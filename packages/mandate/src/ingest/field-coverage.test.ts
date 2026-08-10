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

import { open } from "../db/index.ts";
import { MODULE_KEYS } from "./index.ts";
import { migrate } from "../db/migrate.ts";
import { RULES, coverageFailures, fieldCoverage, formatCoverage, inputFieldCounts, seedShapeFailures } from "./field-coverage.ts";
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

test("every field of every seed module is either carried or explained", async () => {
  const { db, bundle } = await ingested();
  const rows = fieldCoverage(db, bundle);
  assert.deepEqual(coverageFailures(rows), [], `\n${formatCoverage(rows)}`);
  // The table covers the whole seed, not a corner of it: eight modules, every field of each.
  // Derived, not 8: two geometry modules joined the seed and a hardcoded count hides the new ones.
  assert.equal(new Set(rows.map((r) => r.module)).size, MODULE_KEYS.length);
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

test("a name field's total loss FAILS the gate, per module", async () => {
  const { db, bundle } = await ingested();
  // mps.name, cabinet.name and currentMLAs.name shared one probe — `person_alias WHERE kind =
  // 'press'` — which counts a superset of all three, so any one of them could lose every name and
  // the probe would still read 1,041. Staged here exactly as the reviewer reproduced it: delete
  // every press alias belonging to a person who holds an ls_seat_won claim, i.e. the ingest no
  // longer writing any MP name at all. Under the shared probe this stayed verdict="carried".
  const anchors: [string, string, RegExp][] = [
    ["mps", "predicate = 'ls_seat_won'", /^mps\.name: 42 input rows carry it, 0 reached the registry/],
    ["cabinet", "predicate LIKE 'cabinet_portfolio:%'", /^cabinet\.name: 6 input rows carry it, 0 reached the registry/],
    ["currentMLAs", "predicate = 'mla_term'", /^currentMLAs\.name: 294 input rows carry it, 0 reached the registry/],
  ];
  for (const [module, where, expected] of anchors) {
    db.exec("BEGIN");
    try {
      db.exec(
        `DELETE FROM person_alias WHERE kind = 'press' AND person_id IN
           (SELECT REPLACE(subject_ref, 'person:', '') FROM claim WHERE ${where})`,
      );
      const failures = coverageFailures(fieldCoverage(db, bundle));
      assert.equal(failures.length, 1, `${module}: ${failures.join(" | ")}`);
      assert.match(String(failures[0]), expected);
    } finally {
      db.exec("ROLLBACK");
    }
  }
});

test("no two modules share a probe, so a probe always answers for its own module", () => {
  // The structural form of the bug above. Two fields of ONE module may share a probe — a result row
  // carries winner.name and winner.votes together — but a probe shared across modules counts rows
  // another module wrote and can never fall below this module's input.
  const seen = new Map<string, string>();
  for (const [module, rules] of Object.entries(RULES)) {
    for (const [field, rule] of Object.entries(rules)) {
      if (!("probe" in rule)) continue;
      const owner = seen.get(rule.probe);
      assert.ok(
        owner === undefined || owner === module,
        `${module}.${field} reuses ${owner}'s probe: ${rule.probe}`,
      );
      seen.set(rule.probe, module);
    }
  }
});

test("an allowlist entry the registry contradicts FAILS, so 'not modelled' cannot be a lie", async () => {
  const { db, bundle } = await ingested();
  // The direction the rot test could not reach: a `drop` entry was never checked against the
  // registry, so moving a carried field onto the allowlist with a plausible reason silenced the gate
  // AND printed "not-modelled" for 2,920 rows the registry was holding. `assertAbsent` closes it —
  // here by giving one AC seat a Bengali name the entry claims place.names never holds.
  db.exec("BEGIN");
  try {
    db.exec(
      `UPDATE place SET names = '{"bn":"\u09ae\u09c7\u0996\u09b2\u09bf\u0997\u099e\u09cd\u099c"}'
         WHERE kind = 'ac' AND id = (SELECT id FROM place WHERE kind = 'ac' ORDER BY id LIMIT 1)`,
    );
    const failures = coverageFailures(fieldCoverage(db, bundle));
    assert.equal(failures.length, 1, failures.join(" | "));
    assert.match(
      String(failures[0]),
      /^constituencies\.nameBn: allowlisted as not modelled, but 1 registry rows carry it/,
    );
  } finally {
    db.exec("ROLLBACK");
  }
});

test("a seed row that breaks src/types/index.ts FAILS, which the JSON import no longer catches", async () => {
  const { bundle } = await ingested();
  assert.deepEqual(seedShapeFailures(bundle), []);
  // scripts/scraper/overrides.json patches candidate fields and build-data.js writes them straight
  // into data/seed/candidates.json. `raw as Candidate[]` is a cast, so an override that drops `age`
  // or spells gender "M" passes tsc, passes the coverage gate (input and registry fall together)
  // and renders as undefined on /candidate/[id]. An annotation cannot help: tsc WIDENS a JSON
  // literal, so a correct `reservation: "SC"` arrives as `string` and fails too.
  const [first, ...rest] = bundle.candidates;
  const { age: _age, ...ageless } = first as typeof first & { age?: number };
  const missing = { ...bundle, candidates: [ageless, ...rest] } as StaticBundle;
  assert.match(String(seedShapeFailures(missing)[0]), /has no `age`, which src\/types\/index\.ts declares non-optional/);

  const wrongEnum = { ...bundle, candidates: [{ ...first, gender: "M" }, ...rest] } as StaticBundle;
  assert.match(String(seedShapeFailures(wrongEnum)[0]), /has `gender` = "M", which is not one of/);

  // A nested required key and a nested union, since half the contract lives one level down.
  const [firstMinister, ...others] = bundle.cabinet;
  const badRank = {
    ...bundle,
    cabinet: [{ ...firstMinister, portfolios: [{ ministry: "Finance", rank: "Deputy", from: "2026-05-09" }] }, ...others],
  } as StaticBundle;
  assert.match(String(seedShapeFailures(badRank)[0]), /has `portfolios\.rank` = "Deputy", which is not one of/);

  const noMinistry = {
    ...bundle,
    cabinet: [{ ...firstMinister, portfolios: [{ rank: "CM", from: "2026-05-09" }] }, ...others],
  } as StaticBundle;
  assert.match(String(seedShapeFailures(noMinistry)[0]), /has no `portfolios\.ministry`/);
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
