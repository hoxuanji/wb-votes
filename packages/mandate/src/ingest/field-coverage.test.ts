// The field-coverage gate's own tests. Unlike every other ingest test these run the REAL seed
// through the REAL ingest, because the gate is a property of the seed: a six-row fixture with no
// photoUrl is a fixture with no photoUrl, not a pipeline that drops it. One in-memory ingest is
// ~0.7s and every test below shares it.
//
// What matters here is not that the gate passes today — it is that it FAILS when a field goes
// missing. Cycles 1-3 had 239 green tests over an ingest that dropped two fields.

import assert from "node:assert/strict";
import test from "node:test";
import type { DatabaseSync } from "node:sqlite";

import { migrate, open } from "../db/index.ts";
import { coverageFailures, fieldCoverage, formatCoverage, inputFieldCounts } from "./field-coverage.ts";
import { loadStaticBundle, runIngest } from "./index.ts";
import type { StaticBundle } from "./index.ts";

const NOW = "2026-08-09T00:00:00Z";

let shared: Promise<{ db: DatabaseSync; bundle: StaticBundle; anomalyKinds: string[] }> | null = null;
/** The real seed in a real registry, once per test file. */
function ingested(): Promise<{ db: DatabaseSync; bundle: StaticBundle; anomalyKinds: string[] }> {
  shared ??= (async () => {
    const db = open(":memory:");
    migrate(db, NOW);
    // No `bundle` option: this is the production path, so the gate is armed and a drop would throw.
    const r = await runIngest(db, { nowIso: NOW });
    return { db, bundle: await loadStaticBundle(), anomalyKinds: r.anomalies.map((a) => a.kind) };
  })();
  return shared;
}

test("every field of all eight seed modules is either carried or explained", async () => {
  const { db, bundle } = await ingested();
  const rows = fieldCoverage(db, bundle);
  assert.deepEqual(coverageFailures(rows), [], `\n${formatCoverage(rows)}`);
  // The table covers the whole seed, not a corner of it: eight modules, every field of each.
  assert.equal(new Set(rows.map((r) => r.module)).size, 8);
  assert.ok(rows.length > 80, `${rows.length} fields is too few to be the whole seed`);
});

test("the two fields cycles 1-3 dropped now reach the registry", async () => {
  const { db, bundle } = await ingested();
  const rows = fieldCoverage(db, bundle);
  const row = (field: string) => rows.find((r) => r.module === "candidates" && r.field === field);
  assert.deepEqual(
    { input: row("photoUrl")?.input, registry: row("photoUrl")?.registry, verdict: row("photoUrl")?.verdict },
    { input: 2920, registry: 2920, verdict: "carried" },
  );
  assert.deepEqual(
    { input: row("incumbentYears")?.input, registry: row("incumbentYears")?.registry, verdict: row("incumbentYears")?.verdict },
    { input: 157, registry: 157, verdict: "carried" },
  );
  // Both are claims, so both carry a citation — a value with no citation is what P2 forbids.
  for (const predicate of ["photo_url_declared", "incumbent_years_declared"]) {
    const n = db
      .prepare(
        "SELECT COUNT(*) AS n FROM claim c JOIN citation ci ON ci.claim_id = c.id WHERE c.predicate = ?",
      )
      .get(predicate) as { n: number };
    assert.ok(Number(n.n) > 0, `${predicate} has no cited claim`);
  }
  // The years figure is about the CANDIDACY; the photo is about the person.
  const subject = (predicate: string): string =>
    String((db.prepare("SELECT subject_ref FROM claim WHERE predicate = ? LIMIT 1").get(predicate) as { subject_ref: string }).subject_ref);
  assert.match(subject("incumbent_years_declared"), /^candidacy:/);
  assert.match(subject("photo_url_declared"), /^person:/);
});

test("a dropped field FAILS the gate, naming the field and both counts", async () => {
  const { db, bundle } = await ingested();
  // The drop, staged and rolled back: delete the write path's output for one field, exactly as
  // deleting the two lines from wb-static.ts would.
  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM citation WHERE claim_id IN (SELECT id FROM claim WHERE predicate = 'photo_url_declared')");
    db.exec("DELETE FROM claim WHERE predicate = 'photo_url_declared'");
    const failures = coverageFailures(fieldCoverage(db, bundle));
    assert.equal(failures.length, 1);
    assert.match(String(failures[0]), /^candidates\.photoUrl: 2920 input rows carry it, 0 reached the registry/);
  } finally {
    db.exec("ROLLBACK");
  }
  // A partial drop with no reason fails too: incumbent_years_declared is not allowed to lose rows
  // quietly just because it kept some.
  db.exec("BEGIN");
  try {
    db.exec("CREATE TEMP TABLE doomed AS SELECT id FROM claim WHERE predicate = 'incumbent_years_declared' LIMIT 7");
    db.exec("DELETE FROM citation WHERE claim_id IN (SELECT id FROM doomed)");
    db.exec("DELETE FROM claim WHERE id IN (SELECT id FROM doomed)");
    db.exec("DROP TABLE doomed");
    const failures = coverageFailures(fieldCoverage(db, bundle));
    assert.equal(failures.length, 1);
    assert.match(String(failures[0]), /candidates\.incumbentYears: 157 input rows carry it, 150 reached the registry/);
  } finally {
    db.exec("ROLLBACK");
  }
  assert.deepEqual(coverageFailures(fieldCoverage(db, await loadStaticBundle())), []);
});

test("a seed field with no rule FAILS, so a new input field cannot arrive unnoticed", async () => {
  const { db, bundle } = await ingested();
  const [first, ...rest] = bundle.candidates;
  const doctored = { ...bundle, candidates: [{ ...first, spouseProfession: "Teacher" }, ...rest] } as StaticBundle;
  const failures = coverageFailures(fieldCoverage(db, doctored));
  assert.equal(failures.length, 1);
  assert.match(String(failures[0]), /^candidates\.spouseProfession: 1 input rows carry it and field-coverage\.ts has no rule/);
});

test("an allowlist entry that stops matching the seed FAILS, so the list cannot rot", async () => {
  const { db, bundle } = await ingested();
  // (a) a field allowlisted as EMPTY in the seed that starts carrying values: the app's Bengali
  // candidate names are nominal today, and the day they are real the registry has to model them.
  const [first, ...rest] = bundle.candidates;
  const withBengali = { ...bundle, candidates: [{ ...first, nameBn: "হিতেন বর্মন" }, ...rest] } as StaticBundle;
  const bnFailures = coverageFailures(fieldCoverage(db, withBengali));
  assert.equal(bnFailures.length, 1);
  assert.match(String(bnFailures[0]), /^candidates\.nameBn: allowlisted as empty in the seed, but 1 rows now carry a value/);

  // (b) a field allowlisted as NOT MODELLED that has left the seed: the entry is now describing
  // nothing and would hide the next real drop.
  const noColour = {
    ...bundle,
    parties: bundle.parties.map((p) => {
      const { color: _colour, ...rest2 } = p as typeof p & { color?: string };
      return rest2;
    }),
  } as StaticBundle;
  const colourFailures = coverageFailures(fieldCoverage(db, noColour));
  assert.equal(colourFailures.length, 1);
  assert.match(String(colourFailures[0]), /^parties\.color: allowlisted as not modelled, but no input row carries it any more/);
});

test("the gate runs inside the ingest, not only where a human looks", async () => {
  const { anomalyKinds } = await ingested();
  // registry:audit shipped in cycle 1 as a command nobody runs. This reports through the list
  // `mandate ingest` prints, on every run.
  assert.ok(anomalyKinds.includes("field_coverage"));
  // A fixture bundle is a subset of the seed's fields by design, so the gate stays off for it —
  // otherwise every fixture test in wb-static.test.ts would fail on fields it never had.
  const db = open(":memory:");
  migrate(db, NOW);
  const r = await runIngest(db, {
    nowIso: NOW,
    bundle: { ...(await loadStaticBundle()), candidates: [], historicalResults: [], currentMLAs: [] },
  });
  assert.deepEqual(r.coverage, []);
  db.close();
});

test("inputFieldCounts counts what a row actually carries, one level into nested shapes", () => {
  const counts = inputFieldCounts([
    { a: 1, b: null, c: "", d: false, e: [], nested: { x: 1, y: null }, list: [{ z: 1 }, { z: 2, w: 3 }] },
    { a: 2, b: "here", nested: { y: 5 } },
  ]);
  assert.deepEqual(
    Object.fromEntries([...counts].sort()),
    // b/c/e are absent or empty in row 1 and nested.y is null there; `false` is a declared value
    // and counts; a nested key counts once per ROW however many array elements carry it.
    { a: 2, b: 1, d: 1, "list.w": 1, "list.z": 1, "nested.x": 1, "nested.y": 1 },
  );
});
