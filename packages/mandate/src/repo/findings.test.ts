// Findings are data, and the sentence is derived from the data.
//
// WHAT THIS SUITE PROTECTS. The state page's old `lines: string[]` used to BE the analysis — the flip count
// existed only inside "115 of 223 seats changed hands." Anything that wanted to draw it had to parse it, which
// is why the product could print findings and not visualise them. These tests bind the inverse property: every
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
import { electionMapView, headlineFindings } from "./election-map.ts";
import { ofType, summarise, summariseAll, type Finding } from "./findings.ts";

const HAVE_DB = existsSync(process.env["MANDATE_DB_PATH"] ?? DEV_DB_PATH);
const live = { skip: HAVE_DB ? false : "no .data/registry.db — run npm run registry:ingest" };
const db = (): DatabaseSync => openRead();

const bjp = { key: "BJP", label: "BJP" };
const inc = { key: "INC", label: "INC" };

/* ────────────────────────────── the shape, with no database ────────────────────────────── */

test("a finding carries the numbers, so a renderer never parses a sentence", () => {
  const f: Finding = {
    type: "vote_seat_efficiency",
    party: bjp,
    votePct: 36.1,
    seatPct: 29,
    deltaPp: -7.1,
    seats: 65,
    contested: 224,
    counted: 224,
    seatsPerPoint: 65 / 36.1,
  };
  // Both shares AND the gap are fields — a plot, a dumbbell and a diverging bar all need them, and none of
  // the three could have got them out of "BJP took 36.1% of the vote and 29.0% of the seats (−7.1pp)."
  assert.equal(f.votePct, 36.1);
  assert.equal(f.seatPct, 29);
  assert.equal(f.deltaPp, -7.1);
  assert.match(summarise(f), /took 36\.1% of the vote and 29\.0% of the seats \(−7\.1pp\)/);
});

test("no finding stores its own prose — summarise is the only formatter", () => {
  const samples: Finding[] = [
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
    { type: "majority", party: inc, seats: 135, contested: 224, needed: 113, holds: true },
    { type: "vote_seat_efficiency", party: bjp, votePct: 36.1, seatPct: 29, deltaPp: -7.1, seats: 65, contested: 224, counted: 224, seatsPerPoint: null },
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
    counted: 543,
    seatsPerPoint: null,
  };
  // A party that won a seat did not receive no votes. "0.0%" would be a fabrication by rounding.
  assert.match(summarise(f), /<0\.1%/);
});

test("ofType narrows without losing the type", () => {
  const mixed: Finding[] = [
    { type: "majority", party: inc, seats: 135, contested: 224, needed: 113, holds: true },
    { type: "seats_incomparable", count: 224, previousYear: 2004, previousEpochId: "d76", epochId: "d08" },
  ];
  const majorities = ofType(mixed, "majority");
  assert.equal(majorities.length, 1);
  assert.equal(majorities[0]?.needed, 113); // a field only `majority` has, so the narrowing is real
  assert.equal(ofType(mixed, "seat_flips").length, 0);
});

/* ────────────────────────── against the live registry ────────────────────────── */

test("an election's headline findings exist for the newest assembly election, and each reads as a sentence", live, () => {
  const d = db();
  try {
    const row = get<{ id: string; j: string }>(
      d,
      `SELECT id, jurisdiction_place_id AS j FROM election WHERE kind = 'assembly'
        ORDER BY year DESC LIMIT 1`,
    );
    assert.notEqual(row, undefined);
    const findings = headlineFindings(electionMapView(d, row!.id, row!.j));
    assert.ok(findings.length > 0, "no findings for the newest assembly election");
    // The view carries the findings and no prose beside them: the sentences are derived, never authored.
    const lines = summariseAll(findings);
    assert.equal(lines.length, findings.length);
    assert.ok(lines.every((l) => l.length > 0), "a finding summarised to nothing");
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
    const v = electionMapView(d, row!.id, row!.j);
    const flips = ofType(headlineFindings(v), "seat_flips");
    if (flips.length === 0) return; // a first election of its house is a legitimate empty answer
    const f = flips[0]!;
    const summed = f.pairs.reduce((n, p) => n + p.count, 0);
    assert.equal(summed, f.flipped, "the matrix cells do not sum to the flip count");
    assert.equal(f.held + f.flipped, f.comparable);
    // Compared and refused seats are disjoint, so together they cannot exceed the seats contested.
    assert.ok(f.comparable + v.incomparableSeats <= v.seats.length, "a seat was both compared and refused");
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
    const findings = headlineFindings(electionMapView(d, "ka-assembly-2008", "ka"));
    assert.equal(ofType(findings, "seat_flips").length, 0, "a flip finding survived the epoch gate");
    const refused = ofType(findings, "seats_incomparable");
    assert.equal(refused.length, 1, "the refusal was not reported as a finding");
    assert.ok(refused[0]!.count > 0);
    // The house's own majority SURVIVES the redraw: it is a fact about this election's seats, not a comparison.
    assert.ok(ofType(findings, "majority").length > 0, "the gate suppressed the election's own aggregates too");
  } finally {
    d.close();
  }
});
