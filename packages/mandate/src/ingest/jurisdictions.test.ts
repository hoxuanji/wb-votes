// `ensureJurisdictions`: the nation and the 36 states and union territories every other place hangs off.
//
// wb-static used to be the only writer of these rows, so a Lokdhaba import on a migrated database that wb-static
// had not filled failed on `place.parent_id`. These tests run both importers on an empty :memory: registry
// built through the real migrations, and compare what each leaves behind.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { gzipSync } from "node:zlib";
import { all, open } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";
import { JURISDICTIONS } from "./india.ts";
import { MODULE_KEYS, runIngest } from "./index.ts";
import { ensureJurisdictions } from "./jurisdictions.ts";
import { REQUIRED_COLUMNS, importLokdhaba, type ElectionType } from "./sources/lokdhaba.ts";
import type { StaticBundle } from "./index.ts";

const NOW = "2026-08-12T00:00:00.000Z";

function registry(): DatabaseSync {
  const d = open(":memory:");
  migrate(d, NOW);
  return d;
}

/** Every place that is not a seat or a district, in the order the table holds them (rowid), as plain objects. */
function jurisdictionPlaces(d: DatabaseSync): Record<string, unknown>[] {
  return all<Record<string, unknown>>(d, "SELECT * FROM place WHERE kind IN ('nation','state','ut') ORDER BY rowid").map((r) => ({ ...r }));
}

const HEADER = [...REQUIRED_COLUMNS, "Assembly_No", "Poll_No"];
/** One Karnataka candidate row in a one-seat file. */
function file(type: ElectionType): { url: string; bytes: Uint8Array; sha256: string; retrievedAt: string; cached: boolean } {
  const f: Record<string, string> = {
    State_Name: "Karnataka", Year: type === "AE" ? "2018" : "2019", Constituency_No: "1", Constituency_Name: "CHIKKODI",
    Constituency_Type: "GEN", DelimID: "4", Position: "1", Candidate: "A CANDIDATE", Sex: "M", Party: "INC", Party_ID: "1",
    Votes: "900", Valid_Votes: "2000", Electors: "4000", Turnout_Percentage: "50", Vote_Share_Percentage: "45",
    Margin: "100", pid: "P1", Election_Type: type === "AE" ? "State Assembly Election (AE)" : "Lok Sabha Election (GE)",
    Assembly_No: type === "AE" ? "15" : "17", Poll_No: "0",
  };
  const bytes = gzipSync(Buffer.from([HEADER.join(","), HEADER.map((h) => f[h] ?? "").join(",")].join("\n"), "utf8"));
  return { url: `test:ka-${type}`, bytes, sha256: createHash("sha256").update(bytes).digest("hex"), retrievedAt: NOW, cached: false };
}
const importKarnataka = (d: DatabaseSync, type: ElectionType) =>
  importLokdhaba(d, { jurisdictionId: "ka", type, file: file(type), nowIso: NOW });

test("ensureJurisdictions writes India and its 36 states and union territories", () => {
  const d = registry();
  assert.equal(ensureJurisdictions(d), 37);
  const rows = jurisdictionPlaces(d);
  assert.equal(rows.length, 37);
  assert.deepEqual(
    rows.map((r) => r["id"]),
    ["in", ...JURISDICTIONS.map((j) => j.id)],
  );
  assert.deepEqual(rows[0], {
    id: "in", kind: "nation", parent_id: null, canonical_name: "India", names: '{"hi":"भारत"}', lgd_code: null, eci_code: null,
  });
  for (const j of JURISDICTIONS) {
    const row = rows.find((r) => r["id"] === j.id);
    assert.deepEqual(row, {
      id: j.id, kind: j.kind, parent_id: "in", canonical_name: j.name,
      names: j.id === "wb" ? '{"bn":"পশ্চিমবঙ্গ"}' : "{}", lgd_code: j.lgd, eci_code: null,
    });
  }
  d.close();
});

test("ensureJurisdictions is idempotent: a second call leaves every row where it was", () => {
  const d = registry();
  ensureJurisdictions(d);
  const first = jurisdictionPlaces(d);
  ensureJurisdictions(d);
  assert.deepEqual(jurisdictionPlaces(d), first);
  d.close();
});

test("a Lokdhaba assembly import on an empty migrated registry succeeds, and the jurisdictions exist", () => {
  const d = registry();
  const report = importKarnataka(d, "AE");
  assert.equal(report.elections, 1);
  assert.equal(report.candidacies, 1);
  const alone = registry();
  ensureJurisdictions(alone);
  assert.deepEqual(jurisdictionPlaces(d), jurisdictionPlaces(alone));
  // The seat hangs off the state, which now exists.
  assert.deepEqual({ ...all<{ parent_id: string }>(d, "SELECT parent_id FROM place WHERE id = 'ka.ac.001'")[0] }, { parent_id: "ka" });
  d.close();
  alone.close();
});

test("a Lokdhaba general-election import on an empty migrated registry succeeds: the election belongs to India", () => {
  const d = registry();
  assert.equal(importKarnataka(d, "GE").elections, 1);
  assert.deepEqual(
    all<{ jurisdiction_place_id: string }>(d, "SELECT jurisdiction_place_id FROM election").map((r) => ({ ...r })),
    [{ jurisdiction_place_id: "in" }],
  );
  d.close();
});

test("a Lokdhaba import over jurisdictions that are already there leaves them as they were", () => {
  const d = registry();
  ensureJurisdictions(d);
  const before = jurisdictionPlaces(d);
  importKarnataka(d, "AE");
  importKarnataka(d, "GE");
  assert.deepEqual(jurisdictionPlaces(d), before);
  d.close();
});

test("a failed Lokdhaba import leaves no jurisdiction behind", () => {
  const d = registry();
  // The election is written after the places, so refusing it fails the import once the jurisdictions are in.
  d.exec("CREATE TRIGGER refuse_election BEFORE INSERT ON election BEGIN SELECT RAISE(ABORT, 'refused'); END");
  assert.throws(() => importKarnataka(d, "AE"), /refused/);
  assert.deepEqual(jurisdictionPlaces(d), []);
  d.close();
});

test("wb-static leaves the same jurisdiction rows as ensureJurisdictions alone", async () => {
  const docs = Object.fromEntries(
    MODULE_KEYS.map((k, i) => [k, { file: `${k}.json`, retrievedOn: "2026-04-25", docHash: String(i).repeat(64) }]),
  ) as StaticBundle["docs"];
  const bundle: StaticBundle = {
    docs,
    constituencies: [{ id: "c0001", assemblyNumber: 1, name: "Mekliganj", district: "Cooch Behar", reservation: "SC" }],
    parties: [], candidates: [], historicalResults: [], currentMLAs: [], demographics: [], cabinet: [], mps: [], districtPaths: [],
  };
  const d = registry();
  await runIngest(d, { nowIso: NOW, bundle, monotonicMs: () => 0 });
  const alone = registry();
  ensureJurisdictions(alone);
  assert.deepEqual(jurisdictionPlaces(d), jurisdictionPlaces(alone));
  d.close();
  alone.close();
});
