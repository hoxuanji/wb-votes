// One `ingest_run` row per import call: opened before the import writes anything, closed inside the import's own
// atomic block together with the rows it counts, and written as `failed` after that block has rolled back.
//
// The row is what moves dataVersion (repo/envelope.ts reads the newest finished_at among 'ok' and 'partial'
// runs), so an import that leaves none leaves the registry's version where it was. A failed row is safe for the
// same reason: it is filtered out of that read.
//
// wb-static keeps the run code it has (ADR 0004 and 0005: it is transitional), so it is not an adopter.

import type { DatabaseSync } from "node:sqlite";
import { get } from "../db/index.ts";
import { atomically } from "../db/write.ts";
import type { Anomaly } from "../core/citation/index.ts";

export type Run = {
  /** The `ingest_run` row's id, for a report that names its run. */
  readonly id: number;
  /**
   * Closes the run: 'partial' when there are anomalies, 'ok' when there are none. Call it from `body`, so the
   * record commits with the rows it counts. The column holds whatever the importer lists (ECI writes
   * sentences, wb-static writes Anomaly objects); the failed row below writes an Anomaly.
   */
  finish(outcome: { rowsOut: number; anomalies: readonly (Anomaly | string)[] }): void;
};

/**
 * Runs `body` as one atomic import and records it. The row is inserted first, outside that block, so it survives
 * the rollback of a body that throws and is then updated to 'failed'; the error `body` threw is the one rethrown.
 * Everything `body` wrote is undone in that case, which is why a failed import leaves a failed run and nothing
 * else.
 *
 * The row's three statements are plain ones, so a caller that already holds a transaction would take the run
 * with its rollback. None of the importers does.
 */
export function ingestRun<T>(
  db: DatabaseSync,
  run: { pipeline: string; parserVersion: string; nowIso: string; rowsIn?: number },
  body: (run: Run) => T,
): T {
  const id = Number(
    get<{ id: number }>(
      db,
      "INSERT INTO ingest_run (pipeline, parser_version, started_at, rows_in, status) VALUES (?, ?, ?, ?, 'running') RETURNING id",
      run.pipeline,
      run.parserVersion,
      run.nowIso,
      run.rowsIn ?? null,
    )?.id,
  );
  let finished = false;
  const handle: Run = {
    id,
    finish: ({ rowsOut, anomalies }) => {
      db.prepare("UPDATE ingest_run SET finished_at = ?, status = ?, rows_out = ?, anomalies = ? WHERE id = ?").run(
        run.nowIso,
        anomalies.length === 0 ? "ok" : "partial",
        rowsOut,
        JSON.stringify(anomalies),
        id,
      );
      finished = true;
    },
  };
  try {
    return atomically(db, "ingest_run_body", () => {
      const out = body(handle);
      // A run nobody closed would stay 'running' for ever, which is the state the 'failed' status exists to
      // tell apart from an import still in flight.
      if (!finished) throw new Error(`ingest run ${id} (${run.pipeline}): the import returned without finishing the run`);
      return out;
    });
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    // Only the first line is kept, as wb-static does: it is the one-line summary a failure starts with.
    const detail = error.message.split("\n")[0] ?? String(cause);
    db.prepare("UPDATE ingest_run SET finished_at = ?, anomalies = ?, status = 'failed' WHERE id = ?").run(
      run.nowIso,
      JSON.stringify([{ kind: "ingest_failed", ref: `ingest_run:${id}`, detail }]),
      id,
    );
    throw error;
  }
}
