// The house as the arc draws it: parties by seats, the seats nobody was declared to hold, and how far the leader is from a majority.
//
// The arc is of the WHOLE house, whatever the reader has narrowed the list to, so this takes every seat of the election. A partial
// house (a by-election) has no majority and so no arc: drawing four dots under a "majority" it does not have would be a claim.

import assert from "node:assert/strict";
import test from "node:test";
import { houseArc } from "./house-arc.ts";

const seat = (partyKey: string | null, partyLabel: string | null = partyKey): { partyKey: string | null; partyLabel: string | null } => ({
  partyKey,
  partyLabel,
});

const seats = (counts: Record<string, number>, undeclared = 0): ReturnType<typeof seat>[] => [
  ...Object.entries(counts).flatMap(([k, n]) => Array.from({ length: n }, () => seat(k))),
  ...Array.from({ length: undeclared }, () => seat(null, null)),
];

test("a by-election, which decides no house, has no arc", () => {
  assert.equal(houseArc(seats({ AAA: 3, BBB: 1 }), null), null);
});

test("an election with no seats has no arc", () => {
  assert.equal(houseArc([], 148), null);
});

test("parties are ordered by seats, then by key, so a tie is not a coin toss", () => {
  const arc = houseArc(seats({ ZZZ: 2, BBB: 5, AAA: 2, CCC: 5 }), 7);
  assert.deepEqual(arc?.parties.map((p) => [p.key, p.n]), [["BBB", 5], ["CCC", 5], ["AAA", 2], ["ZZZ", 2]]);
});

test("a seat with no declared winner is counted as undeclared and belongs to no party", () => {
  const arc = houseArc(seats({ AAA: 4, BBB: 2 }, 3), 5);
  assert.equal(arc?.undeclared, 3);
  assert.equal(arc?.parties.length, 2);
  assert.ok(arc?.parties.every((p) => p.key !== "" && p.key !== "null"));
});

test("the parties and the undeclared seats add up to the house", () => {
  const arc = houseArc(seats({ AAA: 4, BBB: 2, CCC: 1 }, 3), 6);
  assert.ok(arc !== null);
  assert.equal(arc.total, 10);
  assert.equal(arc.parties.reduce((a, p) => a + p.n, 0) + arc.undeclared, arc.total);
});

test("the leader is short of a majority by the difference, and not short once it has one", () => {
  const short = houseArc(seats({ AAA: 4, BBB: 3 }), 6);
  assert.equal(short?.leader?.key, "AAA");
  assert.equal(short?.shortBy, 2);
  const exact = houseArc(seats({ AAA: 6, BBB: 1 }), 6);
  assert.equal(exact?.shortBy, null);
  const over = houseArc(seats({ AAA: 7 }), 6);
  assert.equal(over?.shortBy, null);
  assert.equal(over?.majority, 6);
});

test("a state's seats in a bigger house are an arc with no majority to be short of, and the scoped majority does not leak into it", () => {
  const arc = houseArc(seats({ AAA: 4, BBB: 3 }), 6, "delegation");
  assert.ok(arc !== null);
  assert.equal(arc.total, 7);
  assert.equal(arc.majority, null);
  assert.equal(arc.shortBy, null);
  assert.equal(arc.leader?.key, "AAA");
  assert.equal(houseArc(seats({ AAA: 4 }), null, "delegation")?.majority, null);
  assert.equal(houseArc([], null, "delegation"), null, "no seats is still no arc");
  assert.equal(houseArc(seats({ AAA: 3 }), null), null, "a by-election, which is not a delegation, still has none");
});

test("a party is keyed by its key and named by its label, which the first of its seats supplies", () => {
  const arc = houseArc([seat("AITC", "TMC"), seat("AITC", "TMC"), seat("BJP", "BJP")], 2);
  assert.deepEqual(arc?.parties[0], { key: "AITC", label: "TMC", n: 2 });
});

test("a winner with a key and no label is still a party, named by its key", () => {
  assert.deepEqual(houseArc([seat("XYZ", null)], 1)?.parties, [{ key: "XYZ", label: "XYZ", n: 1 }]);
});
