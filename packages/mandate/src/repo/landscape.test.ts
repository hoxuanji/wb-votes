// The landscape: who led each state's assembly at every year the registry holds an assembly election in.
//
// The pure half is tested on literals (a state, a year, a count). The SQL half is tested on a registry built here, because the live registry
// holds one state and cannot show the cases that matter: a by-election that must not replace a government, a count still running, an election
// announced with no contests, two elections in one year, a tie for most seats.

import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { DEV_DB_PATH, open, openRead } from "../db/index.ts";
import { currentStandings } from "./elections.ts";
import { blocsByElection, landscapeFrom, landscapeOverTime, leaderOf } from "./landscape.ts";
import type { LandscapeElection, Won } from "./landscape.ts";
import { electionsFixture } from "./testkit.ts";
import type { ElectionSpec } from "./testkit.ts";

const HAVE_DB = existsSync(process.env["MANDATE_DB_PATH"] ?? DEV_DB_PATH);
const live = { skip: HAVE_DB ? false : "no .data/registry.db — run npm run registry:ingest" };

const states = [
  { id: "ka", name: "Karnataka" },
  { id: "kl", name: "Kerala" },
  { id: "wb", name: "West Bengal" },
];
const el = (id: string, jurisdictionId: string, year: number, seats: number): LandscapeElection => ({ id, jurisdictionId, year, seats });
const won = (electionId: string, key: string, seats: number, label = key): Won => ({ electionId, key, label, seats });

/* ────────────────────────────── the rules, on literals ────────────────────────────── */

test("a state's government at a year is its newest assembly election on or before it, and before its first it is hollow", () => {
  const l = landscapeFrom(
    states,
    [el("ka-2013", "ka", 2013, 10), el("kl-2016", "kl", 2016, 10), el("ka-2018", "ka", 2018, 10)],
    [won("ka-2013", "INC", 6), won("ka-2018", "BJP", 7), won("kl-2016", "CPM", 8)],
  );
  assert.deepEqual(l.years, [2013, 2016, 2018], "only the years an assembly election was held in, not every calendar year");
  assert.deepEqual([l.first, l.last], [2013, 2018]);
  const at = (year: number) => Object.fromEntries((l.byYear.find((y) => y.year === year) as { states: { id: string; held: { electionId: string } | null }[] }).states.map((s) => [s.id, s.held?.electionId ?? null]));
  assert.deepEqual(at(2013), { ka: "ka-2013", kl: null, wb: null }, "Kerala has nothing by 2013 and is hollow, not a colour");
  assert.deepEqual(at(2016), { ka: "ka-2013", kl: "kl-2016", wb: null }, "Karnataka's 2013 government stands until its next election");
  assert.deepEqual(at(2018), { ka: "ka-2018", kl: "kl-2016", wb: null });
  assert.deepEqual(l.byYear.map((y) => y.withResult), [1, 2, 2]);
});

test("every year lists every jurisdiction it was given, in id order", () => {
  const l = landscapeFrom([states[2], states[0], states[1]] as typeof states, [el("ka-2013", "ka", 2013, 1)], [won("ka-2013", "INC", 1)]);
  assert.deepEqual(l.byYear[0]?.states.map((s) => s.id), ["ka", "kl", "wb"]);
  assert.deepEqual(l.byYear[0]?.states.map((s) => s.name), ["Karnataka", "Kerala", "West Bengal"]);
});

test("the leader holds the most seats, and a majority is more than half of the seats contested", () => {
  const l = landscapeFrom(
    states,
    [el("a", "ka", 2010, 8), el("b", "kl", 2010, 8), el("c", "wb", 2010, 9)],
    [won("a", "X", 4), won("a", "Y", 3), won("b", "X", 5), won("b", "Y", 3), won("c", "X", 4), won("c", "Y", 3)],
  );
  const [ka, kl, wb] = (l.byYear[0] as { states: { held: { leader: { key: string } | null; leaderSeats: number; seats: number; majority: boolean } }[] }).states.map((s) => s.held);
  assert.deepEqual([ka?.leader?.key, ka?.leaderSeats, ka?.seats, ka?.majority], ["X", 4, 8, false], "4 of 8 is exactly half, and half is not a majority");
  assert.deepEqual([kl?.leader?.key, kl?.leaderSeats, kl?.majority], ["X", 5, true]);
  assert.deepEqual([wb?.leader?.key, wb?.leaderSeats, wb?.majority], ["X", 4, false], "4 of 9 contested is a plurality, and the contest count is the denominator");
});

test("a tie for most seats has no leader: the page must not pick a winner", () => {
  assert.deepEqual(leaderOf([{ key: "A", label: "A", seats: 14 }, { key: "B", label: "B", seats: 14 }, { key: "C", label: "C", seats: 12 }]), {
    leader: null,
    seats: 14,
  });
  // Level for second place is not a tie for the lead.
  assert.equal(leaderOf([{ key: "A", label: "A", seats: 20 }, { key: "B", label: "B", seats: 10 }, { key: "C", label: "C", seats: 10 }]).leader?.key, "A");
  // Nothing declared: no leader, and no seats to claim.
  assert.deepEqual(leaderOf([]), { leader: null, seats: 0 });
  assert.deepEqual(leaderOf([{ key: "A", label: "A", seats: 0 }]), { leader: null, seats: 0 });

  const l = landscapeFrom(states, [el("t", "ka", 2017, 40)], [won("t", "BJP", 14), won("t", "INC", 14), won("t", "IND", 12)]);
  const held = l.byYear[0]?.states.find((s) => s.id === "ka")?.held;
  assert.equal(held?.leader, null);
  assert.equal(held?.leaderSeats, 14, "the seats the level parties each hold are still said");
  assert.equal(held?.majority, false);
  assert.equal(held?.seats, 40, "the election is on record, so the state is not hollow either");
  assert.deepEqual(l.byYear[0]?.tally, [], "a state with no leader is in no party's tally");
  assert.equal(l.byYear[0]?.withResult, 1);
  assert.deepEqual(l.parties, [], "and a party that leads nowhere is not in the legend");
});

test("an election with contests and no declared winner is on record, with no leader", () => {
  const l = landscapeFrom(states, [el("z", "kl", 2021, 140)], []);
  assert.deepEqual(l.byYear[0]?.states.find((s) => s.id === "kl")?.held, {
    electionId: "z",
    year: 2021,
    leader: null,
    leaderSeats: 0,
    seats: 140,
    majority: false,
  });
});

test("two elections in one year are two events: the later one is the government", () => {
  // Bihar 2005 is the real case; the caller's order is the registry's chronology.
  const l = landscapeFrom(states, [el("first", "ka", 2005, 10), el("second", "ka", 2005, 10)], [won("first", "A", 6), won("second", "B", 6)]);
  assert.deepEqual(l.years, [2005], "one stop for the year");
  assert.equal(l.byYear[0]?.states.find((s) => s.id === "ka")?.held?.electionId, "second");
});

test("the tally counts states led, most first and then by key; its numbers sum to the states with a leader", () => {
  const l = landscapeFrom(
    [...states, { id: "xx", name: "X" }, { id: "yy", name: "Y" }],
    [el("1", "ka", 2020, 5), el("2", "kl", 2020, 5), el("3", "wb", 2020, 5), el("4", "xx", 2020, 5), el("5", "yy", 2020, 4)],
    [won("1", "B", 3), won("2", "A", 3), won("3", "C", 3), won("4", "C", 3), won("5", "B", 2), won("5", "A", 2)],
  );
  const y = l.byYear[0];
  assert.deepEqual(y?.tally.map((t) => [t.party.key, t.states]), [["C", 2], ["A", 1], ["B", 1]], "C leads two states; A and B one each, by key");
  assert.equal(y?.tally.reduce((n, t) => n + t.states, 0), (y?.states.filter((s) => s.held?.leader != null).length ?? -1));
});

test("the parties are every party that leads a state at any stop, in an order that does not depend on the year", () => {
  const elections = [el("1", "ka", 2010, 5), el("2", "kl", 2010, 5), el("3", "ka", 2015, 5), el("4", "kl", 2015, 5), el("5", "wb", 2015, 5)];
  const results = [won("1", "A", 3), won("2", "A", 3), won("3", "B", 3), won("4", "A", 3), won("5", "B", 3)];
  const l = landscapeFrom(states, elections, results);
  // A led two states in 2010 and one in 2015 (3 stops); B led two in 2015 (2 stops).
  assert.deepEqual(l.parties.map((p) => p.key), ["A", "B"]);
  assert.deepEqual(landscapeFrom(states, elections, results), l, "the same input gives the same landscape");
});

test("a party's label is the newest election's, everywhere", () => {
  const l = landscapeFrom(states, [el("1", "ka", 2010, 5), el("2", "ka", 2015, 5)], [won("1", "A", 3, "Old"), won("2", "A", 3, "New")]);
  assert.deepEqual(l.parties, [{ key: "A", label: "New" }]);
  assert.equal(l.byYear[0]?.states.find((s) => s.id === "ka")?.held?.leader?.label, "New");
  assert.equal(l.byYear[0]?.tally[0]?.party.label, "New");
});

test("no election at all is an empty landscape and not an error", () => {
  assert.deepEqual(landscapeFrom(states, [], []), { years: [], first: null, last: null, byYear: [], parties: [] });
});

test("seats are summed across the jurisdictions an election's seats sit in", () => {
  const blocs = blocsByElection([
    { electionId: "e", key: "A", label: "A", seats: 3 },
    { electionId: "e", key: "A", label: "A", seats: 2 },
    { electionId: "e", key: "B", label: "B", seats: 4 },
  ]);
  assert.deepEqual(blocs.get("e"), [{ key: "A", label: "A", seats: 5 }, { key: "B", label: "B", seats: 4 }]);
});

/* ────────────────────────────── the registry ────────────────────────────── */

const SPECS: ElectionSpec[] = [
  { id: "ka-assembly-2013", jurisdiction: "ka", year: 2013, seats: { INC: 6, BJP: 3, JDS: 1 } },
  { id: "ka-assembly-2018", jurisdiction: "ka", year: 2018, seats: { BJP: 5, INC: 4 } },
  // A by-election after Karnataka's 2018 house, won by the other side, and in a year no assembly election was held in.
  { id: "ka-bypoll-2019", jurisdiction: "ka", year: 2019, kind: "bypoll", seats: { INC: 2 } },
  { id: "kl-assembly-2016", jurisdiction: "kl", year: 2016, seats: { CPM: 5, INC: 5 } },
  { id: "kl-assembly-2021", jurisdiction: "kl", year: 2021, seats: { CPM: 6, INC: 3 } },
  // A count that is running: its leaders are not a government yet.
  { id: "kl-assembly-2026", jurisdiction: "kl", year: 2026, lifecycle: "counting", seats: { INC: 3 } },
  // Announced, with no contests: not a government either, and not a stop on the scrubber.
  { id: "wb-assembly-2027", jurisdiction: "wb", year: 2027, lifecycle: "announced", seats: {}, announcedOn: "2027-01-10" },
  // The nation's own election is not a state's.
  { id: "ls-2019", jurisdiction: "in", year: 2019, kind: "general", house: "pc", seats: { BJP: 4 }, seatsIn: "ka" },
];

test("a registry's landscape counts assembly elections with a result on record, and nothing else", () => {
  const d = open(":memory:");
  try {
    electionsFixture(d, SPECS);
    const l = landscapeOverTime(d);
    assert.deepEqual(l.years, [2013, 2016, 2018, 2021], "no by-election year, no running count, no announcement, no Lok Sabha");
    assert.equal(l.byYear[0]?.states.length, 36, "every jurisdiction, not only the ones with elections");
    const ids = l.byYear[0]?.states.map((s) => s.id) ?? [];
    assert.deepEqual(ids, [...ids].sort(), "in id order");
    const at = (y: number, id: string) => l.byYear.find((x) => x.year === y)?.states.find((s) => s.id === id)?.held;
    assert.equal(at(2018, "ka")?.leader?.key, "BJP", "the 2019 by-election did not change Karnataka's government");
    assert.deepEqual([at(2018, "ka")?.leaderSeats, at(2018, "ka")?.seats, at(2018, "ka")?.majority], [5, 9, true]);
    assert.equal(at(2016, "kl")?.leader, null, "5 seats each is a tie for most, so Kerala 2016 has no leader");
    assert.equal(at(2021, "kl")?.leader?.key, "CPM");
    assert.equal(at(2021, "kl")?.electionId, "kl-assembly-2021", "the running 2026 count and the announced 2027 election do not appear");
    assert.equal(at(2021, "wb"), null, "West Bengal's only row is an announcement, so it has no election on record");
    // Stops led: INC at 2013 and 2016, BJP at 2018 and 2021, CPM at 2021. JDS won a seat and led nothing, so it is not here.
    assert.deepEqual(l.parties.map((p) => p.key), ["BJP", "INC", "CPM"]);
    for (const y of l.byYear) {
      assert.equal(y.tally.reduce((n, t) => n + t.states, 0), y.states.filter((s) => s.held?.leader).length, `${y.year}: the tally sums to the states with a leader`);
    }
  } finally {
    d.close();
  }
});

test("the last stop agrees with the front page's current standings wherever there is no tie", () => {
  const d = open(":memory:");
  try {
    electionsFixture(d, SPECS.filter((s) => s.lifecycle === undefined && s.kind !== "bypoll" && s.house === undefined));
    const last = landscapeOverTime(d).byYear.at(-1);
    const now = currentStandings(d);
    assert.ok(now.length > 0);
    for (const s of now) {
      const held = last?.states.find((x) => x.id === s.jurisdictionId)?.held;
      assert.equal(held?.electionId, s.electionId, `${s.jurisdictionId}: the same election`);
      assert.equal(held?.seats, s.seatsContested);
      if (held?.leader !== null) {
        assert.equal(held?.leader?.key, s.leaderKey, `${s.jurisdictionId}: the same leader`);
        assert.equal(held?.majority, s.majority);
      }
    }
  } finally {
    d.close();
  }
});

test("an empty registry has no years and 36 states nowhere", () => {
  const d = open(":memory:");
  try {
    electionsFixture(d, []);
    assert.deepEqual(landscapeOverTime(d), { years: [], first: null, last: null, byYear: [], parties: [] });
  } finally {
    d.close();
  }
});

test("the live registry's landscape: every year an assembly election was held, no state coloured without one", live, () => {
  const d = openRead();
  try {
    const l = landscapeOverTime(d);
    assert.equal(l.years.length, l.byYear.length);
    assert.deepEqual(l.years, [...l.years].sort((a, b) => a - b));
    for (const y of l.byYear) {
      assert.equal(y.states.length, 36);
      for (const s of y.states) assert.ok(s.held === null || s.held.year <= y.year, `${s.id} is coloured by an election after ${y.year}`);
      assert.equal(y.tally.reduce((n, t) => n + t.states, 0) <= y.withResult, true);
    }
  } finally {
    d.close();
  }
});
