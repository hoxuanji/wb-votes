// The front page's house bars and dumbbells, on literal numbers. Held here: every seat is in exactly one segment, a party with no seat has
// none, the small parties are added together and never dropped, and a measure nobody published is not drawn at zero.

import assert from "node:assert/strict";
import test from "node:test";
import { dumbbell, halfHouse, houseSegments } from "./story.ts";

// West Bengal 2011: BJP none, INC 42, CPM 38, TMC 173, five small parties 26 seats, 15 undeclared.
const y2011 = [
  { key: "AITC", label: "TMC", seats: 173 },
  { key: "INC", label: "INC", seats: 42 },
  { key: "CPI(M)", label: "CPM", seats: 38 },
  { key: "a", label: "A", seats: 10 },
  { key: "b", label: "B", seats: 6 },
  { key: "c", label: "C", seats: 5 },
  { key: "d", label: "D", seats: 3 },
  { key: "e", label: "E", seats: 2 },
];

test("a party with no seat has no segment, and the lead's absence is not a zero-width bar", () => {
  const s = houseSegments({ tally: y2011, total: 294, undeclared: 15, lead: "BJP", partner: "AITC" });
  assert.equal(s.find((x) => x.key === "BJP"), undefined);
  assert.equal(s.at(-1)?.role, "partner");
  assert.equal(s.at(-1)?.n, 173);
});

test("the parties between own a segment from 4% of the house, and the rest are one hatched segment", () => {
  const s = houseSegments({ tally: y2011, total: 294, undeclared: 15, lead: "BJP", partner: "AITC" });
  assert.deepEqual(
    s.map((x) => [x.role, x.n]),
    [["party", 42], ["party", 38], ["others", 26], ["none", 15], ["partner", 173]],
  );
  assert.equal(s.find((x) => x.role === "others")?.label, "5 other parties");
});

test("every seat is in one segment: the shares of a bar sum to 1", () => {
  const s = houseSegments({ tally: y2011, total: 294, undeclared: 15, lead: "BJP", partner: "AITC" });
  assert.equal(s.reduce((n, x) => n + x.n, 0), 294);
  assert.ok(Math.abs(s.reduce((n, x) => n + x.share, 0) - 1) < 1e-9);
});

test("the lead is drawn first and the partner last", () => {
  const s = houseSegments({
    tally: [{ key: "BJP", label: "BJP", seats: 192 }, { key: "AITC", label: "TMC", seats: 77 }, { key: "IND", label: "IND", seats: 18 }, { key: "x", label: "X", seats: 6 }],
    total: 294,
    undeclared: 1,
    lead: "BJP",
    partner: "AITC",
  });
  assert.deepEqual(s.map((x) => x.role), ["lead", "party", "others", "none", "partner"]);
  assert.equal(s[0]?.label, "BJP");
});

test("a house with no declared winner is one hollow segment, and a lone party is its own lead", () => {
  assert.deepEqual(houseSegments({ tally: [], total: 10, undeclared: 10, lead: "A", partner: null }).map((x) => x.role), ["none"]);
  assert.deepEqual(houseSegments({ tally: [{ key: "A", label: "A", seats: 10 }], total: 10, undeclared: 0, lead: "A", partner: "A" }).map((x) => x.role), ["lead"]);
});

test("half of an odd house falls on a half seat", () => {
  assert.equal(halfHouse(294), 147);
  assert.equal(halfHouse(295), 147.5);
});

test("a dumbbell places both ends on the axis and joins them", () => {
  const d = dumbbell({ a: 38.7, b: 25.9, min: 0, max: 100 });
  assert.ok(Math.abs((d.ax ?? 0) - 0.387) < 1e-9);
  assert.ok(Math.abs((d.from ?? 0) - 0.259) < 1e-9);
  assert.ok(Math.abs((d.to ?? 0) - 0.387) < 1e-9);
  assert.ok(Math.abs((d.gap ?? 0) + 12.8) < 1e-9);
});

test("a measure that was not published has no mark and no line, never a zero", () => {
  const d = dumbbell({ a: null, b: 65.3, min: 0, max: 100 });
  assert.equal(d.ax, null);
  assert.ok(Math.abs((d.bx ?? 0) - 0.653) < 1e-9);
  assert.equal(d.from, null);
  assert.equal(d.to, null);
  assert.equal(d.gap, null);
});
