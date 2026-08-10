// §25/§26 — the two Situation Room sections that need data the other repo modules do not carry.
//
// "WHAT CHANGED TODAY" (§25) has no news feed behind it and there is not going to be one until the
// signals vertical exists. What DOES change, is dated, and is genuinely worth a reader's attention is
// the registry itself: every ingest run records when it ran, how many rows went in and out, how many
// anomalies it raised and whether it finished. That is a change log, it is honest about being one, and
// it satisfies §31's rule that a fact and an analysis must never be blurred — nothing here is presented
// as political news.
//
// The calendar (§26) is built from `election`, and it says "no date on record" wherever the source gave
// none, which is four of five. §48 forbids fake precision, and inventing poll dates to fill a calendar
// would be exactly that.

import type { DatabaseSync } from "node:sqlite";
import { all } from "../db/index.ts";
import { read, yearOf } from "./index.ts";

export type ChangeEntry = {
  at: string;
  pipeline: string;
  rowsIn: number | null;
  rowsOut: number | null;
  /** COUNT of anomalies, parsed from the JSON array the column actually holds. Typing this as a number
   *  made the page render the whole array as text — 30 KB of `[{"kind":"field_coverage"...` at a reader. */
  anomalies: number;
  status: string;
};

/** The column is a JSON array of anomaly objects; a malformed or absent value counts as none rather
 *  than taking the page down. */
function countAnomalies(raw: string | null): number {
  if (raw === null || raw === "") return 0;
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.length : 0;
  } catch {
    return 0;
  }
}

export function changeLog(db: DatabaseSync, limit = 5): ChangeEntry[] {
  return read(() =>
    all<{
      started_at: string;
      pipeline: string;
      rows_in: number | null;
      rows_out: number | null;
      anomalies: string | null;
      status: string;
    }>(
      db,
      `SELECT started_at, pipeline, rows_in, rows_out, anomalies, status
         FROM ingest_run ORDER BY started_at DESC LIMIT ?`,
      Math.min(Math.max(limit, 1), 50),
    ).map((r) => ({
      at: r.started_at,
      pipeline: r.pipeline,
      rowsIn: r.rows_in,
      rowsOut: r.rows_out,
      anomalies: countAnomalies(r.anomalies),
      status: r.status,
    })),
  );
}

export type CalendarEntry = {
  id: string;
  name: string;
  kind: string;
  level: string;
  year: number;
  /** ISO date, or null when the source recorded none — four of five here. */
  countingOn: string | null;
  lifecycle: string;
  seats: number;
  /** §16's vocabulary, derived: a declared result with a source is CONFIRMED; anything else REPORTED. */
  confidence: "CONFIRMED" | "REPORTED";
};

/**
 * The election calendar: the most recent election per jurisdiction, newest first.
 *
 * ONE PER JURISDICTION is the whole point. Unfiltered this returned every election in the registry,
 * which was 5 rows when the registry held West Bengal and 1,188 the moment 1962-2022 arrived for the
 * whole country — a calendar nobody can read, on the front page. What a reader wants from a calendar is
 * where each state stands now; sixty years of Kerala is what the state's own page is for.
 */
export function calendar(db: DatabaseSync): CalendarEntry[] {
  return read(() =>
    all<{
      id: string;
      name: string;
      kind: string;
      level: string;
      counting_on: string | null;
      lifecycle: string;
      seats: number;
      cited: number;
    }>(
      db,
      `SELECT e.id, e.name, e.kind, e.level, e.counting_on, e.lifecycle,
              (SELECT count(*) FROM contest c WHERE c.election_id = e.id) AS seats,
              (SELECT count(*) FROM result r JOIN contest c2 ON c2.id = r.contest_id
                WHERE c2.election_id = e.id AND r.source_id IS NOT NULL) AS cited
         FROM election e
        WHERE e.id IN (
          SELECT id FROM (
            SELECT e2.id AS id,
                   row_number() OVER (
                     PARTITION BY e2.jurisdiction_place_id, e2.kind ORDER BY e2.id DESC
                   ) AS rn
              FROM election e2
             -- A by-election is not where a state stands; its assembly election is.
             WHERE e2.kind <> 'bypoll'
          ) WHERE rn = 1
        )
        ORDER BY e.id DESC`,
    ).map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      level: r.level,
      year: yearOf(r.id),
      countingOn: r.counting_on,
      lifecycle: r.lifecycle,
      seats: r.seats,
      // Every result row in this registry carries a source_id — the P2 constraint — so "confirmed"
      // here means declared AND cited, not merely present.
      confidence: r.lifecycle === "declared" && r.cited > 0 ? "CONFIRMED" : "REPORTED",
    })),
  );
}
