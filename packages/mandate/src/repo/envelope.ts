// §20 — the /v1 response envelope. Every 200 carries `data` + a NON-EMPTY `sources` + a complete
// `meta`; every non-200 is an RFC 9457 problem document, sent as application/problem+json, whose `detail` is
// written to be shown to a user verbatim (§10: what happened and what to do, no apology).
//
// The handler bodies live here as plain functions so the contract test (envelope.test.ts) can call
// them under `node --test` without booting Next. The route.ts files under src/app/v1 are three
// lines each: call, `toResponse`.
//
// They live in the package rather than in src/app/v1 because this package's tsconfig prints an
// error in a src/ file as "src/...", and registry:typecheck greps for "^packages/mandate" — a
// strict-mode error in this file would have been filtered out of its own gate.
//
// ponytail: the two `meta` queries (the newest ingest run, and the claim tally that generates
// the confidence caveat) are SQL here because repo/ exposes neither a run reader nor claim
// confidence. Move them to repo/meta.ts the moment a second caller needs them.

import type { DatabaseSync } from "node:sqlite";
import { all, get } from "../db/index.ts";
import {
  RegistryUnavailableError,
  getPersonBrief,
  getPlaceBrief,
  loadSources,
  marks,
  searchPersons,
} from "./index.ts";
import { inForce } from "../core/epochs.ts";
import type { PersonBrief, PersonRow, PlaceBrief, SourceRef } from "./index.ts";
import type { Found, Place, PlaceIndex } from "./place-resolve.ts";
import { placeIndex, resolve } from "./place-resolve.ts";
import { readRegistry } from "./session.ts";

export type Meta = {
  dataVersion: string;
  freshness: { oldestSource: string; computedAt: string };
  /** The epoch in force for the response's jurisdiction on the day it was computed. Absent when the response
   *  is not about one jurisdiction: a person who stood in two states, or a search. */
  epoch?: string;
  /** True when any figure is crosswalk-derived. Derived, never typed by hand — see `tally`. */
  estimated: boolean;
  caveats: string[];
  /** §6.10 compliance gate. Nothing is gated this cycle; the key still ships so a client can
   *  branch on it without a version check. */
  gated: string[];
};

export type Envelope<T> = { data: T; sources: SourceRef[]; meta: Meta };

/** RFC 9457 problem details. `code` is the flat kebab-case error code the old app already uses. */
export type Problem = {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
};

export type Reply<T> = {
  status: number;
  headers: Record<string, string>;
  body: Envelope<T> | Problem;
};

/**
 * What a search answers with. `results` are the people whose recorded names contain the query, and `count` is how many;
 * `soundsLike` are people who share a phonetic key with it and nothing more, each marked `match: "sounds-like"`. The two
 * are kept apart because a phonetic hit is a suggestion to check and not a person found, and a client that reads `count`
 * or takes the first rows must not be handed one. `limit` bounds both together, the matches first.
 */
export type SearchHit = { query: string; count: number; results: PersonRow[]; soundsLike: PersonRow[] };

/** What a handler returns before `meta` is assembled: the payload plus the claim subjects whose
 *  confidence and vintage generate the caveats. */
type Payload<T> = {
  data: T;
  sources: SourceRef[];
  /** Exact claim subject_refs. */
  refs: string[];
  /** Optional LIKE pattern for compound subject refs ('candidacy:<election>:<place>:<person>'). */
  like: string | null;
  /** The one jurisdiction this payload is about, or null. Decides whether `meta.epoch` is named. */
  jurisdictionId: string | null;
  /** Caveats only the endpoint's own data knows about (e.g. a census vintage). */
  caveats: string[];
  /** True when a figure in this payload is derived rather than measured for this entity. */
  estimated: boolean;
};

const PROBLEM_BASE = "https://wbvotes.in/problem/";

function problem(status: number, code: string, title: string, detail: string): Problem {
  return { type: `${PROBLEM_BASE}${code}`, title, status, detail, code };
}

export function unavailable(): Problem {
  return problem(
    503,
    "registry-unavailable",
    "Registry not built",
    "The mandate registry is not present on this server. Build it with: " +
      "npm run registry:migrate && npm run registry:ingest",
  );
}

/**
 * The problem for something that is not there. What it suggests next is what can find the thing: the person search finds
 * people, and nothing searches seats, which a caller can ask for only by the registry's id or by the name itself.
 */
function notFound(kind: string, slug: string): Problem {
  const next =
    kind === "place"
      ? "Ask for a seat by its place id, for example wb.ac.001, or by its exact name."
      : `Search for a name at /v1/search?q=${encodeURIComponent(slug)}.`;
  return problem(404, `unknown-${kind}`, `No ${kind} for “${slug}”`, `“${slug}” does not match any ${kind} in the registry. ${next}`);
}

/**
 * A path under /v1 that no endpoint answers. Next's own 404 for it is an HTML page, and a client reading JSON from
 * this API expects the problem document every other refusal is. No registry is read, so there is no data version
 * to carry and the reply is never cached.
 */
export function unknownEndpointReply(path: string): { status: number; headers: Record<string, string>; body: Problem } {
  return {
    status: 404,
    headers: { "Cache-Control": "no-store" },
    body: problem(
      404,
      "unknown-endpoint",
      "No such endpoint",
      `“${path}” is not an endpoint. The endpoints are /v1/search?q=<name>, /v1/entity/person/<slug> and /v1/entity/place/<slug>.`,
    ),
  };
}

type MetaBase = { dataVersion: string };

/**
 * More than one seat answers to the name, and a response about one place cannot be about all of them. 300, because
 * the answer is a list the caller picks from, and each seat is named by the id that does select it.
 */
function ambiguous(slug: string, places: readonly Place[]): Problem {
  const ids = places.flatMap((p) => (p.level === "seat" ? [p.placeId] : []));
  return problem(
    300,
    "ambiguous-place",
    `More than one place for “${slug}”`,
    `“${slug}” names ${ids.length} seats: ${ids.join(", ")}. Ask for one by its place id, for example ` +
      `/v1/entity/place/${ids[0] ?? ""}.`,
  );
}

/**
 * dataVersion is the finished_at of the newest run that finished.
 * ponytail: 'partial' counts as successful — a partial run is what every real ingest of this
 * corpus is (unresolved party strings land in `anomalies`), and gating dataVersion on 'ok' would
 * leave a live registry versionless. Tighten to status='ok' when the pipeline can reach it.
 */
function metaBase(db: DatabaseSync): MetaBase {
  const r = get<{ data_version: string | null }>(
    db,
    `SELECT (SELECT finished_at FROM ingest_run
              WHERE finished_at IS NOT NULL AND status IN ('ok','partial')
              ORDER BY finished_at DESC LIMIT 1) AS data_version`,
  );
  if (r === undefined || r.data_version === null) throw new RegistryUnavailableError();
  return { dataVersion: r.data_version };
}

type Tally = { claims: number; provisional: number };

/** One query over the response's claim subjects. Generates the confidence caveat. */
function tally(db: DatabaseSync, refs: readonly string[], like: string | null): Tally {
  if (refs.length === 0 && like === null) return { claims: 0, provisional: 0 };
  const rows = all<{ confidence: string; n: number }>(
    db,
    `SELECT confidence, COUNT(*) AS n
       FROM claim
      WHERE subject_ref IN (${marks(refs.length)})
         OR (? IS NOT NULL AND subject_ref LIKE ?)
      GROUP BY confidence`,
    ...refs,
    like,
    like,
  );
  let claims = 0;
  let provisional = 0;
  for (const r of rows) {
    claims += r.n;
    if (r.confidence === "provisional") provisional += r.n;
  }
  return { claims, provisional };
}

/** Caveats are assembled from the rows the response actually cites, never hardcoded per route. */
function caveats(sources: readonly SourceRef[], t: Tally, extra: readonly string[]): string[] {
  const out = [...extra];
  const unfetched = sources.filter((s) => s.retrievalKind !== "fetched").length;
  if (unfetched > 0) {
    out.push(
      `${unfetched} of ${sources.length} cited sources were never fetched: the figures are as ` +
        `asserted by the publisher, not read off a document we hold. Sources with ` +
        `hashKind "url_only" hash the URL, not the bytes.`,
    );
  }
  if (t.provisional > 0) {
    out.push(
      `${t.provisional} of ${t.claims} claims behind this response are recorded as provisional. ` +
        `No figure here has been verified against a fetched document.`,
    );
  }
  return out;
}

/**
 * The one crosswalk in this registry: the census figures are DISTRICT counts applied to a
 * constituency (the source row says so in its title). `meta.estimated` is read off that cited row,
 * never typed by hand.
 * ponytail: matched on the census source's own title because there is exactly one census source.
 * The moment a second geography crosswalk lands, ingest should write it as a claim predicate and
 * this reads the claim instead.
 */
function crosswalked(sources: readonly SourceRef[]): boolean {
  return sources.some((s) => s.kind === "census" && /district/i.test(s.title ?? ""));
}

/** Census vintage per §6.5: the vintage travels in `meta.caveats`, not a downstream tooltip — and
 *  so does the geography, because a district figure printed under a constituency name is a lie by
 *  omission in exactly the same way a year-less figure is. */
function vintageCaveat(brief: PlaceBrief): string[] {
  const years = [
    ...new Set(
      brief.demographics
        .map((d) => d.value.sourceYear)
        .filter((y): y is number => y !== null),
    ),
  ].sort();
  if (years.length === 0) return [];
  if (!crosswalked(brief.sources)) {
    return [`Demographic figures are Census ${years.join(", ")} and are not re-based to today.`];
  }
  return [
    `Demographic figures are district-level Census ${years.join(", ")} applied to this ` +
      `constituency, not counted inside it, and are not re-based to today.`,
  ];
}

/** A header value must be a ByteString: one Bengali character in it makes `new Response` throw
 *  (undici converts, it does not escape), which turned every non-Latin /v1/search into a 500 with
 *  an empty body. `key` carries the raw search term, so percent-encode it — that is also what makes
 *  the ETag a valid RFC 9110 entity-tag, since encodeURIComponent escapes `"` and `\` too.
 *  dataVersion is an ISO timestamp, so it is left as-is (a client greps for it). */
function headers(dataVersion: string, key: string, ok: boolean): Record<string, string> {
  return {
    "X-Data-Version": dataVersion,
    ETag: `W/"${dataVersion}~${encodeURIComponent(key)}"`,
    "Cache-Control": ok ? "public, s-maxage=60, stale-while-revalidate=300" : "no-store",
  };
}

/** Open, read, envelope, close. The only place a status code is chosen. */
async function run<T>(
  key: string,
  build: (db: DatabaseSync) => Payload<T> | Problem,
  read = readRegistry,
): Promise<Reply<T>> {
  // An outage (no file, unmigrated, damaged, busy) is the 503 problem. A bug in this process is thrown, not
  // dressed up as "registry not built".
  const r = read((db): Reply<T> => {
    const base = metaBase(db);
    const p = build(db);
    if ("status" in p) {
      return { status: p.status, headers: headers(base.dataVersion, key, false), body: p };
    }
    if (p.sources.length === 0) {
      // P2 is structural: an uncited number does not leave this process.
      const bug = problem(
        500,
        "provenance-missing",
        "Provenance missing",
        "This record exists but carries no source, so it cannot be published. Re-run: " +
          "npm run registry:ingest",
      );
      return { status: 500, headers: headers(base.dataVersion, key, false), body: bug };
    }
    const t = tally(db, p.refs, p.like);
    const oldest = p.sources.reduce((a, s) => (s.retrievedAt < a ? s.retrievedAt : a), p.sources[0]!.retrievedAt);
    const computedAt = new Date().toISOString();
    const meta: Meta = {
      dataVersion: base.dataVersion,
      freshness: { oldestSource: oldest.slice(0, 10), computedAt },
      ...(p.jurisdictionId === null ? {} : { epoch: inForce(p.jurisdictionId, computedAt.slice(0, 10)).id }),
      estimated: p.estimated,
      caveats: caveats(p.sources, t, p.caveats),
      gated: [],
    };
    return {
      status: 200,
      headers: headers(base.dataVersion, key, true),
      body: { data: p.data, sources: p.sources, meta },
    };
  });
  if (r.ok) return r.value;
  const u = unavailable();
  return { status: u.status, headers: { "Cache-Control": "no-store" }, body: u };
}

export function personReply(slug: string, read = readRegistry): Promise<Reply<PersonBrief>> {
  return run(`person/${slug}`, (db) => {
    const b = getPersonBrief(db, slug);
    if (b === null) return notFound("person", slug);
    // Candidacy claims are subject_ref 'candidacy:<election>:<place>:<personId>'.
    return {
      data: b,
      sources: b.sources,
      refs: [`person:${b.person.id}`],
      like: `%:${b.person.id}`,
      jurisdictionId: null,
      caveats: [],
      estimated: false,
    };
  }, read);
}

/**
 * The seat a slug names: the registry's own place id, else a bare name, and neither says which state. A name that more
 * than one seat answers to is a question for the caller, not a choice for this to make.
 *
 * A name is the registry's own spelling, case apart, because that is all this API has ever matched (the SQL this
 * replaced was `LOWER(canonical_name) = LOWER(slug)`). The resolver reads a name by its words, so `Coochbehar-Uttar`
 * and `Coochbehar Uttar ` are `Coochbehar Uttar`, and falls back to the name without its marker and to the words
 * joined, which is how a page's old links are read. `exact` stops at the first reading; the spelling check holds
 * what that found to the registry's own.
 */
function seatNamed(index: PlaceIndex, slug: string): Found {
  const byId = resolve(index, { level: "seat", placeId: slug });
  if (byId.found !== "none") return byId;
  const named = resolve(index, { level: "seat", name: slug, exact: true });
  const spelt = (named.found === "one" ? [named.place] : named.found === "many" ? named.places : []).filter(
    (p) => p.level === "seat" && p.name.toLowerCase() === slug.toLowerCase(),
  );
  if (spelt.length === 0) return { found: "none" };
  return spelt.length === 1 ? { found: "one", place: spelt[0]! } : { found: "many", places: spelt };
}

export function placeReply(slug: string, read = readRegistry): Promise<Reply<PlaceBrief>> {
  return run(`place/${slug}`, (db) => {
    const found = seatNamed(placeIndex(db), slug);
    if (found.found === "none") return notFound("place", slug);
    if (found.found === "many") return ambiguous(slug, found.places);
    const b = found.place.level === "seat" ? getPlaceBrief(db, found.place.versionId) : null;
    if (b === null) return notFound("place", slug);
    return {
      data: b,
      sources: b.sources,
      refs: [`place:${b.place.id}`],
      like: null,
      jurisdictionId: b.place.jurisdictionId,
      caveats: vintageCaveat(b),
      estimated: crosswalked(b.sources),
    };
  }, read);
}

/**
 * Transliteration-aware person search (repo/searchPersons does the Indic normalisation).
 * A query that matches nothing is a 404, not a 200 with an empty `sources` array — the envelope
 * invariant holds for every 200 without exception. A query that only SOUNDS like names is a 200 with no
 * `results` and those names in `soundsLike`, which are as citable as a match.
 * ponytail: persons only. Add places when the picker needs them; `types=` is not parsed until it
 * has a second value to choose between.
 */
export function searchReply(q: string, limit = 20, read = readRegistry): Promise<Reply<SearchHit>> {
  const term = q.trim();
  if (term === "") {
    return run(
      "search/",
      () =>
        problem(
          400,
          "missing-query",
          "No search term",
          "Add a name to search for, in Bengali or English: /v1/search?q=Mamata.",
        ),
      read,
    );
  }
  return run(`search/${term}/${limit}`, (db) => {
    const rows = searchPersons(db, term, limit);
    if (rows.length === 0) {
      return problem(
        404,
        "no-matches",
        `Nothing matches “${term}”`,
        `No person in the registry matches “${term}”. Try a surname alone, or the Bengali spelling.`,
      );
    }
    const results = rows.filter((r) => r.match !== "sounds-like");
    const soundsLike = rows.filter((r) => r.match === "sounds-like");
    const refs = rows.map((r) => `person:${r.id}`);
    // Most persons in this registry carry NO person-level claim (only the 2026 affidavit filers
    // do), so resolving sources from `refs` alone answered 500 for ordinary historical names.
    // Every row carries its own source id, and those are the ids that make the list citable.
    const directIds = rows.map((r) => r.sourceId).filter((id): id is string => id !== null);
    const sources = loadSources(db, directIds, refs);
    return {
      data: { query: term, count: results.length, results, soundsLike },
      sources,
      refs,
      like: null,
      jurisdictionId: null,
      caveats: [],
      estimated: false,
    };
  }, read);
}

/** A search's `limit`: 1 to 50, and 20 where it is absent, blank or not a number. A blank value is not zero. */
export function searchLimit(raw: string | null): number {
  const n = raw === null || raw.trim() === "" ? NaN : Number(raw);
  return Number.isFinite(n) ? Math.min(50, Math.max(1, Math.trunc(n))) : 20;
}

/**
 * A reply as the Response that goes on the wire. A problem document carries RFC 9457's own media type, so a client can
 * tell one from data without parsing it; data is plain JSON. The status decides which: only a 200 is data.
 */
export function toResponse(r: Reply<unknown>): Response {
  return new Response(JSON.stringify(r.body), {
    status: r.status,
    headers: { ...r.headers, "Content-Type": r.status === 200 ? "application/json" : "application/problem+json" },
  });
}
