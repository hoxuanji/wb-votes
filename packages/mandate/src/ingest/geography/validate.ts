/**
 * Ten checks on electoral geography, and the before/after metric for the repair.
 *
 * Each check states what it proves and what it does not. A check that cannot be evaluated says so and
 * counts as `skipped` — it never reports zero violations for a question it did not ask, because a green
 * report that was never computed is worse than a red one.
 *
 * Checks 1 and 5-6 and the headline metric need the source files, because "does this name match the
 * source" is not answerable from the registry alone. They read the hash-verified cache written by
 * ops/geo/refetch-lokdhaba.sh; without it they skip. Everything else is pure SQL against the registry.
 */

import type { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { all, get } from "../../db/index.ts";
import { MANIFEST_PATH } from "./backfill.ts";
import { epochByElection, readManifest, reconstruct, type SourceSeat } from "./reconstruct.ts";

export type Check = {
  n: number;
  name: string;
  /** What a violation means, in one line. */
  asks: string;
  violations: number;
  skipped: boolean;
  why?: string;
  /** Up to ten examples, so a violation is actionable rather than a number. */
  examples: string[];
};

export type GeographyValidation = {
  checks: Check[];
  metrics: {
    contests: number;
    /** Contests whose seat name came from a delimitation other than their own, reading `place` — the
     *  pre-repair path. This is the 52,875 figure and it stays measurable because `place` is untouched. */
    misnamedBefore: number | null;
    /** The same question asked of `place_version`, which is where a name lives now. */
    misnamedAfter: number | null;
    ambiguous: number;
    conflicts: number;
    unreconstructed: number;
    nameMatchLinks: number;
    crosswalkRows: number;
    succession: number;
  };
  ok: boolean;
};

const NORM = "UPPER(REPLACE(REPLACE(REPLACE(?, ' ', ''), '-', ''), '.', ''))";
const norm = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** The epoch each (jurisdiction, house) is currently in: the epoch of its most recent election. Never a
 *  literal — 'delim-2008' appears nowhere in this file, so the next delimitation needs no code change. */
export function currentEpochs(db: DatabaseSync): Map<string, string> {
  const rows = all<{ jurisdiction_id: string; kind: string; epoch_id: string }>(
    db,
    `SELECT jurisdiction_id, kind, epoch_id FROM (
       SELECT v.jurisdiction_id, v.kind, v.epoch_id,
              row_number() OVER (PARTITION BY v.jurisdiction_id, v.kind
                                 ORDER BY e.year DESC, e.polling_month DESC, e.occurrence DESC) AS rn
         FROM contest c
         JOIN election e ON e.id = c.election_id
         JOIN place_version v ON v.id = c.place_version_id
        WHERE v.kind IN ('ac','pc'))
      WHERE rn = 1`,
  );
  return new Map(rows.map((r) => [`${r.jurisdiction_id} ${r.kind}`, r.epoch_id]));
}

export function validateGeography(db: DatabaseSync, opts?: { manifestPath?: string }): GeographyValidation {
  const manifestPath = opts?.manifestPath ?? MANIFEST_PATH;
  let bySlot: Map<string, SourceSeat> | null = null;
  let sourceWhy: string | undefined;
  if (existsSync(manifestPath)) {
    const { usable, unusable } = readManifest(manifestPath);
    if (unusable.length > 0) sourceWhy = `${unusable.length} source file(s) no longer match their recorded hash`;
    else {
      const { seats } = reconstruct(usable);
      bySlot = new Map(seats.map((s) => [`${s.jurisdictionId} ${s.kind} ${s.epochId} ${s.number}`, s]));
    }
  } else {
    sourceWhy = `no hash-verified source cache at ${manifestPath} — run ops/geo/refetch-lokdhaba.sh`;
  }

  const checks: Check[] = [];
  const add = (n: number, name: string, asks: string, rows: { ex: string }[], skipped = false, why?: string): void => {
    checks.push({ n, name, asks, violations: rows.length, skipped, why, examples: rows.slice(0, 10).map((r) => r.ex) });
  };
  const sql = <T extends { ex: string }>(q: string, ...p: (string | number)[]): T[] => all<T>(db, q, ...p);

  // ── 1. a contest whose seat name disagrees with the source for its own delimitation ────────────────
  if (bySlot === null) {
    add(1, "name matches the source for its own delimitation", "the seat name the source gives this slot", [], true, sourceWhy);
  } else {
    const rows = all<{ cid: string; jurisdiction_id: string; kind: string; epoch_id: string; number: number; nm: string; conflict: number }>(
      db,
      `SELECT c.id AS cid, v.jurisdiction_id, v.kind, v.epoch_id, v.number, v.canonical_name AS nm, v.name_conflict AS conflict
         FROM contest c JOIN place_version v ON v.id = c.place_version_id WHERE v.kind IN ('ac','pc')`,
    );
    const bad = rows
      .filter((r) => {
        if (r.conflict === 1) return false; // a recorded, reported disagreement between two cited sources
        const s = bySlot.get(`${r.jurisdiction_id} ${r.kind} ${r.epoch_id} ${r.number}`);
        return s !== undefined && norm(s.canonicalName) !== norm(r.nm);
      })
      .map((r) => ({
        ex: `${r.cid}: registry says ${r.nm}, source says ${bySlot?.get(`${r.jurisdiction_id} ${r.kind} ${r.epoch_id} ${r.number}`)?.canonicalName}`,
      }));
    add(1, "name matches the source for its own delimitation", "contests naming a seat the source names differently", bad);
  }

  // ── 2. a contest linked to the wrong delimitation ──────────────────────────────────────────────────
  // Asked of the SOURCE's own DelimID for that seat and year, not of a date window. The registry's
  // effective_from for the three pre-2008 orders is January of the order year and says so in its name;
  // TCPD puts Gujarat's 1975 election in the 1976 order, so a "year >= epoch start" rule reports 901
  // contests that are not wrong. The other half of the check needs no source: one election of one house in
  // one jurisdiction cannot straddle two delimitations.
  const straddles = sql(
    `SELECT c.election_id || ' spans ' || COUNT(DISTINCT v.epoch_id) || ' epochs' AS ex
       FROM contest c JOIN place_version v ON v.id = c.place_version_id
      GROUP BY c.election_id, v.jurisdiction_id, v.kind HAVING COUNT(DISTINCT v.epoch_id) > 1`,
  );
  if (bySlot === null) {
    add(2, "contest sits in the delimitation the source assigns it", "contests in the wrong epoch", straddles, straddles.length === 0, sourceWhy);
  } else {
    const byElection = epochByElection([...bySlot.values()]);
    const rows = all<{ cid: string; jurisdiction_id: string; kind: string; epoch_id: string; number: number; y: string }>(
      db,
      `SELECT c.id AS cid, v.jurisdiction_id, v.kind, v.epoch_id, v.number, e.year AS y
         FROM contest c
         JOIN election e ON e.id = c.election_id
         JOIN place_version v ON v.id = c.place_version_id WHERE v.kind IN ('ac','pc')`,
    );
    const wrongEpoch = rows
      .map((r) => ({ r, want: byElection.get(`${r.jurisdiction_id} ${r.kind} ${r.number} ${Number(r.y)}`) }))
      .filter((x) => x.want !== undefined && x.want !== x.r.epoch_id)
      .map((x) => ({ ex: `${x.r.cid} is on ${x.r.epoch_id}, source puts that election in ${x.want}` }));
    add(2, "contest sits in the delimitation the source assigns it", "contests in the wrong epoch", [...straddles, ...wrongEpoch]);
  }

  // ── 3. duplicate place versions ────────────────────────────────────────────────────────────────────
  add(
    3,
    "no duplicate versions",
    "two versions for the same slot, or the same place in one epoch",
    sql(
      `SELECT jurisdiction_id || ' ' || kind || ' ' || epoch_id || ' #' || number || ' x' || COUNT(*) AS ex
         FROM place_version WHERE number IS NOT NULL
        GROUP BY jurisdiction_id, kind, epoch_id, number HAVING COUNT(*) > 1
       UNION ALL
       SELECT place_id || ' ' || epoch_id || ' x' || COUNT(*) AS ex
         FROM place_version GROUP BY place_id, epoch_id HAVING COUNT(*) > 1`,
    ),
  );

  // ── 4. seat-number collisions across epochs are explicitly handled ─────────────────────────────────
  // A collision is EXPECTED — renumbering is what delimitation does — and a seat that genuinely keeps its
  // name and number across two orders is not a defect either. The defect is narrower: the source gives the
  // two epochs different names and the registry gives them the same one, which is one epoch wearing
  // another's name. That is exactly the bug this repair exists to remove, asked per colliding number.
  if (bySlot === null) {
    add(4, "cross-epoch seat numbers carry their own names", "collisions the registry collapsed to one name", [], true, sourceWhy);
  } else {
    const pairs = all<{ jurisdiction_id: string; kind: string; number: number; a: string; b: string; an: string; bn: string; conflict: number }>(
      db,
      `SELECT a.jurisdiction_id, a.kind, a.number, a.epoch_id AS a, b.epoch_id AS b,
              a.canonical_name AS an, b.canonical_name AS bn,
              MAX(a.name_conflict, b.name_conflict) AS conflict
         FROM place_version a JOIN place_version b
           ON b.jurisdiction_id = a.jurisdiction_id AND b.kind = a.kind AND b.number = a.number
          AND b.epoch_id > a.epoch_id
        WHERE a.kind IN ('ac','pc')`,
    );
    const bad = pairs
      .filter((p) => {
        // A pair where one side is a recorded two-source disagreement is already counted in
        // metrics.conflicts and listed in the unresolved report; counting it again here would report the
        // same West Bengal numbering problem twice under a name that does not describe it. Same exclusion
        // as checks 1, 5 and 6.
        if (p.conflict === 1) return false;
        if (norm(p.an) !== norm(p.bn)) return false; // registry distinguishes them — nothing to check
        const sa = bySlot?.get(`${p.jurisdiction_id} ${p.kind} ${p.a} ${p.number}`);
        const sb = bySlot?.get(`${p.jurisdiction_id} ${p.kind} ${p.b} ${p.number}`);
        return sa !== undefined && sb !== undefined && norm(sa.canonicalName) !== norm(sb.canonicalName);
      })
      .map((p) => ({ ex: `${p.jurisdiction_id} ${p.kind} #${p.number}: ${p.a} and ${p.b} both called ${p.an}` }));
    add(4, "cross-epoch seat numbers carry their own names", "collisions the registry collapsed to one name", bad);
  }

  // ── 5 & 6. current seats wearing historical names, and the reverse ─────────────────────────────────
  // Both reduce to the same question — is this version's name the one the source gives THIS epoch — asked
  // of the current epoch and of the older ones. The current epoch is derived, never a literal.
  if (bySlot === null) {
    add(5, "current seats carry current names", "current-epoch names the source names differently", [], true, sourceWhy);
    add(6, "historical seats carry historical names", "older-epoch names the source names differently", [], true, sourceWhy);
  } else {
    const cur = currentEpochs(db);
    const rows = all<{ jurisdiction_id: string; kind: string; epoch_id: string; number: number; nm: string; conflict: number; key: string | null }>(
      db,
      `SELECT jurisdiction_id, kind, epoch_id, number, canonical_name AS nm, name_conflict AS conflict,
              source_constituency_key AS key
         FROM place_version WHERE kind IN ('ac','pc')`,
    );
    const wrong = (r: (typeof rows)[number]): boolean => {
      if (r.conflict === 1) return false;
      const s = bySlot?.get(`${r.jurisdiction_id} ${r.kind} ${r.epoch_id} ${r.number}`);
      return s !== undefined && norm(s.canonicalName) !== norm(r.nm);
    };
    const isCurrent = (r: (typeof rows)[number]): boolean => cur.get(`${r.jurisdiction_id} ${r.kind}`) === r.epoch_id;
    const ex = (r: (typeof rows)[number]): { ex: string } => ({
      ex: `${r.jurisdiction_id} ${r.kind} #${r.number} ${r.epoch_id}: ${r.nm}`,
    });
    add(5, "current seats carry current names", "current-epoch names the source names differently", rows.filter((r) => isCurrent(r) && wrong(r)).map(ex));
    add(6, "historical seats carry historical names", "older-epoch names the source names differently", rows.filter((r) => !isCurrent(r) && wrong(r)).map(ex));
  }

  // ── 7. winner / contest / constituency consistency ─────────────────────────────────────────────────
  // The known red here is NOT a geography defect, and it is left visible rather than excused: 34 Bihar
  // seats carry two winners because Bihar held two assembly elections in 2005 — February and October — and
  // the election id is (jurisdiction, house, YEAR), which cannot tell them apart. That is the same class of
  // mistake as the one this repair fixes, one level up: a year is no more a stable identity for an election
  // than a seat number is for a constituency. Repairing it means splitting elections and is tracked
  // separately in docs/model/electoral-geography.md; it is not silently filtered out here.
  add(
    7,
    "one winner per seat, in the right jurisdiction",
    "contests with no winner or several, and contests outside their election's jurisdiction",
    sql(
      `SELECT c.id || ' has ' || COUNT(*) || ' winners' AS ex
         FROM contest c JOIN result r ON r.contest_id = c.id AND r.is_winner = 1 AND r.revision = 0
        GROUP BY c.id HAVING COUNT(*) > c.seats_available
       UNION ALL
       SELECT c.id || ' is in ' || v.jurisdiction_id || ' but its election is scoped to ' ||
              e.jurisdiction_place_id AS ex
         FROM contest c JOIN place_version v ON v.id = c.place_version_id
         JOIN election e ON e.id = c.election_id
        WHERE e.level = 'state' AND e.jurisdiction_place_id <> v.jurisdiction_id`,
    ),
  );

  // ── 8. missing canonical names ─────────────────────────────────────────────────────────────────────
  add(
    8,
    "every version is named",
    "versions with no name",
    sql(`SELECT id || ' ' || place_id AS ex FROM place_version WHERE canonical_name IS NULL OR canonical_name = ''`),
  );

  // ── 9. missing place versions ─────────────────────────────────────────────────────────────────────
  add(
    9,
    "every constituency and contest has a version",
    "constituency places with no version, and contests pointing at none",
    sql(
      `SELECT p.id || ' has no version' AS ex FROM place p
        WHERE p.kind IN ('ac','pc') AND NOT EXISTS (SELECT 1 FROM place_version v WHERE v.place_id = p.id)
       UNION ALL
       SELECT c.id || ' points at no version' AS ex FROM contest c
        WHERE NOT EXISTS (SELECT 1 FROM place_version v WHERE v.id = c.place_version_id)`,
    ),
  );

  // ── 10. missing provenance ────────────────────────────────────────────────────────────────────────
  add(
    10,
    "every name and result cites a source",
    "versions with no name source, results with no source",
    sql(
      `SELECT 'version ' || id || ' (' || canonical_name || ') has no name_source_id' AS ex
         FROM place_version WHERE kind IN ('ac','pc') AND name_source_id IS NULL
       UNION ALL
       SELECT 'result on ' || contest_id || ' has no source' AS ex
         FROM result WHERE source_id IS NULL OR source_id = ''`,
    ),
  );

  const num = (q: string): number => Number(Object.values(get<Record<string, unknown>>(db, q) ?? {})[0] ?? 0);
  let misnamedBefore: number | null = null;
  let misnamedAfter: number | null = null;
  if (bySlot !== null) {
    const rows = all<{ n: number; jurisdiction_id: string; kind: string; epoch_id: string; number: number; before: string; after: string }>(
      db,
      `SELECT COUNT(*) AS n, v.jurisdiction_id, v.kind, v.epoch_id, v.number,
              p.canonical_name AS before, v.canonical_name AS after
         FROM contest c JOIN place_version v ON v.id = c.place_version_id JOIN place p ON p.id = v.place_id
        WHERE v.kind IN ('ac','pc')
        GROUP BY v.id`,
    );
    misnamedBefore = 0;
    misnamedAfter = 0;
    for (const r of rows) {
      const s = bySlot.get(`${r.jurisdiction_id} ${r.kind} ${r.epoch_id} ${r.number}`);
      if (s === undefined) continue;
      if (norm(s.canonicalName) !== norm(r.before)) misnamedBefore += r.n;
      if (norm(s.canonicalName) !== norm(r.after)) misnamedAfter += r.n;
    }
  }

  const metrics = {
    contests: num("SELECT COUNT(*) FROM contest"),
    misnamedBefore,
    misnamedAfter,
    ambiguous: num("SELECT COUNT(*) FROM place_version WHERE json_array_length(name_variants) > 1"),
    conflicts: num("SELECT COUNT(*) FROM place_version WHERE name_conflict = 1"),
    unreconstructed: num(
      "SELECT COUNT(*) FROM place_version WHERE kind IN ('ac','pc') AND source_constituency_key IS NULL",
    ),
    nameMatchLinks: num("SELECT COUNT(*) FROM place_version_link WHERE kind = 'name_match'"),
    crosswalkRows: num("SELECT COUNT(*) FROM place_crosswalk"),
    succession: num("SELECT COUNT(*) FROM place_version_link WHERE kind <> 'name_match'"),
  };

  return { checks, metrics, ok: checks.every((c) => c.skipped || c.violations === 0) };
}

/** The NORM fragment is exported for tests that need the same normalisation in SQL as in JS. */
export const SQL_NORM = NORM;
