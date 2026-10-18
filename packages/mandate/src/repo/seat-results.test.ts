// Seat results, on literal records. No database: every rule in the module that does not need SQL is stated here
// as an array in and an array out, which is the whole point of the module's shape.
//
// What the registry-backed half asserts (the adapter, and its parity with the readers it replaces) is in
// read-seats.test.ts.

import assert from "node:assert/strict";
import test from "node:test";
import {
  CURRENT_REVISION,
  closest,
  medianMarginShare,
  partyRef,
  seatsFromRecords,
  tally,
  turnoutOf,
  type CandidateRecord,
  type SeatRecord,
  type SeatResult,
} from "./seat-results.ts";

const party = (id: string | null, shortName: string | null, name: string | null, raw: string | null = null) => ({
  id,
  shortName,
  name,
  raw,
});

const cand = (name: string, p: ReturnType<typeof party>, votes: number | null): CandidateRecord => ({
  personId: `p-${name}`,
  name,
  party: p,
  votes,
});

const AITC = party("AITC", "TMC", "All India Trinamool Congress");
const BJP = party("BJP", "BJP", "Bharatiya Janata Party");

/** One counted seat in a verified election, with whatever the test overrides. */
function seat(over: Partial<SeatRecord> = {}): SeatRecord {
  return {
    electionId: "e1",
    contestId: "e1:1",
    placeId: "wb.ac.001",
    versionId: 1,
    epochId: "delim-2008",
    name: "Alpha",
    number: 1,
    reservation: "general",
    jurisdictionId: "wb",
    districtId: null,
    districtName: null,
    winner: cand("Ann", AITC, 600),
    runnerUp: cand("Bob", BJP, 400),
    declaredMargin: 200,
    voters: 1000,
    electors: 2000,
    ...over,
  };
}

const none: ReadonlySet<string> = new Set();

/* ────────────────────────────── the party rule ────────────────────────────── */

test("partyRef: the label is short_name, then name, then the raw string, and a blank is a missing one", () => {
  assert.equal(partyRef(party("AITC", "TMC", "All India Trinamool Congress", "AITC")).label, "TMC");
  assert.equal(partyRef(party("AITC", "", "All India Trinamool Congress")).label, "All India Trinamool Congress");
  assert.equal(partyRef(party("AITC", null, null, "Trinamool")).label, "Trinamool");
  assert.equal(partyRef(party("AITC", "", "", "")).label, "Unattached", "nothing at all to name it by");
});

test("partyRef: the key is the party id, else the source's own string, else 'unattached'", () => {
  assert.equal(partyRef(party("AITC", "TMC", null, "stray")).key, "AITC", "a resolved party keys by its id");
  assert.equal(partyRef(party(null, null, null, "IND")).key, "IND", "an unresolved one keys by what the source printed");
  assert.equal(partyRef(party(null, null, null, "")).key, "unattached", "a blank string is not a key");
  assert.equal(partyRef(party(null, null, null, null)).key, "unattached");
});

/* ────────────────────────────── the winner, the runner-up and the margin ────────────────────────────── */

test("an undeclared seat has no winner at all: not a party called Unattached", () => {
  const [s] = seatsFromRecords([seat({ winner: null, runnerUp: null, declaredMargin: null })], none);
  assert.equal(s?.winner, null);
  assert.equal(s?.margin, null);
  assert.equal(s?.marginShare, null);
  assert.deepEqual(tally(s === undefined ? [] : [s]), [], "and it is nobody's seat in the tally");
});

test("a declared winner no register lists is a party of its own string, and one with none is Unattached", () => {
  const out = seatsFromRecords(
    [
      seat({ winner: cand("Ind", party(null, null, null, "IND"), 500) }),
      seat({ contestId: "e1:2", placeId: "wb.ac.002", winner: cand("Nobody", party(null, null, null, null), 500) }),
    ],
    none,
  );
  assert.deepEqual(out[0]?.winner?.party, { key: "IND", label: "IND" });
  assert.deepEqual(out[1]?.winner?.party, { key: "unattached", label: "Unattached" });
});

test("the margin is counted from the two vote counts when both exist, even if the source declared another", () => {
  const [s] = seatsFromRecords([seat({ declaredMargin: 999 })], none);
  assert.deepEqual({ ...s?.margin }, { votes: 200, basis: "counted" });
});

test("the margin is the declared one, labelled so, when the source published no counts", () => {
  const [s] = seatsFromRecords(
    [seat({ winner: cand("Ann", AITC, null), runnerUp: null, declaredMargin: 321 })],
    none,
  );
  assert.deepEqual({ ...s?.margin }, { votes: 321, basis: "declared" });
  // And one count is not two: a winner's votes with no runner-up row cannot be subtracted from.
  const [t] = seatsFromRecords([seat({ runnerUp: null, declaredMargin: 150 })], none);
  assert.deepEqual({ ...t?.margin }, { votes: 150, basis: "declared" });
});

test("a seat with neither counts nor a declared margin has no margin, not a zero", () => {
  const [s] = seatsFromRecords([seat({ winner: cand("Ann", AITC, null), runnerUp: null, declaredMargin: null })], none);
  assert.equal(s?.margin, null);
  assert.equal(s?.marginShare, null);
});

test("the margin share is of votes polled, by absolute value, and absent without votes polled", () => {
  const [a, b, c] = seatsFromRecords(
    [
      seat({ voters: 1000 }),
      seat({ contestId: "e1:2", placeId: "wb.ac.002", winner: cand("Ann", AITC, 400), runnerUp: cand("Bob", BJP, 600) }),
      seat({ contestId: "e1:3", placeId: "wb.ac.003", voters: 0 }),
    ],
    none,
  );
  assert.equal(a?.marginShare, 20);
  assert.equal(b?.marginShare, 20, "a negative margin is a margin of the same size");
  assert.equal(c?.marginShare, null, "a share of zero votes polled is not a share");
});

/* ────────────────────────────── the gate ────────────────────────────── */

test("an unverified election keeps its margin in votes and loses every share that divides by its turnout", () => {
  const [s] = seatsFromRecords(
    [seat({ winner: cand("Ann", AITC, null), runnerUp: null, declaredMargin: 321, voters: 1000, electors: 2000 })],
    new Set(["e1"]),
  );
  assert.deepEqual({ ...s?.margin }, { votes: 321, basis: "declared" }, "the sourced margin is kept");
  assert.equal(s?.marginShare, null, "its share of an uncorroborated figure is not");
  assert.equal(s?.turnout.state, "unverified");
  assert.equal(s?.counts, null, "and no bare count is left on the seat to divide by");
  if (s?.turnout.state === "unverified") assert.deepEqual({ ...s.turnout.evidence }, { pct: 50, voters: 1000, electors: 2000 });
});

test("the gate is per election: a verified election in the same read is untouched", () => {
  const out = seatsFromRecords(
    [seat({ electionId: "bad" }), seat({ electionId: "good", contestId: "good:1" })],
    new Set(["bad"]),
  );
  assert.equal(out[0]?.marginShare, null);
  assert.equal(out[1]?.marginShare, 20);
  assert.equal(out[1]?.turnout.state, "reported");
  assert.deepEqual({ ...out[1]?.counts }, { voters: 1000, electors: 2000 });
});

/* ────────────────────────────── turnout over a set ────────────────────────────── */

test("turnoutOf sums the counts: it does not average the seats' percentages", () => {
  const out = seatsFromRecords(
    [
      seat({ voters: 100, electors: 200 }), // 50%
      seat({ contestId: "e1:2", placeId: "wb.ac.002", voters: 900, electors: 1000 }), // 90%
    ],
    none,
  );
  const t = turnoutOf(out);
  assert.equal(t.state, "reported");
  if (t.state === "reported") assert.equal(t.pct, (100 * 1000) / 1200, "not (50 + 90) / 2");
});

test("turnoutOf is absent when there are no counts, and counts what a partial row does give", () => {
  assert.deepEqual({ ...turnoutOf([]) }, { state: "absent" });
  const out = seatsFromRecords([seat({ voters: null, electors: null })], none);
  assert.deepEqual({ ...turnoutOf(out) }, { state: "absent" });
  // A seat with votes polled and no electors adds to the numerator only, exactly as the front page always did.
  const partial = seatsFromRecords(
    [seat({ voters: 100, electors: 200 }), seat({ contestId: "e1:2", placeId: "wb.ac.002", voters: 50, electors: null })],
    none,
  );
  const t = turnoutOf(partial);
  if (t.state === "reported") assert.equal(t.pct, 75);
  else assert.fail(`expected a reported turnout, got ${t.state}`);
});

test("turnoutOf an unverified election is a reading with evidence, never a reported figure", () => {
  const t = turnoutOf(
    seatsFromRecords(
      [seat({ voters: 100, electors: 200 }), seat({ contestId: "e1:2", placeId: "wb.ac.002", voters: 150, electors: 200 })],
      new Set(["e1"]),
    ),
  );
  assert.equal(t.state, "unverified");
  if (t.state === "unverified") assert.deepEqual({ ...t.evidence }, { pct: 62.5, voters: 250, electors: 400 });
});

test("turnoutOf a set with one unverified seat is unverified: the sum contains a count nothing corroborates", () => {
  const t = turnoutOf(seatsFromRecords([seat({ electionId: "bad" }), seat({ electionId: "good" })], new Set(["bad"])));
  assert.equal(t.state, "unverified");
});

/* ────────────────────────────── the aggregates ────────────────────────────── */

test("tally counts declared winners by party, biggest first, ties by key", () => {
  const out = seatsFromRecords(
    [
      seat({ contestId: "1", placeId: "a" }),
      seat({ contestId: "2", placeId: "b", winner: cand("X", BJP, 600) }),
      seat({ contestId: "3", placeId: "c", winner: cand("Y", AITC, 600) }),
      seat({ contestId: "4", placeId: "d", winner: cand("Z", party(null, null, null, "IND"), 600) }),
      seat({ contestId: "5", placeId: "e", winner: null, runnerUp: null, declaredMargin: null }),
    ],
    none,
  );
  assert.deepEqual(tally(out), [
    { key: "AITC", label: "TMC", seats: 2 },
    { key: "BJP", label: "BJP", seats: 1 },
    { key: "IND", label: "IND", seats: 1 },
  ]);
});

test("closest ranks by margin share, skips seats without one, breaks ties by name, and takes n", () => {
  const w = (name: string, won: number, second: number, over: Partial<SeatRecord> = {}): SeatRecord =>
    seat({
      contestId: name,
      placeId: `wb.ac.${name}`,
      name,
      winner: cand("W", AITC, won),
      runnerUp: cand("R", BJP, second),
      declaredMargin: null,
      voters: 1000,
      ...over,
    });
  const out = seatsFromRecords(
    [
      w("Delta", 520, 480), // 4%
      w("Bravo", 505, 495), // 1%
      w("Alpha", 505, 495), // 1%
      w("Echo", 900, 100, { voters: 0 }), // no votes polled: unknown, not close
      w("Charlie", 501, 499), // 0.2%
    ],
    none,
  );
  assert.deepEqual(
    closest(out, 3).map((s) => s.name),
    ["Charlie", "Alpha", "Bravo"],
  );
  assert.deepEqual(closest(out, 99).map((s) => s.name), ["Charlie", "Alpha", "Bravo", "Delta"]);
  assert.deepEqual(closest([], 5), []);
});

test("closest finds nothing in an unverified election: its seats are unknown, not close", () => {
  assert.deepEqual(closest(seatsFromRecords([seat()], new Set(["e1"])), 5), []);
});

test("medianMarginShare is the median of the seats that have a share", () => {
  const share = (won: number, second: number, id: string, over: Partial<SeatRecord> = {}): SeatRecord =>
    seat({ contestId: id, placeId: id, winner: cand("W", AITC, won), runnerUp: cand("R", BJP, second), voters: 1000, ...over });
  const out = seatsFromRecords(
    [
      share(510, 490, "a"), // 2
      share(550, 450, "b"), // 10
      share(530, 470, "c"), // 6
      share(900, 100, "d", { voters: 0 }), // none
      seat({ contestId: "e", placeId: "e", winner: null, runnerUp: null, declaredMargin: null }), // none
    ],
    none,
  );
  assert.equal(medianMarginShare(out), 6);
  assert.equal(medianMarginShare(out.slice(0, 2)), 6, "an even count averages the middle two: (2 + 10) / 2");
  assert.equal(medianMarginShare([]), null);
  assert.equal(medianMarginShare(seatsFromRecords([seat()], new Set(["e1"]))), null, "a gated election has none");
});

/* ────────────────────────────── plain data ────────────────────────────── */

test("seat results are plain data: they survive JSON unchanged, so they can cross to a React prop", () => {
  const out: SeatResult[] = seatsFromRecords(
    [
      seat({ districtId: "wb.d1", districtName: "North" }),
      seat({ electionId: "bad", contestId: "bad:1", winner: cand("Ann", AITC, null), runnerUp: null, declaredMargin: 7 }),
      seat({ contestId: "e1:3", placeId: "wb.ac.003", winner: null, runnerUp: null, declaredMargin: null }),
    ],
    new Set(["bad"]),
  );
  assert.deepEqual(JSON.parse(JSON.stringify(out)), out);
});

test("the current revision is 0, the only one any reader looks at", () => {
  assert.equal(CURRENT_REVISION, 0);
});
