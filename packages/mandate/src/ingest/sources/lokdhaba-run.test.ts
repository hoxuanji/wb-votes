// What the Lokdhaba importer leaves in `ingest_run`: one row per file it loads, which moves the registry's
// dataVersion, and a failed row, with nothing else, when the load stops.
//
// Until the importer opened a run, a loaded state left the registry as versionless as it found it.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { gzipSync } from "node:zlib";
import { all, open } from "../../db/index.ts";
import { migrate } from "../../db/migrate.ts";
import { placeReply } from "../../repo/envelope.ts";
import { REQUIRED_COLUMNS, importLokdhaba } from "./lokdhaba.ts";

const SEED_RUN = "2026-07-01T00:00:00.000Z";
const NOW = "2026-08-12T00:00:00.000Z";
const HEADER = [...REQUIRED_COLUMNS, "Assembly_No", "Poll_No"];

function line(seat: number, name: string, delim: string, position: number, n: number, votes: string): string {
  const f: Record<string, string> = {
    State_Name: "Karnataka", Year: "2018", Constituency_No: String(seat), Constituency_Name: name,
    Constituency_Type: "GEN", DelimID: delim, Position: String(position), Candidate: `CANDIDATE ${n}`, Sex: "M",
    Party: "INC", Party_ID: "1", Votes: votes, Valid_Votes: "2000", Electors: "4000", Turnout_Percentage: "50",
    Vote_Share_Percentage: "45", Margin: position === 1 ? "100" : "", pid: `P${n}`,
    Election_Type: "State Assembly Election (AE)", Assembly_No: "15", Poll_No: "0",
  };
  return HEADER.map((h) => f[h] ?? "").join(",");
}

const file = (rows: string[]) => {
  const bytes = gzipSync(Buffer.from([HEADER.join(","), ...rows].join("\n"), "utf8"));
  return { url: "test:ka-ae", bytes, sha256: createHash("sha256").update(bytes).digest("hex"), retrievedAt: NOW, cached: false };
};
const input = (rows: string[]) => ({ jurisdictionId: "ka", type: "AE" as const, file: file(rows), nowIso: NOW });

/** A migrated registry that already ran once (the seed) and holds Karnataka's place, which is all the importer needs. */
function registry(): DatabaseSync {
  const d = open(":memory:");
  migrate(d, SEED_RUN);
  d.exec(`
    INSERT INTO place (id, kind, canonical_name) VALUES ('in','nation','India'), ('ka','state','Karnataka');
    INSERT INTO ingest_run (pipeline, parser_version, started_at, finished_at, status)
      VALUES ('static:wb-static', 'v1', '${SEED_RUN}', '${SEED_RUN}', 'ok');
  `);
  return d;
}

const runs = (d: DatabaseSync) =>
  all<{ pipeline: string; status: string; rows_in: number | null; rows_out: number | null; finished_at: string | null; anomalies: string }>(
    d,
    "SELECT pipeline, status, rows_in, rows_out, finished_at, anomalies FROM ingest_run WHERE pipeline LIKE 'lokdhaba:%' ORDER BY id",
  ).map((r) => ({ ...r }));

/** Every table's row count except ingest_run, so a failed import can be shown to have changed nothing else. */
function counts(d: DatabaseSync): Record<string, number> {
  const tables = all<{ name: string }>(d, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  return Object.fromEntries(
    tables.filter((t) => t.name !== "ingest_run").map((t) => [t.name, Number(d.prepare(`SELECT COUNT(*) AS n FROM ${t.name}`).get()?.["n"])]),
  );
}

/** The version a reader of the API is told, taken through the envelope itself. */
async function dataVersion(d: DatabaseSync): Promise<string | undefined> {
  const r = await placeReply("ka.ac.001", (fn) => ({ ok: true, value: fn(d) }));
  return r.headers["X-Data-Version"];
}

const GOOD = [line(1, "AURAD", "4", 1, 1, "900"), line(1, "AURAD", "4", 2, 2, "800")];

test("a Lokdhaba import leaves one run for the file, and the registry's dataVersion moves to it", async () => {
  const d = registry();
  assert.equal(await dataVersion(d), SEED_RUN, "before the import the newest finished run is the seed's");
  const report = importLokdhaba(d, input(GOOD));
  assert.deepEqual(runs(d), [
    { pipeline: "lokdhaba:ka:AE", status: "ok", rows_in: 2, rows_out: report.results, finished_at: NOW, anomalies: "[]" },
  ]);
  assert.equal(report.results, 2);
  assert.equal(await dataVersion(d), NOW);
  d.close();
});

test("a second load of the same file is a second run: runs are a log, and the rows are not duplicated", () => {
  const d = registry();
  importLokdhaba(d, input(GOOD));
  const before = counts(d);
  importLokdhaba(d, input(GOOD));
  assert.equal(runs(d).length, 2);
  assert.deepEqual(counts(d), before);
  d.close();
});

test("rows the importer skips make its run partial, and the run says what was skipped", () => {
  const d = registry();
  // A DelimID the epoch table does not know: the row is refused, not guessed at.
  importLokdhaba(d, input([...GOOD, line(3, "NOWHERE", "9", 1, 3, "700")]));
  const [run] = runs(d);
  assert.equal(run?.status, "partial");
  assert.equal(run?.rows_in, 3);
  assert.match(String(JSON.parse(run?.anomalies ?? "[]")[0]?.detail), /^1: unknown TCPD DelimID 9/);
  d.close();
});

test("a load that stops leaves a failed run and nothing else", () => {
  const d = registry();
  // ensureJurisdictions now rewrites the jurisdiction places, so the load is stopped late, at its last table.
  d.exec("CREATE TRIGGER disk_on_fire BEFORE INSERT ON turnout BEGIN SELECT RAISE(ABORT, 'disk on fire'); END");
  const before = counts(d);
  assert.throws(() => importLokdhaba(d, input(GOOD)), /disk on fire/);
  assert.deepEqual(counts(d), before, "every table is as it was");
  const [run] = runs(d);
  assert.equal(run?.status, "failed");
  assert.equal(run?.finished_at, NOW);
  assert.match(String(JSON.parse(run?.anomalies ?? "[]")[0]?.detail), /disk on fire/);
  d.close();
});

test("a failed load does not move dataVersion", async () => {
  const d = registry();
  importLokdhaba(d, { ...input(GOOD), nowIso: "2026-08-01T00:00:00.000Z" });
  assert.equal(await dataVersion(d), "2026-08-01T00:00:00.000Z");
  d.exec("CREATE TRIGGER disk_on_fire BEFORE INSERT ON turnout BEGIN SELECT RAISE(ABORT, 'disk on fire'); END");
  // A seat the first load did not hold, so its turnout row is an insert and not an update of one.
  const more = { ...input([line(2, "BETA", "4", 1, 5, "500")]), nowIso: "2026-09-01T00:00:00.000Z" };
  assert.throws(() => importLokdhaba(d, more), /disk on fire/);
  assert.equal(runs(d).at(-1)?.status, "failed");
  assert.equal(await dataVersion(d), "2026-08-01T00:00:00.000Z");
  d.close();
});
