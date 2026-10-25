// Where the names on the vote-against-seat plot go: claims about literal coordinates, and a randomised sweep of the
// same claims.
//
// WHAT WAS WRONG. Every party's name was printed beside its marker and the names were then pushed apart in one
// dimension, so four small parties at the origin of West Bengal 2021 printed over each other and over the axis.
// The claims below are the ones a reader needs to be true of ANY layout, not of that one: no two names closer than
// a line, every name inside the frame, no name over a marker, a leader line wherever a name is not beside its
// marker, and the same layout whatever order the parties arrive in.

import assert from "node:assert/strict";
import test from "node:test";
import {
  axisTicks,
  encloseDiscs,
  labelWidth,
  othersLabel,
  placeLabels,
  splitMinor,
  type Box,
  type Disc,
  type LabelRequest,
  type PlacedLabel,
} from "./plot-labels.ts";

const LINE = 16;
/** The plot's interior in the 400-unit frame the figure draws in: 38 of margin for the axes, 4 of air. */
const FRAME: Box = { x0: 42, y0: 42, x1: 358, y1: 358 };
const R = 7;

const req = (key: string, x: number, y: number, chars = 3, weight = 1): LabelRequest => ({
  key,
  x,
  y,
  r: R,
  width: labelWidth("x".repeat(chars)),
  weight,
});
const discs = (rs: readonly LabelRequest[]): Disc[] => rs.map(({ x, y, r }) => ({ x, y, r }));

/** West Bengal 2021 as the figure positions it: the four parties that printed over each other, then the two big ones. */
const WB2021 = [
  req("AITC", 249.2, 53.4, 4, 71),
  req("BJP", 205.3, 250.3, 3, 39),
  req("CPM", 58.9, 362, 3, 4.8),
  req("INC", 50.9, 362, 3, 3),
  req("IND", 44.7, 360.5, 3, 1.5),
  req("AISF", 44, 360.5, 4, 1.4),
];

/** The distance between two boxes along the axis they are furthest apart on; zero or less means they overlap. */
const separation = (a: Box, b: Box) => Math.max(a.x0 - b.x1, b.x0 - a.x1, a.y0 - b.y1, b.y0 - a.y1);

/** The nearest distance from a point to a box. */
function toBox(d: Disc, b: Box): number {
  const dx = Math.max(b.x0 - d.x, 0, d.x - b.x1);
  const dy = Math.max(b.y0 - d.y, 0, d.y - b.y1);
  return Math.hypot(dx, dy);
}

/** Every claim that must hold of a layout, whatever its input. */
function assertLegible(
  requests: readonly LabelRequest[],
  placed: readonly PlacedLabel[],
  obstacles: readonly Disc[],
  frame: Box,
  where: string,
): void {
  for (const p of placed) {
    assert.ok(
      p.box.x0 >= frame.x0 && p.box.x1 <= frame.x1 && p.box.y0 >= frame.y0 && p.box.y1 <= frame.y1,
      `${where}: ${p.key} leaves the frame: ${JSON.stringify(p.box)}`,
    );
    assert.ok(Math.abs(p.box.y1 - p.box.y0 - LINE) < 1e-9, `${where}: ${p.key} is not one line tall`);
    assert.ok(Math.abs((p.box.y0 + p.box.y1) / 2 - p.y) < 1e-9, `${where}: ${p.key}'s text is not on its line`);
    for (const d of obstacles) {
      assert.ok(toBox(d, p.box) > d.r, `${where}: ${p.key} covers the marker at ${d.x},${d.y}`);
    }
    const own = requests.find((q) => q.key === p.key) as LabelRequest;
    const adjacent = toBox(own, p.box) <= own.r + 5;
    assert.equal(p.leader === null, adjacent, `${where}: ${p.key} ${adjacent ? "is beside its marker and has a leader" : "moved away and has none"}`);
    if (p.leader !== null) {
      const start = Math.hypot(p.leader.x1 - own.x, p.leader.y1 - own.y);
      assert.ok(start >= own.r && start <= own.r + 2, `${where}: ${p.key}'s leader does not start at its marker's edge`);
      assert.ok(toBox({ x: p.leader.x2, y: p.leader.y2, r: 0 }, p.box) <= 2, `${where}: ${p.key}'s leader does not reach its label`);
    }
  }
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = i + 1; j < placed.length; j += 1) {
      const a = placed[i] as PlacedLabel;
      const b = placed[j] as PlacedLabel;
      assert.ok(separation(a.box, b.box) >= 0, `${where}: ${a.key} and ${b.key} overlap`);
      const sideBySide = a.box.x0 < b.box.x1 && b.box.x0 < a.box.x1;
      if (sideBySide) assert.ok(Math.abs(a.y - b.y) >= LINE - 1e-9, `${where}: ${a.key} and ${b.key} are closer than a line`);
      const sameRow = a.box.y0 < b.box.y1 && b.box.y0 < a.box.y1;
      if (sameRow) assert.ok(Math.max(a.box.x0 - b.box.x1, b.box.x0 - a.box.x1) >= LINE - 1e-9, `${where}: ${a.key} and ${b.key} are on one row less than a line apart`);
    }
  }
}

/* ───────────────────────────── one marker ───────────────────────────── */

test("a marker in open space is labelled beside it, to its right, with no leader", () => {
  const q = req("TMC", 200, 200);
  const { placed, unplaced } = placeLabels([q], discs([q]), FRAME, LINE);
  assert.deepEqual(unplaced, []);
  const p = placed[0] as PlacedLabel;
  assert.equal(p.anchor, "start");
  assert.equal(p.leader, null);
  assert.equal(p.y, 200, "the name sits on the marker's own line");
  assert.ok(p.x > 200 + R, "the name clears the marker");
  assert.ok(p.x - 200 <= R + 6, "the name is beside the marker, not a long way off");
});

test("a marker at the right edge is labelled on its left, anchored at the label's end", () => {
  const q = req("BJP", 352, 200);
  const { placed } = placeLabels([q], discs([q]), FRAME, LINE);
  const p = placed[0] as PlacedLabel;
  assert.equal(p.anchor, "end");
  assert.ok(p.x < 352 - R);
  assert.equal(p.leader, null);
  assertLegible([q], placed, discs([q]), FRAME, "right edge");
});

test("a marker on the axis is labelled above the axis, never over it", () => {
  const q = req("CPM", 100, 362);
  const { placed } = placeLabels([q], discs([q]), FRAME, LINE);
  const p = placed[0] as PlacedLabel;
  assert.ok(p.box.y1 <= FRAME.y1, "the label crosses the axis");
  assertLegible([q], placed, discs([q]), FRAME, "on the axis");
});

/* ───────────────────────────── the defect ───────────────────────────── */

test("West Bengal 2021: the four small parties at the origin each get a line of their own", () => {
  const { placed, unplaced } = placeLabels(WB2021, discs(WB2021), FRAME, LINE);
  assert.deepEqual(unplaced, []);
  assert.deepEqual(placed.map((p) => p.key), WB2021.map((q) => q.key), "results are in the order they were asked for");
  assertLegible(WB2021, placed, discs(WB2021), FRAME, "WB 2021");
  const small = placed.filter((p) => ["CPM", "INC", "IND", "AISF"].includes(p.key));
  assert.equal(new Set(small.map((p) => p.y)).size, 4, "four names, four different lines");
  assert.ok(small.filter((p) => p.leader !== null).length >= 3, "names pushed off a shared spot say whose they are");
});

test("the larger party is placed first and keeps the best spot", () => {
  // Two markers at the same point: the one with the greater weight gets the place beside it.
  const big = req("BIG", 150, 150, 3, 50);
  const small = req("SML", 150, 150, 3, 2);
  const { placed } = placeLabels([small, big], discs([small, big]), FRAME, LINE);
  const [s, b] = placed as [PlacedLabel, PlacedLabel];
  assert.equal(b.leader, null);
  assert.notEqual(s.leader, null);
  assert.equal(b.anchor, "start");
});

/** West Bengal 2016 and 2011 as the figure positions them: nine parties, five of them within a dozen units of each other at the origin. */
const WB2016 = [
  req("AITC", 250.8, 53.4, 4, 66.7),
  req("CPIM", 130, 321.1, 4, 19.9),
  req("INC", 97.1, 299, 3, 13.6),
  req("BJP", 86.4, 357.3, 3, 10.5),
  req("AIFB", 51.7, 358.9, 4, 3),
  req("IND", 51.6, 360.4, 3, 2.9),
  req("RSP", 46, 357.3, 3, 1.7),
  req("CPI", 45.3, 360.4, 3, 1.6),
  req("BGPM", 40.3, 357.3, 4, 1),
];
const WB2011 = [
  req("AITC", 237.8, 59.4, 4, 58.8),
  req("CPIM", 192.3, 295.5, 4, 30),
  req("INC", 87.5, 288.5, 3, 14.3),
  req("IND", 67.8, 355, 3, 5.8),
  req("AIFB", 64.2, 342.8, 4, 5.1),
  req("BJP", 59.2, 362, 3, 4.1),
  req("RSP", 53.6, 351.5, 3, 3),
  req("CPI", 48.1, 358.5, 3, 2),
  req("BGPM", 41.9, 356.8, 4, 1),
];

/** What the figure hands the placement to keep names off: the parity diagonal and each party's drop to it (y = 400 - x there). */
const rules = (rs: readonly LabelRequest[]) => [
  { x1: 38, y1: 362, x2: 362, y2: 38 },
  ...rs.map((q) => ({ x1: q.x, y1: q.y, x2: q.x, y2: 400 - q.x })),
];

const onLeader = (l: NonNullable<PlacedLabel["leader"]>, k: number, steps: number) => ({
  x: l.x1 + ((l.x2 - l.x1) * k) / steps,
  y: l.y1 + ((l.y2 - l.y1) * k) / steps,
});

/** Every way a leader line can mislead: through another name, through another party's marker, across another leader. */
function leaderFaults(requests: readonly LabelRequest[], placed: readonly PlacedLabel[]): string[] {
  const faults: string[] = [];
  const steps = 60;
  for (const p of placed) {
    if (p.leader === null) continue;
    const own = requests.find((q) => q.key === p.key) as LabelRequest;
    for (let k = 0; k <= steps; k += 1) {
      const { x, y } = onLeader(p.leader, k, steps);
      for (const o of placed) {
        if (o !== p && x > o.box.x0 && x < o.box.x1 && y > o.box.y0 && y < o.box.y1) faults.push(`${p.key}'s leader runs through the name ${o.key}`);
      }
      for (const q of requests) {
        // A marker within three marker-widths of its own is part of the same blob and cannot be told from it, so a
        // line leaving the blob through it is not misleading. The disc tested is the one drawn (5 units), not the
        // selected size (7) the placement keeps names clear of.
        if (q !== own && Math.hypot(q.x - own.x, q.y - own.y) > 15 && Math.hypot(x - q.x, y - q.y) < 5) {
          faults.push(`${p.key}'s leader runs through the marker of ${q.key}`);
        }
      }
    }
    for (const o of placed) {
      if (o.key <= p.key || o.leader === null) continue;
      const side = (s: NonNullable<PlacedLabel["leader"]>, x: number, y: number) => Math.sign((s.x2 - s.x1) * (y - s.y1) - (s.y2 - s.y1) * (x - s.x1));
      const a = p.leader;
      const b = o.leader;
      if (side(a, b.x1, b.y1) * side(a, b.x2, b.y2) < 0 && side(b, a.x1, a.y1) * side(b, a.x2, a.y2) < 0) {
        faults.push(`${p.key}'s leader crosses ${o.key}'s`);
      }
    }
  }
  return [...new Set(faults)];
}

test("a leader never crosses another party's label", () => {
  const { placed } = placeLabels(WB2021, discs(WB2021), FRAME, LINE);
  assert.deepEqual(leaderFaults(WB2021, placed), []);
});

test("three markers within a few units: leaders neither cross each other nor run through a name", () => {
  // Found by search: in each, the cheapest places for the three names put two leaders across each other (the first) or a
  // leader through another name (the second), and a dearer layout avoids it.
  for (const rs of [
    [req("P0", 58, 328, 3, 37), req("P1", 69, 325, 3, 10), req("P2", 59, 341, 3, 35)],
    [req("P0", 69, 335, 3, 24), req("P1", 42, 330, 3, 23), req("P2", 61, 337, 3, 20)],
  ]) {
    const { placed, unplaced } = placeLabels(rs, discs(rs), FRAME, LINE);
    assert.deepEqual(unplaced, []);
    assertLegible(rs, placed, discs(rs), FRAME, "three close");
    assert.deepEqual(leaderFaults(rs, placed), []);
  }
});

test("West Bengal 2016 and 2011: nine names, five of them from one blob of markers, and every leader says whose it is", () => {
  for (const [where, rs] of [["2016", WB2016], ["2011", WB2011]] as const) {
    const { placed, unplaced } = placeLabels(rs, discs(rs), FRAME, LINE, rules(rs));
    assert.deepEqual(unplaced, [], where);
    assertLegible(rs, placed, discs(rs), FRAME, `WB ${where}`);
    assert.deepEqual(leaderFaults(rs, placed), [], `WB ${where}`);
    // The one party standing clear of the blob keeps a leader off its marker whatever the others do.
    const clear = rs.find((q) => q.key === "BJP") as LabelRequest;
    for (const p of placed) {
      if (p.leader === null || p.key === "BJP") continue;
      for (let k = 0; k <= 60; k += 1) {
        const { x, y } = onLeader(p.leader, k, 60);
        assert.ok(Math.hypot(x - clear.x, y - clear.y) > clear.r, `WB ${where}: ${p.key}'s leader runs through BJP's marker`);
      }
    }
  }
});

/* ───────────────────────────── determinism and limits ───────────────────────────── */

test("a name keeps off the parity line when a place beside its marker is free", () => {
  // A marker just above the diagonal: to its right the name would sit across the line, to its left it would not.
  const diagonal = [{ x1: 38, y1: 362, x2: 362, y2: 38 }];
  const q = req("PTY", 200, 185);
  const crossing = placeLabels([q], discs([q]), FRAME, LINE).placed[0] as PlacedLabel;
  const clear = placeLabels([q], discs([q]), FRAME, LINE, diagonal).placed[0] as PlacedLabel;
  assert.equal(crossing.anchor, "start", "without the line it is on the right, across it");
  const onLine = (b: Box) => {
    const yAt = (x: number) => 400 - x;
    return Math.min(...[b.x0, b.x1].map(yAt)) < b.y1 && Math.max(...[b.x0, b.x1].map(yAt)) > b.y0;
  };
  assert.ok(onLine(crossing.box), "the control really does cross the line");
  assert.ok(!onLine(clear.box), "with the line known it does not");
  assertLegible([q], [clear], discs([q]), FRAME, "off the line");
});

test("the layout does not depend on the order the parties arrive in", () => {
  const forward = placeLabels(WB2021, discs(WB2021), FRAME, LINE).placed;
  const backward = placeLabels([...WB2021].reverse(), discs(WB2021), FRAME, LINE).placed;
  const byKey = (ps: readonly PlacedLabel[]) => Object.fromEntries(ps.map((p) => [p.key, p]));
  assert.deepEqual(byKey(backward), byKey(forward));
  assert.deepEqual(placeLabels(WB2021, discs(WB2021), FRAME, LINE), placeLabels(WB2021, discs(WB2021), FRAME, LINE));
});

test("equal weights are broken by key, so the layout is still one layout", () => {
  const a = req("A", 100, 100, 3, 5);
  const b = req("B", 100, 100, 3, 5);
  const ab = placeLabels([a, b], discs([a, b]), FRAME, LINE).placed;
  const ba = placeLabels([b, a], discs([a, b]), FRAME, LINE).placed;
  assert.deepEqual(Object.fromEntries(ab.map((p) => [p.key, p.y])), Object.fromEntries(ba.map((p) => [p.key, p.y])));
});

test("a frame with no room for a name leaves it unplaced rather than overprinting", () => {
  const q = req("WIDE", 100, 100, 40);
  const narrow: Box = { x0: 90, y0: 90, x1: 200, y1: 120 };
  const { placed, unplaced } = placeLabels([q], discs([q]), narrow, LINE);
  assert.deepEqual(placed, []);
  assert.deepEqual(unplaced, ["WIDE"]);
});

test("a frame with room for only so many names leaves the rest unplaced", () => {
  const rs = [req("A", 60, 60, 3, 3), req("B", 60, 60, 3, 2), req("C", 60, 60, 3, 1)];
  const tight: Box = { x0: 40, y0: 40, x1: 130, y1: 72 };
  const { placed, unplaced } = placeLabels(rs, discs(rs), tight, LINE);
  assert.equal(placed.length + unplaced.length, 3);
  assert.ok(unplaced.length >= 1);
  assertLegible(rs, placed, discs(rs), tight, "tight frame");
});

/** A small deterministic generator, so a failing layout can be reproduced from its seed. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

test("500 random layouts, half of them crowded at the origin, hold every claim", () => {
  let unplacedTotal = 0;
  for (let seed = 1; seed <= 500; seed += 1) {
    const rnd = lcg(seed);
    const n = 1 + Math.floor(rnd() * 10);
    const rs: LabelRequest[] = [];
    for (let i = 0; i < n; i += 1) {
      const crowded = rnd() < 0.5;
      const x = crowded ? 38 + rnd() * 30 : 38 + rnd() * 324;
      const y = crowded ? 362 - rnd() * 30 : 38 + rnd() * 324;
      rs.push(req(`P${i}`, x, y, 2 + Math.floor(rnd() * 11), rnd() * 70));
    }
    const { placed, unplaced } = placeLabels(rs, discs(rs), FRAME, LINE);
    unplacedTotal += unplaced.length;
    assert.equal(placed.length + unplaced.length, n, `seed ${seed}: a party went missing`);
    assertLegible(rs, placed, discs(rs), FRAME, `seed ${seed}`);
    const again = placeLabels([...rs].reverse(), discs(rs), FRAME, LINE).placed;
    assert.deepEqual(
      Object.fromEntries(again.map((p) => [p.key, p])),
      Object.fromEntries(placed.map((p) => [p.key, p])),
      `seed ${seed}: order changed the layout`,
    );
  }
  assert.equal(unplacedTotal, 0, "ten names fit in a plot this size");
});

/* ───────────────────────────── the group of small parties ───────────────────────────── */

const row = (key: string, votePct: number | null, seatPct: number) => ({ key, votePct, seatPct });

test("parties under 1% of both the vote and the seats are one group, in the order they arrived", () => {
  const rows = [
    row("TMC", 48, 71),
    row("IND", 0.4, 0.34),
    row("BJP", 38, 26),
    row("AISF", 0.5, 0.34),
    row("CPM", 0.9, 0),
  ];
  const { named, minor } = splitMinor(rows);
  assert.deepEqual(named.map((r) => r.key), ["TMC", "BJP"]);
  assert.deepEqual(minor.map((r) => r.key), ["IND", "AISF", "CPM"]);
});

test("under 1% means under: a party at exactly 1% of either share is named, and so is one with a larger other share", () => {
  const rows = [row("A", 1, 0.3), row("B", 0.3, 1), row("C", 0.5, 0.5), row("D", 0.6, 0.2), row("E", 5, 0.1)];
  const { named, minor } = splitMinor(rows);
  assert.deepEqual(minor.map((r) => r.key), ["C", "D"]);
  assert.deepEqual(named.map((r) => r.key), ["A", "B", "E"]);
});

test("one small party is named, not a group of one", () => {
  const rows = [row("TMC", 48, 71), row("IND", 0.4, 0.34)];
  const { named, minor } = splitMinor(rows);
  assert.deepEqual(minor, []);
  assert.deepEqual(named.map((r) => r.key), ["TMC", "IND"]);
});

test("a party with no vote share is not grouped: it is not on the plot at all", () => {
  const { named, minor } = splitMinor([row("A", null, 0), row("B", 0.2, 0.1), row("C", 0.2, 0.1)]);
  assert.deepEqual(minor.map((r) => r.key), ["B", "C"]);
  assert.deepEqual(named.map((r) => r.key), ["A"]);
});

test("the group's name lists the parties until the line would be too long, then counts the rest", () => {
  assert.equal(othersLabel(["IND", "AISF", "CPM", "INC"], 40), "Others: IND, AISF, CPM, INC");
  assert.equal(othersLabel(["IND", "AISF", "CPM", "INC"], 24), "Others: IND, AISF, +2");
  assert.equal(othersLabel(["IND", "AISF", "CPM", "INC"], 20), "Others: IND, +3");
  assert.equal(othersLabel(["A-VERY-LONG-PARTY-NAME", "B"], 12), "Others: A-VERY-LONG-PARTY-NAME, +1", "the first name is always shown");
  assert.equal(othersLabel(["IND", "AISF"], 40), "Others: IND, AISF");
});

test("the disc round a group covers every member marker", () => {
  const members = [{ x: 44.7, y: 360.5, r: R }, { x: 44, y: 360.5, r: R }, { x: 58.9, y: 362, r: R }, { x: 50.9, y: 362, r: R }];
  const blob = encloseDiscs(members);
  for (const m of members) assert.ok(Math.hypot(m.x - blob.x, m.y - blob.y) + m.r <= blob.r + 1e-9);
  assert.deepEqual(encloseDiscs([{ x: 10, y: 20, r: R }]), { x: 10, y: 20, r: R });
});

test("a group label is placed beside the cluster and clear of every member", () => {
  const members = WB2021.filter((q) => ["CPM", "INC", "IND", "AISF"].includes(q.key));
  const blob = encloseDiscs(members);
  const others: LabelRequest = { ...blob, key: "others", width: labelWidth(othersLabel(["IND", "AISF", "CPM", "INC"], 40)), weight: -1 };
  const named = WB2021.filter((q) => !members.includes(q));
  const requests = [...named, others];
  const { placed, unplaced } = placeLabels(requests, [...discs(named), ...discs(members), blob], FRAME, LINE);
  assert.deepEqual(unplaced, []);
  assertLegible(requests, placed, [...discs(named), ...discs(members), blob], FRAME, "group");
});

/* ───────────────────────────── the axes ───────────────────────────── */

test("axis ticks are round values inside the range, from zero", () => {
  assert.deepEqual(axisTicks(63), [0, 20, 40, 60]);
  assert.deepEqual(axisTicks(75.0015), [0, 20, 40, 60]);
  assert.deepEqual(axisTicks(105), [0, 20, 40, 60, 80, 100]);
  assert.deepEqual(axisTicks(21), [0, 5, 10, 15, 20]);
  assert.deepEqual(axisTicks(10), [0, 2, 4, 6, 8, 10]);
});

test("no tick is past the end of the axis", () => {
  for (let c = 5; c <= 110; c += 0.7) {
    const t = axisTicks(c);
    assert.equal(t[0], 0);
    assert.ok(t.every((v) => v <= c), `a tick past ${c}: ${t.join(",")}`);
    assert.ok(t.length >= 3, `${c} has ${t.length} ticks`);
  }
});

test("a label is as wide as its characters and a little more", () => {
  assert.equal(labelWidth(""), 0);
  assert.ok(labelWidth("TMC") > 3 * 14 * 0.6, "a monospace face at 14px is about 8.4 units a character");
  assert.ok(labelWidth("AISF") / labelWidth("TMC") - 4 / 3 < 1e-9);
});
