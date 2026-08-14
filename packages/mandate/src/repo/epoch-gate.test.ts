// The epoch gate: what may be compared seat by seat, and what may not.
//
// THE DEFECT THIS SUITE EXISTS TO PREVENT, in full, because it shipped and a reader would have believed it:
//
//   `place.id` is a seat NUMBER slot, not a territory. Every delimitation order renumbers constituencies
//   from scratch, so Karnataka's `ka.ac.001` is AURAD under the 1976 order and NIPPANI under the 2008 one —
//   different places, hundreds of kilometres apart. `stateShifts` and `watchSignals` matched two elections'
//   winners on `place_id` alone. Pairing Karnataka 2004 with Karnataka 2008 therefore matched 223 seats,
//   ALL 223 of which name a different constituency, and reported 170 of them as having "changed hands".
//
//   The state page's election selector makes that pair reachable in two clicks, and 65 of 324 consecutive
//   assembly pairs cross a delimitation the same way.
//
// WHY THE FIX IS A KEY AND NOT AN `if`. A check must be remembered at every call site. Keying the
// comparison on (epoch, place) makes the wrong match UNREPRESENTABLE — the keys cannot collide across
// epochs, so a cross-epoch pair finds nothing no matter who calls it. These tests bind that property at the
// primitive (`seatKey`, `partitionByEpoch`) AND at both consumers, so the gate cannot be removed from one
// of them and left in the other.
//
// AND WHY A SILENT ZERO IS NOT ACCEPTABLE EITHER. "0 seats changed hands" reads as continuity; "223 seats
// cannot be compared" is the truth. Both consumers carry the refused count, and that is asserted here too.
//
// Registry-backed tests skip without .data/registry.db and take their fixtures FROM the registry: the
// cross-epoch pair is DISCOVERED by querying for one, so this suite keeps working as data is loaded.

import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { DEV_DB_PATH, all, get, openRead } from "../db/index.ts";
import { partitionByEpoch, previousElection, seatKey } from "./elections.ts";
import { stateShifts } from "./state-map.ts";
import { spine, watchSignals } from "./home.ts";

const HAVE_DB = existsSync(process.env["MANDATE_DB_PATH"] ?? DEV_DB_PATH);
const live = { skip: HAVE_DB ? false : "no .data/registry.db — run npm run registry:ingest" };
const db = (): DatabaseSync => openRead();

/* ─────────────────────────────── the primitive, with no database ─────────────────────────────── */

test("seatKey separates the same seat number under two delimitations", () => {
  // The exact rows behind the defect. One number, two territories, two keys.
  assert.notEqual(seatKey("ka.ac.001", "delim-1976"), seatKey("ka.ac.001", "delim-2008"));
  // And the same seat under the same boundary is the same key, or nothing could ever be compared.
  assert.equal(seatKey("ka.ac.001", "delim-2008"), seatKey("ka.ac.001", "delim-2008"));
});

test("seatKey cannot collide: no two distinct (place, epoch) pairs produce one key", () => {
  const pairs: [string, string][] = [
    ["ka.ac.001", "delim-2008"],
    ["ka.ac.001", "delim-1976"],
    ["ka.ac.0", "delim-2008 1"], // the adversarial case a naive concatenation would collapse
    ["wb.ac.084", "delim-2008"],
    ["up.ac.306", "delim-1952"],
  ];
  const keys = new Set(pairs.map(([p, e]) => seatKey(p, e)));
  assert.equal(keys.size, pairs.length, "two different seats share a comparison key");
});

test("partitionByEpoch refuses every seat when the boundary changed, and refuses none when it did not", () => {
  const then2004 = [
    { placeId: "ka.ac.001", epochId: "delim-1976" },
    { placeId: "ka.ac.002", epochId: "delim-1976" },
  ];
  const now2008 = [
    { placeId: "ka.ac.001", epochId: "delim-2008" },
    { placeId: "ka.ac.002", epochId: "delim-2008" },
  ];

  const across = partitionByEpoch(now2008, then2004);
  assert.equal(across.comparable.length, 0, "a redrawn seat was admitted to the comparison");
  assert.equal(across.incomparable.length, 2, "the refused seats were not reported");

  const within = partitionByEpoch(now2008, now2008);
  assert.equal(within.comparable.length, 2);
  assert.equal(within.incomparable.length, 0);
});

test("partitionByEpoch splits a MIXED election per seat, not per election", () => {
  // ls-2024 is this shape in the live registry: 524 contests under delim-2008, 5 under delim-2022-jk and
  // 14 under delim-2023-as. An election-level flag would have called all 543 comparable to 2019.
  const then = [
    { placeId: "ka.pc.001", epochId: "delim-2008" },
    { placeId: "jk.pc.001", epochId: "delim-2008" },
  ];
  const now = [
    { placeId: "ka.pc.001", epochId: "delim-2008" },
    { placeId: "jk.pc.001", epochId: "delim-2022-jk" },
  ];
  const split = partitionByEpoch(now, then);
  assert.equal(split.comparable.length, 1, "the seat on unchanged boundaries should compare");
  assert.equal(split.incomparable.length, 1, "the redrawn seat should not");
  assert.equal(split.incomparable[0]?.placeId, "jk.pc.001");
});

/* ─────────────────────────── the consumers, against the live registry ─────────────────────────── */

/** A consecutive same-kind pair in one jurisdiction whose contests sit under DIFFERENT epochs. */
function crossEpochPair(
  d: DatabaseSync,
): { jurisdiction: string; now: string; then: string; nowEpoch: string; thenEpoch: string } | null {
  const rows = all<{ id: string; j: string; epoch: string }>(
    d,
    `SELECT e.id AS id, e.jurisdiction_place_id AS j, e.epoch_id AS epoch
       FROM election e WHERE e.kind = 'assembly' ORDER BY e.jurisdiction_place_id, e.year`,
  );
  for (const row of rows) {
    const prior = previousElection(d, row.id);
    if (prior === null) continue;
    const priorEpoch = get<{ e: string }>(d, `SELECT epoch_id AS e FROM election WHERE id = ?`, prior)?.e;
    if (priorEpoch !== undefined && priorEpoch !== row.epoch) {
      return { jurisdiction: row.j, now: row.id, then: prior, nowEpoch: row.epoch, thenEpoch: priorEpoch };
    }
  }
  return null;
}

test("a cross-epoch pair exists in the registry, so this gate is not theoretical", live, () => {
  const d = db();
  try {
    const pair = crossEpochPair(d);
    assert.notEqual(pair, null, "no cross-epoch pair found — the fixture these tests need is missing");
  } finally {
    d.close();
  }
});

test("stateShifts NEVER reports a flip count across a delimitation", live, () => {
  const d = db();
  try {
    const pair = crossEpochPair(d);
    if (pair === null) return;
    const shifts = stateShifts(d, pair.jurisdiction, pair.now);

    // The whole defect, as one assertion: not one seat may be compared across the boundary change.
    assert.equal(
      shifts.comparableSeats,
      0,
      `${pair.now} vs ${pair.then} crosses ${pair.thenEpoch} → ${pair.nowEpoch} and still compared ` +
        `${shifts.comparableSeats} seats`,
    );
    // And the refusal is REPORTED, not swallowed. A hidden zero would read as "nothing changed".
    assert.ok(shifts.incomparableSeats > 0, "seats were refused without being counted");
    // No sentence may claim seats changed hands.
    const claims = shifts.lines.filter((l) => /changed hands/.test(l));
    assert.equal(claims.length, 0, `a flip claim survived the gate: ${JSON.stringify(claims)}`);
    // Something must SAY why, or the section is silently short.
    assert.ok(
      shifts.lines.some((l) => /cannot be compared/.test(l)),
      "the refusal was not explained to the reader",
    );
  } finally {
    d.close();
  }
});

test("stateShifts still compares seats WITHIN one delimitation", live, () => {
  const d = db();
  try {
    // Every jurisdiction's newest assembly pair is same-epoch in the current registry, so this asserts the
    // gate did not simply switch the feature off.
    const rows = all<{ id: string; j: string }>(
      d,
      `SELECT e.id AS id, e.jurisdiction_place_id AS j FROM election e
        WHERE e.kind = 'assembly' ORDER BY e.year DESC LIMIT 40`,
    );
    let compared = 0;
    for (const r of rows) {
      const prior = previousElection(d, r.id);
      if (prior === null) continue;
      const a = get<{ e: string }>(d, `SELECT epoch_id AS e FROM election WHERE id = ?`, r.id)?.e;
      const b = get<{ e: string }>(d, `SELECT epoch_id AS e FROM election WHERE id = ?`, prior)?.e;
      if (a !== b) continue;
      const shifts = stateShifts(d, r.j, r.id);
      if (shifts.comparableSeats > 0) compared += 1;
    }
    assert.ok(compared > 0, "the gate blocked every same-epoch comparison too");
  } finally {
    d.close();
  }
});

test("watchSignals emits no flip signal that crosses a delimitation", live, () => {
  const d = db();
  try {
    const s = spine(d);
    const signals = watchSignals(d, s, 2026, 100);
    const flips = signals.filter((x) => /changed hands/.test(x.rule));

    for (const sig of flips) {
      // Re-derive the pair this signal is about and assert both sides share a boundary.
      const standing = s.standings.find((x) => x.jurisdictionName === sig.subject);
      if (standing === undefined) continue;
      const thenId = s.previousOf(standing.electionId);
      if (thenId === null) continue;
      const a = get<{ e: string }>(d, `SELECT epoch_id AS e FROM election WHERE id = ?`, standing.electionId)?.e;
      const b = get<{ e: string }>(d, `SELECT epoch_id AS e FROM election WHERE id = ?`, thenId)?.e;
      assert.equal(a, b, `a flip signal for ${sig.subject} spans ${b} → ${a}`);
    }
  } finally {
    d.close();
  }
});

test("the OLD matching rule really did produce a false flip count — the defect, reproduced", live, () => {
  const d = db();
  try {
    const pair = crossEpochPair(d);
    if (pair === null) return;

    // The winners of both elections, exactly as the shipped query read them.
    const rows = all<{ electionId: string; placeId: string; epochId: string; party: string | null }>(
      d,
      `SELECT c.election_id AS electionId, pv.place_id AS placeId, pv.epoch_id AS epochId,
              COALESCE(pt.short_name, ca.party_raw) AS party
         FROM contest c
         JOIN place_version pv ON pv.id = c.place_version_id
         JOIN result r  ON r.contest_id = c.id AND r.revision = 0 AND r.is_winner = 1
         JOIN candidacy ca ON ca.id = r.candidacy_id
         LEFT JOIN party_version pver ON pver.id = ca.party_version_id
         LEFT JOIN party pt ON pt.id = pver.party_id
        WHERE c.election_id IN (?, ?)`,
      pair.now,
      pair.then,
    );
    const now = rows.filter((r) => r.electionId === pair.now);
    const then = rows.filter((r) => r.electionId === pair.then);

    // THE OLD RULE, reimplemented here and nowhere else: match on place_id, ignore the boundary.
    const oldBefore = new Map(then.map((r) => [r.placeId, r.party]));
    let oldCompared = 0;
    let oldFlipped = 0;
    for (const r of now) {
      const was = oldBefore.get(r.placeId);
      if (was === undefined || was === null || r.party === null) continue;
      oldCompared += 1;
      if (was !== r.party) oldFlipped += 1;
    }

    // This is the bug, measured: the old rule matched a large number of seats and called many of them
    // flips. If this assertion ever fails it means the fixture pair changed, not that the bug was benign.
    assert.ok(
      oldCompared > 0,
      `the old rule matched nothing for ${pair.now} vs ${pair.then}; this fixture no longer demonstrates the defect`,
    );
    assert.ok(oldFlipped > 0, "the old rule reported no flips, so there was nothing to prevent");

    // Every one of those matches names a DIFFERENT constituency — which is what made the count false.
    const nameOf = new Map(
      all<{ pid: string; ep: string; nm: string }>(
        d,
        `SELECT place_id AS pid, epoch_id AS ep, canonical_name AS nm FROM place_version
          WHERE epoch_id IN (?, ?)`,
        pair.nowEpoch,
        pair.thenEpoch,
      ).map((r) => [seatKey(r.pid, r.ep), r.nm]),
    );
    let renamed = 0;
    for (const r of now) {
      if (!oldBefore.has(r.placeId)) continue;
      const a = nameOf.get(seatKey(r.placeId, pair.nowEpoch));
      const b = nameOf.get(seatKey(r.placeId, pair.thenEpoch));
      if (a !== undefined && b !== undefined && a !== b) renamed += 1;
    }
    assert.ok(
      renamed > 0,
      "the old rule's matches all named the same seat, so the comparison would have been sound",
    );

    // AND THE GATE, on the very same data, refuses all of it.
    const gated = partitionByEpoch(now, then);
    assert.equal(gated.comparable.length, 0);
    assert.equal(
      stateShifts(d, pair.jurisdiction, pair.now).comparableSeats,
      0,
      "the shipped path still compares what the old rule compared",
    );
  } finally {
    d.close();
  }
});

test("the seat facts a comparison reads carry their own boundary", live, () => {
  const d = db();
  try {
    const s = spine(d);
    assert.ok(s.seats.length > 0, "no seat facts loaded");
    // Without epochId on the row there is nothing to key on, so this is the gate's precondition.
    for (const seat of s.seats.slice(0, 200)) {
      assert.equal(typeof seat.epochId, "string");
      assert.ok(seat.epochId.length > 0, `${seat.placeId} carries no epoch`);
    }
  } finally {
    d.close();
  }
});
