// The vote ladder and the turnout dots, on literal numbers.

import assert from "node:assert/strict";
import test from "node:test";
import { partyOrder, voteLadder } from "./vote-ladder.ts";
import type { LadderRowIn, LadderSeg } from "./vote-ladder.ts";
import { turnoutDots } from "./turnout-dots.ts";

const seg = (key: string | null, share: number, o: Partial<LadderSeg> = {}): LadderSeg => ({ key, label: key ?? "tail", share, winner: false, tail: key === null, name: key === null ? null : `${key} candidate`, ...o });
const row = (id: string, segments: LadderSeg[], evidence: LadderRowIn["evidence"] = "counted"): LadderRowIn => ({
  id,
  label: id,
  evidence,
  segments,
  unitemised: Math.max(0, 100 - segments.reduce((n, s) => n + s.share, 0)),
  scale: 100,
});

// Mekliganj 2011, 2016, 2021 (the shares the registry holds), and 2026 declared.
const mek = [
  row("2011", [seg("AIFB", 48.89, { winner: true }), seg("INC", 26.74), seg("IND", 15.97), seg("BJP", 2.52), seg("BSP", 2.28)]),
  row("2016", [seg("AITC", 41.35, { winner: true }), seg("AIFB", 37.68), seg("BJP", 12.91), seg("BSP", 3.12), seg("SUCI", 1.15)]),
  row("2021", [seg("AITC", 49.98, { winner: true }), seg("BJP", 42.59), seg("AIFB", 3.45), seg("SUCI", 0.89), seg("BSP", 0.52)]),
  row("2026", [], "declared"),
];

test("every row shares one party order, by total share over the counted rows", () => {
  assert.deepEqual(partyOrder(mek).slice(0, 4), ["AITC", "AIFB", "BJP", "INC"]);
  const l = voteLadder(mek);
  for (const r of l.rows.slice(0, 3)) {
    const keys = r.segments.map((s) => s.key);
    const ranks = keys.map((k) => l.order.indexOf(k as string));
    assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), `${r.id}: segments are not in the shared order`);
  }
});

test("a row is placed from the left on one scale, and what no candidate accounts for is left unfilled", () => {
  const r = voteLadder(mek).rows[0]!;
  assert.equal(r.segments[0]?.start, 0);
  const end = r.segments.at(-1)!;
  assert.ok(Math.abs(end.start + end.width - (100 - r.unitemised)) < 0.05, "the segments do not end where the itemised share does");
  assert.ok(r.unitemised > 0 && r.unitemised < 5);
});

test("a ribbon joins a party across two counted rows and never into a declared one", () => {
  const l = voteLadder(mek, { followed: "BJP" });
  assert.deepEqual(l.ribbons[0]?.map((x) => x.key).sort(), ["AIFB", "BJP", "BSP"], "2011 to 2016 joins the parties both rows list");
  assert.deepEqual(l.ribbons[1]?.map((x) => x.key).sort(), ["AIFB", "AITC", "BJP", "BSP", "SUCI"], "2016 to 2021");
  assert.deepEqual(l.ribbons[2], [], "nothing runs into 2026");
  assert.deepEqual(l.ribbons[3], []);
  assert.equal(l.ribbons[1]?.find((x) => x.key === "BJP")?.followed, true);
  assert.equal(l.ribbons[1]?.find((x) => x.key === "AIFB")?.followed, false);
});

test("a party that appears twice in a row (two independents) has no ribbon, since no single predecessor is identifiable", () => {
  const rows = [row("a", [seg("IND", 20), seg("IND", 10), seg("X", 50)]), row("b", [seg("IND", 15), seg("X", 60)])];
  const l = voteLadder(rows);
  assert.deepEqual(l.ribbons[0]?.map((x) => x.key), ["X"]);
});

test("the tail added together is last, is no party's, and has no ribbon", () => {
  const rows = [row("a", [seg("X", 40), seg(null, 20), seg("Y", 30)]), row("b", [seg("X", 45), seg(null, 15), seg("Y", 25)])];
  const l = voteLadder(rows);
  assert.equal(l.rows[0]?.segments.at(-1)?.tail, true);
  assert.ok(!l.ribbons[0]?.some((x) => x.key === "null"));
  assert.equal(l.ribbons[0]?.length, 2);
});

test("a ribbon is a polygon from the party's span above to its span below", () => {
  const rows = [row("a", [seg("X", 40), seg("Y", 30)]), row("b", [seg("Y", 50), seg("X", 20)])];
  const l = voteLadder(rows, { height: 10 });
  const x = l.ribbons[0]!.find((r) => r.key === "X")!;
  const top = l.rows[0]!.segments.find((s) => s.key === "X")!;
  const bottom = l.rows[1]!.segments.find((s) => s.key === "X")!;
  assert.equal(x.points, `${top.start},0 ${top.start + top.width},0 ${bottom.start + bottom.width},10 ${bottom.start},10`);
});

test("shares that run a little over 100 are drawn to their own total, so no segment overflows its bar", () => {
  const over: LadderRowIn = { ...row("a", [seg("X", 60), seg("Y", 45)]), scale: 105 };
  const r = voteLadder([over]).rows[0]!;
  assert.ok(r.segments.at(-1)!.start + r.segments.at(-1)!.width <= 100.01);
});

test("turnout dots sit on a stated axis that does not start at zero, and a figure not on record is not placed", () => {
  const t = turnoutDots([
    { id: "2011", label: "2011", seat: 86.6, district: 83.1, state: 84.7 },
    { id: "2021", label: "2021", seat: 87.8, district: 80.9, state: 82.2 },
    { id: "2026", label: "2026", seat: null, district: null, state: null },
  ]);
  assert.equal(t.min, 75);
  assert.equal(t.max, 95);
  assert.equal(t.rows[2]?.seatX, null);
  assert.equal(t.rows[2]?.districtX, null);
  assert.ok((t.rows[0]?.seatX ?? 0) > (t.rows[0]?.districtX ?? 1), "a seat above its district sits to its right");
  const none = turnoutDots([{ id: "a", label: "a", seat: null, district: null, state: null }]);
  assert.equal(none.rows[0]?.seatX, null);
});
