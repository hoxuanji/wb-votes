// How seats moved between parties from one election to the next, as a matrix of previous holder to winner.
//
// A seat can only be compared with itself. One whose boundary was redrawn between the two elections has no predecessor, and one
// whose winner is undeclared at either election has no pair, so neither enters a flow; both are counted apart, because a picture
// of "how power moved" that quietly dropped seats would claim a whole it was not drawn from.

import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { DEV_DB_PATH, all } from "../db/index.ts";
import { electionMapView } from "./election-map.ts";
import { seatFlows } from "./seat-flows.ts";
import { readRegistry } from "./session.ts";

type S = Parameters<typeof seatFlows>[0][number];

/** A comparable seat won by `to`, previously held by `from`. */
const moved = (from: string, to: string): S => ({ partyKey: to, partyLabel: to, comparable: true, flip: { from: { key: from, label: from } } });
/** A seat that cannot be compared: its boundary was redrawn. */
const redrawn = (to: string): S => ({ partyKey: to, partyLabel: to, comparable: false, flip: null });
/** A comparable seat with no declared winner at one of the two elections. */
const unpaired = (to: string | null): S => ({ partyKey: to, partyLabel: to, comparable: true, flip: null });

const rep = (n: number, make: () => S): S[] => Array.from({ length: n }, make);

test("a seat enters a flow from its previous holder to its winner", () => {
  const f = seatFlows([...rep(3, () => moved("AAA", "BBB")), ...rep(2, () => moved("BBB", "BBB"))]);
  assert.deepEqual(f.flows, [{ from: "AAA", to: "BBB", n: 3 }, { from: "BBB", to: "BBB", n: 2 }]);
});

test("held plus flipped is the seats compared", () => {
  const f = seatFlows([...rep(3, () => moved("AAA", "BBB")), ...rep(2, () => moved("BBB", "BBB")), moved("CCC", "AAA")]);
  assert.equal(f.held, 2);
  assert.equal(f.flipped, 4);
  assert.equal(f.compared, 6);
  assert.equal(f.held + f.flipped, f.compared);
});

test("a redrawn seat is counted as incomparable and enters no flow", () => {
  const f = seatFlows([moved("AAA", "AAA"), redrawn("BBB"), redrawn("BBB")]);
  assert.equal(f.left.incomparable, 2);
  assert.equal(f.compared, 1);
  assert.deepEqual(f.flows, [{ from: "AAA", to: "AAA", n: 1 }]);
});

test("a comparable seat with no declared winner at either election is counted as undeclared and enters no flow", () => {
  const f = seatFlows([moved("AAA", "BBB"), unpaired(null), unpaired("CCC")]);
  assert.equal(f.left.undeclared, 2);
  assert.equal(f.compared, 1);
  assert.deepEqual(f.flows.map((x) => x.to), ["BBB"]);
});

test("a seat that says it was a flip but has no winner is undeclared, not a flow to nobody", () => {
  const odd: S = { partyKey: null, partyLabel: null, comparable: true, flip: { from: { key: "AAA", label: "AAA" } } };
  const f = seatFlows([odd]);
  assert.equal(f.left.undeclared, 1);
  assert.deepEqual(f.flows, []);
});

test("the seats compared plus both left counts are every seat", () => {
  const seats = [...rep(4, () => moved("AAA", "BBB")), ...rep(2, () => redrawn("AAA")), ...rep(3, () => unpaired(null)), moved("BBB", "BBB")];
  const f = seatFlows(seats);
  assert.equal(f.compared + f.left.incomparable + f.left.undeclared, seats.length);
});

test("flows are ordered by seats, then by previous holder, then by winner", () => {
  const f = seatFlows([moved("ZZZ", "AAA"), moved("AAA", "ZZZ"), moved("AAA", "BBB"), moved("AAA", "BBB"), moved("BBB", "AAA")]);
  assert.deepEqual(f.flows.map((x) => `${x.from}>${x.to}:${x.n}`), ["AAA>BBB:2", "AAA>ZZZ:1", "BBB>AAA:1", "ZZZ>AAA:1"]);
});

test("a party is listed once, labelled, most involved first, with a tie broken by key", () => {
  const seats: S[] = [
    { partyKey: "BJP", partyLabel: "BJP", comparable: true, flip: { from: { key: "AITC", label: "TMC" } } },
    { partyKey: "BJP", partyLabel: "BJP", comparable: true, flip: { from: { key: "AITC", label: "TMC" } } },
    { partyKey: "AITC", partyLabel: "TMC", comparable: true, flip: { from: { key: "AITC", label: "TMC" } } },
  ];
  assert.deepEqual(seatFlows(seats).parties, [{ key: "AITC", label: "TMC" }, { key: "BJP", label: "BJP" }]);
});

test("no seats is no flows and no party", () => {
  const f = seatFlows([]);
  assert.deepEqual(f, { parties: [], flows: [], compared: 0, held: 0, flipped: 0, left: { incomparable: 0, undeclared: 0 } });
});

const live = { skip: existsSync(process.env["MANDATE_DB_PATH"] ?? DEV_DB_PATH) ? false : "no .data/registry.db" };

test("on every election of the registry the flows say what the findings say: held, flipped, compared and incomparable", live, () => {
  const checked = readRegistry((db) => {
    const wrong: string[] = [];
    let n = 0;
    for (const { id } of all<{ id: string }>(db, `SELECT id FROM election ORDER BY id`)) {
      const v = electionMapView(db, id);
      if (v.election === null || v.flips === null) continue;
      n++;
      const f = seatFlows(v.seats);
      const got = [f.held, f.flipped, f.compared, f.left.incomparable];
      const want = [v.flips.held, v.flips.flipped, v.flips.comparable, v.incomparableSeats];
      if (got.join() !== want.join()) wrong.push(`${id}: flows [held, flipped, compared, incomparable] ${got.join()} against findings ${want.join()}`);
    }
    return { n, wrong };
  });
  assert.ok(checked.ok, "the registry could not be read");
  assert.deepEqual(checked.value.wrong, []);
  assert.ok(checked.value.n > 0, "no election with a comparison was found, so nothing was checked");
});
