// Where the boxes and ribbons of a seat-flow picture go: two columns of parties (who held the seats before, who won them now) as
// stacked boxes as tall as their seats, and a ribbon from each previous holder to each winner as thick as the seats that moved.
//
// The geometry is held here on literal flows, so that the properties that make the picture honest are tested and not looked at:
// a box is exactly as tall as its seats, ribbons fill the box they leave and the one they enter without overlapping, and folding the
// tail into "Others" loses no seat.

import assert from "node:assert/strict";
import test from "node:test";
import { FLOW_H, NAME_MIN, NODE_GAP, OTHERS, flowLayout } from "./flow-layout.ts";
import type { FlowNode } from "./flow-layout.ts";

const EPS = 1e-6;
const label = (k: string): string => k;

type F = { from: string; to: string; n: number };
const flow = (from: string, to: string, n: number): F => ({ from, to, n });

const height = (n: FlowNode): number => n.y1 - n.y0;

test("a box is as tall as its seats, in proportion, and the boxes of a column stack from the top without overlapping", () => {
  const l = flowLayout([flow("A", "B", 6), flow("A", "A", 2), flow("B", "B", 4)], label);
  const total = 12;
  for (const side of [l.from, l.to]) {
    const unit = (FLOW_H - NODE_GAP * (side.length - 1)) / total;
    side.forEach((n, i) => {
      assert.ok(Math.abs(height(n) - n.seats * unit) <= EPS, `${n.key}: ${height(n)} for ${n.seats} seats`);
      if (i > 0) assert.ok(Math.abs(n.y0 - (side[i - 1]!.y1 + NODE_GAP)) <= EPS, `${n.key} is not ${NODE_GAP} under the box above`);
    });
    assert.ok(Math.abs(side[0]!.y0) <= EPS, "the column starts at the top");
    assert.ok(Math.abs(side.at(-1)!.y1 - FLOW_H) <= EPS, "the column ends at the bottom");
  }
});

test("each column holds every seat compared, and a column is ordered by seats, largest first, a tie by key", () => {
  const l = flowLayout([flow("B", "A", 3), flow("A", "A", 3), flow("C", "B", 5)], label);
  assert.deepEqual(l.from.map((n) => [n.key, n.seats]), [["C", 5], ["A", 3], ["B", 3]]);
  assert.deepEqual(l.to.map((n) => [n.key, n.seats]), [["A", 6], ["B", 5]]);
  for (const side of [l.from, l.to]) assert.equal(side.reduce((s, n) => s + n.seats, 0), 11);
});

test("ribbons fill the box they leave and the box they enter exactly, and none overlaps another in either", () => {
  const flows = [flow("A", "A", 4), flow("A", "B", 3), flow("A", "C", 1), flow("B", "A", 2), flow("B", "C", 5), flow("C", "C", 2)];
  const l = flowLayout(flows, label);
  const spans = (side: "from" | "to") =>
    l.ribbons.map((r) => ({ key: r[side], y0: side === "from" ? r.fromY0 : r.toY0, y1: side === "from" ? r.fromY1 : r.toY1 }));
  for (const side of ["from", "to"] as const) {
    for (const node of l[side]) {
      const mine = spans(side).filter((s) => s.key === node.key).sort((a, b) => a.y0 - b.y0);
      assert.ok(Math.abs(mine.reduce((s, r) => s + (r.y1 - r.y0), 0) - height(node)) <= EPS, `${side} ${node.key}: ribbons do not fill the box`);
      assert.ok(mine.every((r) => r.y0 >= node.y0 - EPS && r.y1 <= node.y1 + EPS), `${side} ${node.key}: a ribbon leaves its box`);
      mine.forEach((r, i) => i > 0 && assert.ok(r.y0 >= mine[i - 1]!.y1 - EPS, `${side} ${node.key}: ribbons overlap`));
    }
  }
});

test("a ribbon is as thick at both ends as the seats it carries, in the unit of its own column", () => {
  const l = flowLayout([flow("A", "B", 6), flow("B", "B", 2)], label);
  for (const r of l.ribbons) {
    const fromUnit = (FLOW_H - NODE_GAP * (l.from.length - 1)) / 8;
    const toUnit = (FLOW_H - NODE_GAP * (l.to.length - 1)) / 8;
    assert.ok(Math.abs(r.fromY1 - r.fromY0 - r.n * fromUnit) <= EPS);
    assert.ok(Math.abs(r.toY1 - r.toY0 - r.n * toUnit) <= EPS);
  }
});

test("a ribbon is held where its previous holder is its winner, and moved where it is not", () => {
  const l = flowLayout([flow("A", "A", 2), flow("A", "B", 1), flow("B", "B", 1)], label);
  const movements = Object.fromEntries(l.ribbons.map((r) => [`${r.from}>${r.to}`, r.movement]));
  assert.deepEqual(movements, { "A>A": "held", "A>B": "moved", "B>B": "held" });
});

test("past seven parties on a side the smallest are one box, Others (n), and no seat is lost", () => {
  const parties = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9"];
  const flows = parties.map((p, i) => flow(p, "P1", 20 - i * 2));
  const l = flowLayout(flows, label);
  assert.equal(l.from.length, 7, "six parties and the fold");
  const folded = l.from.at(-1)!;
  assert.equal(folded.key, OTHERS);
  assert.equal(folded.label, "Others (3)");
  assert.equal(folded.folded, 3);
  assert.equal(folded.seats, 20 - 6 * 2 + (20 - 7 * 2) + (20 - 8 * 2));
  assert.equal(l.from.reduce((s, n) => s + n.seats, 0), flows.reduce((s, f) => s + f.n, 0));
  assert.equal(l.ribbons.reduce((s, r) => s + r.n, 0), flows.reduce((s, f) => s + f.n, 0));
});

test("exactly seven parties on a side are all named: one folded into Others (1) would hide a name to save nothing", () => {
  const flows = ["P1", "P2", "P3", "P4", "P5", "P6", "P7"].map((p, i) => flow(p, "P1", 10 - i));
  const l = flowLayout(flows, label);
  assert.equal(l.from.length, 7);
  assert.ok(l.from.every((n) => n.key !== OTHERS));
});

test("a party kept on one side and folded on the other has the seats it held drawn as held, and the seats it lost as moved", () => {
  // F is a box on the left and folded into Others on the right, and all 3 of its seats were held. A's seats
  // went to six parties on the right, of which only N1 is big enough to keep a box.
  const flows = [
    flow("A", "A", 30),
    ...["N1", "N2", "N3", "N4", "N5", "N6"].map((p) => flow("A", p, 4)),
    flow("F", "F", 3),
    flow("B", "B", 20),
    flow("C", "C", 15),
    flow("D", "D", 10),
    flow("E", "E", 6),
    flow("G", "G", 1),
    flow("H", "H", 1),
  ];
  const l = flowLayout(flows, label);
  const at = (from: string, to: string) => l.ribbons.find((r) => r.from === from && r.to === to);
  assert.equal(at("F", OTHERS)?.n, 3);
  assert.equal(at("F", OTHERS)?.movement, "held", "3 seats F kept, drawn as seats that changed hands");
  assert.equal(at("A", OTHERS)?.n, 20);
  assert.equal(at("A", OTHERS)?.movement, "moved", "every seat in it is one A lost");
});

test("a ribbon into the fold that carries a hold and a move is mixed", () => {
  // T is a box on the left. On the right its one held seat is below the six boxes kept, and so are five of the
  // parties that took its other seats.
  const flows = [
    ...["P1", "P2", "P3", "P4", "P5"].map((p, i) => flow(p, p, 30 - i)),
    flow("T", "T", 1),
    ...["Z1", "Z2", "Z3", "Z4", "Z5", "Z6"].map((p) => flow("T", p, 2)),
  ];
  const l = flowLayout(flows, label);
  const into = l.ribbons.find((r) => r.from === "T" && r.to === OTHERS);
  assert.equal(into?.n, 11, "the hold and ten seats lost");
  assert.equal(into?.movement, "mixed");
});

test("ribbons between two folded boxes are mixed, since they hold some holds and some moves", () => {
  const small = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"];
  const flows = [...small.map((p, i) => flow(p, p, 10 - i)), flow("S7", "S8", 1)];
  const l = flowLayout(flows, label);
  const mixed = l.ribbons.filter((r) => r.from === OTHERS && r.to === OTHERS);
  assert.equal(mixed.length, 1);
  assert.equal(mixed[0]!.movement, "mixed");
});

test("a ribbon between two folded boxes that holds only holds is held, and only moves is moved", () => {
  const small = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"];
  const heldOnly = flowLayout(small.map((p, i) => flow(p, p, 10 - i)), label);
  assert.equal(heldOnly.ribbons.find((r) => r.from === OTHERS && r.to === OTHERS)?.movement, "held");
  // S7 and S8 lose their seats to each other, so the fold is folded on both sides and nothing in it is held.
  const movedOnly = flowLayout([...small.slice(0, 6).map((p, i) => flow(p, p, 10 - i)), flow("S7", "S8", 4), flow("S8", "S7", 3)], label);
  assert.equal(movedOnly.ribbons.find((r) => r.from === OTHERS && r.to === OTHERS)?.movement, "moved");
});

test("one party that held every seat is a box the height of the column and one ribbon straight across", () => {
  const l = flowLayout([flow("A", "A", 40)], label);
  assert.equal(l.from.length, 1);
  assert.ok(Math.abs(height(l.from[0]!) - FLOW_H) <= EPS);
  assert.equal(l.ribbons.length, 1);
  assert.ok(Math.abs(l.ribbons[0]!.fromY0 - l.ribbons[0]!.toY0) <= EPS);
});

test("no flows is nothing to draw", () => {
  assert.deepEqual(flowLayout([], label), { from: [], to: [], ribbons: [] });
});

test("the path of a ribbon runs from the left edge of the picture to the right and is closed", () => {
  const [r] = flowLayout([flow("A", "B", 3)], label).ribbons;
  assert.ok(r !== undefined);
  assert.match(r.path, /^M0 [\d.]+ C[^Z]*L100 [\d.]+ C[^Z]*Z$/);
});

test("the layout is the same every time it is asked for", () => {
  const flows = [flow("A", "B", 3), flow("B", "A", 3), flow("C", "C", 1)];
  assert.deepEqual(flowLayout(flows, label), flowLayout(flows, label));
});

test("a box is named only if it is tall enough to carry its name", () => {
  const l = flowLayout([flow("A", "A", 200), flow("B", "B", 1)], label);
  const a = l.from.find((n) => n.key === "A")!;
  const b = l.from.find((n) => n.key === "B")!;
  assert.ok(height(a) >= NAME_MIN && a.named, "the big box is named");
  assert.ok(height(b) < NAME_MIN && !b.named, `a box ${height(b).toFixed(2)} tall is not named`);
  for (const n of [...l.from, ...l.to]) assert.equal(n.named, height(n) >= NAME_MIN, `${n.key}`);
});
