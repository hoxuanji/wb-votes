// `ingestRun` on an in-memory registry built through the real migrations: one row per call, closed with the rows it
// counts, and written as `failed` after the import's own writes have been rolled back.

import assert from "node:assert/strict";
import test from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { all, get, open } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";
import { ingestRun } from "./run.ts";

const NOW = "2026-08-12T00:00:00.000Z";

function registry(): DatabaseSync {
  const d = open(":memory:");
  migrate(d, NOW);
  return d;
}

const RUN = { pipeline: "test:pipeline", parserVersion: "test-v1", nowIso: NOW, rowsIn: 7 };
const runs = (d: DatabaseSync): Record<string, unknown>[] =>
  all<Record<string, unknown>>(d, "SELECT * FROM ingest_run ORDER BY id").map((r) => ({ ...r }));
const sources = (d: DatabaseSync): number => Number(get<{ n: number }>(d, "SELECT COUNT(*) AS n FROM source")?.n);
const addSource = (d: DatabaseSync, id: string): void => {
  d.prepare(
    "INSERT INTO source (id,kind,title,retrieved_at,doc_hash,hash_kind,retrieval_kind) VALUES (?,'eci_declaration','t',?,'h','document_bytes','fetched')",
  ).run(id, NOW);
};
/** BEGIN fails inside a transaction, so this passes only when no savepoint is left open. */
const idle = (d: DatabaseSync): void => {
  d.exec("BEGIN");
  d.exec("ROLLBACK");
};

test("a run is one row, open while the body writes and closed with what the body counted", () => {
  const d = registry();
  let seen: Record<string, unknown> | undefined;
  const out = ingestRun(d, RUN, (run) => {
    seen = { ...get<Record<string, unknown>>(d, "SELECT * FROM ingest_run WHERE id = ?", run.id) };
    addSource(d, "s1");
    run.finish({ rowsOut: 3, anomalies: [] });
    return "the body's value";
  });
  assert.equal(out, "the body's value");
  assert.equal(seen?.["status"], "running");
  assert.equal(seen?.["finished_at"], null);
  assert.deepEqual(runs(d), [
    {
      id: seen?.["id"], pipeline: "test:pipeline", parser_version: "test-v1", started_at: NOW, finished_at: NOW,
      rows_in: 7, rows_out: 3, anomalies: "[]", status: "ok",
    },
  ]);
  assert.equal(sources(d), 1, "what the body wrote is kept");
  idle(d);
  d.close();
});

test("anomalies make the run partial, which is still a run that finished", () => {
  const d = registry();
  const anomalies = [{ kind: "rows_skipped", ref: "test:pipeline", detail: "2: no votes" }, "a sentence"];
  ingestRun(d, RUN, (run) => run.finish({ rowsOut: 1, anomalies }));
  const [row] = runs(d);
  assert.equal(row?.["status"], "partial");
  assert.deepEqual(JSON.parse(String(row?.["anomalies"])), anomalies);
  d.close();
});

test("rows_in is NULL when the caller does not know it", () => {
  const d = registry();
  ingestRun(d, { pipeline: "p", parserVersion: "v", nowIso: NOW }, (run) => run.finish({ rowsOut: 0, anomalies: [] }));
  assert.equal(runs(d)[0]?.["rows_in"], null);
  d.close();
});

test("each call is its own run, numbered by the row it inserted", () => {
  const d = registry();
  const ids = [1, 2, 3].map(() => ingestRun(d, RUN, (run) => (run.finish({ rowsOut: 0, anomalies: [] }), run.id)));
  assert.deepEqual(ids, runs(d).map((r) => r["id"]));
  assert.equal(new Set(ids).size, 3);
  d.close();
});

test("a body that throws leaves a failed run and none of what it wrote, and the error is its own", () => {
  const d = registry();
  addSource(d, "before");
  const boom = new Error("disk on fire\nsecond line the operator needs but the run need not keep");
  assert.throws(
    () =>
      ingestRun(d, RUN, () => {
        addSource(d, "s1");
        addSource(d, "s2");
        throw boom;
      }),
    (e) => e === boom,
  );
  assert.equal(sources(d), 1, "the body's writes are rolled back to the source that was there before");
  const [row] = runs(d);
  assert.equal(row?.["status"], "failed");
  assert.equal(row?.["finished_at"], NOW, "a failed run is not left looking like one still in flight");
  assert.equal(row?.["rows_out"], null);
  assert.deepEqual(JSON.parse(String(row?.["anomalies"])), [
    { kind: "ingest_failed", ref: `ingest_run:${String(row?.["id"])}`, detail: "disk on fire" },
  ]);
  idle(d);
  d.close();
});

test("a body that returns without finishing the run is a failure, not a run left open", () => {
  const d = registry();
  assert.throws(() => ingestRun(d, RUN, () => addSource(d, "s1")), /returned without finishing/);
  assert.equal(sources(d), 0);
  assert.equal(runs(d)[0]?.["status"], "failed");
  d.close();
});

test("something thrown that is not an Error comes out as one", () => {
  const d = registry();
  assert.throws(
    () => ingestRun(d, RUN, () => { throw "plain string"; }),
    (e) => e instanceof Error && e.message === "plain string",
  );
  assert.equal(runs(d)[0]?.["status"], "failed");
  d.close();
});

test("a failed run does not move dataVersion, and a finished one does", () => {
  // envelope.ts reads the newest finished_at among runs whose status is ok or partial.
  const version = (d: DatabaseSync): string | undefined =>
    get<{ v: string }>(
      d,
      "SELECT finished_at AS v FROM ingest_run WHERE finished_at IS NOT NULL AND status IN ('ok','partial') ORDER BY finished_at DESC LIMIT 1",
    )?.v;
  const d = registry();
  ingestRun(d, { ...RUN, nowIso: "2026-01-01T00:00:00.000Z" }, (run) => run.finish({ rowsOut: 0, anomalies: [] }));
  assert.throws(() => ingestRun(d, { ...RUN, nowIso: "2026-06-01T00:00:00.000Z" }, () => { throw new Error("x"); }));
  assert.equal(version(d), "2026-01-01T00:00:00.000Z");
  ingestRun(d, { ...RUN, nowIso: "2026-09-01T00:00:00.000Z" }, (run) => run.finish({ rowsOut: 0, anomalies: [] }));
  assert.equal(version(d), "2026-09-01T00:00:00.000Z");
  d.close();
});
