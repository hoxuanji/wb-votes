// The margin field strip's numbers, on literals and on a swarm the size of an assembly election.

import assert from "node:assert/strict";
import test from "node:test";
import { LAYOUT, ceilNice, floorNice, seatStrip } from "./seat-strip.ts";
import type { LayoutName, StripPoint } from "./seat-strip.ts";

const pt = (id: string, value: number, o: Partial<StripPoint> = {}): StripPoint => ({ id, value, key: "K", basis: "declared", self: false, tip: id, ...o });

/** A repeatable stream of numbers in [0, 1): no test here depends on a lucky draw. */
function stream(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Margins shaped like a state's: log-normal, a few hundred of them, from a few hundred votes to about a lakh. */
function swarm(n: number, seed: number, selfAt = 7): StripPoint[] {
  const next = stream(seed);
  return Array.from({ length: n }, (_, i) => {
    const gauss = Array.from({ length: 6 }, next).reduce((a, b) => a + b, 0) - 3;
    return pt(`s${i}`, Math.max(1, Math.round(Math.exp(Math.log(26_000) + gauss * 1.4))), { self: i === selfAt });
  });
}

test("the ladder rounds out to 1, 2 or 5 times a power of ten", () => {
  assert.equal(floorNice(5_567), 5_000);
  assert.equal(ceilNice(710_930), 1_000_000);
  assert.equal(floorNice(309), 200);
  assert.equal(ceilNice(104_265), 200_000);
  assert.equal(floorNice(1_000), 1_000);
  assert.equal(ceilNice(1_000), 1_000);
  assert.equal(floorNice(1), 1);
});

test("West Bengal's 2024 margins span 5,000 to 10 lakh, with the powers of ten labelled", () => {
  const s = seatStrip([pt("lo", 5_567), pt("mid", 85_022, { self: true }), pt("hi", 710_930)]);
  assert.equal(s.lo, 5_000);
  assert.equal(s.hi, 1_000_000);
  assert.deepEqual(s.ticks.filter((t) => t.major).map((t) => t.value), [10_000, 100_000, 1_000_000]);
  assert.deepEqual(s.ticks.map((t) => t.value), [5_000, 10_000, 20_000, 50_000, 100_000, 200_000, 500_000, 1_000_000]);
  assert.equal(s.ticks[0]?.x, 0);
  assert.equal(s.ticks.at(-1)?.x, 1);
});

test("a dot is placed by the logarithm of its margin: a tenfold margin is the same distance along the axis wherever it starts", () => {
  const s = seatStrip([pt("a", 1_000), pt("b", 10_000), pt("c", 100_000), pt("d", 1_000_000)]);
  const [a, b, c, d] = s.dots.map((x) => x.x);
  assert.ok(Math.abs((b as number) - (a as number) - ((c as number) - (b as number))) < 1e-12);
  assert.ok(Math.abs((c as number) - (b as number) - ((d as number) - (c as number))) < 1e-12);
  assert.equal(a, 0);
  assert.equal(d, 1);
});

test("every dot is inside the axis, in margin order, and each carries what it was given", () => {
  const points = swarm(120, 3);
  const s = seatStrip(points);
  assert.equal(s.dots.length, 120);
  s.dots.forEach((d, i) => {
    assert.ok(d.x >= 0 && d.x <= 1, `${d.id}: x ${d.x}`);
    assert.ok(d.value >= s.lo && d.value <= s.hi);
    if (i > 0) assert.ok(d.value >= (s.dots[i - 1] as { value: number }).value, "dots are not in margin order");
    const given = points.find((p) => p.id === d.id);
    assert.equal(d.tip, given?.tip);
    assert.equal(d.key, given?.key);
    assert.equal(d.basis, given?.basis);
  });
});

test("a margin that is zero, or not a number, is not a place on a log axis: it is counted, and drawn nowhere", () => {
  const s = seatStrip([pt("zero", 0), pt("nan", Number.NaN), pt("neg", -5), pt("a", 100), pt("b", 10_000)]);
  assert.equal(s.unplaced, 3);
  assert.deepEqual(s.dots.map((d) => d.id), ["a", "b"]);
  assert.equal(s.dots[0]?.x, 0, "a zero margin was put at the left edge");
  // And a seat with nothing placeable is a strip with no dots and finite ends.
  const none = seatStrip([pt("zero", 0)]);
  assert.equal(none.dots.length, 0);
  assert.equal(none.unplaced, 1);
  assert.ok(Number.isFinite(none.lo) && Number.isFinite(none.hi) && none.hi > none.lo);
});

test("no two dots overlap, in any of the three layouts, with the seat's ring clear of its neighbours", () => {
  for (const seed of [1, 2, 3, 4]) {
    for (const n of [42, 293]) {
      const s = seatStrip(swarm(n, seed, 11));
      for (const name of ["s", "m", "l"] as LayoutName[]) {
        const { width: w, dot, step } = LAYOUT[name];
        for (let i = 0; i < s.dots.length; i++) {
          for (let j = i + 1; j < s.dots.length; j++) {
            const a = s.dots[i]!;
            const b = s.dots[j]!;
            const gap = Math.hypot((a.x - b.x) * w, (a.lane[name] - b.lane[name]) * step);
            const need = a.self || b.self ? dot + 6 : dot + 1;
            assert.ok(gap >= need, `${n} dots, seed ${seed}, layout ${name}: ${a.id} and ${b.id} are ${gap.toFixed(1)}px apart`);
          }
        }
      }
    }
  }
});

test("the seat the page is about is on the middle line in every layout, and the rows grow evenly about it", () => {
  const s = seatStrip(swarm(293, 9, 150));
  const me = s.dots.find((d) => d.self);
  assert.deepEqual(me?.lane, { s: 0, m: 0, l: 0 });
  for (const name of ["s", "m", "l"] as LayoutName[]) {
    const rows = s.dots.map((d) => d.lane[name]);
    assert.equal(Math.max(...rows.map(Math.abs)), s.lanes[name]);
    assert.ok(Math.max(...rows) > 0 && Math.min(...rows) < 0, `${name}: the swarm grows on one side of its line only`);
  }
});

test("a narrower track needs at least as many rows as a wider one, and a swarm of 42 stays short on a phone", () => {
  const big = seatStrip(swarm(293, 5)).lanes;
  assert.ok(big.s >= big.m && big.m >= big.l, JSON.stringify(big));
  const small = seatStrip(swarm(42, 5)).lanes;
  assert.ok(small.s >= small.m && small.m >= small.l, JSON.stringify(small));
  assert.ok(small.s * 2 + 1 <= 12, `42 dots need ${small.s * 2 + 1} rows on a phone`);
});

test("margins that are all the same stack into a column and do not overlap", () => {
  const s = seatStrip(Array.from({ length: 9 }, (_, i) => pt(`e${i}`, 5_000, { self: i === 3 })));
  assert.equal(s.lo, 5_000);
  assert.ok(s.hi > s.lo);
  const rows = s.dots.map((d) => d.lane.l);
  assert.equal(new Set(rows).size, 9, "nine equal margins share a row");
});

test("one margin is a strip with a dot on it, and nothing is NaN", () => {
  const s = seatStrip([pt("only", 85_022, { self: true })]);
  assert.equal(s.dots.length, 1);
  assert.ok(Number.isFinite(s.dots[0]!.x));
  assert.ok(s.ticks.length > 0);
  assert.equal(JSON.stringify(s).includes("null"), false);
});

test("a span of less than a decade labels every tick, so the axis always has numbers on it", () => {
  const s = seatStrip([pt("a", 2_100), pt("b", 4_900)]);
  assert.deepEqual(s.ticks.map((t) => [t.value, t.major]), [[2_000, true], [5_000, true]]);
});

test("the same points always give the same strip", () => {
  assert.deepEqual(seatStrip(swarm(100, 8)), seatStrip(swarm(100, 8)));
  const a = swarm(100, 8);
  assert.deepEqual(seatStrip(a), seatStrip([...a].reverse()), "the order the points arrive in changes the strip");
});
