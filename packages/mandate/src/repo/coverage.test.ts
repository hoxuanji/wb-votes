// Tests for the coverage ledger.
//
// The page exists to stop the product overstating itself, so the failure mode to guard against is the
// ledger drifting into a nicer story than the database supports. Three ways that happens:
//
//   · a status is hand-written and outlives the data it described
//   · a vertical quietly disappears from the list, and with it the fact that it holds nothing
//   · a probe counts a table that some other vertical also writes, so an empty vertical borrows rows
//
// All three are checked here. The last one is the subtle one and it is the same mistake the
// field-coverage gate found in the ingest: three modules once shared one probe.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { openRead, DEV_DB_PATH } from "../db/open.ts";
import { migrate } from "../db/migrate.ts";
import { get } from "../db/index.ts";
import { INDIA, VERTICALS, getCoverage, verticals } from "./coverage.ts";

const HAVE_DB = existsSync(process.env["MANDATE_DB_PATH"] ?? DEV_DB_PATH);
const live = { skip: HAVE_DB ? false : "no .data/registry.db — run npm run registry:ingest" };

test("the ledger covers every vertical the spec names, by key", () => {
  const spec = readFileSync(new URL("../../../../docs/platform/00-model.md", import.meta.url), "utf8");
  // §3 of the spec is the list of record. If a vertical is added there and not here, the page silently
  // under-reports the gap — which is the one thing this page must never do.
  assert.equal(VERTICALS.length, 18, `spec §3 names eighteen verticals, ledger has ${VERTICALS.length}`);
  assert.equal(new Set(VERTICALS.map((v) => v.key)).size, 18, "duplicate vertical key");
  for (const v of VERTICALS) {
    assert.ok(v.question.trim().length > 0, `${v.key} has no question`);
    assert.ok(v.source.trim().length > 0, `${v.key} names no source`);
    assert.ok(v.scope.trim().length > 0, `${v.key} states no scope`);
    assert.ok(v.unit.trim().length > 0, `${v.key} has no unit for its count`);
  }
  // The spec must mention the platform reframe, or this ledger is describing a document that moved on.
  // Whitespace-tolerant: the spec is prose and wraps mid-sentence.
  assert.match(spec, /Elections are its live-event mode,\s+not its\s+subject/);
});

test("reach is measured, and scope no longer claims to be a count", () => {
  // WHY THIS EXISTS. `scope` was one field carrying two different kinds of claim: how far the data goes,
  // and what it excludes. The first is a count and it rotted — "West Bengal: 294 assembly seats × 4
  // elections" survived months past the load of 355 assembly elections across 31 jurisdictions, so a page
  // built to stop the product overstating itself was understating it by an order of magnitude. Anything
  // countable is now counted by `reachProbe`; `scope` keeps only the caveat.
  for (const v of VERTICALS) {
    if (v.reachProbe !== null) {
      assert.match(v.reachProbe, /AS reach/i, `${v.key}'s reach probe must select one column named reach`);
      assert.ok(v.probe !== null, `${v.key} measures its reach but not its rows`);
    }
    // A caveat may name a place; it may not assert HOW MANY of them there are, because that is the part
    // that goes stale. Guard the specific shape that failed.
    assert.doesNotMatch(
      v.scope,
      /\b(one|two|three|four|five)\s+(state|states|assembly cycles|boundary epoch)/i,
      `${v.key}'s scope line counts something in prose: "${v.scope}"`,
    );
    assert.doesNotMatch(v.scope, /\d+\s+(assembly seats|West Bengal)/i, `${v.key}'s scope hard-codes a count`);
  }
});

test("no two verticals share a probe, so an empty one cannot borrow rows", () => {
  const probes = VERTICALS.flatMap((v) => (v.probe === null ? [] : [v.probe.replace(/\s+/g, " ")]));
  assert.equal(new Set(probes).size, probes.length, "two verticals count the same query");
  // And a probe must return a single column named n, or the count silently reads as 0.
  for (const p of probes) assert.match(p, /count\(\*\) AS n/i, `probe does not select count(*) AS n: ${p}`);
});

test("status is derived from the data, not declared", () => {
  // An empty but migrated registry: every probe resolves, nothing has rows. Any vertical reporting
  // "present" here is reading a status from somewhere other than the database.
  const db = new DatabaseSync(":memory:");
  migrate(db, "2026-08-10T00:00:00.000Z");
  const rows = verticals(db);
  assert.equal(rows.length, 18);
  assert.ok(
    rows.every((v) => v.status !== "present"),
    `on an empty registry these claimed data: ${rows.filter((v) => v.status === "present").map((v) => v.key).join(", ")}`,
  );
  assert.ok(
    rows.every((v) => v.count === 0),
    "a count came back non-zero from an empty database",
  );
  // A vertical with a probe against a real table is "empty"; one with no probe is "no-model". The
  // distinction is the difference between "we model this and have none" and "we cannot hold it at all".
  const byKey = new Map(rows.map((v) => [v.key, v]));
  assert.equal(byKey.get("elections")?.status, "empty", "elections has a probe, so it cannot be no-model");
  assert.equal(byKey.get("bills")?.status, "no-model", "bills has no table and must say so");
  db.close();
});

test("a probe naming a table that no longer exists degrades instead of 500ing", () => {
  const db = new DatabaseSync(":memory:");
  migrate(db, "2026-08-10T00:00:00.000Z");
  // Simulate a future migration renaming a table out from under a probe.
  db.exec("DROP TABLE alliance_member");
  const rows = verticals(db);
  const coalitions = rows.find((v) => v.key === "coalitions");
  assert.equal(coalitions?.status, "no-model", "a broken probe must not take the page down");
  assert.equal(rows.length, 18, "a broken probe dropped a vertical from the ledger");
  db.close();
});

test("the live ledger reports the gap honestly", live, () => {
  const c = getCoverage(openRead());
  assert.equal(c.present + c.empty + c.noModel, c.total, "the three counts do not sum to the total");
  assert.equal(c.total, 18);

  // Elections and census are the two verticals with real data; if either stops being "present" the
  // registry has lost rows.
  const byKey = new Map(c.verticals.map((v) => [v.key, v]));
  assert.equal(byKey.get("elections")?.status, "present");
  assert.equal(byKey.get("census")?.status, "present");

  // The point of the page: most of it is not built. If this ever drops to zero, either the platform
  // genuinely covers everything or someone has quietly deleted the rows that say otherwise.
  assert.ok(c.noModel >= 10, `only ${c.noModel} verticals unmodelled — verify before relaxing this`);

  // Court cases must stay deliberately empty, not silently populated.
  assert.equal(byKey.get("cases")?.status, "empty", "legal_case has rows — P5 says it must not");
  assert.match(byKey.get("cases")?.scope ?? "", /charged is not convicted/i);

  // Geography ratios must be arithmetic on the same numbers the table prints.
  const g = c.geography;
  assert.ok(g.statesLoaded >= 1 && g.statesLoaded <= INDIA.states);
  assert.equal(Math.round(g.assemblyPct * 100) / 100, Math.round(((100 * g.assemblySeatsLoaded) / INDIA.assemblySeats) * 100) / 100);
  assert.ok(g.assemblyPct < 100, "claiming every assembly seat in India is loaded");
  assert.ok(g.parliamentarySeatsLoaded > 0, "the Lok Sabha load is not visible in coverage");
});

test("measured reach agrees with the registry, and never contradicts the count", live, () => {
  const d = openRead();
  try {
    for (const v of verticals(d)) {
      if (v.reachProbe === null || v.status !== "present") {
        assert.equal(v.reach, null, `${v.key} reports a reach it cannot measure`);
        continue;
      }
      assert.ok(v.reach !== null && v.reach.trim().length > 0, `${v.key} has rows but no measured reach`);
      // The reach must not be a bare number with no unit, and must not be empty of digits either: it is a
      // measurement, so it says what it measured.
      assert.match(v.reach, /\d/, `${v.key}'s reach carries no figure: "${v.reach}"`);
      assert.match(v.reach, /[a-z]/i, `${v.key}'s reach carries no unit: "${v.reach}"`);
    }
    // The one that rotted, asserted directly: the elections row must name more than one jurisdiction if
    // the registry holds more than one.
    const js = get<{ n: number }>(d, "SELECT count(DISTINCT jurisdiction_place_id) AS n FROM election")?.n ?? 0;
    const elections = verticals(d).find((v) => v.key === "elections");
    if (js > 1 && elections?.status === "present") {
      assert.match(
        elections.reach ?? "",
        new RegExp(`^${js} jurisdictions`),
        `the elections reach says "${elections.reach}" but the registry holds ${js} jurisdictions`,
      );
    }
  } finally {
    d.close();
  }
});

test("counts match a direct query, so the page cannot inflate them", live, () => {
  const db = openRead();
  for (const v of verticals(db)) {
    if (v.probe === null) continue;
    const direct = Number(get<{ n: number }>(db, v.probe)?.n ?? 0);
    assert.equal(v.count, direct, `${v.key} reports ${v.count} against a direct count of ${direct}`);
  }
});
