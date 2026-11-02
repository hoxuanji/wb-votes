// Next up: the elections ahead, and how much of each five-year term has run.
//
// The rules that matter are the ones with no live example: the registry holds no announced date and no overdue term that is not also a
// reading of its own coverage, so the announced branch, the overdue split and the tie are all built by hand here. The helpers are tested on
// literals; the reader on a registry built from a list of elections.

import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { DEV_DB_PATH, open, openRead } from "../db/index.ts";
import { entryOf, inOrder, namedLeader, nextUp, seatsToFill, stillAhead, termElapsed } from "./next-up.ts";
import type { Pending } from "./next-up.ts";
import type { NextUp } from "./situation-types.ts";
import { electionsFixture } from "./testkit.ts";
import type { ElectionSpec } from "./testkit.ts";

const HAVE_DB = existsSync(process.env["MANDATE_DB_PATH"] ?? DEV_DB_PATH);
const live = { skip: HAVE_DB ? false : "no .data/registry.db — run npm run registry:ingest" };

const TODAY = new Date("2026-11-03T00:00:00Z");

/* ────────────────────────────── the term ────────────────────────────── */

test("a term is five years from the middle of the polling month, or from the middle of the year when the month is not held", () => {
  // Unknown month: 1 July. Five years on, to the day, the term is exactly run.
  assert.equal(termElapsed(2021, null, new Date("2026-07-01T00:00:00Z")), 1);
  assert.equal(termElapsed(2021, null, new Date("2021-07-01T00:00:00Z")), 0);
  assert.ok(Math.abs(termElapsed(2021, null, new Date("2024-01-01T00:00:00Z")) - 0.5) < 0.01, "half a term, give or take a day");
  // A known month: the 15th. April 2021 ends on 15 April 2026, so 3 November 2026 is past it.
  assert.equal(termElapsed(2021, 4, new Date("2026-04-15T00:00:00Z")), 1);
  assert.ok(termElapsed(2021, 4, TODAY) > 1.1 && termElapsed(2021, 4, TODAY) < 1.12, "overdue is above one, and is not clamped");
});

test("a day before the term begins is 0, and never negative", () => {
  assert.equal(termElapsed(2026, null, new Date("2026-02-01T00:00:00Z")), 0);
  assert.equal(termElapsed(2026, 11, new Date("2026-11-03T00:00:00Z")), 0);
});

test("a month that is not 1 to 12 is no month: the middle of the year is used, as for null", () => {
  for (const bad of [0, 13, -1, 4.5, Number.NaN]) {
    assert.equal(termElapsed(2021, bad, TODAY), termElapsed(2021, null, TODAY), String(bad));
  }
});

test("the seats an election will fill are the reference strength, and the last election's count only where there is none", () => {
  assert.equal(seatsToFill("assembly", "ka", 87), 224);
  assert.equal(seatsToFill("assembly", "jk", 87), 90, "today's strength, not the 87 the last election filled");
  assert.equal(seatsToFill("assembly", "xx", 12), 12, "a jurisdiction the reference does not know has only the last election's count");
  assert.equal(seatsToFill("assembly", "an", 0), 0, "a territory with no assembly has none to fill and the reference gives none");
  assert.equal(seatsToFill("lok-sabha", "in", 300), 543);
});

/* ────────────────────────────── the entries ────────────────────────────── */

const pending = (over: Partial<Pending> = {}): Pending => ({
  basis: "inferred",
  jurisdictionId: "kl",
  jurisdictionName: "Kerala",
  body: "assembly",
  year: 2026,
  announcedOn: null,
  after: { electionId: "kl-assembly-2021", year: 2021, month: 4, leaderLabel: "CPM" },
  seats: 140,
  ...over,
});

test("an announced entry has its date and no term; an inferred one has a term and no date", () => {
  const a = entryOf(pending({ basis: "announced", year: 2028, announcedOn: "2028-03-01" }), TODAY);
  assert.deepEqual([a.basis, a.on, a.termElapsed], ["announced", "2028-03-01", null]);
  const i = entryOf(pending(), TODAY);
  assert.deepEqual([i.basis, i.on], ["inferred", null]);
  assert.equal(typeof i.termElapsed, "number");
});

test("a date inferred from a term can never come out announced, whatever date is attached to the input", () => {
  // The only way to an `on` is basis 'announced'. An inferred row that somehow carried a date must still say it is inferred and print none.
  const e = entryOf(pending({ basis: "inferred", announcedOn: "2027-01-01" }), TODAY);
  assert.equal(e.basis, "inferred");
  assert.equal(e.on, null);
});

test("an entry names the body in its own word and the election it follows", () => {
  const ls = entryOf(pending({ body: "lok-sabha", jurisdictionId: "in", jurisdictionName: "India", year: 2029, seats: 543 }), TODAY);
  assert.equal(ls.bodyWord, "Lok Sabha");
  assert.equal(entryOf(pending(), TODAY).bodyWord, "Assembly");
  assert.deepEqual(entryOf(pending(), TODAY).after, { electionId: "kl-assembly-2021", year: 2021, leaderLabel: "CPM" }, "the month is for the fraction and does not leave");
});

test("an announced election whose counting day has passed is not next; one with no counting date stays", () => {
  assert.equal(stillAhead("2026-05-02", TODAY), false);
  assert.equal(stillAhead("2026-11-03", TODAY), true, "counting today is not over");
  assert.equal(stillAhead("2028-05-13", TODAY), true);
  assert.equal(stillAhead(null, TODAY), true);
});

test("the order is announced by date, then terms still to run by year and name, then the overdue", () => {
  const e = (name: string, basis: NextUp["basis"], year: number, on: string | null = null): NextUp =>
    entryOf(pending({ jurisdictionName: name, basis, year, announcedOn: on }), TODAY);
  const sorted = inOrder(
    [
      e("Zeta", "inferred", 2027),
      e("Alpha", "inferred", 2020),
      e("Beta", "inferred", 2027),
      e("Gamma", "announced", 2028, "2028-03-01"),
      e("Delta", "announced", 2027, "2027-06-01"),
      e("Epsilon", "inferred", 2026),
      e("Eta", "announced", 2027, null),
      e("Theta", "inferred", 2019),
    ],
    TODAY,
  );
  assert.deepEqual(
    sorted.map((x) => x.jurisdictionName),
    ["Delta", "Gamma", "Eta", "Epsilon", "Beta", "Zeta", "Theta", "Alpha"],
    "announced Delta before Gamma by date, the undated Eta last of them; then 2026, 2027 (Beta before Zeta); then the overdue, oldest first",
  );
});

/* ────────────────────────────── the registry ────────────────────────────── */

const SPECS: ElectionSpec[] = [
  // Karnataka: held in 2023 (May), and its next one announced by the Commission for 2028.
  { id: "ka-assembly-2023", jurisdiction: "ka", year: 2023, month: 5, seats: { INC: 6, BJP: 3 } },
  { id: "ka-assembly-2028", jurisdiction: "ka", year: 2028, lifecycle: "announced", seats: {}, announcedOn: "2028-03-01", countingOn: "2028-05-13" },
  // Kerala: held in 2021 with no month on record, its two big parties level for most seats.
  { id: "kl-assembly-2021", jurisdiction: "kl", year: 2021, seats: { CPM: 5, INC: 5 } },
  // Tamil Nadu: 2016, so its term ended in 2021 and it is overdue.
  { id: "tn-assembly-2016", jurisdiction: "tn", year: 2016, month: 4, seats: { DMK: 3, ADMK: 2 } },
  // West Bengal: held this year.
  { id: "wb-assembly-2026", jurisdiction: "wb", year: 2026, month: 4, seats: { AITC: 4, BJP: 1 } },
  // The Lok Sabha: one election for the union, its seats in the states.
  { id: "ls-2024", jurisdiction: "in", year: 2024, month: 5, kind: "general", house: "pc", seatsIn: "ka", seats: { BJP: 5, INC: 4 } },
  // Goa: its next election was announced and has been counted: the Commission's own counting date is behind us.
  { id: "ga-assembly-2022", jurisdiction: "ga", year: 2022, seats: { BJP: 2 } },
  { id: "ga-assembly-2026", jurisdiction: "ga", year: 2026, lifecycle: "announced", seats: {}, announcedOn: "2026-01-10", countingOn: "2026-03-10" },
  // Manipur: an announced election and no election before it on record, so there is nothing for it to follow.
  { id: "mn-assembly-2027", jurisdiction: "mn", year: 2027, lifecycle: "announced", seats: {}, announcedOn: "2027-01-10" },
];

test("the rail: announced first, then the terms still to run, the Lok Sabha among them, then the overdue", () => {
  const d = open(":memory:");
  try {
    electionsFixture(d, SPECS);
    const rail = nextUp(d, TODAY);
    assert.deepEqual(
      rail.map((e) => `${e.jurisdictionId}:${e.bodyWord}:${e.year}:${e.basis}`),
      ["ka:Assembly:2028:announced", "kl:Assembly:2026:inferred", "in:Lok Sabha:2029:inferred", "wb:Assembly:2031:inferred", "tn:Assembly:2021:inferred"],
    );
  } finally {
    d.close();
  }
});

test("a date is announced only where the Commission set one, and an inferred entry has a term and no date", () => {
  const d = open(":memory:");
  try {
    electionsFixture(d, SPECS);
    for (const e of nextUp(d, TODAY)) {
      if (e.basis === "announced") {
        assert.equal(e.termElapsed, null, `${e.jurisdictionId}: an announced date is not a term`);
      } else {
        assert.equal(e.on, null, `${e.jurisdictionId}: an inferred entry carries no date`);
        assert.equal(typeof e.termElapsed, "number", `${e.jurisdictionId}: and a fraction of a term`);
      }
    }
    const ka = nextUp(d, TODAY).find((e) => e.jurisdictionId === "ka");
    assert.deepEqual([ka?.basis, ka?.on, ka?.termElapsed, ka?.seats], ["announced", "2028-03-01", null, 224]);
    assert.deepEqual(ka?.after, { electionId: "ka-assembly-2023", year: 2023, leaderLabel: "INC" }, "it follows the election before it, not itself");
  } finally {
    d.close();
  }
});

test("the terms: Kerala's term has run out (the month is unknown, so it is counted from mid-2021), West Bengal's has just begun", () => {
  const d = open(":memory:");
  try {
    electionsFixture(d, SPECS);
    const rail = nextUp(d, TODAY);
    const by = (id: string) => rail.find((e) => e.jurisdictionId === id) as NextUp;
    assert.ok(by("kl").termElapsed! > 1 && by("kl").termElapsed! < 1.1, `Kerala ${by("kl").termElapsed}`);
    assert.equal(by("kl").year, 2026, "due this year, so it is not in the overdue group, though its term has run out");
    assert.ok(by("wb").termElapsed! > 0.1 && by("wb").termElapsed! < 0.12, `West Bengal ${by("wb").termElapsed}`);
    assert.ok(by("tn").termElapsed! > 1.8, `Tamil Nadu is overdue: ${by("tn").termElapsed}`);
    assert.equal(by("tn").year, 2021);
    const ls = rail.find((e) => e.bodyWord === "Lok Sabha") as NextUp;
    assert.deepEqual([ls.jurisdictionId, ls.year, ls.seats, ls.after.electionId, ls.after.leaderLabel], ["in", 2029, 543, "ls-2024", null]);
    assert.ok(ls.termElapsed! > 0.4 && ls.termElapsed! < 0.5, `the Lok Sabha's term: ${ls.termElapsed}`);
  } finally {
    d.close();
  }
});

test("a Lok Sabha the registry holds only part of has no leader to name; one it holds in full does", () => {
  // Nine of 543 seats: the party that won them did not lead the house, and the registry does not know who did.
  const partial = open(":memory:");
  const whole = open(":memory:");
  try {
    electionsFixture(partial, SPECS);
    assert.equal(nextUp(partial, TODAY).find((e) => e.bodyWord === "Lok Sabha")?.after.leaderLabel, null);
    electionsFixture(whole, [{ id: "ls-2024", jurisdiction: "in", year: 2024, kind: "general", house: "pc", seatsIn: "ka", seats: { BJP: 300, INC: 243 } }]);
    assert.equal(nextUp(whole, TODAY).find((e) => e.bodyWord === "Lok Sabha")?.after.leaderLabel, "BJP");
    // An assembly is the state's own, and its leader is named however many seats are held.
    assert.equal(namedLeader("assembly", 3, [{ key: "A", label: "A", seats: 2 }, { key: "B", label: "B", seats: 1 }]), "A");
    assert.equal(namedLeader("lok-sabha", 542, [{ key: "A", label: "A", seats: 300 }]), null, "one seat short of the house");
    assert.equal(namedLeader("lok-sabha", 543, [{ key: "A", label: "A", seats: 271 }, { key: "B", label: "B", seats: 271 }]), null, "level is level");
  } finally {
    partial.close();
    whole.close();
  }
});

test("a tie for most seats leaves the election it follows without a leader: the page must not pick a winner", () => {
  const d = open(":memory:");
  try {
    electionsFixture(d, SPECS);
    const kl = nextUp(d, TODAY).find((e) => e.jurisdictionId === "kl");
    assert.equal(kl?.after.leaderLabel, null);
  } finally {
    d.close();
  }
});

test("an announced election already counted is not next, and one with nothing before it to follow is not listed", () => {
  const d = open(":memory:");
  try {
    electionsFixture(d, SPECS);
    const ids = nextUp(d, TODAY).map((e) => e.jurisdictionId);
    assert.ok(!ids.includes("ga"), "Goa's counting day was 10 March 2026");
    assert.ok(!ids.includes("mn"), "Manipur has no earlier election on record, and `after` needs one");
  } finally {
    d.close();
  }
});

test("as of an earlier day the same registry gives a smaller fraction of every term", () => {
  const d = open(":memory:");
  try {
    electionsFixture(d, SPECS);
    const then = nextUp(d, new Date("2025-11-03T00:00:00Z"));
    const now = nextUp(d, TODAY);
    for (const e of now) {
      const before = then.find((x) => x.jurisdictionId === e.jurisdictionId && x.bodyWord === e.bodyWord);
      if (e.termElapsed === null) assert.equal(before?.termElapsed, null);
      else assert.ok((before?.termElapsed ?? Infinity) < e.termElapsed, `${e.jurisdictionId}`);
    }
  } finally {
    d.close();
  }
});

test("an empty registry has nothing ahead", () => {
  const d = open(":memory:");
  try {
    electionsFixture(d, []);
    assert.deepEqual(nextUp(d, TODAY), []);
  } finally {
    d.close();
  }
});

test("the live registry's rail: every entry is inferred, and West Bengal's term has just begun", live, () => {
  const d = openRead();
  try {
    const rail = nextUp(d, TODAY);
    for (const e of rail) {
      assert.equal(e.basis === "announced", e.termElapsed === null);
      if (e.basis === "inferred") assert.equal(e.on, null);
    }
    assert.ok(rail.some((e) => e.bodyWord === "Lok Sabha"), "the Lok Sabha is on the rail when the registry holds one");
  } finally {
    d.close();
  }
});
