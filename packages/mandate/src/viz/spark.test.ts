// The small trend line and the bar against a threshold, on literal numbers.

import assert from "node:assert/strict";
import test from "node:test";
import { MIN_POINTS, sparkline } from "./spark.ts";
import type { SparkPoint } from "./spark.ts";
import { bullet, shareText } from "./bullet.ts";

const pt = (label: string, value: number | null, basis: "counted" | "declared" = "counted"): SparkPoint => ({
  label,
  value,
  basis,
  key: "K",
  tip: `${label}: ${value}`,
});
const make = (points: SparkPoint[]) => sparkline({ width: 400, height: 100, zero: true, points });

test("counted points that sit next to each other are joined by one solid run", () => {
  const s = make([pt("2011", 10), pt("2016", 20), pt("2021", 15)]);
  assert.equal(s.enough, true);
  assert.equal(s.runs.length, 1);
  assert.equal(s.dots.length, 3);
  assert.ok(s.dots.every((d) => d.basis === "counted"));
});

test("a declared point is a hollow ring reached by a dashed stub, and no solid line reaches it", () => {
  const s = make([pt("2011", 10), pt("2016", 20), pt("2021", 15), pt("2026", 30, "declared")]);
  assert.equal(s.runs.length, 1, "the solid run stops at the last counted point");
  assert.equal(s.stubs.length, 1);
  assert.equal(s.dots.at(-1)?.basis, "declared");
  const last = s.dots.at(-1)!;
  assert.ok(s.stubs[0]!.endsWith(`${last.x} ${last.y}`), "the stub ends on the ring");
});

test("a point with no value is a gap with its label, never a mark at zero, and no line crosses it", () => {
  const s = make([pt("2011", 10), pt("2016", null), pt("2021", 15), pt("2026", 12)]);
  assert.equal(s.gaps.length, 1);
  assert.equal(s.gaps[0]?.label, "2016");
  assert.equal(s.dots.length, 3, "the gap has no dot");
  assert.equal(s.runs.length, 1, "only 2021 and 2026 are adjacent counted points");
  assert.ok(!s.runs.some((d) => d.includes(`${s.gaps[0]!.x} `)), "a run passes through a gap");
});

test("fewer than three valued points draw nothing and say so", () => {
  assert.equal(MIN_POINTS, 3);
  const s = make([pt("2011", 10), pt("2016", null), pt("2021", 15)]);
  assert.equal(s.enough, false);
  assert.equal(s.dots.length, 0);
  assert.equal(s.runs.length, 0);
  assert.match(s.fact ?? "", /2 of 3 elections have a figure/);
});

test("with zero on the axis the smallest value is not on the baseline unless it is zero", () => {
  const s = make([pt("a", 10), pt("b", 20), pt("c", 30)]);
  assert.ok(s.dots[0]!.y < s.baseline, "10 sits above a baseline of 0");
  const z = make([pt("a", 0), pt("b", 20), pt("c", 30)]);
  assert.equal(z.dots[0]!.y, z.baseline);
});

test("equal values sit in the middle of the band, not on a line of NaN", () => {
  const s = sparkline({ width: 400, height: 100, zero: false, points: [pt("a", 5), pt("b", 5), pt("c", 5)] });
  assert.ok(s.dots.every((d) => Number.isFinite(d.y)));
});

test("a bar fills a share of its scale and the tick sits at the target", () => {
  const b = bullet({ value: 30, target: 50, scale: 60 });
  assert.equal(b.fill, 0.5);
  assert.ok(Math.abs(b.tick - 50 / 60) < 1e-12);
  assert.equal(bullet({ value: null, target: 50, scale: 60 }).fill, null);
  assert.equal(bullet({ value: 90, target: 50, scale: 60 }).fill, 1);
});

test("a share one decimal would round onto the line keeps the decimals that tell it from the line", () => {
  assert.equal(shareText(49.98), "49.98");
  assert.equal(shareText(50.02), "50.02");
  assert.equal(shareText(49.999), "49.999");
  assert.equal(shareText(41.349), "41.3");
  assert.equal(shareText(50), "50.0");
});
