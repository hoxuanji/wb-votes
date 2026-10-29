// Margins as columns on one scale, on literal numbers.

import assert from "node:assert/strict";
import test from "node:test";
import { marginColumns } from "./margin-columns.ts";
import type { MarginCol } from "./margin-columns.ts";

const col = (id: string, votes: number | null, basis: MarginCol["basis"] = "counted"): MarginCol => ({ id, label: id, votes, basis, key: "K", changedHands: false });

test("every column is a share of the same largest margin", () => {
  const r = marginColumns([col("a", 10), col("b", 40), col("c", 20)], { signed: false });
  assert.equal(r.max, 40);
  assert.deepEqual(r.cols.map((c) => c.frac), [0.25, 1, 0.5]);
});

test("a margin that points behind is down, and is as tall as one ahead by the same number", () => {
  const r = marginColumns([col("a", 30), col("b", -30), col("c", -15)], { signed: true });
  assert.deepEqual(r.cols.map((c) => c.dir), ["up", "down", "down"]);
  assert.deepEqual(r.cols.map((c) => c.frac), [1, 1, 0.5]);
});

test("a column with no margin is blank, never a zero-height bar, and does not move the scale", () => {
  const r = marginColumns([col("a", null, null), col("b", 8)], { signed: true });
  assert.equal(r.cols[0]?.dir, "none");
  assert.equal(r.cols[0]?.frac, 0);
  assert.equal(r.max, 8);
});

test("a declared margin is dashed, exactly, and a counted one is not", () => {
  const r = marginColumns([col("a", 5, "counted"), col("b", 7, "declared"), col("c", null, null)], { signed: false });
  assert.deepEqual(r.cols.map((c) => c.dashed), [false, true, false]);
});

test("no margin anywhere is a finite scale, not a division by zero", () => {
  const r = marginColumns([col("a", null, null)], { signed: true });
  assert.equal(r.max, 1);
  assert.ok(Number.isFinite(r.cols[0]?.frac));
});
