/**
 * Checks on election-event identity, and the before/after for the split.
 *
 * Same rules as the geography validator: every check says what it asks, a check that cannot be evaluated
 * reports `skipped` rather than zero, and the source-aware ones read the hash-verified cache.
 */

import type { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { all, get } from "../../db/index.ts";
import { readManifest } from "../geography/reconstruct.ts";
import { groupKey } from "./event.ts";
import { planElections } from "./identity.ts";

export type ElectionCheck = {
  n: number;
  name: string;
  violations: number;
  skipped: boolean;
  why?: string;
  examples: string[];
};

export type ElectionValidation = {
  checks: ElectionCheck[];
  metrics: {
    events: number;
    /** (jurisdiction, kind, house, year) groups holding more than one event — expected, and named. */
    multiEventYears: number;
    withoutYear: number;
    withoutSource: number;
    contests: number;
    results: number;
    /** Events the source describes that the registry does not hold. */
    missingFromRegistry: number;
    /** Registry elections no source file describes — the seed's own, legitimately. */
    notInSource: number;
    duplicateWinnerContests: number;
  };
  ok: boolean;
};

const MANIFEST = ".data/cache/lokdhaba/refetch-manifest.tsv";

export function validateElections(db: DatabaseSync, opts?: { manifestPath?: string }): ElectionValidation {
  const manifestPath = opts?.manifestPath ?? MANIFEST;
  const haveSource = existsSync(manifestPath);
  const checks: ElectionCheck[] = [];
  const add = (n: number, name: string, rows: { ex: string }[], skipped = false, why?: string): void => {
    checks.push({ n, name, violations: rows.length, skipped, why, examples: rows.slice(0, 10).map((r) => r.ex) });
  };
  const sql = (q: string): { ex: string }[] => all<{ ex: string }>(db, q);

  // 1. No contest may show more winners than its seats. This is the defect the split exists to remove.
  add(
    1,
    "one winner per seat in every event",
    sql(
      `SELECT c.election_id || ' / ' || c.id || ' has ' || COUNT(*) || ' winners' AS ex
         FROM contest c
         JOIN result r ON r.contest_id = c.id AND r.is_winner = 1 AND r.revision = 0
        GROUP BY c.id HAVING COUNT(*) > c.seats_available`,
    ),
  );

  // 2. Identity is total: every election carries a year, a house and an occurrence, and the UNIQUE holds.
  add(
    2,
    "every election has year, house and occurrence, and no two share them",
    sql(
      `SELECT id || ' has no year' AS ex FROM election WHERE year IS NULL
       UNION ALL
       SELECT id || ' has house ''none'' but fills seats' AS ex FROM election e
        WHERE e.house = 'none' AND EXISTS (SELECT 1 FROM contest c WHERE c.election_id = e.id)
       UNION ALL
       SELECT jurisdiction_place_id || ' ' || kind || ' ' || house || ' ' || year || ' occurrence ' ||
              occurrence || ' x' || COUNT(*) AS ex
         FROM election GROUP BY jurisdiction_place_id, kind, house, year, occurrence HAVING COUNT(*) > 1`,
    ),
  );

  // 3. Chronology must not need the id string. Every election's year must match the year its id carries,
  //    because 17 queries used to read the year out of that string and any drift between the two would make
  //    the column and the id disagree about when an election happened.
  add(
    3,
    "the year column agrees with the year in the id",
    sql(
      `SELECT id || ': column ' || year || ', id says ' ||
              CAST(replace(replace(substr(id, -7), '-p1', ''), '-p2', '') AS INTEGER) AS ex
         FROM election
        WHERE id NOT LIKE '%-a%' AND CAST(substr(replace(replace(id, '-p1', ''), '-p2', ''), -4) AS INTEGER) <> year`,
    ),
  );

  // 4. An event's contests must sit in one delimitation PER JURISDICTION, and belong to its own jurisdiction.
  //
  // Per jurisdiction, not per election. One election spanning several delimitations is not a defect, it is
  // what India's 2024 general election was: DPACO 2008 for most states, the Jammu & Kashmir Delimitation
  // Commission's 2022 order for J&K, and the ECI's 2023 order for Assam. Grouping by election alone made
  // `ls-2024 spans 3 epochs` a violation when all three are correct and cited. What must never happen is one
  // JURISDICTION's seats in an election straddling two delimitations, which is the real defect —
  // `mandate geography validate` check 2 has always grouped this way, and this check now agrees with it.
  // docs/model/delimitation-assam-jk.md.
  add(
    4,
    "an event's contests are in one delimitation per jurisdiction, and its own jurisdiction",
    sql(
      `SELECT e.id || ' / ' || v.jurisdiction_id || ' spans ' || COUNT(DISTINCT v.epoch_id) || ' epochs' AS ex
         FROM election e JOIN contest c ON c.election_id = e.id
         JOIN place_version v ON v.id = c.place_version_id
        GROUP BY e.id, v.jurisdiction_id, v.kind HAVING COUNT(DISTINCT v.epoch_id) > 1
       UNION ALL
       SELECT e.id || ' has a contest in ' || v.jurisdiction_id AS ex
         FROM election e JOIN contest c ON c.election_id = e.id
         JOIN place_version v ON v.id = c.place_version_id
        WHERE e.level = 'state' AND v.jurisdiction_id <> e.jurisdiction_place_id
       UNION ALL
       SELECT e.id || ' fills ' || e.house || ' but has a ' || v.kind || ' contest' AS ex
         FROM election e JOIN contest c ON c.election_id = e.id
         JOIN place_version v ON v.id = c.place_version_id
        WHERE e.house IN ('ac','pc') AND v.kind <> e.house`,
    ),
  );

  // 5. Every event the source describes exists, with the id the shared scheme gives it.
  if (!haveSource) {
    add(5, "every event in the source exists in the registry", [], true, `no hash-verified cache at ${manifestPath}`);
  } else {
    const { usable } = readManifest(manifestPath);
    const plan = planElections(usable);
    const known = new Set(all<{ id: string }>(db, "SELECT id FROM election").map((r) => r.id));
    add(
      5,
      "every event in the source exists in the registry",
      plan.filter((p) => !known.has(p.id)).map((p) => ({ ex: `${p.id} (${p.seats} seats, ${p.rows} rows) is missing` })),
    );
  }

  const num = (q: string): number => Number(Object.values(get<Record<string, unknown>>(db, q) ?? {})[0] ?? 0);
  let missingFromRegistry = 0;
  let notInSource = 0;
  let multiEventYears = 0;
  if (haveSource) {
    const { usable } = readManifest(manifestPath);
    const plan = planElections(usable);
    const known = new Set(all<{ id: string }>(db, "SELECT id FROM election").map((r) => r.id));
    const planned = new Set(plan.map((p) => p.id));
    missingFromRegistry = plan.filter((p) => !known.has(p.id)).length;
    notInSource = [...known].filter((id) => !planned.has(id)).length;
    const groups = new Map<string, number>();
    for (const p of plan) groups.set(groupKey(p), (groups.get(groupKey(p)) ?? 0) + 1);
    multiEventYears = [...groups.values()].filter((n) => n > 1).length;
  }

  const metrics = {
    events: num("SELECT COUNT(*) FROM election"),
    multiEventYears,
    withoutYear: num("SELECT COUNT(*) FROM election WHERE year IS NULL"),
    withoutSource: num("SELECT COUNT(*) FROM election WHERE source_id IS NULL"),
    contests: num("SELECT COUNT(*) FROM contest"),
    results: num("SELECT COUNT(*) FROM result"),
    missingFromRegistry,
    notInSource,
    duplicateWinnerContests: num(
      `SELECT COUNT(*) FROM (
         SELECT c.id FROM contest c
         JOIN result r ON r.contest_id = c.id AND r.is_winner = 1 AND r.revision = 0
         GROUP BY c.id HAVING COUNT(*) > c.seats_available)`,
    ),
  };

  return { checks, metrics, ok: checks.every((c) => c.skipped || c.violations === 0) };
}

/** Contests and results per event, for the report the brief asks for. */
export function perEvent(db: DatabaseSync, limit = 15): { id: string; contests: number; results: number }[] {
  return all<{ id: string; contests: number; results: number }>(
    db,
    `SELECT e.id,
            (SELECT COUNT(*) FROM contest c WHERE c.election_id = e.id) AS contests,
            (SELECT COUNT(*) FROM result r JOIN contest c ON c.id = r.contest_id WHERE c.election_id = e.id) AS results
       FROM election e
      ORDER BY e.year DESC, e.polling_month DESC, e.occurrence
      LIMIT ?`,
    limit,
  );
}
