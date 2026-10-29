// The seat list beside a map: how its seats are put in order, and the heading that says what the list is.
//
// Every rule is checked on literal seats with no database. The claim that spans the module is that the heading is READ FROM
// the order a builder applied: a builder returns the order it used, `listHead` says it, and nothing in between can disagree.
// That is the defect this replaces: with no vote counts the state page's "closest" twelve were the first twelve in seat
// order, and the election page's list was empty, and neither page said so.

import assert from "node:assert/strict";
import test from "node:test";
import { closestFirst, closestRanked, gaps, inSeatOrder, listHead, marginSaid, sharedGaps } from "./seat-list.ts";
import { binPhrase, bandPhrase, partyLabelIn, partyPhrase } from "./seat-list.ts";
import type { RowFacts, SeatList } from "./seat-list.ts";
import type { Turnout } from "./turnout-trust.ts";

/* ─────────────────────────────────── literals ─────────────────────────────────── */

type Seat = { id: string; marginPct: number | null; partyLabel: string | null };

const seat = (id: string, marginPct: number | null, partyLabel: string | null = "BJP"): Seat => ({ id, marginPct, partyLabel });
const ids = (l: SeatList<Seat>): string[] => l.seats.map((s) => s.id);

/** In seat order: s1 is the first seat, and the margins are not sorted. */
const COUNTED: Seat[] = [seat("s1", 12), seat("s2", 0.4), seat("s3", 3.1), seat("s4", 25), seat("s5", 1.5)];
/** An election whose source published no vote counts: no seat has a margin share. */
const UNCOUNTED: Seat[] = [seat("s1", null), seat("s2", null), seat("s3", null), seat("s4", null)];
/** s2 and s4 have none, as an unopposed seat has none. */
const SOME: Seat[] = [seat("s1", 7), seat("s2", null), seat("s3", 2), seat("s4", null), seat("s5", 4)];

/* ─────────────────────────────────── the builders ─────────────────────────────────── */

test("closestFirst puts the smallest margin first, and a list that is all margins says it is ordered by margin", () => {
  const l = closestFirst(COUNTED, 3);
  assert.deepEqual(ids(l), ["s2", "s5", "s3"]);
  assert.equal(l.of, 5, "of is the set the list was cut from, before the cap");
  assert.equal(l.order, "margin");
});

test("closestFirst with no margin anywhere leaves the seats as they came, and says that is seat order", () => {
  const l = closestFirst(UNCOUNTED, 3);
  assert.deepEqual(ids(l), ["s1", "s2", "s3"]);
  assert.equal(l.of, 4);
  assert.equal(l.order, "seat");
});

test("closestFirst puts a seat with no margin after every seat that has one, and says so when the list reaches them", () => {
  const all = closestFirst(SOME, 5);
  assert.deepEqual(ids(all), ["s3", "s5", "s1", "s2", "s4"], "the two with no margin follow, in seat order");
  assert.equal(all.order, "margin-then-seat");
  // A cap that stops before them is a list of margins, and says only that.
  const cut = closestFirst(SOME, 3);
  assert.deepEqual(ids(cut), ["s3", "s5", "s1"]);
  assert.equal(cut.order, "margin");
});

test("closestFirst breaks a tie by the order the seats came in, and does not reorder its input", () => {
  const tied = [seat("a", 2), seat("b", 1), seat("c", 2), seat("d", 1)];
  assert.deepEqual(ids(closestFirst(tied, 4)), ["b", "d", "a", "c"]);
  assert.deepEqual(tied.map((s) => s.id), ["a", "b", "c", "d"]);
});

test("closestFirst of nothing is an empty list ordered by margin, of nothing", () => {
  assert.deepEqual(closestFirst([], 12), { seats: [], of: 0, order: "margin" });
});

test("closestRanked drops a seat with no margin or no winner, ranks the rest, and is ordered by margin whatever it finds", () => {
  const seats = [seat("s1", 5), seat("s2", null), seat("s3", 1), seat("s4", 0.2, null), seat("s5", 3)];
  const l = closestRanked(seats, 2);
  assert.deepEqual(ids(l), ["s3", "s5"]);
  assert.equal(l.of, 5, "the count is of every seat, so that a list of two reads as two of five");
  assert.equal(l.order, "margin");
  // With no margin anywhere there is nothing to rank, and the list is empty rather than a list in seat order.
  assert.deepEqual(closestRanked(UNCOUNTED, 12), { seats: [], of: 4, order: "margin" });
});

test("inSeatOrder keeps the order it was given, and says it is seat order", () => {
  const l = inSeatOrder(COUNTED, 2);
  assert.deepEqual(ids(l), ["s1", "s2"]);
  assert.equal(l.of, 5);
  assert.equal(l.order, "seat");
});

/* ─────────────────────────────────── the heading ─────────────────────────────────── */

const list = (shown: number, of: number, order: SeatList<number>["order"]): SeatList<number> => ({
  seats: Array.from({ length: shown }, (_, i) => i),
  of,
  order,
});
const NONE = { isolation: null, district: null };

test("an unnarrowed list is headed with what it is and how much of it is shown", () => {
  assert.deepEqual(listHead(NONE, list(12, 294, "margin")), { title: "Closest contests", count: "12 of 294", note: null });
  assert.deepEqual(listHead(NONE, list(12, 294, "seat")), { title: "In seat order", count: "12 of 294", note: null });
  assert.deepEqual(listHead(NONE, list(12, 294, "margin-then-seat")), {
    title: "Closest contests, then seats with no margin",
    count: "12 of 294",
    note: null,
  });
});

test("a list that is the whole of what it describes says so with the same words", () => {
  assert.equal(listHead(NONE, list(5, 5, "margin")).count, "5 of 5");
});

test("a narrowing is said, and so is the order, and so is the count of what was narrowed to", () => {
  const district = { isolation: null, district: "Kolkata" };
  assert.deepEqual(listHead(district, list(16, 16, "margin")), { title: "Seats in Kolkata, closest first", count: "16 of 16", note: null });
  assert.equal(listHead(district, list(16, 16, "seat")).title, "Seats in Kolkata, in seat order");
  assert.equal(listHead(district, list(16, 16, "margin-then-seat")).title, "Seats in Kolkata, closest first, then those with no margin");

  const party = { isolation: partyPhrase("TMC", "winners"), district: null };
  assert.deepEqual(listHead(party, list(60, 77, "margin")), { title: "Seats won by TMC, closest first", count: "60 of 77", note: null });

  const second = { isolation: partyPhrase("INC", "runnerup"), district: null };
  assert.equal(listHead(second, list(3, 3, "margin")).title, "Seats where INC came second, closest first");

  const band = { isolation: bandPhrase("under 1%"), district: null };
  assert.equal(listHead(band, list(9, 9, "margin")).title, "Seats decided by under 1%, closest first");
});

test("a district and an isolation narrow together, and the heading names both", () => {
  const both = { isolation: partyPhrase("TMC", "winners"), district: "Kolkata" };
  assert.equal(listHead(both, list(11, 11, "margin")).title, "Seats won by TMC in Kolkata, closest first");
});

test("a margin bin is said as the range it is, and the overflow bin as everything above it", () => {
  assert.equal(binPhrase({ lo: 4, hi: 6 }), "decided by 4 to 6 percent");
  assert.equal(binPhrase({ lo: 40, hi: null }), "decided by 40 percent or more");
  const bin = { isolation: binPhrase({ lo: 4, hi: 6 }), district: null };
  assert.deepEqual(listHead(bin, list(40, 130, "seat")), { title: "Seats decided by 4 to 6 percent, in seat order", count: "40 of 130", note: null });
});

test("counts are written the way the rest of the page writes them", () => {
  assert.equal(listHead(NONE, list(12, 1234, "margin")).count, "12 of 1,234");
  assert.equal(listHead(NONE, list(12, 123456, "margin")).count, "12 of 1,23,456");
});

test("a list that ranks nothing says why, in the place of a list", () => {
  const empty = listHead(NONE, { seats: [], of: 294, order: "margin" });
  assert.equal(empty.title, "Closest contests");
  assert.equal(empty.count, "0 of 294");
  assert.equal(empty.note, "None of the 294 seats has a margin over votes polled, so none can be ranked.");
  assert.equal(
    listHead(NONE, { seats: [], of: 1, order: "margin" }).note,
    "This seat has no margin over votes polled, so it cannot be ranked.",
  );
  // An election with no seats has nothing to explain. A narrowing that matches nothing is "0 of 0", and says so in a sentence:
  // the heading names the selection, and the reader is left asking whether the list failed to load.
  assert.equal(listHead(NONE, { seats: [], of: 0, order: "margin" }).note, null);
  assert.deepEqual(listHead({ isolation: null, district: "Kolkata" }, { seats: [], of: 0, order: "margin" }), {
    title: "Seats in Kolkata, closest first",
    count: "0 of 0",
    note: "No seat matches this selection.",
  });
  assert.deepEqual(listHead({ isolation: "decided by 4 to 6 percent", district: null }, { seats: [], of: 0, order: "seat" }), {
    title: "Seats decided by 4 to 6 percent, in seat order",
    count: "0 of 0",
    note: "No seat matches this selection.",
  });
  // A narrowing that matches seats says nothing of the kind.
  assert.equal(listHead({ isolation: "won by TMC", district: null }, list(3, 3, "margin")).note, null);
});

test("the heading is read from the builder's order, never from the data the page happens to hold", () => {
  // The same four seats, listed by each builder: the heading follows the builder.
  assert.equal(listHead(NONE, closestFirst(UNCOUNTED, 12)).title, "In seat order");
  assert.equal(listHead(NONE, closestFirst(COUNTED, 12)).title, "Closest contests");
  assert.equal(listHead(NONE, closestFirst(SOME, 12)).title, "Closest contests, then seats with no margin");
  assert.equal(listHead(NONE, closestRanked(COUNTED, 12)).title, "Closest contests");
  assert.equal(listHead(NONE, inSeatOrder(COUNTED, 12)).title, "In seat order");
  // And the count is what the builder cut: the four uncounted seats are four of four, the twelve-seat cap never reached.
  assert.equal(listHead(NONE, closestFirst(UNCOUNTED, 12)).count, "4 of 4");
  assert.equal(listHead(NONE, closestFirst(UNCOUNTED, 2)).count, "2 of 4");
});

test("a party is named by the side it is on in the mode being read", () => {
  const seats = [
    { partyKey: "BJP", partyLabel: "Bharatiya Janata Party", runnerUpKey: "TMC", runnerUpLabel: "All India Trinamool Congress" },
    { partyKey: "TMC", partyLabel: "All India Trinamool Congress", runnerUpKey: null, runnerUpLabel: null },
  ];
  assert.equal(partyLabelIn(seats, "TMC", "winners"), "All India Trinamool Congress");
  assert.equal(partyLabelIn(seats, "TMC", "runnerup"), "All India Trinamool Congress");
  assert.equal(partyLabelIn(seats, "BJP", "flips"), "Bharatiya Janata Party", "flips reads the winner, as the selection does");
  assert.equal(partyLabelIn(seats, "XYZ", "winners"), "XYZ", "a key no seat carries is named by the key");
});

/* ─────────────────────────────────── the rows ─────────────────────────────────── */

const REPORTED: Turnout = { state: "reported", pct: 80 };
const UNVERIFIED: Turnout = { state: "unverified", reason: "r", evidence: { pct: 93, voters: 1, electors: 1 } };
const ABSENT: Turnout = { state: "absent" };

const row = (o: Partial<Parameters<typeof gaps>[0]> = {}): Parameters<typeof gaps>[0] => ({
  partyLabel: "BJP",
  runnerUpLabel: "TMC",
  marginVotes: 57,
  marginBasis: "counted",
  marginPct: 0.02,
  turnout: REPORTED,
  ...o,
});

test("a row with everything known says nothing is missing", () => {
  assert.deepEqual(gaps(row()), { margin: null, runnerUp: null, share: null });
  assert.equal(marginSaid(row()), "57 votes");
  assert.equal(marginSaid(row({ marginVotes: 29584, marginBasis: "declared" })), "29,584 votes (declared)");
});

test("a seat from an election with no vote counts shows the declared margin and says the rest is not known", () => {
  const wb2026 = row({ runnerUpLabel: null, marginVotes: 29584, marginBasis: "declared", marginPct: null, turnout: UNVERIFIED });
  assert.equal(marginSaid(wb2026), "29,584 votes (declared)");
  assert.deepEqual(gaps(wb2026), {
    margin: null,
    runnerUp: "no runner-up recorded",
    share: "share of votes polled\u00a0— verification pending",
  });
});

test("a share that is missing because the turnout is not reported says that, not that it is pending", () => {
  assert.equal(gaps(row({ marginPct: null, turnout: ABSENT })).share, "share of votes polled not reported");
});

test("a seat with no margin at all says so once, and does not also say its share is missing", () => {
  const unopposed = row({ runnerUpLabel: null, marginVotes: null, marginBasis: null, marginPct: null });
  assert.equal(marginSaid(unopposed), null);
  assert.deepEqual(gaps(unopposed), { margin: "margin not reported", runnerUp: "no runner-up recorded", share: null });
});

test("a seat with no winner has no runner-up to be missing, and no margin", () => {
  const none = row({ partyLabel: null, runnerUpLabel: null, marginVotes: null, marginBasis: null, marginPct: null });
  assert.deepEqual(gaps(none), { margin: "margin not reported", runnerUp: null, share: null });
});

/* ───────────────────── a gap every row has is said once, above the list ───────────────────── */

const NO_COUNTS = (o: Partial<RowFacts> = {}): RowFacts =>
  row({ runnerUpLabel: null, marginVotes: 100, marginBasis: "declared", marginPct: null, turnout: UNVERIFIED, ...o });

test("when every row lacks the same things, the list says them once and in the rows' own words", () => {
  const said = sharedGaps([NO_COUNTS(), NO_COUNTS({ marginVotes: 20 })]);
  assert.deepEqual([said.runnerUp, said.share, said.turnout], [true, true, true]);
  assert.equal(
    said.sentence,
    "On every seat in this list: no runner-up recorded · share of votes polled\u00a0— verification pending · turnout — verification pending.",
  );
});

test("a gap only some rows have stays on those rows, so the list never says less than its rows would", () => {
  // The second seat has a runner-up: "no runner-up recorded" is not true of every seat, so it is not said of the list.
  const said = sharedGaps([NO_COUNTS(), NO_COUNTS({ runnerUpLabel: "TMC" })]);
  assert.equal(said.runnerUp, false);
  assert.equal(said.share, true);
  assert.equal(said.sentence?.includes("no runner-up recorded"), false);
  // A seat with no winner has no runner-up to lack, so it breaks the run too.
  assert.equal(sharedGaps([NO_COUNTS(), NO_COUNTS({ partyLabel: null })]).runnerUp, false);
});

test("a list of rows with nothing missing, or of one row, shares nothing", () => {
  assert.deepEqual(sharedGaps([row(), row()]), { runnerUp: false, share: false, turnout: false, sentence: null });
  assert.equal(sharedGaps([NO_COUNTS()]).sentence, null, "one row is not a list");
  assert.equal(sharedGaps([]).sentence, null);
});
