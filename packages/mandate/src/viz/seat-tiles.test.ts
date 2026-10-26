// Where each seat sits when every seat is the same size.
//
// A map gives a seat the area its boundary has, so Kolkata's sixteen seats are specks and Cooch Behar's are continents. A tile map gives
// every seat one equal tile and keeps only what the map is good for: seats next to each other on the ground stay next to each other on the
// grid. The layout is a function of the seats' centroids alone, so everything that makes it honest is held on literal numbers: every seat
// has its own cell, the grid is compact, a seat does not move far from where it is, and the same seats always give the same grid.

import assert from "node:assert/strict";
import test from "node:test";
import { centroidOf, tileLayout } from "./seat-tiles.ts";
import type { TileSeat } from "./seat-tiles.ts";

const near = (got: readonly number[] | null, want: readonly number[], eps = 1e-9): void => {
  assert.ok(got !== null, "no centroid");
  want.forEach((w, i) => assert.ok(Math.abs((got[i] as number) - w) <= eps, `[${got.join(", ")}] is not [${want.join(", ")}]`));
};

test("the centroid of a unit square is its middle, whichever way it is wound", () => {
  near(centroidOf("M0 0L1 0L1 1L0 1Z"), [0.5, 0.5]);
  near(centroidOf("M0 0L0 1L1 1L1 0Z"), [0.5, 0.5]);
});

test("the centroid of an L shape is the area-weighted one, not the middle of its box", () => {
  near(centroidOf("M0 0L2 0L2 1L1 1L1 2L0 2Z"), [2.5 / 3, 2.5 / 3]);
});

test("a path of two rings has the centroid of the larger, so an island does not pull the seat out to sea", () => {
  near(centroidOf("M10 10L11 10L11 11L10 11ZM0 0L2 0L2 2L0 2Z"), [1, 1]);
});

test("a path with no area has the middle of its box, and a path that cannot be read has none", () => {
  near(centroidOf("M0 0L2 0L0 0Z"), [1, 0]);
  assert.equal(centroidOf(""), null);
  assert.equal(centroidOf("M0 0C1 1 2 2 3 3Z"), null, "a curve is a command this geometry does not use");
});

/** A small deterministic generator, so a "random" cloud is the same every run. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const cloud = (n: number, seed: number, w = 100, h = 100): TileSeat[] => {
  const next = seeded(seed);
  return Array.from({ length: n }, (_, i) => ({ id: `s${String(i).padStart(3, "0")}`, x: next() * w, y: next() * h }));
};

test("every seat gets its own cell, inside the grid", () => {
  for (const [n, seed] of [[1, 1], [2, 2], [7, 3], [60, 4], [294, 5], [543, 6]] as const) {
    const { tiles, cols, rows } = tileLayout(cloud(n, seed));
    assert.equal(tiles.length, n);
    assert.equal(new Set(tiles.map((t) => `${t.col},${t.row}`)).size, n, `${n} seats share a cell`);
    assert.ok(tiles.every((t) => t.col >= 0 && t.col < cols && t.row >= 0 && t.row < rows), `${n} seats: a tile is outside the grid`);
  }
});

test("the grid is compact: no more than 1.6 cells per seat", () => {
  for (const [n, seed] of [[3, 1], [10, 2], [42, 3], [294, 4], [543, 5]] as const) {
    const { cols, rows } = tileLayout(cloud(n, seed));
    assert.ok(cols * rows >= n && cols * rows <= 1.6 * n, `${n} seats in ${cols} x ${rows}`);
  }
});

test("a 3 by 3 lattice of centroids lays out as that lattice", () => {
  const seats: TileSeat[] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) seats.push({ id: `r${r}c${c}`, x: c * 10, y: r * 10 });
  const { tiles, cols, rows } = tileLayout(seats);
  assert.deepEqual([cols, rows], [3, 3]);
  for (const t of tiles) assert.equal(t.id, `r${t.row}c${t.col}`);
});

test("ten seats at one point and ten spread out all get distinct cells, the crowd spread around where it was", () => {
  const crowd: TileSeat[] = Array.from({ length: 10 }, (_, i) => ({ id: `k${i}`, x: 50, y: 50 }));
  const spread = cloud(10, 9).map((s, i) => ({ ...s, id: `s${i}` }));
  const { tiles } = tileLayout([...crowd, ...spread]);
  assert.equal(new Set(tiles.map((t) => `${t.col},${t.row}`)).size, 20);
});

test("the layout does not depend on the order the seats arrive in", () => {
  const seats = cloud(120, 11);
  const a = tileLayout(seats);
  const b = tileLayout([...seats].reverse());
  assert.deepEqual(a, b);
});

/** How far, in cells, each seat's tile is from where its centroid is, over the box the centroids span. */
function displacement(seats: TileSeat[]): number[] {
  const { tiles, cols, rows } = tileLayout(seats);
  const xs = seats.map((s) => s.x);
  const ys = seats.map((s) => s.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const pw = (x1 - x0) / cols;
  const ph = (y1 - y0) / rows;
  const byId = new Map(seats.map((s) => [s.id, s]));
  return tiles.map((t) => {
    const s = byId.get(t.id)!;
    return Math.hypot((x0 + (t.col + 0.5) * pw - s.x) / pw, (y0 + (t.row + 0.5) * ph - s.y) / ph);
  });
}

test("a seat does not move far from where it is: within three cells on a uniform cloud, whatever the cloud, and on average within one", () => {
  // Five clouds, not one: the first version sent a seat from the top edge to row 18 on one of them and was fine on another.
  for (const seed of [21, 22, 23, 24, 25]) {
    const moved = displacement(cloud(294, seed, 200, 300));
    assert.ok(Math.max(...moved) <= 3, `seed ${seed}: the furthest seat moved ${Math.max(...moved).toFixed(2)} cells`);
    assert.ok(moved.reduce((a, b) => a + b, 0) / moved.length <= 1, `seed ${seed}: the average seat moved more than a cell`);
  }
});

test("a crowd of seats at one point is spread into a block around it, not strung out along a row or a column", () => {
  const crowd: TileSeat[] = Array.from({ length: 12 }, (_, i) => ({ id: `k${String(i).padStart(2, "0")}`, x: 100, y: 150 }));
  const { tiles } = tileLayout([...crowd, ...cloud(120, 31, 200, 300)]);
  const mine = tiles.filter((t) => t.id.startsWith("k"));
  const span = (key: "col" | "row"): number => Math.max(...mine.map((t) => t[key])) - Math.min(...mine.map((t) => t[key]));
  assert.ok(span("col") <= 5 && span("row") <= 5, `twelve seats span ${span("col") + 1} columns by ${span("row") + 1} rows`);
});

test("seats that sit on a line stay in their order along it, on a wide grid of a few rows", () => {
  const seats: TileSeat[] = Array.from({ length: 12 }, (_, i) => ({ id: `l${String(i).padStart(2, "0")}`, x: i * 5, y: 0 }));
  const { tiles, cols, rows } = tileLayout(seats);
  assert.ok(cols >= 4 * rows, `a line of twelve is ${cols} columns by ${rows} rows`);
  const sorted = [...tiles].sort((a, b) => (a.id < b.id ? -1 : 1));
  sorted.forEach((t, i) => i > 0 && assert.ok(sorted[i - 1]!.col <= t.col, `${t.id} is left of ${sorted[i - 1]!.id}`));
});

test("no seats is an empty grid", () => {
  assert.deepEqual(tileLayout([]), { tiles: [], cols: 0, rows: 0 });
});

test("a single seat is a single cell", () => {
  assert.deepEqual(tileLayout([{ id: "only", x: 3, y: 4 }]), { tiles: [{ id: "only", col: 0, row: 0 }], cols: 1, rows: 1 });
});
