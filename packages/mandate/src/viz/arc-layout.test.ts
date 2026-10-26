// Where the seats of a house sit in a parliament arc.
//
// A house is drawn as a half ring of dots, one per seat, in concentric rows. The layout is a pure function of the number of seats,
// so every property that makes the picture honest can be held on literal numbers: one dot per seat, none outside the frame, none
// on top of another, and an order along the arc that lets a party's seats be a contiguous slice (a wedge).

import assert from "node:assert/strict";
import test from "node:test";
import { ARC_BOX, arcLayout } from "./arc-layout.ts";

const SIZES = [0, 1, 2, 3, 5, 13, 40, 294, 543];
const EPS = 1e-6;

test("there is exactly one dot per seat, for a union territory and for the Lok Sabha", () => {
  for (const n of SIZES) assert.equal(arcLayout(n).length, n, `${n} seats`);
});

test("every dot, with its radius, is inside the frame, and every number is finite", () => {
  for (const n of SIZES) {
    for (const d of arcLayout(n)) {
      for (const v of [d.x, d.y, d.r, d.row, d.angle]) assert.ok(Number.isFinite(v), `${n} seats: ${JSON.stringify(d)}`);
      assert.ok(d.x - d.r >= -EPS && d.x + d.r <= ARC_BOX.w + EPS, `${n} seats: x of ${JSON.stringify(d)}`);
      assert.ok(d.y - d.r >= -EPS && d.y + d.r <= ARC_BOX.h + EPS, `${n} seats: y of ${JSON.stringify(d)}`);
    }
  }
});

test("no two dots overlap: their centres are at least two radii apart", () => {
  for (const n of [2, 3, 5, 13, 40, 294, 543]) {
    const dots = arcLayout(n);
    let nearest = Infinity;
    for (let i = 0; i < dots.length; i++) {
      for (let j = i + 1; j < dots.length; j++) {
        const a = dots[i]!;
        const b = dots[j]!;
        nearest = Math.min(nearest, Math.hypot(a.x - b.x, a.y - b.y) - (a.r + b.r));
      }
    }
    assert.ok(nearest >= -EPS, `${n} seats: the closest pair overlaps by ${-nearest}`);
  }
});

test("seats are ordered along the arc from its left end, the outer row first where angles tie", () => {
  for (const n of [5, 40, 294, 543]) {
    const dots = arcLayout(n);
    for (let i = 1; i < dots.length; i++) {
      const a = dots[i - 1]!;
      const b = dots[i]!;
      assert.ok(a.angle <= b.angle + EPS, `${n} seats: dot ${i} turns back`);
      if (Math.abs(a.angle - b.angle) <= EPS) assert.ok(a.row <= b.row, `${n} seats: dot ${i} is an inner row before an outer one`);
    }
    assert.ok(dots[0]!.angle <= EPS, "the first dot is at the left end");
    assert.ok(Math.abs(dots[n - 1]!.angle - Math.PI) <= EPS, "the last dot is at the right end");
  }
});

test("a one-seat house is a single dot in the middle of the arc", () => {
  const [only] = arcLayout(1);
  assert.ok(only !== undefined);
  assert.ok(Math.abs(only.x - ARC_BOX.w / 2) <= EPS);
  assert.ok(Math.abs(only.angle - Math.PI / 2) <= EPS);
});

test("the Lok Sabha's dots are still readable, and a small house does not get giant ones", () => {
  assert.ok(arcLayout(543)[0]!.r >= 3.2, "543 seats");
  assert.ok(arcLayout(294)[0]!.r >= 5, "294 seats");
  assert.ok(arcLayout(2)[0]!.r <= 14, "2 seats");
});

test("the layout is the same every time it is asked for", () => {
  assert.deepEqual(arcLayout(294), arcLayout(294));
});
