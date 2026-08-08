// The field-coverage gate: what the seed carries, field by field, against what the registry kept.
//
// Cycles 1-3 shipped an ingest that dropped candidates.photoUrl (2,920 rows) and
// candidates.incumbentYears (157) in silence. 239 tests, 120 logged anomalies, `uncitedValues 0`
// and six review lenses all passed it, because every one of those checks asks "is what we wrote
// cited?" and not one of them asked "did we write everything?". That is the hole this file closes.
//
// One rule per input field. Either a SQL probe counting the registry rows that carry the datum, or
// an allowlist entry saying why the registry does not model it. Four ways to fail:
//   · a field in the input with no rule                      — a new seed field cannot arrive unseen
//   · a probe that counts 0, or fewer rows than the input with no `partial` reason
//   · an allowlist entry that no longer matches the input     — the list cannot rot
//   · an allowlist entry whose `assertAbsent` finds rows      — "not modelled" cannot be a lie
// A probe must also be SCOPED TO ITS MODULE, enforced structurally by the test that no two modules
// share one: three modules once shared `person_alias WHERE kind='press'`, so 42 MP names could go
// missing while the probe counted 1,041 MLA and minister aliases and called it carried.
// The gate runs inside `runIngest` against the real seed, so `mandate ingest` and CI both hit it.

import type { DatabaseSync } from "node:sqlite";

import type { ModuleKey, StaticBundle } from "./sources/wb-static.ts";

type Rule =
  /** `probe` counts registry rows carrying this datum. It must be SCOPED TO THIS MODULE: a probe
   *  that counts a table three modules write to (`person_alias WHERE kind='press'`) can never fall
   *  below one module's input, so it cannot detect that module losing the field entirely.
   *  `partial` explains a legitimate shortfall; without one, registry < input fails. */
  | { probe: string; partial?: string }
  /** Deliberately not modelled. Fails when no input row carries the field — nothing left to drop —
   *  and, where the registry has a slot the datum could plausibly land in, when `assertAbsent`
   *  finds rows in it. Without that second direction the allowlist is an unguarded escape hatch:
   *  moving a carried field here and writing a plausible reason silenced the gate AND printed
   *  "not-modelled" for something the registry was holding 2,920 rows of. */
  | { drop: string; assertAbsent?: string }
  /** Named in the ingest's own row type but never populated in the seed. Fails the day one is. */
  | { absent: string; assertAbsent?: string };

/** Every field of every seed module. `winner.votes` / `portfolios.ministry` are nested one level:
 *  a nested field is still a field, and the 2026 vote_share lives in one.
 *  Exported for the structural test that no two modules share a probe. */
export const RULES: Record<ModuleKey, Record<string, Rule>> = {
  constituencies: {
    id: { drop: "the seed's own row key; place ids are derived from assemblyNumber (wb.ac.NNN) and every row it keys is persisted under that id" },
    assemblyNumber: { probe: "SELECT COUNT(*) AS n FROM place_version WHERE number IS NOT NULL" },
    name: { probe: "SELECT COUNT(*) AS n FROM place WHERE kind = 'ac'" },
    nameBn: {
      drop: "byte-identical to `name` in all 294 rows — the seed's Bengali seat names are Latin copies, so place.names has nothing to hold. jsonNames() writes a bn only when it differs",
      assertAbsent: `SELECT COUNT(*) AS n FROM place WHERE kind = 'ac' AND names LIKE '%"bn"%'`,
    },
    district: { probe: "SELECT COUNT(*) AS n FROM place WHERE kind = 'ac' AND parent_id IS NOT NULL" },
    districtBn: {
      drop: "byte-identical to `district` in all 294 rows, same as nameBn",
      assertAbsent: `SELECT COUNT(*) AS n FROM place WHERE kind = 'district' AND names LIKE '%"bn"%'`,
    },
    reservation: { probe: "SELECT COUNT(*) AS n FROM place_version WHERE reservation IS NOT NULL" },
  },
  parties: {
    id: { probe: "SELECT COUNT(*) AS n FROM party" },
    name: { probe: "SELECT COUNT(*) AS n FROM party WHERE name IS NOT NULL" },
    nameBn: { probe: `SELECT COUNT(*) AS n FROM party WHERE names LIKE '%"bn"%'` },
    abbreviation: { probe: "SELECT COUNT(*) AS n FROM party WHERE short_name IS NOT NULL" },
    color: { drop: "the old app's chart fill. P3 is symbol-before-colour: the registry stores the symbol asset and lets the client pick a palette" },
    isNational: { probe: "SELECT COUNT(*) AS n FROM party WHERE kind IN ('national','state','independent')" },
    symbolUrl: { probe: "SELECT COUNT(*) AS n FROM symbol WHERE svg_ref IS NOT NULL" },
  },
  candidates: {
    id: { probe: "SELECT COUNT(*) AS n FROM person_identifier WHERE scheme = 'myneta_id'" },
    name: {
      // Joined to the myneta_id identifier so the probe answers only for THIS module: if the
      // candidates loop stopped writing names, no affidavit alias would be left and this reads 0.
      // ponytail: one name produces ~2.7 alias rows (blocking variants) and `mandate resolve`
      // collapses 2,920 nominations onto 2,620 persons, so there is no per-row count to compare
      // against — this detects the field's total loss, not a partial one. It becomes exact the day
      // ADR 0004's `candidacy.name_as_declared` lands, which is the same column that ends the 289
      // ambiguous names in the round trip.
      probe: "SELECT COUNT(*) AS n FROM person_alias a JOIN person_identifier i ON i.person_id = a.person_id AND i.scheme = 'myneta_id' WHERE a.kind = 'affidavit'",
    },
    nameBn: {
      absent: "the seed carries no Bengali candidate names at all; person.names would hold one the moment it did",
      assertAbsent: `SELECT COUNT(*) AS n FROM person p JOIN person_identifier i ON i.person_id = p.id AND i.scheme = 'myneta_id' WHERE p.names LIKE '%"bn"%'`,
    },
    partyId: { probe: "SELECT COUNT(*) AS n FROM candidacy WHERE party_version_id IS NOT NULL OR party_raw IS NOT NULL" },
    constituencyId: { probe: "SELECT COUNT(*) AS n FROM candidacy c JOIN contest ct ON ct.id = c.contest_id WHERE ct.election_id = 'wb-assembly-2026'" },
    photoUrl: { probe: "SELECT COUNT(*) AS n FROM claim WHERE predicate = 'photo_url_declared'" },
    age: { probe: "SELECT COUNT(*) AS n FROM claim WHERE predicate = 'age_declared'" },
    gender: {
      probe: "SELECT COUNT(*) AS n FROM person WHERE sex IS NOT NULL",
      partial: "one person row per human, not per nomination: `mandate resolve` merged duplicates and the ingest writes sex onto the survivor only",
    },
    education: { probe: "SELECT COUNT(*) AS n FROM claim WHERE predicate = 'education_declared'" },
    criminalCases: { probe: "SELECT COUNT(*) AS n FROM claim WHERE predicate = 'pending_cases_declared'" },
    totalAssets: { probe: "SELECT COUNT(*) AS n FROM affidavit_field WHERE path = 'assets.total'" },
    totalLiabilities: { probe: "SELECT COUNT(*) AS n FROM affidavit_field WHERE path = 'liabilities.total'" },
    movableAssets: { probe: "SELECT COUNT(*) AS n FROM affidavit_field WHERE path = 'assets.movable.total'" },
    immovableAssets: { probe: "SELECT COUNT(*) AS n FROM affidavit_field WHERE path = 'assets.immovable.total'" },
    affidavitUrl: { probe: "SELECT COUNT(*) AS n FROM source WHERE kind = 'affidavit' AND hash_kind = 'url_only'" },
    occupation: { probe: "SELECT COUNT(*) AS n FROM claim WHERE predicate = 'occupation_declared'" },
    incumbentYears: { probe: "SELECT COUNT(*) AS n FROM claim WHERE predicate = 'incumbent_years_declared'" },
    isIncumbent: { drop: "the boolean shadow of incumbentYears: true on exactly the 157 rows that declare a tenure, false on the other 2,763, so incumbent_years_declared carries the same fact with a number behind it" },
  },
  historicalResults: {
    // 40 of the 1,175 rows are a second row for a (year, constituency) another row already claims,
    // so a per-contest probe reads 1,135. That is the documented duplicate_result_row discard, not
    // a lost field — which is why these carry a `partial` reason instead of failing.
    constituencyId: { probe: "SELECT COUNT(*) AS n FROM (SELECT DISTINCT contest_id FROM result)", partial: "40 input rows are a duplicate (year, constituency) key and are discarded, on content — see the duplicate_result_row anomaly" },
    year: { probe: "SELECT COUNT(*) AS n FROM (SELECT DISTINCT contest_id FROM result)", partial: "as constituencyId: 40 duplicate (year, constituency) rows discarded" },
    "winner.name": { probe: "SELECT COUNT(*) AS n FROM result WHERE is_winner = 1", partial: "40 duplicate (year, constituency) rows discarded" },
    "winner.partyId": { probe: "SELECT COUNT(*) AS n FROM result r JOIN candidacy c ON c.id = r.candidacy_id WHERE r.is_winner = 1 AND (c.party_version_id IS NOT NULL OR c.party_raw IS NOT NULL)", partial: "40 duplicate (year, constituency) rows discarded" },
    "winner.partyAbbr": { probe: "SELECT COUNT(*) AS n FROM result r JOIN candidacy c ON c.id = r.candidacy_id WHERE r.is_winner = 1 AND (c.party_version_id IS NOT NULL OR c.party_raw IS NOT NULL)", partial: "the abbreviation is a second spelling of partyId, resolved to the same party_version; 40 duplicate rows discarded" },
    "winner.votes": { probe: "SELECT COUNT(*) AS n FROM result WHERE is_winner = 1", partial: "40 duplicate (year, constituency) rows discarded" },
    "winner.voteShare": { probe: "SELECT COUNT(*) AS n FROM result WHERE is_winner = 1 AND vote_share IS NOT NULL", partial: "40 duplicate (year, constituency) rows discarded" },
    "runnerUp.name": { probe: 'SELECT COUNT(*) AS n FROM result WHERE "rank" = 2', partial: "40 duplicate (year, constituency) rows discarded" },
    "runnerUp.partyId": { probe: 'SELECT COUNT(*) AS n FROM result r JOIN candidacy c ON c.id = r.candidacy_id WHERE r."rank" = 2 AND (c.party_version_id IS NOT NULL OR c.party_raw IS NOT NULL)', partial: "40 duplicate (year, constituency) rows discarded" },
    "runnerUp.partyAbbr": { probe: 'SELECT COUNT(*) AS n FROM result r JOIN candidacy c ON c.id = r.candidacy_id WHERE r."rank" = 2 AND (c.party_version_id IS NOT NULL OR c.party_raw IS NOT NULL)', partial: "a second spelling of partyId; 40 duplicate rows discarded" },
    "runnerUp.votes": { probe: 'SELECT COUNT(*) AS n FROM result WHERE "rank" = 2', partial: "40 duplicate (year, constituency) rows discarded" },
    "runnerUp.voteShare": { probe: 'SELECT COUNT(*) AS n FROM result WHERE "rank" = 2 AND vote_share IS NOT NULL', partial: "40 duplicate (year, constituency) rows discarded" },
    // COUNT(*) FROM result counted the winner and runner-up rows too, so every topContestants
    // value could vanish and the probe would still read 4,357. A contest whose field the seed
    // publishes (every topContestants array in the seed holds at least 3) has a rank>=3 row.
    "topContestants.name": { probe: 'SELECT COUNT(DISTINCT r.contest_id) AS n FROM result r WHERE r."rank" >= 3', partial: "a topContestants entry the winner/runnerUp fields do not already carry is a rank>=3 result row; 40 duplicate (year, constituency) rows discarded" },
    "topContestants.partyId": { probe: 'SELECT COUNT(DISTINCT r.contest_id) AS n FROM result r JOIN candidacy c ON c.id = r.candidacy_id WHERE r."rank" >= 3 AND (c.party_version_id IS NOT NULL OR c.party_raw IS NOT NULL)', partial: "a topContestants entry the winner/runnerUp fields do not already carry is a rank>=3 result row; 40 duplicate (year, constituency) rows discarded" },
    "topContestants.partyAbbr": { probe: 'SELECT COUNT(DISTINCT r.contest_id) AS n FROM result r JOIN candidacy c ON c.id = r.candidacy_id WHERE r."rank" >= 3 AND (c.party_raw IS NOT NULL OR EXISTS (SELECT 1 FROM party_version pv JOIN party pt ON pt.id = pv.party_id WHERE pv.id = c.party_version_id AND pt.short_name IS NOT NULL))', partial: "a topContestants entry the winner/runnerUp fields do not already carry is a rank>=3 result row; 40 duplicate (year, constituency) rows discarded" },
    "topContestants.votes": { probe: 'SELECT COUNT(DISTINCT r.contest_id) AS n FROM result r WHERE r."rank" >= 3 AND r.votes IS NOT NULL', partial: "a topContestants entry the winner/runnerUp fields do not already carry is a rank>=3 result row; 40 duplicate (year, constituency) rows discarded" },
    "topContestants.voteShare": { probe: 'SELECT COUNT(DISTINCT r.contest_id) AS n FROM result r WHERE r."rank" >= 3 AND r.vote_share IS NOT NULL', partial: "a topContestants entry the winner/runnerUp fields do not already carry is a rank>=3 result row; 40 duplicate (year, constituency) rows discarded" },
    turnoutPct: { probe: "SELECT COUNT(*) AS n FROM claim WHERE predicate = 'turnout_pct'", partial: "40 duplicate (year, constituency) rows discarded" },
    marginVotes: { probe: "SELECT COUNT(*) AS n FROM result WHERE is_winner = 1 AND margin IS NOT NULL", partial: "40 duplicate (year, constituency) rows discarded" },
    marginPct: { drop: "derived: marginVotes / totalVotes, both of which the registry stores. A stored ratio is a second copy of a number that can disagree with its operands" },
    totalVotes: { probe: "SELECT COUNT(*) AS n FROM turnout WHERE voters IS NOT NULL", partial: "40 duplicate (year, constituency) rows discarded" },
    totalElectors: { probe: "SELECT COUNT(*) AS n FROM turnout WHERE electors IS NOT NULL", partial: "40 duplicate (year, constituency) rows discarded" },
  },
  currentMLAs: {
    constituencyId: { probe: "SELECT COUNT(*) AS n FROM claim WHERE predicate = 'mla_term' AND json_extract(object_value, '$.placeId') IS NOT NULL" },
    name: { probe: "SELECT COUNT(DISTINCT a.person_id) AS n FROM person_alias a JOIN claim c ON c.subject_ref = 'person:' || a.person_id WHERE a.kind = 'press' AND c.predicate = 'mla_term'" },
    partyId: { probe: "SELECT COUNT(*) AS n FROM claim WHERE predicate = 'mla_term' AND json_extract(object_value, '$.partyId') IS NOT NULL" },
    term: { probe: "SELECT COUNT(*) AS n FROM claim WHERE predicate = 'mla_term' AND as_of IS NOT NULL" },
    marginVotes: { probe: "SELECT COUNT(*) AS n FROM claim WHERE predicate = 'mla_margin_votes'" },
    voteShare: { probe: "SELECT COUNT(*) AS n FROM claim WHERE predicate = 'mla_vote_share'" },
    candidateId: { probe: "SELECT COUNT(*) AS n FROM candidacy c JOIN contest ct ON ct.id = c.contest_id WHERE ct.election_id = 'wb-assembly-2026' AND c.status = 'elected'" },
    sourceUrl: {
      probe: "SELECT COUNT(DISTINCT ci.source_id) AS n FROM citation ci JOIN claim c ON c.id = ci.claim_id WHERE c.predicate = 'mla_term'",
      partial: "one source row per distinct URL, not per row that cites it: the 294 MLA rows name 2 distinct pages",
    },
  },
  demographics: {
    constituencyId: { probe: "SELECT COUNT(DISTINCT subject_ref) AS n FROM claim WHERE predicate LIKE 'demographics.%'" },
    population: { probe: "SELECT COUNT(*) AS n FROM claim WHERE predicate = 'demographics.population'" },
    literacyRate: { probe: "SELECT COUNT(*) AS n FROM claim WHERE predicate = 'demographics.literacyRate'" },
    sexRatio: { probe: "SELECT COUNT(*) AS n FROM claim WHERE predicate = 'demographics.sexRatio'" },
    scPct: { probe: "SELECT COUNT(*) AS n FROM claim WHERE predicate = 'demographics.scPct'" },
    stPct: { probe: "SELECT COUNT(*) AS n FROM claim WHERE predicate = 'demographics.stPct'" },
    urbanPct: { probe: "SELECT COUNT(*) AS n FROM claim WHERE predicate = 'demographics.urbanPct'" },
    sourceYear: { probe: "SELECT COUNT(DISTINCT subject_ref) AS n FROM claim WHERE predicate LIKE 'demographics.%' AND as_of IS NOT NULL" },
    sourceNote: { probe: "SELECT COUNT(*) AS n FROM claim WHERE predicate = 'demographics.source_note'" },
  },
  cabinet: {
    id: { drop: "the seed's own row key; a minister is a person row keyed by name and seat, and the ministry is in the predicate" },
    name: { probe: "SELECT COUNT(DISTINCT a.person_id) AS n FROM person_alias a JOIN claim c ON c.subject_ref = 'person:' || a.person_id WHERE a.kind = 'press' AND c.predicate LIKE 'cabinet_portfolio:%'" },
    partyId: { probe: "SELECT COUNT(*) AS n FROM claim WHERE predicate LIKE 'cabinet_portfolio:%' AND json_extract(object_value, '$.partyId') IS NOT NULL" },
    constituencyId: { probe: "SELECT COUNT(*) AS n FROM claim WHERE predicate LIKE 'cabinet_portfolio:%' AND json_extract(object_value, '$.constituencyId') IS NOT NULL" },
    lat: {
      drop: "a map pin for the old app's cabinet map. The registry locates a minister by placeId; a pair of floats with no geometry_ref is not a place",
      assertAbsent: "SELECT COUNT(*) AS n FROM place_version WHERE geometry_ref IS NOT NULL",
    },
    lng: { drop: "as lat", assertAbsent: "SELECT COUNT(*) AS n FROM place_version WHERE geometry_ref IS NOT NULL" },
    "portfolios.ministry": { probe: "SELECT COUNT(*) AS n FROM claim WHERE predicate LIKE 'cabinet_portfolio:%'" },
    "portfolios.rank": { probe: "SELECT COUNT(*) AS n FROM claim WHERE predicate LIKE 'cabinet_portfolio:%' AND json_extract(object_value, '$.rank') IS NOT NULL" },
    "portfolios.from": { probe: "SELECT COUNT(*) AS n FROM claim WHERE predicate LIKE 'cabinet_portfolio:%' AND as_of IS NOT NULL" },
    inducted: { drop: "the minister's induction date, which every portfolio restates as its own `from` — and the per-portfolio date is the one the registry can date a claim with (claim.as_of)" },
    bio: { drop: "an editorial paragraph, not a declared value: there is no predicate a prose blurb is the object of, and §12 has no free-text profile slot" },
    sourceUrl: {
      probe: "SELECT COUNT(DISTINCT ci.source_id) AS n FROM citation ci JOIN claim c ON c.id = ci.claim_id WHERE c.predicate LIKE 'cabinet_portfolio:%'",
      partial: "one source row per distinct URL: all 6 cabinet rows name the same page",
    },
  },
  mps: {
    id: { drop: "the seed's own row key; the MP is a person row keyed by seat and name" },
    name: { probe: "SELECT COUNT(DISTINCT a.person_id) AS n FROM person_alias a JOIN claim c ON c.subject_ref = 'person:' || a.person_id WHERE a.kind = 'press' AND c.predicate = 'ls_seat_won'" },
    partyId: { probe: "SELECT COUNT(*) AS n FROM claim WHERE predicate = 'ls_seat_won' AND json_extract(object_value, '$.partyId') IS NOT NULL" },
    lsConstituency: { probe: "SELECT COUNT(*) AS n FROM claim WHERE predicate = 'ls_seat_won' AND json_extract(object_value, '$.constituency') IS NOT NULL" },
    lsNumber: {
      drop: "the Lok Sabha seat number. This registry has no LS place row for it to number — the seat travels as its name inside ls_seat_won, and a number with no place is unjoinable",
      assertAbsent: "SELECT COUNT(*) AS n FROM place WHERE kind = 'pc'",
    },
    margin: { probe: "SELECT COUNT(*) AS n FROM claim WHERE predicate = 'ls_seat_won' AND json_extract(object_value, '$.margin') IS NOT NULL" },
    electedOn: { probe: "SELECT COUNT(*) AS n FROM claim WHERE predicate = 'ls_seat_won' AND as_of IS NOT NULL" },
    sourceUrl: {
      probe: "SELECT COUNT(DISTINCT ci.source_id) AS n FROM citation ci JOIN claim c ON c.id = ci.claim_id WHERE c.predicate = 'ls_seat_won'",
      partial: "one source row per distinct URL: all 42 MP rows name the same page",
    },
  },
};

export type CoverageVerdict = "carried" | "partial" | "not-modelled" | "dropped";

export type CoverageRow = {
  module: ModuleKey;
  field: string;
  /** Input rows carrying a non-null, non-empty value. */
  input: number;
  /** Registry rows the probe counted; null for an allowlisted field, which has no slot to count. */
  registry: number | null;
  verdict: CoverageVerdict;
  reason: string | null;
  /** The gate's complaint, or null when this row passes. */
  failure: string | null;
};

/** field -> how many rows carry a non-null, non-empty value. One level into nested objects and
 *  arrays of objects, so `winner.voteShare` and `portfolios.ministry` are fields in their own
 *  right. `false` counts: a declared false is a value, which is exactly why isIncumbent is on the
 *  allowlist rather than invisible. */
export function inputFieldCounts(rows: readonly unknown[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const present = new Set<string>();
    collect(row, "", present, 0);
    for (const f of present) counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  return counts;
}

// ponytail: two levels deep, which is every shape the seed has (winner.votes, portfolios.from).
// A third level would need a depth bump here and nothing else.
function collect(value: unknown, path: string, present: Set<string>, depth: number): void {
  if (value == null || value === "") return;
  if (Array.isArray(value)) {
    for (const v of value) collect(v, path, present, depth);
    return;
  }
  if (typeof value === "object" && depth < 2) {
    for (const [k, v] of Object.entries(value)) {
      collect(v, path === "" ? k : `${path}.${k}`, present, depth + 1);
    }
    return;
  }
  if (path !== "") present.add(path);
}

/** The whole table, one row per field of all eight modules, each already judged. */
export function fieldCoverage(db: DatabaseSync, bundle: StaticBundle): CoverageRow[] {
  const out: CoverageRow[] = [];
  const count = (sql: string): number => Number(db.prepare(sql).get()?.n ?? 0);
  for (const module of Object.keys(RULES) as ModuleKey[]) {
    const rules = RULES[module];
    const input = inputFieldCounts(bundle[module] as readonly unknown[]);
    const fields = [...new Set([...input.keys(), ...Object.keys(rules)])].sort();
    for (const field of fields) {
      const n = input.get(field) ?? 0;
      const rule = rules[field];
      const at = `${module}.${field}`;
      if (rule === undefined) {
        out.push({
          module, field, input: n, registry: null, verdict: "dropped", reason: null,
          failure: `${at}: ${n} input rows carry it and field-coverage.ts has no rule saying where it goes. Add a probe if the ingest persists it, or an allowlist entry with the reason it does not.`,
        });
        continue;
      }
      if ("drop" in rule || "absent" in rule) {
        const reason = "drop" in rule ? rule.drop : rule.absent;
        const wrongDirection =
          "drop" in rule
            ? n === 0
              ? `${at}: allowlisted as not modelled, but no input row carries it any more. Delete the entry — an allowlist that outlives its field hides the next real drop.`
              : null
            : n === 0
              ? null
              : `${at}: allowlisted as empty in the seed, but ${n} rows now carry a value. Model it and give it a probe.`;
        // The other direction: an entry that claims the registry does not hold the datum, while the
        // registry holds it. Moving a live field onto the allowlist with a plausible reason is the
        // first thing anyone reaches for when this gate goes red, and it used to be free.
        const held = rule.assertAbsent === undefined ? null : count(rule.assertAbsent);
        out.push({
          module, field, input: n, registry: held, verdict: "not-modelled", reason,
          failure:
            wrongDirection ??
            (held !== null && held > 0
              ? `${at}: allowlisted as not modelled, but ${held} registry rows carry it. Delete the entry and give the field a probe — the reason is false. (assertAbsent: ${rule.assertAbsent ?? ""})`
              : null),
        });
        continue;
      }
      const got = count(rule.probe);
      if (n === 0) {
        out.push({
          module, field, input: 0, registry: got, verdict: "dropped", reason: null,
          failure: `${at}: has a registry probe but no input row carries it. Delete the probe, or fix the field name it is spelled with.`,
        });
        continue;
      }
      if (got === 0) {
        out.push({
          module, field, input: n, registry: 0, verdict: "dropped", reason: null,
          failure: `${at}: ${n} input rows carry it, 0 reached the registry. The ingest is dropping it. (probe: ${rule.probe})`,
        });
        continue;
      }
      if (got < n) {
        out.push({
          module, field, input: n, registry: got, verdict: "partial", reason: rule.partial ?? null,
          failure: rule.partial === undefined
            ? `${at}: ${n} input rows carry it, ${got} reached the registry, and no reason is recorded for the shortfall. Explain it in the rule's \`partial\` or fix the ingest.`
            : null,
        });
        continue;
      }
      out.push({ module, field, input: n, registry: got, verdict: "carried", reason: null, failure: null });
    }
  }
  return out;
}

export const coverageFailures = (rows: readonly CoverageRow[]): string[] =>
  rows.flatMap((r) => (r.failure === null ? [] : [r.failure]));

/** The table, for `mandate ingest` and for the message of the error the gate throws. */
export function formatCoverage(rows: readonly CoverageRow[]): string {
  const cells = rows.map((r) => [
    `${r.module}.${r.field}`,
    String(r.input),
    r.registry === null ? "-" : String(r.registry),
    r.verdict,
    r.reason ?? "",
  ]);
  const head = ["field", "input", "registry", "verdict", "reason"];
  const w = head.map((h, i) => Math.max(h.length, ...cells.map((c) => (c[i] ?? "").length)));
  const line = (c: readonly string[]): string =>
    c.map((v, i) => (i === c.length - 1 ? v : v.padEnd(w[i] ?? 0))).join("  ").trimEnd();
  return [line(head), line(w.map((n) => "-".repeat(n))), ...cells.map(line)].join("\n");
}

// ─── the shape contract the JSON import gave away ────────────────────────────
// src/data/*.ts used to be `export const candidates: Candidate[] = [ ...literals ]`, so tsc checked
// every row against src/types/index.ts: a missing `age` was TS2741 and `gender: "Wombat"` was TS2322.
// The rows are JSON now and the shims say `raw as Candidate[]`, which checks neither. An annotation
// cannot replace the cast: TypeScript WIDENS a JSON literal, so `reservation: "SC"` arrives as
// `string` and a correct row fails too (verified with this repo's tsc). So the two error classes the
// annotation caught are checked here instead, at ingest, against the same interfaces.
//
// ponytail: required keys and string/number unions only — the two classes that reach a page as
// `undefined` or as an unhandled branch. A wrong primitive type still errors at build via the cast
// (TS2352). Widen this to full per-field validation the day the seed gains a field the app parses.

type Shape = {
  /** Non-optional keys of the module's interface. Dotted for a nested object or array of objects:
   *  `winner.name`, `portfolios.ministry`. Presence, not truthiness — `isNational: false`,
   *  `criminalCases: 0` and `marginVotes: null` are declared values. */
  required: readonly string[];
  /** Field -> the interface's string/number literal union. Checked only when a value is present. */
  enums?: Record<string, readonly (string | number)[]>;
};

const RESERVATION = ["General", "SC", "ST"] as const;
const GENDER = ["Male", "Female", "Other"] as const;
const TERM = ["2021-2026", "2026-2031"] as const;
const MINISTRY_RANK = ["CM", "Cabinet", "MoS-Independent", "MoS"] as const;
const ELECTION_YEAR = [2011, 2016, 2021, 2026] as const;

const SHAPES: Record<ModuleKey, Shape> = {
  constituencies: {
    required: ["id", "name", "nameBn", "district", "districtBn", "reservation", "assemblyNumber"],
    enums: { reservation: RESERVATION },
  },
  parties: { required: ["id", "name", "nameBn", "abbreviation", "color", "isNational"] },
  candidates: {
    required: [
      "id", "name", "partyId", "constituencyId", "age", "education", "criminalCases",
      "totalAssets", "totalLiabilities", "isIncumbent",
    ],
    enums: { gender: GENDER },
  },
  historicalResults: {
    required: [
      "constituencyId", "year", "turnoutPct", "marginVotes", "marginPct", "totalVotes",
      "winner.name", "winner.partyId", "winner.partyAbbr", "winner.votes", "winner.voteShare",
      "runnerUp.name", "runnerUp.partyId", "runnerUp.partyAbbr", "runnerUp.votes", "runnerUp.voteShare",
      "topContestants.name", "topContestants.partyId", "topContestants.partyAbbr",
      "topContestants.votes", "topContestants.voteShare",
    ],
    enums: { year: ELECTION_YEAR },
  },
  currentMLAs: {
    required: [
      "constituencyId", "name", "partyId", "term", "marginVotes", "voteShare", "candidateId",
      "sourceUrl",
    ],
    enums: { term: TERM },
  },
  demographics: { required: ["constituencyId", "sourceYear"] },
  cabinet: {
    required: [
      "id", "name", "partyId", "portfolios", "inducted", "sourceUrl",
      "portfolios.ministry", "portfolios.rank", "portfolios.from",
    ],
    enums: { "portfolios.rank": MINISTRY_RANK },
  },
  mps: {
    required: ["id", "name", "partyId", "lsConstituency", "lsNumber", "margin", "electedOn", "sourceUrl"],
  },
};

/** Every object a dotted path's last segment could live on: `winner` -> the winner object (or
 *  nothing, when the row has no winner), `portfolios` -> every portfolio in the array. An absent
 *  optional container (`runnerUp`) yields no parents, so its own required keys are not demanded. */
function parentsAt(value: unknown, segments: readonly string[]): Record<string, unknown>[] {
  if (value == null || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((v) => parentsAt(v, segments));
  if (segments.length === 0) return [value as Record<string, unknown>];
  return parentsAt((value as Record<string, unknown>)[segments[0] as string], segments.slice(1));
}

/** One line per violated row, capped: an override that drops a key usually drops it everywhere, and
 *  2,920 identical lines is not more information than 5. */
export function seedShapeFailures(bundle: StaticBundle): string[] {
  const out: string[] = [];
  for (const module of Object.keys(SHAPES) as ModuleKey[]) {
    const shape = SHAPES[module];
    const rows = bundle[module] as readonly unknown[];
    const say = (msg: string): void => {
      if (out.length < 40) out.push(`${module}: ${msg}`);
    };
    rows.forEach((row, i) => {
      const where = `row ${i}${typeof (row as Record<string, unknown>)?.["id"] === "string" ? ` (${String((row as Record<string, unknown>)["id"])})` : ""}`;
      for (const path of shape.required) {
        const segments = path.split(".");
        const leaf = segments[segments.length - 1] as string;
        for (const parent of parentsAt(row, segments.slice(0, -1))) {
          if (!Object.hasOwn(parent, leaf) || parent[leaf] === undefined) {
            say(`${where} has no \`${path}\`, which src/types/index.ts declares non-optional. The old app renders it as undefined.`);
          }
        }
      }
      for (const [path, allowed] of Object.entries(shape.enums ?? {})) {
        const segments = path.split(".");
        const leaf = segments[segments.length - 1] as string;
        for (const parent of parentsAt(row, segments.slice(0, -1))) {
          const v = parent[leaf];
          if (v == null) continue;
          if (!(allowed as readonly unknown[]).includes(v)) {
            say(`${where} has \`${path}\` = ${JSON.stringify(v)}, which is not one of ${allowed.map((a) => JSON.stringify(a)).join(" | ")}.`);
          }
        }
      }
    });
  }
  return out;
}
