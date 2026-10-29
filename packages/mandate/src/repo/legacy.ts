// Where the URLs of the previous product, and of the old `/pl` tree, are sent now. One answer per legacy route, with the
// route's miss policy in it, so a page file only follows what it is told.
//
// These live here rather than inline in the page files for the reason cycle 2 learned the hard way:
// logic inside an app-router page that webpack cannot statically see compiles to `undefined` and
// returns a 500 for every slug, while the build still prints "Compiled successfully".
//
// The constituency mapping goes through the seat's NUMBER, the AC number, NOT through the numeric tail of the old id.
// `c0001` and `wb.ac.001` do happen to agree on all 294 seats — that was measured, not assumed — but agreeing today
// is not a mapping, and a delimitation that renumbers a seat would silently redirect readers to the wrong
// constituency. The number is asked of the place index (place-resolve.ts), among the CURRENT West Bengal assembly
// seats: the previous product held those and nothing else, so an id never names a seat of another state or a
// Lok Sabha seat, which have numbers of their own.

import type { DatabaseSync } from "node:sqlite";
import { get } from "../db/index.ts";
import { chronoDesc } from "../core/election-kind.ts";
import { read } from "./index.ts";
import type { Search } from "./place-filters.ts";
import type { Place, PlaceQuery, SeatPlace } from "./place-resolve.ts";
import { decode, resolveRequest } from "./place-view.ts";
import { personHref, stateHref } from "./routes.ts";
import { readRegistry } from "./session.ts";

/** `c0042` -> 42. Null for anything that is not that shape, including `c0000`. */
export function acNumber(legacyId: string): number | null {
  const m = /^c0*(\d{1,3})$/i.exec(legacyId.trim());
  if (m?.[1] === undefined) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 999 ? n : null;
}

// ── the `/pl` grammar ────────────────────────────────────────────────────────────────────────────

/**
 * The query a `/pl` path makes: §7's grammar, /pl/:state · /pl/:state/:district · /pl/:state/:district/:seat.
 *
 * Only the compatibility route still reads what a place is from how many segments it has. A canonical route
 * knows, because the kind of place is in its prefix, and says so by building its own query.
 */
export function pathQuery(segments: readonly string[]): PlaceQuery | null {
  const clean = segments.map((s) => decode(s).trim()).filter((s) => s !== "");
  const [state, district, seat] = clean;
  if (state === undefined || clean.length > 3) return null;
  if (district === undefined) return { level: "state", id: state };
  if (seat === undefined) return { level: "district", state, district };
  return { level: "seat", state, district, name: seat };
}

// ── the ids ──────────────────────────────────────────────────────────────────────────────────────

/**
 * The seat an old id named: `c0001` is West Bengal's assembly seat number 1 as the registry holds it now.
 *
 * Only a current seat answers (D26), and a number that no current seat holds, or that two do, names nothing.
 */
function legacySeat(db: DatabaseSync, legacyId: string): SeatPlace | null {
  const n = acNumber(legacyId);
  if (n === null) return null;
  const found = resolveRequest(db, { level: "seat", state: "wb", body: "assembly", number: n });
  return found.found === "one" && found.place.level === "seat" ? found.place : null;
}

/**
 * `/candidate/wb26_52` -> `/p/hiten-barman-ca794e`.
 *
 * `person_identifier` carries the affidavit id that the old app used as its primary key, for all
 * 2,920 of them. Resolution survives entity resolution: a merge rewrites the identifier's
 * person_id, so an old link follows the person to whichever record absorbed them.
 */
function personForMynetaId(db: DatabaseSync, mynetaId: string): string | null {
  const v = mynetaId.trim();
  if (v === "") return null;
  return read(
    () =>
      get<{ person_id: string }>(
        db,
        `SELECT person_id FROM person_identifier WHERE scheme = 'myneta_id' AND value = ?`,
        v,
      )?.person_id ?? null,
  );
}

/**
 * `/mla/c0001` -> the sitting member's person page.
 *
 * The old route keyed an MLA profile by *constituency*, so the equivalent is "whoever won the most
 * recent election here", at the seat the id names (`legacySeat`) and no other version of its number. Ordering is
 * the chronology key, and a seat whose newest election declared nobody falls back to the one before it.
 */
function sittingMemberForLegacyId(db: DatabaseSync, legacyId: string): string | null {
  const seat = legacySeat(db, legacyId);
  if (seat === null) return null;
  return read(
    () =>
      get<{ person_id: string }>(
        db,
        `SELECT ca.person_id
           FROM contest c
           JOIN election e       ON e.id = c.election_id
           JOIN result r         ON r.contest_id = c.id AND r.is_winner = 1 AND r.revision = 0
           JOIN candidacy ca     ON ca.id = r.candidacy_id
          WHERE c.place_version_id = ?
          ORDER BY ${chronoDesc()}
          LIMIT 1`,
        seat.versionId,
      )?.person_id ?? null,
  );
}

// ── the routes ───────────────────────────────────────────────────────────────────────────────────

/**
 * A request to a legacy route, as that route's page hands it over. The route is named for what it is and not for its
 * URL, so that a name here is never mistaken for a link (routes.guard.test.ts).
 */
export type LegacyRequest =
  /** `/pl?to=ka`: what the jurisdiction picker used to submit. */
  | { route: "pl-picker"; to: string | undefined }
  /** `/pl/ka/bagalkot/badami[/analysis]`, with the query it came with. */
  | { route: "pl-path"; path: readonly string[]; search: Search }
  /** `/mla/c0001`. */
  | { route: "mla"; id: string }
  /** `/candidate/wb26_52`. */
  | { route: "candidate"; id: string }
  /** `/candidates`. */
  | { route: "candidates" }
  /** `/constituency/c0001`: one segment under `/constituency` is always an id from the previous product. */
  | { route: "constituency-id"; id: string }
  /** `/constituency/<state>/<name>`, the form before the body was in the path. */
  | { route: "constituency-name"; state: string; body: string };

/**
 * What a legacy route does with its request. Never an outage: that is thrown.
 *
 * `not-found` is a 404 and never a redirect up the tree, because sending a reader who asked for a seat to a state
 * page is the silent substitution this architecture exists to end. `choose` is a question for the reader, for a name
 * that more than one seat answers to.
 */
export type LegacyTarget =
  | { kind: "redirect"; to: string; permanent: boolean }
  | { kind: "choose"; places: readonly Place[] }
  | { kind: "not-found" };

const NOT_FOUND: LegacyTarget = { kind: "not-found" };

/** A 308, unless the route says its destination is only where a miss lands. */
const redirectTo = (to: string, permanent = true): LegacyTarget => ({ kind: "redirect", to, permanent });

/**
 * The query survives the redirect: `?election=`, `?district=`, `?party=`, `?mode=` and `?seat=` mean the same thing
 * on the canonical state route as they did here, so dropping them would silently change what a shared link shows.
 */
function queryOf(search: Search): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(search)) {
    if (typeof v === "string") qs.set(k, v);
    else if (Array.isArray(v) && v[0] !== undefined) qs.set(k, v[0]);
  }
  const query = qs.toString();
  return query === "" ? "" : `?${query}`;
}

/**
 * Run `fn` on the registry. A registry that cannot answer must not produce a redirect to a guess, and it is not a 404
 * either: a crawler keeps a 404 and drops the redirect for good. It is thrown, which a crawler retries.
 */
function inRegistry<T>(session: typeof readRegistry, fn: (db: DatabaseSync) => T): T {
  const r = session(fn);
  if (!r.ok) throw r.cause;
  return r.value;
}

/**
 * Where a legacy request goes. `session` is for a test that points at a fixture.
 *
 * ── THE MISS POLICY, PER ROUTE ──
 *
 *   pl-picker, pl-path       an unknown place is a 404, and so is a path that is no place
 *   mla                      a 404: an id with no sitting member is no page
 *   constituency-id          a 404, and not the state page: an unresolvable id is not a request for a state
 *   constituency-name        a 404, and `many` asks which, because a name may mean two offices
 *   candidate                search, as a 307: the name in the reader's head is what they can still act on
 *   candidates               search, always
 *
 * Only `pl-path` is checked before the registry is opened, because a path that is no place cannot match anything;
 * every other registry route opens it for every id, garbage included. A route that needs no registry answers without
 * one, so an outage cannot change its answer.
 */
export function legacyTarget(request: LegacyRequest, session: typeof readRegistry = readRegistry): LegacyTarget {
  switch (request.route) {
    case "candidates":
      return redirectTo("/search");

    case "pl-picker":
      return request.to !== undefined && /^[a-z]{2}$/.test(request.to) ? redirectTo(stateHref(request.to)) : NOT_FOUND;

    case "pl-path": {
      // `/pl/<state>/<district>/<seat>/analysis` kept its lens in the trailing segment. Preserve it.
      const lens = request.path.at(-1) === "analysis" ? "/analysis" : "";
      const query = pathQuery(lens === "" ? request.path : request.path.slice(0, -1));
      if (query === null) return NOT_FOUND;
      return inRegistry(session, (db): LegacyTarget => {
        const found = resolveRequest(db, query);
        if (found.found === "none") return NOT_FOUND;
        if (found.found === "many") return { kind: "choose", places: found.places };
        // The address the resolver gave the place it found, never one spelled from the path.
        return redirectTo(`${found.place.href}${lens}${queryOf(request.search)}`);
      });
    }

    case "mla":
      return inRegistry(session, (db) => {
        const person = sittingMemberForLegacyId(db, request.id);
        return person === null ? NOT_FOUND : redirectTo(personHref(person));
      });

    case "candidate":
      return inRegistry(session, (db) => {
        const person = personForMynetaId(db, request.id);
        return person === null ? redirectTo("/search", false) : redirectTo(personHref(person));
      });

    case "constituency-id":
      // Canonical, so an old WB Votes id redirects ONCE rather than into the compatibility layer and out again.
      return inRegistry(session, (db) => {
        const seat = legacySeat(db, request.id);
        return seat === null ? NOT_FOUND : redirectTo(seat.href);
      });

    case "constituency-name":
      // The name is read as the registry spells it and in no looser way: no id, no number, no marker stripped, no
      // words joined. This URL is where old links live, and it has only ever answered to a name.
      return inRegistry(session, (db): LegacyTarget => {
        const found = resolveRequest(db, { level: "seat", state: request.state, name: request.body, exact: true });
        if (found.found === "none") return NOT_FOUND;
        // This URL has always matched its state exactly, where a route that names a body ignores case: `WB` is a 404 here.
        const first = found.found === "one" ? found.place : found.places[0];
        if (first?.level !== "seat" || first.stateId !== request.state) return NOT_FOUND;
        return found.found === "one" ? redirectTo(found.place.href) : { kind: "choose", places: found.places };
      });
  }
}
