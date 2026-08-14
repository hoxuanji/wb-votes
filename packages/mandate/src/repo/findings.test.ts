// Findings are data, and the sentence is derived from the data.
//
// WHAT THIS SUITE PROTECTS. `StateShifts.lines` used to BE the analysis — the flip count existed only
// inside "115 of 223 seats changed hands." Anything that wanted to draw it had to parse it, which is why
// the product could print findings and not visualise them. These tests bind the inverse property: every
// conclusion is reachable as a field, and `summarise` is a pure function of those fields.
//
// The one rule worth stating: there is NO `text` field on a finding. A stored sentence is a second source
// of truth, and two sources of truth for one number is how a chart's caption starts contradicting its own
// bars. `summarise` is asserted here to agree with the fields it formats.

import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { DEV_DB_PATH, get, openRead } from "../db/index.ts";
import { ofType, summarise, summariseAll, type Finding } from "./findings.ts";
import { stateShifts } from "./state-map.ts";

const HAVE_DB = existsSync(process.env["MANDATE_DB_PATH"] ?? DEV_DB_PATH);
const live = { skip: HAVE_DB ? false : "no .data/registry.db — run npm run registry:ingest" };
const db = (): DatabaseSync => openRead();

const bjp = { key: "BJP", label: "BJP" };
const inc = { key: "INC", label: "INC" };

/* ────────────────────────────── the shape, with no database ────────────────────────────── */

test("a finding carries the numbers, so a renderer never parses a sentence", () => {
  const f: Finding = {
    type: "seat_movement",
    party: bjp,
    then: 104,
    now: 65,
    delta: -39,
    previousYear: 2018,
    year: 2023,
  };
  // Both endpoints AND the delta are fields — a slope, a dumbbell and a diverging bar all need them, and
  // none of the three could have got them out of "BJP lost 39 seats, 104 to 65."
  assert.equal(f.then, 104);
  assert.equal(f.now, 65);
  assert.equal(f.delta, -39);
  assert.match(summarise(f), /lost 39 seats/);
});

test("no finding stores its own prose — summarise is the only formatter", () => {
  const samples: Finding[] = [
    { type: "seat_movement", party: bjp, then: 104, now: 65, delta: -39, previousYear: 2018, year: 2023 },
    { type: "party_arrival", party: inc, seats: 12, previousYear: 2018, year: 2023 },
    { type: "party_wipeout", party: bjp, seats: 7, previousYear: 2018, year: 2023 },
    {
      type: "seat_flips",
      flipped: 115,
      held: 108,
      comparable: 223,
      pairs: [{ from: bjp, to: inc, count: 53 }],
      previousYear: 2018,
      year: 2023,
    },
    { type: "seats_incomparable", count: 224, previousYear: 2004, previousEpochId: "d76", epochId: "d08" },
    { type: "turnout_change", nowPct: 72.8, thenPct: 74, deltaPp: -1.2, previousYear: 2018, year: 2023 },
    { type: "majority", party: inc, seats: 135, contested: 224, needed: 113, holds: true },
  ];
  for (const f of samples) {
    assert.ok(!("text" in f), `${f.type} carries a stored sentence`);
    assert.ok(summarise(f).length > 0, `${f.type} produced no summary`);
    assert.ok(summarise(f).endsWith("."), `${f.type} summary is not a sentence`);
  }
  assert.equal(summariseAll(samples).length, samples.length);
});

test("a flip finding carries the from-to breakdown a matrix needs", () => {
  const f: Finding = {
    type: "seat_flips",
    flipped: 115,
    held: 108,
    comparable: 223,
    // The Karnataka 2018→2023 cells, which no previous output could express at all.
    pairs: [
      { from: bjp, to: inc, count: 53 },
      { from: { key: "JD(S)", label: "JD(S)" }, to: inc, count: 22 },
      { from: inc, to: bjp, count: 17 },
    ],
    previousYear: 2018,
    year: 2023,
  };
  const pairs = f.type === "seat_flips" ? f.pairs : [];
  assert.equal(pairs.reduce((n, p) => n + p.count, 0), 92);
  // Every cell names both ends by KEY, which is what party ink is looked up by.
  for (const p of pairs) {
    assert.ok(p.from.key.length > 0);
    assert.ok(p.to.key.length > 0);
    assert.notEqual(p.from.key, p.to.key, "a flip to the same party is not a flip");
  }
});

test("held + flipped equals the comparable denominator", () => {
  const f = {
    type: "seat_flips" as const,
    flipped: 115,
    held: 108,
    comparable: 223,
    pairs: [],
    previousYear: 2018,
    year: 2023,
  };
  assert.equal(f.held + f.flipped, f.comparable);
});

test("a share that is small but real never summarises as zero", () => {
  const f: Finding = {
    type: "vote_seat_efficiency",
    party: { key: "SKM", label: "SKM" },
    votePct: 0.03,
    seatPct: 0.18,
    deltaPp: 0.15,
    seats: 1,
    contested: 543,
    seatsPerPoint: null,
  };
  // A party that won a seat did not receive no votes. "0.0%" would be a fabrication by rounding.
  assert.match(summarise(f), /<0\.1%/);
});

test("ofType narrows without losing the type", () => {
  const mixed: Finding[] = [
    { type: "majority", party: inc, seats: 135, contested: 224, needed: 113, holds: true },
    { type: "turnout_change", nowPct: 72.8, thenPct: 74, deltaPp: -1.2, previousYear: 2018, year: 2023 },
  ];
  const majorities = ofType(mixed, "majority");
  assert.equal(majorities.length, 1);
  assert.equal(majorities[0]?.needed, 113); // a field only `majority` has, so the narrowing is real
  assert.equal(ofType(mixed, "seat_flips").length, 0);
});

/* ────────────────────────── against the live registry ────────────────────────── */

test("stateShifts returns findings, and its prose is exactly summariseAll of them", live, () => {
  const d = db();
  try {
    const row = get<{ id: string; j: string }>(
      d,
      `SELECT id, jurisdiction_place_id AS j FROM election WHERE kind = 'assembly'
        ORDER BY year DESC LIMIT 1`,
    );
    assert.notEqual(row, undefined);
    const s = stateShifts(d, row!.j, row!.id);
    assert.ok(s.findings.length > 0, "no findings for the newest assembly election");
    // The invariant that keeps a caption honest: prose is derived, never authored beside the data.
    assert.deepEqual(s.lines, summariseAll(s.findings));
  } finally {
    d.close();
  }
});

test("a same-epoch comparison produces flip pairs that reconcile with the flip count", live, () => {
  const d = db();
  try {
    const row = get<{ id: string; j: string }>(
      d,
      `SELECT id, jurisdiction_place_id AS j FROM election WHERE kind = 'assembly'
        ORDER BY year DESC LIMIT 1`,
    );
    const s = stateShifts(d, row!.j, row!.id);
    const flips = ofType(s.findings, "seat_flips");
    if (flips.length === 0) return; // a first election of its house is a legitimate empty answer
    const f = flips[0]!;
    const summed = f.pairs.reduce((n, p) => n + p.count, 0);
    assert.equal(summed, f.flipped, "the matrix cells do not sum to the flip count");
    assert.equal(f.held + f.flipped, f.comparable);
    assert.equal(f.comparable, s.comparableSeats);
  } finally {
    d.close();
  }
});

test("a cross-epoch comparison emits seats_incomparable and NO seat_flips", live, () => {
  const d = db();
  try {
    // ka-assembly-2008's previous is ka-assembly-2004, across the 1976→2008 redraw.
    const exists = get<{ n: number }>(
      d,
      `SELECT COUNT(*) AS n FROM election WHERE id IN ('ka-assembly-2008','ka-assembly-2004')`,
    );
    if ((exists?.n ?? 0) < 2) return;
    const s = stateShifts(d, "ka", "ka-assembly-2008");
    assert.equal(ofType(s.findings, "seat_flips").length, 0, "a flip finding survived the epoch gate");
    const refused = ofType(s.findings, "seats_incomparable");
    assert.equal(refused.length, 1, "the refusal was not reported as a finding");
    assert.ok(refused[0]!.count > 0);
    // State-level aggregates SURVIVE the redraw: a state's turnout is a real quantity across it.
    assert.ok(
      ofType(s.findings, "turnout_change").length > 0 || ofType(s.findings, "majority").length > 0,
      "the gate suppressed state-level aggregates too",
    );
  } finally {
    d.close();
  }
});
