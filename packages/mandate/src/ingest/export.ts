// The round trip: read the REGISTRY, rebuild the seed modules from it, and measure how much of the
// input comes back. This is a MEASUREMENT, not a migration — nothing in the repo consumes
// reconstruct(); data/seed/*.json stays the input and the app keeps reading it. The number this
// file exists to produce is the readiness gate for §29 Phase C/E: the seed and the old app can only
// be deleted once the registry can give the input back, and today it cannot. See ADR 0004.
//
// Three honesty rules, because a round-trip report that flatters itself is worse than none:
//   1. A field is "not reconstructable" only when the SCHEMA has nowhere to hold it (a party
//      colour, a minister's map pin, an SVG path). Everything else that fails to come back is a
//      DIFFERENCE. `photoUrl` was on that list while 2,920 cited claims held it — a report that
//      calls a stored field unstorable is the same lie as one that flatters itself.
//   1b. And a rebuilt row with no seed row is counted, not ignored: walking only the seed let a
//      rebuild invent unlimited rows and still score 100%.
//   2. Entity resolution merged 1,160 persons. A candidacy has no name column, so the name a source
//      used lives on person_alias with no link back to the candidacy: for a merged person the
//      registry holds N names and cannot say which row each belongs to. That is reported as
//      `ambiguous`, never resolved by guessing — and `guessable` counts how often the guess (the
//      survivor's canonical name) would have been right, so the loss is separable from bookkeeping.
//   3. Derived and re-cased values (vote_share, reservation, party labels) are compared exactly.
//      A rounding or casing difference is a difference.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { DatabaseSync } from "node:sqlite";

import { contentId, slug } from "../core/ids.ts";
import { all } from "../db/index.ts";
// One table for both directions of the district name disagreement — see districts.ts.
import { censusName } from "./districts.ts";

export type Row = Record<string, unknown>;
export type Seed = Record<string, Row[]>;

const SEED_DIR = fileURLToPath(new URL("../../../../data/seed/", import.meta.url));

/** A value the registry holds more than one candidate for and cannot attribute to this row. The
 *  suffix is the guess we deliberately did NOT make, so the report can count how often it fits. */
const AMB = " ambiguous:";  // leading SPACE, not \0: a NUL makes this file binary to git and to
                            // grep, which silently stopped matching it. No seed value is
                            // space-prefixed, and ADR 0004 documents this exact form.
const ambiguous = (guess: unknown): string => AMB + String(guess ?? "");
const isAmb = (v: unknown): v is string => typeof v === "string" && v.startsWith(AMB);

const PARTY_VALID_FROM = "2011-01-01";
/** The seat id the old app uses is a function of the assembly number, which place_version holds.
 *  ponytail: the `c0001` form is a convention, not a stored column — restate it here rather than
 *  add a column to carry a string the registry can derive. Store it if the app's ids ever diverge. */
const seatId = (n: number): string => `c${String(n).padStart(4, "0")}`;
/** reservation is stored lowercase; the seed spells it 'SC' / 'ST' / 'General'. */
const unReservation = (r: string): string =>
  r.length <= 2 ? r.toUpperCase() : r.slice(0, 1).toUpperCase() + r.slice(1);
const genderOf = (sex: string | null): string | undefined =>
  sex === "m" ? "Male" : sex === "f" ? "Female" : sex === "o" ? "Other" : undefined;
const bn = (names: string | null): string | undefined => {
  try {
    const v = (JSON.parse(names ?? "{}") as { bn?: string }).bn;
    return typeof v === "string" ? v : undefined;
  } catch {
    return undefined;
  }
};
const httpUrl = (u: string | null | undefined): string | undefined =>
  u != null && /^https?:/.test(u) ? u : undefined;

// ─── what the schema has nowhere to hold ─────────────────────────────────────
// Per module, in report-path form (array indices collapse to `[]`). Only consulted when nothing was
// reconstructed for that path, so a field listed here still gets credit if it does come back.
// A module with nothing on the list is absent from it, not present with an empty array.
// candidates.json is the one to notice: photoUrl, incumbentYears and isIncumbent were on this list
// while the registry held a cited claim for each (2,920 / 157 / derived from the second), which broke
// rule 1 above and understated that module's ceiling by 14.3pp.
/** Report-path fields whose seed encoding of "not reported" is the number 0. See the comparison below.
 *  Verified before adding: all 293 affected rows are 2026 winners, and there is not one genuine
 *  votes = 0 in the registry's 4,357 result rows. */
const ABSENCE_AS_ZERO: ReadonlySet<string> = new Set([
  "winner.votes",
  "winner.voteShare",
  "runnerUp.votes",
  "runnerUp.voteShare",
  "topContestants[].votes",
  "topContestants[].voteShare",
]);

const NOT_STORED: Record<string, readonly string[]> = {
  "constituencies.json": ["nameBn", "districtBn"],
  "parties.json": ["color"],
  "historical-results.json": ["marginPct"],
  "cabinet.json": ["lat", "lng", "inducted", "bio"],
  "wbmps.json": ["lsNumber"],
};

/** Row key per module: what identifies the same row on both sides. */
const KEY: Record<string, (r: Row) => string> = {
  "constituencies.json": (r) => String(r["id"]),
  "parties.json": (r) => String(r["id"]),
  "candidates.json": (r) => String(r["id"]),
  "historical-results.json": (r) => `${String(r["year"])}:${String(r["constituencyId"])}`,
  "current-mla.json": (r) => String(r["constituencyId"]),
  "demographics.json": (r) => String(r["constituencyId"]),
  "cabinet.json": (r) => String(r["constituencyId"] ?? slug(String(r["name"]))),
  "wbmps.json": (r) => String(r["lsConstituency"]),
  "wb-ac-paths.json": (r) => String(r["id"]),
  "wb-districts.json": (r) => String(r["name"]),
};

/**
 * Every seed module, including the two nothing ingests.
 *
 * wb-ac-paths.json and wb-districts.json hold constituency and district geometry, 1,546 values that
 * no table can accept (`place_version.geometry_ref` is null everywhere). They are REPORTED, at 0%,
 * because they are part of the seed and therefore part of what deleting the seed would cost — and
 * because a report that omits them can never notice the day geometry does land.
 *
 * They were briefly dropped from this list on the grounds that a 0% module drags the headline down
 * and forces a second percentage. Both true, and neither is a reason to stop reporting: the fix is
 * to publish both numbers, which is what `formatReport` now does. The version before this one said
 * "Reported, not hidden" in this comment, and deleting a module was how the overall figure went from
 * 85.9% to 94.1% in the same commit that legitimately fixed candidates.json.
 *
 * provenance.json is genuinely excluded, and that is a bug fix rather than a presentational choice:
 * it is a `file -> date` map of registry bookkeeping, not seed content, and scoring it as a module
 * compared 8 rebuilt rows against 7 seed rows and called the round trip 100%.
 */
const MODULES = Object.keys(KEY);

/** Reported, not hidden — see above. Excluded from the INGESTED figure, never from the report. */
// Empty since migration 008 gave geometry a table: both modules are ingested and reconstructable, so
// the two figures below now differ only by rows the ingest drops, not by whole modules nothing reads.
// Kept as a mechanism rather than deleted — the next unreadable module should land here, reported.
const NOT_INGESTED = new Set<string>([]);

// ─── reading the seed ────────────────────────────────────────────────────────

export function readSeed(dir: string = SEED_DIR): Seed {
  const out: Seed = {};
  for (const file of MODULES) out[file] = JSON.parse(readFileSync(dir + file, "utf8")) as Row[];
  return out;
}

// ─── reading the registry ────────────────────────────────────────────────────

type ClaimRow = {
  id: number;
  subject_ref: string;
  predicate: string;
  object_value: string;
  as_of: string | null;
  url: string | null;
};

type Registry = {
  /** Every distinct name the registry holds for a person, in the order they were written. */
  namesOf: Map<string, string[]>;
  canonical: Map<string, { name: string; sex: string | null; names: string | null }>;
  claims: Map<string, ClaimRow[]>;
};

const claimKey = (subject: string, predicate: string): string => `${subject}|${predicate}`;

function readRegistry(db: DatabaseSync): Registry {
  const canonical = new Map<string, { name: string; sex: string | null; names: string | null }>();
  for (const p of all<{ id: string; canonical_name: string; sex: string | null; names: string | null }>(
    db,
    "SELECT id, canonical_name, sex, names FROM person",
  )) {
    canonical.set(p.id, { name: p.canonical_name, sex: p.sex, names: p.names });
  }
  const namesOf = new Map<string, string[]>();
  for (const a of all<{ person_id: string; name: string }>(
    db,
    "SELECT DISTINCT person_id, name FROM person_alias ORDER BY person_id, name",
  )) {
    const list = namesOf.get(a.person_id) ?? [];
    if (!list.includes(a.name)) list.push(a.name);
    namesOf.set(a.person_id, list);
  }
  const claims = new Map<string, ClaimRow[]>();
  const seen = new Set<number>();
  for (const c of all<ClaimRow>(
    db,
    `SELECT c.id AS id, c.subject_ref AS subject_ref, c.predicate AS predicate,
            c.object_value AS object_value, c.as_of AS as_of, s.url AS url
       FROM claim c
       LEFT JOIN citation ci ON ci.claim_id = c.id
       LEFT JOIN source s ON s.id = ci.source_id
      ORDER BY c.id`,
  )) {
    if (seen.has(c.id)) continue; // a claim with two citations is still one claim
    seen.add(c.id);
    const k = claimKey(c.subject_ref, c.predicate);
    const list = claims.get(k) ?? [];
    list.push(c);
    claims.set(k, list);
  }
  return { namesOf, canonical, claims };
}

/** The one name for this row, or `ambiguous` when resolution left several on one person. */
function nameOf(reg: Registry, personId: string): string {
  const names = reg.namesOf.get(personId) ?? [];
  const canonical = reg.canonical.get(personId)?.name ?? personId;
  // A name written in Bengali is a variant of the same row, not a rival candidate for it: the
  // Latin name is what every seed module carries.
  const latin = names.filter((n) => /[A-Za-z]/.test(n));
  if (latin.length === 1) return latin[0] as string;
  if (latin.length === 0) return names.length === 1 ? (names[0] as string) : ambiguous(canonical);
  return ambiguous(canonical);
}

/** A claim's value, `undefined` when absent, `ambiguous` when a merge put two on one subject. */
function claimValue(reg: Registry, subject: string, predicate: string): unknown {
  const list = reg.claims.get(claimKey(subject, predicate)) ?? [];
  if (list.length === 0) return undefined;
  const distinct = new Set(list.map((c) => c.object_value));
  const first = JSON.parse((list[0] as ClaimRow).object_value) as unknown;
  return distinct.size === 1 ? first : ambiguous(first);
}

function claimRow(reg: Registry, subject: string, predicate: string): ClaimRow | undefined {
  return (reg.claims.get(claimKey(subject, predicate)) ?? [])[0];
}

// ─── the rebuild, module by module ───────────────────────────────────────────

export function reconstruct(db: DatabaseSync): Seed {
  const reg = readRegistry(db);
  return {
    "constituencies.json": constituencies(db),
    "parties.json": parties(db),
    "candidates.json": candidates(db, reg),
    "historical-results.json": historicalResults(db, reg),
    "current-mla.json": currentMLAs(db, reg),
    "demographics.json": demographics(db, reg),
    "cabinet.json": cabinet(db, reg),
    "wbmps.json": mps(db, reg),
    "wb-ac-paths.json": geometry(db, "ac"),
    "wb-districts.json": geometry(db, "district"),
  };
}

function constituencies(db: DatabaseSync): Row[] {
  return all<{
    n: number;
    name: string;
    names: string | null;
    resv: string;
    district: string | null;
    dnames: string | null;
  }>(
    db,
    `SELECT pv.number AS n, p.canonical_name AS name, p.names AS names, pv.reservation AS resv,
            d.canonical_name AS district, d.names AS dnames
       FROM place_version pv
       JOIN place p ON p.id = pv.place_id
       LEFT JOIN place d ON d.id = p.parent_id
      WHERE p.kind = 'ac'
      ORDER BY pv.number`,
  ).map((r) => ({
    id: seatId(Number(r.n)),
    assemblyNumber: Number(r.n),
    name: r.name,
    ...(bn(r.names) === undefined ? {} : { nameBn: bn(r.names) }),
    district: r.district ?? undefined,
    ...(bn(r.dnames) === undefined ? {} : { districtBn: bn(r.dnames) }),
    reservation: unReservation(r.resv),
  }));
}

function parties(db: DatabaseSync): Row[] {
  return all<{
    id: string;
    name: string;
    short_name: string;
    names: string | null;
    kind: string;
    svg_ref: string | null;
  }>(
    db,
    `SELECT p.id AS id, p.name AS name, p.short_name AS short_name, p.names AS names,
            p.kind AS kind, sy.svg_ref AS svg_ref
       FROM party p
       JOIN party_version pv ON pv.party_id = p.id AND pv.valid_from = ?
       LEFT JOIN symbol sy ON sy.id = pv.symbol_id
      WHERE p.kind <> 'registered_unrecognised'
      ORDER BY p.id`,
    PARTY_VALID_FROM,
  ).map((r) => ({
    id: r.id,
    name: r.name,
    ...(bn(r.names) === undefined ? {} : { nameBn: bn(r.names) }),
    abbreviation: r.short_name,
    isNational: r.kind === "national",
    ...(r.svg_ref == null ? {} : { symbolUrl: r.svg_ref }),
  }));
}

function candidates(db: DatabaseSync, reg: Registry): Row[] {
  const fields = new Map<string, number>();
  for (const f of all<{ affidavit_id: string; path: string; value_numeric: number | null }>(
    db,
    "SELECT affidavit_id, path, value_numeric FROM affidavit_field",
  )) {
    if (f.value_numeric != null) fields.set(`${f.affidavit_id}|${f.path}`, Number(f.value_numeric));
  }
  const rows = all<{
    aff: string;
    cand: string;
    person_id: string;
    acno: number;
    age: number | null;
    education: string | null;
    party_raw: string | null;
    party_id: string | null;
    aff_url: string | null;
  }>(
    db,
    `SELECT a.id AS aff, c.id AS cand, c.person_id AS person_id, ct.place_version_id AS acno,
            c.age_declared AS age, c.education_declared AS education, c.party_raw AS party_raw,
            pv.party_id AS party_id, s.url AS aff_url
       FROM affidavit a
       JOIN candidacy c ON c.id = a.candidacy_id
       JOIN contest ct ON ct.id = c.contest_id
       LEFT JOIN party_version pv ON pv.id = c.party_version_id
       LEFT JOIN source s ON s.id = a.source_id
      ORDER BY a.id`,
  );
  return rows.map((r) => {
    // affidavit.id carries the candidate's own myneta id, which is the only link back from a
    // registry row to a candidates.json row that survives a person merge.
    const id = r.aff.replace(/^affidavit:/, "");
    const num = (path: string): number | undefined => fields.get(`${r.aff}|${path}`);
    const sex = reg.canonical.get(r.person_id)?.sex ?? null;
    const cases = claimValue(reg, `person:${r.person_id}`, "pending_cases_declared");
    const occupation = claimValue(reg, `person:${r.person_id}`, "occupation_declared");
    const photoUrl = claimValue(reg, `person:${r.person_id}`, "photo_url_declared");
    // Years served is a fact about one contest, so the claim is on the candidacy, not the person.
    const years = claimValue(reg, `candidacy:${r.cand}`, "incumbent_years_declared");
    return {
      id,
      name: nameOf(reg, r.person_id),
      partyId: r.party_raw ?? r.party_id ?? undefined,
      constituencyId: seatId(Number(r.acno)),
      ...(photoUrl === undefined ? {} : { photoUrl }),
      age: r.age ?? null,
      ...(genderOf(sex) === undefined ? {} : { gender: genderOf(sex) }),
      education: r.education ?? undefined,
      ...(cases === undefined ? {} : { criminalCases: cases }),
      ...(num("assets.total") === undefined ? {} : { totalAssets: num("assets.total") }),
      ...(num("liabilities.total") === undefined
        ? {}
        : { totalLiabilities: num("liabilities.total") }),
      ...(num("assets.movable.total") === undefined
        ? {}
        : { movableAssets: num("assets.movable.total") }),
      ...(num("assets.immovable.total") === undefined
        ? {}
        : { immovableAssets: num("assets.immovable.total") }),
      ...(httpUrl(r.aff_url) === undefined ? {} : { affidavitUrl: httpUrl(r.aff_url) }),
      ...(occupation === undefined ? {} : { occupation }),
      ...(years === undefined ? {} : { incumbentYears: years }),
      // Derived from presence, not stored: the seed's isIncumbent is true on exactly the rows that
      // declare a tenure. A stored boolean beside the number it shadows can only disagree with it.
      isIncumbent: years !== undefined,
    };
  });
}

function historicalResults(db: DatabaseSync, reg: Registry): Row[] {
  const turnout = new Map<string, { electors: number | null; voters: number | null }>();
  for (const t of all<{ contest_id: string; electors: number | null; voters: number | null }>(
    db,
    "SELECT contest_id, electors, voters FROM turnout WHERE scope = 'contest'",
  )) {
    turnout.set(t.contest_id, { electors: t.electors, voters: t.voters });
  }
  type R = {
    contest_id: string;
    election_id: string;
    acno: number;
    revision: number;
    votes: number;
    vote_share: number | null;
    rank: number | null;
    is_winner: number;
    margin: number | null;
    person_id: string;
    party_id: string | null;
    abbr: string | null;
    party_raw: string | null;
  };
  const byContest = new Map<string, R[]>();
  for (const r of all<R>(
    db,
    `SELECT r.contest_id AS contest_id, ct.election_id AS election_id, ct.place_version_id AS acno,
            r.revision AS revision, r.votes AS votes, r.vote_share AS vote_share, r."rank" AS rank,
            r.is_winner AS is_winner, r.margin AS margin, cy.person_id AS person_id,
            pv.party_id AS party_id, pt.short_name AS abbr, cy.party_raw AS party_raw
       FROM result r
       JOIN contest ct ON ct.id = r.contest_id
       JOIN candidacy cy ON cy.id = r.candidacy_id
       LEFT JOIN party_version pv ON pv.id = cy.party_version_id
       LEFT JOIN party pt ON pt.id = pv.party_id
       JOIN election e ON e.id = ct.election_id
      -- historical-results.json is an ASSEMBLY results file, keyed (year, assembly constituency).
      -- Without this filter the 42 Lok Sabha 2024 contests reconstructed into it as 42 rows the seed
      -- has no key for, which the report correctly counted as 462 invented values and which dropped
      -- the round-trip figure by 0.9pp. The registry gaining an election KIND must not make an
      -- unrelated module look wrong.
      WHERE e.kind = 'assembly'
      ORDER BY r.contest_id, r.revision, r."rank"`,
  )) {
    const cur = byContest.get(r.contest_id);
    if (cur === undefined || Number(r.revision) > Number((cur[0] as R).revision)) {
      byContest.set(r.contest_id, [r]);
      continue;
    }
    if (Number(r.revision) === Number((cur[0] as R).revision)) cur.push(r);
  }
  const contestant = (r: R): Row => ({
    name: nameOf(reg, r.person_id),
    partyId: r.party_raw ?? r.party_id ?? undefined,
    partyAbbr: r.party_raw ?? r.abbr ?? undefined,
    votes: Number(r.votes),
    voteShare: r.vote_share ?? null,
  });
  const out: Row[] = [];
  for (const [contestId, rows] of byContest) {
    const year = Number(contestId.split(":")[0]?.split("-").pop());
    const winner = rows.find((r) => Number(r.is_winner) === 1) ?? (rows[0] as R);
    const t = turnout.get(contestId);
    out.push({
      constituencyId: seatId(Number((rows[0] as R).acno)),
      year,
      winner: contestant(winner),
      // runnerUp and topContestants exist in the seed exactly when the field has more than one
      // recorded contestant; a single-row contest carries neither.
      ...(rows.length > 1 ? { runnerUp: contestant(rows[1] as R) } : {}),
      ...(rows.length > 1 ? { topContestants: rows.map(contestant) } : {}),
      turnoutPct: claimValue(reg, `contest:${contestId}`, "turnout_pct") ?? null,
      marginVotes: winner.margin ?? null,
      totalVotes: t?.voters ?? null,
      totalElectors: t?.electors ?? null,
    });
  }
  return out;
}

function currentMLAs(db: DatabaseSync, reg: Registry): Row[] {
  // The winner's own candidates.json id: the elected 2026 candidacy's affidavit carries it. This
  // survives the merge because affidavit -> candidacy is a direct row link.
  const electedMyneta = new Map<string, string>();
  for (const r of all<{ acno: number; aff: string }>(
    db,
    `SELECT ct.place_version_id AS acno, a.id AS aff
       FROM candidacy c
       JOIN contest ct ON ct.id = c.contest_id
       JOIN affidavit a ON a.candidacy_id = c.id
      WHERE c.status = 'elected' AND ct.election_id = 'wb-assembly-2026'`,
  )) {
    electedMyneta.set(seatId(Number(r.acno)), r.aff.replace(/^affidavit:/, ""));
  }
  const out: Row[] = [];
  for (const [key, list] of reg.claims) {
    if (!key.endsWith("|mla_term")) continue;
    for (const c of list) {
      const v = JSON.parse(c.object_value) as {
        term?: string;
        constituencyId?: string;
        party?: string;
      };
      const person = c.subject_ref.replace(/^person:/, "");
      const ac = String(v.constituencyId);
      out.push({
        constituencyId: ac,
        name: nameOf(reg, person),
        partyId: v.party ?? undefined,
        term: v.term ?? undefined,
        marginVotes: claimValue(reg, c.subject_ref, "mla_margin_votes") ?? null,
        voteShare: claimValue(reg, c.subject_ref, "mla_vote_share") ?? null,
        candidateId: electedMyneta.get(ac) ?? null,
        sourceUrl: httpUrl(c.url) ?? undefined,
      });
    }
  }
  return out;
}

function demographics(db: DatabaseSync, reg: Registry): Row[] {
  const fields: [string, string][] = [
    ["population", "population"],
    ["literacyRate", "literacyRate"],
    ["sexRatio", "sexRatio"],
    ["scPct", "scPct"],
    ["stPct", "stPct"],
    ["urbanPct", "urbanPct"],
  ];
  const out: Row[] = [];
  for (const p of all<{ n: number; place_id: string }>(
    db,
    `SELECT pv.number AS n, pv.place_id AS place_id
       FROM place_version pv JOIN place p ON p.id = pv.place_id
      WHERE p.kind = 'ac' ORDER BY pv.number`,
  )) {
    const subject = `place:${p.place_id}`;
    const anchor = fields
      .map(([, path]) => claimRow(reg, subject, `demographics.${path}`))
      .find((c) => c !== undefined);
    if (anchor === undefined) continue;
    const row: Row = { constituencyId: seatId(Number(p.n)) };
    for (const [seedField, path] of fields) {
      row[seedField] = claimValue(reg, subject, `demographics.${path}`) ?? null;
    }
    row["sourceYear"] = Number((anchor.as_of ?? "").slice(0, 4));
    const note = claimValue(reg, subject, "demographics.source_note");
    if (note !== undefined) row["sourceNote"] = note;
    out.push(row);
  }
  return out;
}

function cabinet(_db: DatabaseSync, reg: Registry): Row[] {
  type Portfolio = { claimId: number; ministry: string; rank: string | null; from: string | null };
  const byPerson = new Map<
    string,
    { url: string | null; constituencyId: string | null; party: string | null; ps: Portfolio[] }
  >();
  for (const [key, list] of reg.claims) {
    if (!key.includes("|cabinet_portfolio:")) continue;
    for (const c of list) {
      const v = JSON.parse(c.object_value) as {
        ministry?: string;
        rank?: string | null;
        constituencyId?: string | null;
        partyId?: string | null;
      };
      const person = c.subject_ref.replace(/^person:/, "");
      const cur =
        byPerson.get(person) ??
        { url: httpUrl(c.url) ?? null, constituencyId: v.constituencyId ?? null, party: v.partyId ?? null, ps: [] };
      cur.ps.push({
        claimId: Number(c.id),
        ministry: String(v.ministry),
        rank: v.rank ?? null,
        from: c.as_of,
      });
      byPerson.set(person, cur);
    }
  }
  return [...byPerson].map(([person, m]) => {
    const name = nameOf(reg, person);
    // ponytail: portfolio order is claim.id order, which is the order the ingest read them and so
    // the seed's own order. claim.id is a DATABASE-LOCAL surrogate (ADR 0001) — the registry has no
    // portfolio sequence column, so this ordering is not reproducible across databases. Add an
    // explicit sequence to the claim value if the order ever has to be published.
    const ps = [...m.ps].sort((a, b) => a.claimId - b.claimId);
    return {
      id: isAmb(name) ? name : slug(name),
      name,
      partyId: m.party ?? undefined,
      ...(m.constituencyId == null ? {} : { constituencyId: m.constituencyId }),
      portfolios: ps.map((p) => ({
        ministry: p.ministry,
        ...(p.rank == null ? {} : { rank: p.rank }),
        ...(p.from == null ? {} : { from: p.from }),
      })),
      sourceUrl: m.url ?? undefined,
    };
  });
}

/** Outlines back out of place_geometry, in the seed's own shape. Both modules were 0% and allowlisted
 *  as unstorable until migration 008 gave them a table. */
function geometry(db: DatabaseSync, kind: "ac" | "district"): Row[] {
  return all<{ name: string; number: number | null; path: string; cx: number; cy: number }>(
    db,
    `SELECT p.canonical_name AS name, pv.number AS number, g.path AS path,
            g.centroid_x AS cx, g.centroid_y AS cy
       FROM place_geometry g
       JOIN place_version pv ON pv.id = g.place_version_id
       JOIN place p          ON p.id = pv.place_id
      WHERE p.kind = ?
      ORDER BY pv.number, p.canonical_name`,
    kind,
  ).map((r) =>
    kind === "ac"
      ? {
          // The seed keys constituency outlines by the old app's cXXXX id, which is a function of the
          // seat number — the same correspondence the redirects use, measured at 294/294.
          id: `c${String(r.number ?? 0).padStart(4, "0")}`,
          acNo: r.number,
          path: r.path,
          centroid: { x: r.cx, y: r.cy },
        }
      : {
          // The seed spells districts the census way and the place tree spells them the ECI way — the
          // disagreement the ingest's DISTRICT_ALIAS exists to bridge. Reconstruction has to spell them
          // back the seed's way or 9 of 19 rows look invented; the map is imported rather than restated
          // so the two directions cannot drift apart.
          name: censusName(r.name),
          path: r.path,
          centroid: { x: r.cx, y: r.cy },
        },
  );
}

function mps(db: DatabaseSync, reg: Registry): Row[] {
  // Seat number by constituency name, from the `pc` places the Lok Sabha ingest now creates. Before
  // those existed this field was allowlisted as unstorable; it was only ever unread.
  const pcNumber = new Map<string, number>();
  for (const r of all<{ name: string; number: number | null }>(
    db,
    `SELECT p.canonical_name AS name, pv.number AS number
       FROM place p JOIN place_version pv ON pv.place_id = p.id
      WHERE p.kind = 'pc'`,
  )) {
    if (r.number !== null) pcNumber.set(r.name, r.number);
  }
  const out: Row[] = [];
  for (const [key, list] of reg.claims) {
    if (!key.endsWith("|ls_seat_won")) continue;
    for (const c of list) {
      const v = JSON.parse(c.object_value) as {
        constituency?: string;
        party?: string;
        margin?: number | null;
      };
      const name = nameOf(reg, c.subject_ref.replace(/^person:/, ""));
      out.push({
        id: isAmb(name) ? name : slug(name),
        name,
        partyId: v.party ?? undefined,
        lsConstituency: v.constituency ?? undefined,
        lsNumber: v.constituency === undefined ? undefined : (pcNumber.get(v.constituency) ?? undefined),
        margin: v.margin ?? null,
        electedOn: c.as_of ?? undefined,
        sourceUrl: httpUrl(c.url) ?? undefined,
      });
    }
  }
  return out;
}

// ─── the diff ────────────────────────────────────────────────────────────────

export type Example = { row: string; seed: string; got: string };
export type FieldStat = {
  field: string;
  exact: number;
  diff: number;
  ambiguous: number;
  /** Of the ambiguous ones, how many the survivor's canonical name would have got right. */
  guessable: number;
  notStored: number;
  examples: Example[];
};
export type ModuleStat = {
  file: string;
  seedRows: number;
  rebuiltRows: number;
  matchedRows: number;
  droppedRows: number;
  /** Rebuilt rows whose key is in no seed row. Counted against the percentage, not ignored. */
  inventedRows: number;
  values: number;
  exact: number;
  ambiguous: number;
  pct: number;
  fields: FieldStat[];
};
export type DiffReport = {
  modules: ModuleStat[];
  /** Every seed module, geometry included. The number that says what the seed still holds alone. */
  values: number;
  exact: number;
  ambiguous: number;
  pct: number;
  /** The eight modules the ingest actually reads. The number the ratchet gates, because a module
   *  nothing ingests cannot improve and would pin the gate below anything reachable. Both are
   *  printed, so neither can be quoted without the other. */
  ingestedValues: number;
  ingestedExact: number;
  ingestedPct: number;
};

/** Leaf values by path. `[]` for an empty array so an absent array and an empty one differ. */
function leaves(v: unknown, path: string, out: Map<string, unknown>): void {
  if (v === null || typeof v !== "object") {
    if (v !== undefined) out.set(path, v);
    return;
  }
  if (Array.isArray(v)) {
    if (v.length === 0) out.set(path, "[]");
    else v.forEach((x, i) => leaves(x, `${path}.${i}`, out));
    return;
  }
  for (const [k, val] of Object.entries(v)) leaves(val, path === "" ? k : `${path}.${k}`, out);
}
const flat = (r: Row): Map<string, unknown> => {
  const out = new Map<string, unknown>();
  leaves(r, "", out);
  return out;
};
/** `topContestants.3.votes` -> `topContestants[].votes`: one report line per field, not per index. */
const reportPath = (p: string): string => p.replace(/\.\d+(?=\.|$)/g, "[]");
const show = (v: unknown): string => {
  if (v === undefined) return "—";
  if (isAmb(v)) return `ambiguous (guess: ${v.slice(AMB.length)})`;
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
};

/** The pseudo-field whole rows the ingest discarded are counted under. */
const DISCARDED = "(row discarded: duplicate key)";
/** And the one a rebuilt row with no seed row is counted under: the rebuild invented it. */
const INVENTED = "(row invented: no seed row for this key)";

/** historical-results.json holds 40 (year, AC) keys twice; the ingest keeps ONE by the same content
 *  rule used here, so the other 40 rows are counted as dropped rather than blamed on the rebuild. */
function pickSeedRow(file: string, rows: readonly Row[]): { kept: Row; dropped: Row[] } {
  if (rows.length === 1 || file !== "historical-results.json") {
    return { kept: rows[0] as Row, dropped: rows.slice(1) };
  }
  let kept = rows[0] as Row;
  for (const r of rows.slice(1)) {
    const a = Number(r["totalVotes"] ?? -1);
    const b = Number(kept["totalVotes"] ?? -1);
    const better =
      a !== b ? a > b : contentId([JSON.stringify(r)]) < contentId([JSON.stringify(kept)]);
    if (better) kept = r;
  }
  return { kept, dropped: rows.filter((r) => r !== kept) };
}

export function diff(seed: Seed, rebuilt: Seed): DiffReport {
  const modules: ModuleStat[] = [];
  for (const file of MODULES) {
    const seedRows = seed[file] ?? [];
    const rebuiltRows = rebuilt[file] ?? [];
    const key = KEY[file] as (r: Row) => string;
    const notStored = new Set(NOT_STORED[file] ?? []);
    const got = new Map<string, Row>();
    for (const r of rebuiltRows) got.set(key(r), r);
    const grouped = new Map<string, Row[]>();
    for (const r of seedRows) {
      const k = key(r);
      grouped.set(k, [...(grouped.get(k) ?? []), r]);
    }

    const stats = new Map<string, FieldStat>();
    const bump = (
      field: string,
      bucket: "exact" | "diff" | "ambiguous" | "notStored",
      ex?: Example,
      guessable?: boolean,
    ): void => {
      const s =
        stats.get(field) ??
        { field, exact: 0, diff: 0, ambiguous: 0, guessable: 0, notStored: 0, examples: [] };
      s[bucket] += 1;
      if (guessable === true) s.guessable += 1;
      if (ex !== undefined && s.examples.length < 3) s.examples.push(ex);
      stats.set(field, s);
    };

    let matchedRows = 0;
    let droppedRows = 0;
    for (const [k, rows] of grouped) {
      const { kept, dropped } = pickSeedRow(file, rows);
      droppedRows += dropped.length;
      const target = got.get(k);
      if (target !== undefined) matchedRows += 1;
      const seedFlat = flat(kept);
      const gotFlat = target === undefined ? new Map<string, unknown>() : flat(target);
      // Rows the ingest discarded are counted under one pseudo-field: they are whole rows lost to a
      // duplicate key, not a per-field failure, and spreading them over 20 field lines hid the real
      // per-field differences behind the same 40 rows repeated.
      for (const d of dropped) {
        for (const _ of flat(d).keys()) bump(DISCARDED, "diff", { row: k, seed: "whole row", got: "—" });
      }
      for (const p of new Set([...seedFlat.keys(), ...gotFlat.keys()])) {
        const field = reportPath(p);
        const want = seedFlat.get(p);
        const have = gotFlat.get(p);
        if (have === undefined) {
          if (notStored.has(field) || NOT_INGESTED.has(file)) bump(field, "notStored");
          else bump(field, "diff", { row: k, seed: show(want), got: "—" });
          continue;
        }
        if (isAmb(have)) {
          bump(
            field,
            "ambiguous",
            { row: k, seed: show(want), got: show(have) },
            String(want) === have.slice(AMB.length),
          );
          continue;
        }
        // Absence in two encodings is agreement, not a difference. historical-results.json records the
        // 2026 winners' votes and voteShare as 0 — the source reports no tallies and the seed had
        // nowhere to say so — while the registry now stores NULL for exactly those rows (migration
        // 007). Counting that as a mismatch would mean the round-trip figure FELL by 0.3pp because the
        // registry stopped repeating its input's fabricated zero, and the ratchet would then block the
        // honesty fix. A gate that punishes telling the truth is a broken gate.
        //
        // Deliberately narrow: only these two fields, only where the seed says 0 and the registry says
        // nothing. A registry 0 against a seed 0 is still exact, and a registry NULL against a seed
        // 4,231 is still a difference.
        if (want === 0 && (have === undefined || have === null) && ABSENCE_AS_ZERO.has(field))
          bump(field, "exact");
        else if (want === have) bump(field, "exact");
        else bump(field, "diff", { row: k, seed: show(want), got: show(have) });
      }
    }

    // Every rebuilt row the seed has no row for, under one pseudo-field and one value per leaf, so
    // an invented row costs the percentage what a lost row costs it.
    let inventedRows = 0;
    for (const [k, r] of got) {
      if (grouped.has(k)) continue;
      inventedRows += 1;
      for (const _ of flat(r).keys()) bump(INVENTED, "diff", { row: k, seed: "—", got: "whole row" });
    }

    const fields = [...stats.values()].sort((a, b) => a.field.localeCompare(b.field));
    const values = fields.reduce((n, f) => n + f.exact + f.diff + f.ambiguous + f.notStored, 0);
    const exact = fields.reduce((n, f) => n + f.exact, 0);
    modules.push({
      file,
      seedRows: seedRows.length,
      rebuiltRows: rebuiltRows.length,
      matchedRows,
      droppedRows,
      inventedRows,
      values,
      exact,
      ambiguous: fields.reduce((n, f) => n + f.ambiguous, 0),
      pct: values === 0 ? 0 : (100 * exact) / values,
      fields,
    });
  }
  const values = modules.reduce((n, m) => n + m.values, 0);
  const exact = modules.reduce((n, m) => n + m.exact, 0);
  const ingested = modules.filter((m) => !NOT_INGESTED.has(m.file));
  const ingestedValues = ingested.reduce((n, m) => n + m.values, 0);
  const ingestedExact = ingested.reduce((n, m) => n + m.exact, 0);
  return {
    modules,
    values,
    exact,
    ambiguous: modules.reduce((n, m) => n + m.ambiguous, 0),
    pct: values === 0 ? 0 : (100 * exact) / values,
    ingestedValues,
    ingestedExact,
    ingestedPct: ingestedValues === 0 ? 0 : (100 * ingestedExact) / ingestedValues,
  };
}

/** Read the seed, rebuild it from the registry, compare. */
export function diffAgainstSeed(db: DatabaseSync, dir?: string): DiffReport {
  return diff(readSeed(dir), reconstruct(db));
}

/**
 * The gate. 94.1 is TODAY'S MEASURED VALUE floored to a tenth (measured 94.11% on 2026-08-09, after
 * the Lok Sabha load made wbmps.json 100% by giving lsNumber somewhere to live,
 * .data/registry.db after migrate + ingest + resolve). It was 85.8 for one commit, over eleven
 * "modules" — two of which nothing ingests and one of which was registry bookkeeping scoring a false
 * 100%, with photoUrl and incumbentYears wrongly declared unstorable. Not 100: cycle 1 shipped an
 * unsatisfiable vote-share invariant and an always-red gate teaches people to ignore the colour.
 * This one is a RATCHET — it only ever goes up, and it goes up in the commit that makes the number
 * go up. What blocks 100% is in ADR 0004.
 */
export const THRESHOLD_PCT = 94.1;

export function formatReport(r: DiffReport): string {
  const out: string[] = [];
  const pct = (n: number): string => `${n.toFixed(1)}%`;
  for (const m of r.modules) {
    out.push("");
    out.push(
      `${m.file}  rows seed ${m.seedRows} / rebuilt ${m.rebuiltRows} / matched ${m.matchedRows}` +
        (m.droppedRows > 0 ? ` / dropped by ingest ${m.droppedRows}` : "") +
        (m.inventedRows > 0 ? ` / invented by rebuild ${m.inventedRows}` : "") +
        `   values ${m.exact}/${m.values} exact  ${pct(m.pct)}`,
    );
    const w = Math.max(5, ...m.fields.map((f) => f.field.length));
    for (const f of m.fields) {
      const bits = [`exact ${f.exact}`];
      if (f.diff > 0) bits.push(`differs ${f.diff}`);
      if (f.ambiguous > 0) {
        bits.push(`ambiguous ${f.ambiguous}${f.guessable > 0 ? ` (${f.guessable} guessable)` : ""}`);
      }
      if (f.notStored > 0) bits.push(`not reconstructable ${f.notStored}`);
      out.push(`  ${f.field.padEnd(w)}  ${bits.join("  ")}`);
      for (const e of f.examples) out.push(`  ${" ".repeat(w)}    ${e.row}: seed ${e.seed} | got ${e.got}`);
    }
  }
  out.push("");
  out.push(
    `ingested modules  ${r.ingestedExact}/${r.ingestedValues} values exact  ${pct(r.ingestedPct)}   ambiguous ${r.ambiguous}`,
    `whole seed        ${r.exact}/${r.values} values exact  ${pct(r.pct)}`,
  );
  out.push(`threshold ${pct(THRESHOLD_PCT)} — ratchet up only, never down`);
  return out.join("\n");
}
