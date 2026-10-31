// The photo finish's numbers, on literals: the ruler's window and grid, and the bars it is read against.

import assert from "node:assert/strict";
import test from "node:test";
import { gridFor, photoFinish, ruler } from "./seat-ruler.ts";

test("the brief's example: 116,035 against 115,978 is a window from 115,900 to 116,100 on a grid of 50", () => {
  const r = ruler(116_035, 115_978);
  assert.equal(r.gap, 57);
  assert.equal(r.step, 50);
  assert.equal(r.lo, 115_900);
  assert.equal(r.hi, 116_100);
  assert.deepEqual(r.ticks, [115_900, 115_950, 116_000, 116_050, 116_100]);
  assert.equal(r.posA, (116_035 - 115_900) / 200);
  assert.equal(r.posB, (115_978 - 115_900) / 200);
  assert.equal(r.startsAtZero, false);
});

test("the grid is 1, 2 or 5 times a power of ten and no more than the gap", () => {
  for (const [gap, step] of [[0, 1], [1, 1], [3, 2], [4, 2], [5, 5], [9, 5], [10, 10], [57, 50], [99, 50], [100, 100], [250, 200], [499, 200], [500, 500], [1_249, 1_000]] as const) {
    assert.equal(gridFor(gap), step, `gap ${gap}`);
  }
});

test("a window holds both totals with at least one grid step of room each side, on every sort of gap", () => {
  for (const total of [4_000, 61_377, 116_035, 243_751]) {
    for (let gap = 1; gap <= 1_300; gap += 7) {
      const a = total + gap;
      const b = total;
      const r = ruler(a, b);
      assert.equal(r.gap, gap);
      assert.ok(r.lo <= b - r.step && r.hi >= a + r.step, `${a} ${b}: window ${r.lo} to ${r.hi} on ${r.step}`);
      assert.equal(r.lo % r.step, 0);
      assert.equal(r.hi % r.step, 0);
      assert.ok(r.posA > 0 && r.posA < 1 && r.posB > 0 && r.posB < 1, `${a} ${b}: a dot is on the window's edge`);
      assert.ok(r.ticks.length >= 4 && r.ticks.length <= 8, `${a} ${b}: ${r.ticks.length} ticks`);
      // The ticks are every grid step, from end to end.
      assert.equal(r.ticks[0], r.lo);
      assert.equal(r.ticks.at(-1), r.hi);
      r.ticks.slice(1).forEach((t, i) => assert.equal(t - (r.ticks[i] as number), r.step));
      // The gap is a visible share of the window: between a seventh and a half of it.
      assert.ok(gap / (r.hi - r.lo) > 0.14 && gap / (r.hi - r.lo) <= 0.5, `${a} ${b}: gap is ${gap / (r.hi - r.lo)} of the window`);
    }
  }
});

test("a tie has a window of three ticks with both totals on the middle one", () => {
  const r = ruler(116_035, 116_035);
  assert.equal(r.gap, 0);
  assert.deepEqual(r.ticks, [116_034, 116_035, 116_036]);
  assert.equal(r.posA, 0.5);
  assert.equal(r.posB, 0.5);
});

test("the totals are positioned by their own value, not by which is larger", () => {
  const w = ruler(100, 160);
  assert.ok(w.posA < w.posB, "a smaller first total is to the left");
  assert.equal(ruler(160, 100).posA, w.posB);
});

test("a window that would reach below zero stops at zero and says so", () => {
  const r = ruler(8, 3);
  assert.equal(r.lo, 0);
  assert.equal(r.startsAtZero, true);
  assert.ok(r.posA > 0 && r.posB >= 0);
});

test("the same two totals always give the same figure", () => {
  assert.deepEqual(photoFinish(116_035, 115_978), photoFinish(116_035, 115_978));
});

test("the bars start at zero and are on one scale that holds the larger total", () => {
  const f = photoFinish(116_035, 115_978);
  assert.equal(f.bars.ticks[0], 0, "the bars' scale does not start at zero");
  assert.ok(f.bars.max >= 116_035);
  assert.equal(f.bars.ticks.at(-1), f.bars.max);
  assert.equal(f.bars.fracA, 116_035 / f.bars.max);
  assert.equal(f.bars.fracB, 115_978 / f.bars.max);
  // Two bars this close are the same length to the eye: that is the figure's point.
  assert.ok(f.bars.fracA - f.bars.fracB < 0.001);
  assert.ok(f.bars.fracA > 0.9 && f.bars.fracA <= 1);
});

test("the funnel opens from the ruler's window on the bars' scale, inside the scale", () => {
  const f = photoFinish(116_035, 115_978);
  assert.ok(f.zoom.from < f.zoom.to);
  assert.ok(f.zoom.from >= 0 && f.zoom.to <= 1);
  assert.ok(Math.abs(f.zoom.from - 115_900 / f.bars.max) < 1e-12);
  assert.ok(Math.abs(f.zoom.to - 116_100 / f.bars.max) < 1e-12);
  // A window that runs past the scale's end is cut at it.
  assert.equal(photoFinish(119_990, 119_940).zoom.to, 1);
});

test("nothing is NaN for any pair of totals, including a tie and zero", () => {
  for (const [a, b] of [[0, 0], [5, 5], [1, 0], [116_035, 116_035], [10_000_000, 9_999_000]] as const) {
    const f = photoFinish(a, b);
    for (const n of [f.bars.max, f.bars.fracA, f.bars.fracB, f.zoom.from, f.zoom.to, f.ruler.lo, f.ruler.hi, f.ruler.posA, f.ruler.posB, ...f.ruler.ticks, ...f.bars.ticks]) {
      assert.ok(Number.isFinite(n), `${a} ${b}: ${n}`);
    }
  }
});
