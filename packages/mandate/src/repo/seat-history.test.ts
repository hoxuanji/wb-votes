// A seat's history, drawn: the strip of who held the seat and the bar of each election (seat-history.ts), and the page that draws them.
//
// The pure function is tested first, on literal records, because the live registry holds neither a seat of ten candidates, nor a tie
// for first, nor shares that run over the votes polled. Then the reader, over a registry built here from literal data through the
// real migrations, and last the seat page rendered in-process:
//
//   xx  five assembly seats and one Lok Sabha seat under one order
//         Alpha  2011 AAA, 2016 BBB, 2018 by-poll CCC, 2021 TMC (party id AITC) with ten candidates, 2026 TMC with a declared margin
//                and no counts: it changed hands three times and held at the end
//         Beta   2016 and 2026 with no result at all, 2021 AAA with no votes polled on record
//         Gamma  2021, AAA and BBB with 400 votes each
//         Delta  no contest on record

import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { DEV_DB_PATH, all, open } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";
import { margin_pct, vote_share_pct } from "../semantic/index.ts";
import { fillFor } from "../viz/party-ink.ts";
import { getPlaceAnalysis } from "./place-analysis.ts";
import { getPlaceBrief } from "./place.ts";
import { placeHeadline, placeTiles, times } from "./place-presentation.ts";
import { readRegistry } from "./session.ts";
import { SEGMENTS, heldCaption, readSeatHistory, seatHistory, segmentLabel, shareText } from "./seat-history.ts";
import type { HistoryCandidate, HistoryRecord, SeatHistory } from "./seat-history.ts";
import { readSeats } from "./seat-results.ts";

const ROOT = new URL("../../../../", import.meta.url).pathname;

/* ───────────────────────────── literal records ───────────────────────────── */

const party = (id: string) => ({ id, shortName: id, name: id, raw: null });

/** One candidate. `votes` and `share` are as stored: null for not published. The winner is the first, unless said. */
function cand(
  name: string,
  p: string,
  rank: number | null,
  votes: number | null,
  share: number | null = null,
  isWinner: boolean = rank === 1,
): HistoryCandidate {
  return { name, party: party(p), rank, isWinner, votes, voteShare: share };
}

function rec(year: number, candidates: HistoryCandidate[], over: Partial<HistoryRecord> = {}): HistoryRecord {
  return {
    contestId: `e${year}:s`,
    year,
    byPoll: false,
    candidates,
    declaredMargin: null,
    votesPolled: null,
    ...over,
  };
}

/** A contest won by `p`, its source naming no counts: the shape of West Bengal 2026. */
const declared = (year: number, p: string, margin: number | null = 100): HistoryRecord =>
  rec(year, [cand(`Winner ${year}`, p, 1, null)], { declaredMargin: margin });

/** A contest the source declared nothing for. */
const nobody = (year: number): HistoryRecord => rec(year, []);

const holders = (h: SeatHistory): (string | null)[] => h.held.map((b) => b.party?.key ?? null);

/* ───────────────────────────── who held the seat ───────────────────────────── */

test("the strip runs oldest to newest, one block per election, and marks each place the seat changed hands", () => {
  // Newest first, as the seat's table is: A held it to 2011 and again from 2021, B in between.
  const h = seatHistory([declared(2021, "A"), declared(2016, "B"), declared(2011, "A"), declared(2006, "A")]);
  assert.deepEqual(h.held.map((b) => [b.year, b.label, b.party?.key, b.changedHands]), [
    [2006, "2006", "A", false],
    [2011, "2011", "A", false],
    [2016, "2016", "B", true],
    [2021, "2021", "A", true],
  ]);
  assert.equal(h.handOffs, 2);
  assert.equal(h.undeclared, 0);
  assert.equal(heldCaption(h), "4 elections, 2006 to 2021 — changed hands twice");
});

test("a seat won by one party throughout is one unbroken run: no block changes hands", () => {
  const h = seatHistory([declared(2021, "A"), declared(2016, "A"), declared(2011, "A")]);
  assert.deepEqual(holders(h), ["A", "A", "A"]);
  assert.equal(h.handOffs, 0);
  assert.ok(h.held.every((b) => !b.changedHands));
  assert.equal(heldCaption(h), "3 elections, 2011 to 2021 — never changed hands");
});

test("a block of an election with no declared winner has no party, and the seat does not change hands across it", () => {
  // A, nobody, B: the winners either side of the gap are both declared but they are not adjacent, as the headline counts.
  const h = seatHistory([declared(2021, "B"), nobody(2016), declared(2011, "A")]);
  assert.deepEqual(holders(h), ["A", null, "B"]);
  assert.deepEqual(h.held.map((b) => b.changedHands), [false, false, false]);
  assert.equal(h.undeclared, 1);
  assert.equal(h.handOffs, 0);
  // "Never" would be a claim about the election nobody declared, so the caption says only what is on record.
  assert.equal(heldCaption(h), "3 elections, 2011 to 2021 — no change of hands on record; 1 with no declared winner");
  // And the same party either side of a gap does not change hands either.
  assert.equal(seatHistory([declared(2021, "A"), nobody(2016), declared(2011, "A")]).handOffs, 0);
});

test("an undeclared election beside one declared winner is no change of hands on record, and never a never", () => {
  const h = seatHistory([declared(2021, "A"), nobody(2016)]);
  assert.equal(h.handOffs, 0);
  assert.equal(heldCaption(h), "2 elections, 2016 to 2021 — no change of hands on record; 1 with no declared winner");
  // With a change of hands somewhere, the hand-offs are counted and the gap is still said.
  const g = seatHistory([declared(2021, "A"), declared(2016, "B"), nobody(2011)]);
  assert.equal(heldCaption(g), "3 elections, 2011 to 2021 — changed hands once; 1 with no declared winner");
});

test("a single election has a strip of one block, and says there is nothing earlier to compare it with", () => {
  const h = seatHistory([declared(2024, "A")]);
  assert.deepEqual(holders(h), ["A"]);
  assert.equal(h.handOffs, 0);
  assert.equal(heldCaption(h), "1 election, 2024 — no earlier election to compare it with");
  // And with no declared winner in it.
  assert.equal(heldCaption(seatHistory([nobody(2024)])), "1 election, 2024 — no earlier election to compare it with; 1 with no declared winner");
});

test("no election on record is no strip, and an empty caption", () => {
  const h = seatHistory([]);
  assert.deepEqual(h, { held: [], handOffs: 0, undeclared: 0, results: [] });
  assert.equal(heldCaption(h), "");
});

test("a by-election is a block of the strip and is labelled as one, so two blocks of a year are not the same election", () => {
  const h = seatHistory([declared(2021, "A"), { ...declared(2021, "B"), contestId: "bp:s", byPoll: true }, declared(2016, "A")]);
  assert.deepEqual(h.held.map((b) => [b.label, b.party?.key, b.changedHands]), [
    ["2016", "A", false],
    ["2021 by-poll", "B", true],
    ["2021", "A", true],
  ]);
  assert.equal(h.handOffs, 2);
});

test("the party is the one the maps colour by: its key, and the label a reader reads", () => {
  const winner: HistoryCandidate = { name: "W", party: { id: "AITC", shortName: "TMC", name: "Trinamool", raw: null }, rank: 1, isWinner: true, votes: null, voteShare: null };
  const h = seatHistory([rec(2021, [winner], { declaredMargin: 5 })]);
  assert.deepEqual(h.held[0]?.party, { key: "AITC", label: "TMC" });
  assert.equal(h.held[0]?.winner, "W");
});

test("a change of hands is a change of the party's key, not of the label it is printed with", () => {
  const w = (year: number, id: string, shortName: string): HistoryRecord =>
    rec(year, [{ name: `W${year}`, party: { id, shortName, name: null, raw: null }, rank: 1, isWinner: true, votes: null, voteShare: null }], { declaredMargin: 1 });
  // Two parties that print one abbreviation are two parties.
  assert.equal(seatHistory([w(2021, "P2", "XY"), w(2016, "P1", "XY")]).handOffs, 1);
  // One party whose label was spelled two ways is one party.
  assert.equal(seatHistory([w(2021, "P1", "XY2"), w(2016, "P1", "XY")]).handOffs, 0);
});

/* ───────────────────────────── the bar of an election ───────────────────────────── */

const five = [
  cand("One", "A", 1, 72040, 48.89),
  cand("Two", "B", 2, 39408, 26.74),
  cand("Three", "C", 3, 23540, 15.97),
  cand("Four", "D", 4, 3713, 2.52),
  cand("Five", "E", 5, 3359, 2.28),
];

test("the published shares are the bar, and what they do not add up to is left unfilled, not given to the leaders", () => {
  // The registry holds the leading five of a contest: 96.4 of the votes polled. The rest is neither invented nor spread.
  const r = seatHistory([rec(2011, five, { votesPolled: 147357, declaredMargin: 32632 })]).results[0];
  assert.ok(r !== undefined && r.bar !== null);
  assert.deepEqual(r.bar.segments.map((s) => [s.party?.key, s.name, s.share, s.winner, s.candidates]), [
    ["A", "One", 48.89, true, 1],
    ["B", "Two", 26.74, false, 1],
    ["C", "Three", 15.97, false, 1],
    ["D", "Four", 2.52, false, 1],
    ["E", "Five", 2.28, false, 1],
  ]);
  assert.ok(Math.abs(r.bar.total - 96.4) < 1e-9);
  assert.ok(Math.abs(r.bar.unitemised - 3.6) < 1e-9);
  assert.equal(r.evidence, "counted");
  assert.equal(r.note, null);
});

test("a share the source published wins over one worked out, and a missing one is the votes over the votes polled", () => {
  // Published 49.98 where 99338 / 198744 is 49.9819...: the published one is the table's, so the two agree to the digit.
  const published = seatHistory([rec(2021, [cand("One", "A", 1, 99338, 49.98), cand("Two", "B", 2, 84653, 42.59)], { votesPolled: 198744 })]).results[0];
  assert.deepEqual(published?.bar?.segments.map((s) => s.share), [49.98, 42.59]);
  // No share published (the source gave counts only): votes over the votes polled, 600 and 350 of 1000.
  const worked = seatHistory([rec(2016, [cand("One", "A", 1, 600), cand("Two", "B", 2, 350)], { votesPolled: 1000 })]).results[0];
  assert.deepEqual(worked?.bar?.segments.map((s) => s.share), [60, 35]);
  assert.ok(Math.abs((worked?.bar?.unitemised ?? 0) - 5) < 1e-9);
  // Each candidate on their own row: one published and one not is both.
  const mixed = seatHistory([rec(2016, [cand("One", "A", 1, 600, 61.5), cand("Two", "B", 2, 350)], { votesPolled: 1000 })]).results[0];
  assert.deepEqual(mixed?.bar?.segments.map((s) => s.share), [61.5, 35]);
});

test("a share worked out from votes prints as the vote_share_pct measure's own figure, and the margin as margin_pct's", () => {
  // The measure is the one definition; the bar keeps the quotient unrounded only so that what is left over is not rounding.
  for (const [votes, polled] of [[99338, 198744], [5, 15], [1, 3], [333, 1000], [12345, 54321], [7, 8]] as const) {
    const bar = seatHistory([rec(2021, [cand("One", "A", 1, votes), cand("Two", "B", 2, 1)], { votesPolled: polled })]).results[0]?.bar;
    const share = bar?.segments[0]?.share;
    assert.ok(share !== undefined);
    assert.equal(`${shareText(share)}%`, vote_share_pct.format(vote_share_pct.compute({ votes, validVotes: polled })));
  }
  const r = seatHistory([rec(2021, [cand("One", "A", 1, 99338, 49.98), cand("Two", "B", 2, 84653, 42.59)], { votesPolled: 198744 })]).results[0];
  assert.ok(r?.statement.endsWith(`${margin_pct.format(margin_pct.compute({ rank1Votes: 14685, rank2Votes: 0, validVotes: 198744 }))} of the votes polled.`));
});

test("shares that add up to a little more than the votes polled are drawn to their total, and say so; a rounding remainder is not a part of the vote", () => {
  // 100.01, as a truncated field adds up: no unfilled part, and no note.
  const rounded = seatHistory([rec(2011, [cand("One", "A", 1, 5, 33.34), cand("Two", "B", 2, 5, 33.34), cand("Three", "C", 3, 5, 33.33)], { votesPolled: 15 })]).results[0];
  assert.equal(rounded?.bar?.unitemised, 0);
  assert.equal(rounded?.note, null);
  // 99.97 is not 100 but a tenth cannot show the difference either.
  const under = seatHistory([rec(2011, [cand("One", "A", 1, 5, 66.66), cand("Two", "B", 2, 5, 33.31)], { votesPolled: 15 })]).results[0];
  assert.equal(under?.bar?.unitemised, 0);
  // 101.5: counts that reconcile with the votes polled to within the window, but not to the vote. Drawn to that total.
  const over = seatHistory([rec(2023, [cand("One", "A", 1, 1013), cand("Two", "B", 2, 814)], { votesPolled: 1800 })]).results[0];
  assert.ok(over?.bar !== null && over?.bar !== undefined);
  assert.equal(over.bar.unitemised, 0);
  assert.equal(shareText(over.bar.total), "101.5");
  assert.equal(over.note, "The shares add up to 101.5%, so the bar is drawn to that total.");
});

test("shares that contradict the votes polled are not drawn at all", () => {
  const r = seatHistory([rec(2011, [cand("One", "A", 1, 700), cand("Two", "B", 2, 500)], { votesPolled: 1000 })]).results[0];
  assert.equal(r?.bar, null);
  assert.equal(r?.evidence, "counted");
  assert.equal(r?.note, "The shares add up to 120.0%, more than the votes polled, so no bar is drawn.");
  // The words still say who won and by how much, from the counts, but not as a share of votes polled that the page has just said
  // the counts contradict: a margin share the bar declined to stand behind is not printed in a sentence beside it.
  assert.equal(r?.statement, "One (A) beat Two (B) by 200 votes.");
  // The same counts against votes polled they do fit are given as a share.
  const fits = seatHistory([rec(2011, [cand("One", "A", 1, 700), cand("Two", "B", 2, 200)], { votesPolled: 1000 })]).results[0];
  assert.equal(fits?.statement, "One (A) beat Two (B) by 500 votes, 50.0% of the votes polled.");
});

test("counts with no votes polled and no published share have no share to state, so no bar", () => {
  const r = seatHistory([rec(2011, [cand("One", "A", 1, 700), cand("Two", "B", 2, 500)])]).results[0];
  assert.equal(r?.bar, null);
  assert.equal(r?.evidence, "counted");
  assert.equal(r?.note, "The votes polled are not on record and no share was published, so the shares cannot be stated and no bar is drawn.");
  // Without the votes polled the margin is still in votes, and has no share of anything.
  assert.equal(r?.statement, "One (A) beat Two (B) by 200 votes.");
});

test("a zero or missing count is not a count: nothing is drawn from it", () => {
  const r = seatHistory([rec(2021, [cand("One", "A", 1, 0, 0), cand("Two", "B", 2, null, null)], { declaredMargin: 50, votesPolled: 1000 })]).results[0];
  assert.equal(r?.evidence, "declared");
  assert.equal(r?.bar, null);
});

test("past six candidates the tail is added together as Others (n), and the page is told", () => {
  const ten = Array.from({ length: 10 }, (_, i) => cand(`C${i + 1}`, i < 3 ? "ABC"[i] ?? "X" : "IND", i + 1, 300 - i * 30, null));
  // 300, 270, 240, 210, 180, 150, 120, 90, 60, 30 = 1650 of 2000 polled.
  const r = seatHistory([rec(2021, ten, { votesPolled: 2000 })]).results[0];
  assert.ok(r !== undefined && r.bar !== null);
  assert.equal(r.bar.segments.length, SEGMENTS);
  assert.deepEqual(r.bar.segments.slice(0, 5).map((s) => s.name), ["C1", "C2", "C3", "C4", "C5"]);
  const tail = r.bar.segments[SEGMENTS - 1];
  assert.ok(tail !== undefined);
  assert.equal(tail.party, null);
  assert.equal(tail.name, null);
  assert.equal(tail.candidates, 5);
  assert.equal(segmentLabel(tail), "Others (5)");
  // C6..C10: 150 + 120 + 90 + 60 + 30 = 450 votes, 22.5% of 2000.
  assert.equal(tail.votes, 450);
  assert.ok(Math.abs(tail.share - 22.5) < 1e-9);
  // Nothing is lost by grouping: the segments still add up to the shares of all ten, 82.5%.
  assert.ok(Math.abs(r.bar.total - 82.5) < 1e-9);
  assert.ok(Math.abs(r.bar.segments.reduce((sum, s) => sum + s.share, 0) - 82.5) < 1e-9);
  assert.equal(r.note, "The 5 lowest of 10 candidates are added together as Others (5).");
});

test("a tail has a vote count only when every candidate in it has one", () => {
  // Eight candidates with published shares, and counts for all but one of the last three.
  const eight = Array.from({ length: 8 }, (_, i) => cand(`C${i + 1}`, `P${i + 1}`, i + 1, i === 6 ? null : 100 - i, 20 - i * 2));
  const tail = seatHistory([rec(2021, eight)]).results[0]?.bar?.segments.at(-1);
  assert.equal(tail?.candidates, 3);
  assert.equal(tail?.votes, null);
  // With every count held it is their sum.
  const all = Array.from({ length: 8 }, (_, i) => cand(`C${i + 1}`, `P${i + 1}`, i + 1, 100 - i, 20 - i * 2));
  assert.equal(seatHistory([rec(2021, all)]).results[0]?.bar?.segments.at(-1)?.votes, 95 + 94 + 93);
});

test("six candidates are six segments; seven are five and Others (2)", () => {
  const n = (k: number): HistoryCandidate[] => Array.from({ length: k }, (_, i) => cand(`C${i + 1}`, `P${i + 1}`, i + 1, 100 - i * 5));
  const six = seatHistory([rec(2021, n(6), { votesPolled: 1000 })]).results[0];
  assert.equal(six?.bar?.segments.length, 6);
  assert.ok(six?.bar?.segments.every((s) => s.party !== null));
  assert.equal(six?.note, null);
  const seven = seatHistory([rec(2021, n(7), { votesPolled: 1000 })]).results[0];
  assert.equal(seven?.bar?.segments.length, 6);
  assert.equal(seven?.bar?.segments[5]?.candidates, 2);
  assert.equal(seven?.note, "The 2 lowest of 7 candidates are added together as Others (2).");
});

test("a tail added together and a total a little over the votes polled are both said, in that order", () => {
  // Seven candidates of 145 votes in 1000 polled: 101.5% in all, and the last two are Others (2).
  const seven = Array.from({ length: 7 }, (_, i) => cand(`C${i + 1}`, `P${i + 1}`, i + 1, 145));
  const r = seatHistory([rec(2021, seven, { votesPolled: 1000 })]).results[0];
  assert.equal(r?.bar?.segments.length, 6);
  assert.equal(r?.note, "The 2 lowest of 7 candidates are added together as Others (2). The shares add up to 101.5%, so the bar is drawn to that total.");
});

test("candidates are drawn leader first however the rows arrived, and the runner-up is the rank-2 row", () => {
  const scrambled = [cand("Three", "C", 3, 100), cand("One", "A", 1, 500), cand("Two", "B", 2, 300)];
  const r = seatHistory([rec(2021, scrambled, { votesPolled: 1000 })]).results[0];
  assert.deepEqual(r?.bar?.segments.map((s) => s.name), ["One", "Two", "Three"]);
  assert.equal(r?.winner?.name, "One");
  assert.equal(r?.runnerUp?.name, "Two");
  assert.deepEqual(r?.margin, { votes: 200, basis: "counted" });
  // With no rank-2 row the next candidate down is not the runner-up, and the margin between them would be over the wrong one.
  const gap = seatHistory([rec(2021, [cand("One", "A", 1, 500), cand("Three", "C", 3, 100)], { votesPolled: 1000, declaredMargin: 250 })]).results[0];
  assert.equal(gap?.runnerUp, null);
  assert.deepEqual(gap?.margin, { votes: 250, basis: "declared" });
  assert.equal(gap?.statement, "One (A) won by a declared margin of 250 votes.");
  // Where the source published shares and no counts, rank is all that orders the candidates: votes cannot.
  const shares = [cand("Three", "C", 3, null, 10), cand("One", "A", 1, null, 50), cand("Two", "B", 2, null, 30)];
  assert.deepEqual(seatHistory([rec(2021, shares)]).results[0]?.bar?.segments.map((s) => s.name), ["One", "Two", "Three"]);
});

/* ───────────────────────────── the words ───────────────────────────── */

test("the winner, the runner-up and the margin are named, with the party beside each name", () => {
  const r = seatHistory([rec(2021, [cand("Adhikary Paresh", "AITC", 1, 99338, 49.98), cand("Dadhiram Ray", "BJP", 2, 84653, 42.59)], { votesPolled: 198744, declaredMargin: 14685 })]).results[0];
  assert.equal(r?.statement, "Adhikary Paresh (AITC) beat Dadhiram Ray (BJP) by 14,685 votes, 7.4% of the votes polled.");
  assert.deepEqual(r?.winner?.party, { key: "AITC", label: "AITC" });
});

test("a tie for first says both polled the same and that the source declared the winner", () => {
  const r = seatHistory([rec(2021, [cand("One", "A", 1, 4000), cand("Two", "B", 2, 4000)], { votesPolled: 10000 })]).results[0];
  assert.deepEqual(r?.margin, { votes: 0, basis: "counted" });
  assert.equal(r?.statement, "One (A) and Two (B) polled the same 4,000 votes; the source declares One the winner.");
  assert.deepEqual(r?.bar?.segments.map((s) => s.share), [40, 40]);
  // The seat is the declared winner's, whatever the order of two equal counts.
  assert.deepEqual(seatHistory([rec(2021, [cand("Two", "B", 2, 4000), cand("One", "A", 1, 4000)], { votesPolled: 10000 })]).held.map((b) => b.party?.key), ["A"]);
});

test("an election with only a declared margin names the winner and the margin, draws no bar, and says the shares are not on record", () => {
  const r = seatHistory([declared(2026, "A", 29584)]).results[0];
  assert.ok(r !== undefined);
  assert.equal(r.evidence, "declared");
  assert.equal(r.bar, null);
  assert.deepEqual(r.margin, { votes: 29584, basis: "declared" });
  assert.equal(r.statement, "Winner 2026 (A) won by a declared margin of 29,584 votes.");
  assert.equal(r.note, "Candidate vote counts are not on record for this election, so the shares are not on record and no bar is drawn.");
  // And with no margin either, the winner is all there is.
  assert.equal(seatHistory([declared(2026, "A", null)]).results[0]?.statement, "Winner 2026 (A) won.");
});

test("an election with nothing on record is a sentence and no bar", () => {
  const r = seatHistory([nobody(2016)]).results[0];
  assert.equal(r?.evidence, "none");
  assert.equal(r?.bar, null);
  assert.equal(r?.winner, null);
  assert.equal(r?.statement, "No result is declared for this election.");
  assert.equal(r?.note, "No candidate vote counts are on record, so no bar is drawn.");
});

test("counts with no declared winner are drawn, and no winner is named", () => {
  const r = seatHistory([rec(2021, [cand("One", "A", 1, 500, 50, false), cand("Two", "B", 2, 300, 30, false)], { votesPolled: 1000 })]).results[0];
  assert.equal(r?.winner, null);
  assert.equal(r?.statement, "No winner is declared for this election, though candidate votes are on record.");
  assert.deepEqual(r?.bar?.segments.map((s) => [s.name, s.winner]), [["One", false], ["Two", false]]);
  assert.equal(seatHistory([rec(2021, [cand("One", "A", 1, 500, 50, false)]), declared(2016, "B")]).undeclared, 1);
});

test("a share too small for a tenth is not printed as nothing", () => {
  assert.equal(shareText(48.89), "48.9");
  assert.equal(shareText(0.04), "<0.1");
  assert.equal(shareText(0), "0.0");
  assert.equal(shareText(100), "100.0");
});

/* ───────────────────────────── the reader ───────────────────────────── */

function fixture(db: DatabaseSync): DatabaseSync {
  migrate(db, "2026-08-12T00:00:00.000Z");
  db.exec(`
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('e1','Delimitation','2008-02-19');
    INSERT INTO place (id, kind, canonical_name) VALUES ('in','nation','India');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('xx','state','Xx State','in');
    INSERT INTO source (id, kind, publisher, title, retrieved_at, doc_hash) VALUES ('s1','static_module','P','Results','2026-08-12','sha256:0');
    INSERT INTO party (id, name, short_name) VALUES ('AAA','A Party','AAA');
    INSERT INTO party (id, name, short_name) VALUES ('BBB','B Party','BBB');
    INSERT INTO party (id, name, short_name) VALUES ('CCC','C Party','CCC');
    INSERT INTO party (id, name, short_name) VALUES ('AITC','All India Trinamool Congress','TMC');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (1,'AAA','1990-01-01','A Party');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (2,'BBB','1990-01-01','B Party');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (3,'CCC','1990-01-01','C Party');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (4,'AITC','1998-01-01','All India Trinamool Congress');
  `);
  const place = db.prepare(`INSERT INTO place (id, kind, canonical_name, parent_id) VALUES (?, 'ac', ?, 'xx')`);
  const version = db.prepare(
    `INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, reservation)
     VALUES (?, ?, 'xx', 'ac', 'e1', ?, ?, 'general')`,
  );
  ["Alpha", "Beta", "Gamma", "Delta"].forEach((name, i) => {
    place.run(`xx.ac.00${i + 1}`, name);
    version.run(i + 1, `xx.ac.00${i + 1}`, i + 1, name);
  });
  const election = db.prepare(
    `INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, occurrence)
     VALUES (?, ?, 'state', 'xx', 'e1', ?, 'declared', 'ac', ?, 1)`,
  );
  for (const [id, kind, year] of [
    ["xx-assembly-2011", "assembly", 2011],
    ["xx-assembly-2016", "assembly", 2016],
    ["xx-bypoll-ae-2018", "bypoll", 2018],
    ["xx-assembly-2021", "assembly", 2021],
    ["xx-assembly-2026", "assembly", 2026],
  ] as const) {
    election.run(id, kind, id, year);
  }

  const person = db.prepare(`INSERT INTO person (id, canonical_name, created_at) VALUES (?, ?, '2026-08-12')`);
  const contestRow = db.prepare(`INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES (?, ?, ?, 'declared')`);
  const candidacy = db.prepare(
    `INSERT INTO candidacy (id, contest_id, person_id, party_version_id, party_raw, status) VALUES (?, ?, ?, ?, ?, 'contesting')`,
  );
  const result = db.prepare(
    `INSERT INTO result (contest_id, candidacy_id, revision, votes, vote_share, "rank", is_winner, margin, source_id, ingested_at)
     VALUES (?, ?, 0, ?, ?, ?, ?, ?, 's1', '2026-08-12')`,
  );
  const turnout = db.prepare(
    `INSERT INTO turnout (contest_id, scope, electors, voters, source_id) VALUES (?, 'contest', ?, ?, 's1')`,
  );
  type Row = { who: string; version: number | null; raw?: string; votes: number | null; share?: number | null };
  /** A contest of a seat version, its rows leader first; the first is the declared winner and carries the margin. */
  const contest = (electionId: string, versionId: number, voters: number | null, margin: number | null, rows: Row[]): void => {
    const id = `${electionId}:${versionId}`;
    contestRow.run(id, electionId, versionId);
    if (voters !== null) turnout.run(id, voters * 2, voters);
    rows.forEach((r, i) => {
      const pid = `p-${id}-${i}`;
      person.run(pid, `${r.who} ${electionId.slice(-4)}`);
      candidacy.run(`c-${id}-${i}`, id, pid, r.version, r.raw ?? null);
      result.run(id, `c-${id}-${i}`, r.votes, r.share ?? null, i + 1, i === 0 ? 1 : 0, i === 0 ? margin : null);
    });
  };

  // Alpha
  contest("xx-assembly-2011", 1, 1000, 200, [
    { who: "Ann", version: 1, votes: 500, share: 50 },
    { who: "Bob", version: 2, votes: 300, share: 30 },
    { who: "Cat", version: 3, votes: 100, share: 10 },
  ]);
  contest("xx-assembly-2016", 1, 1000, 250, [
    { who: "Bea", version: 2, votes: 600 },
    { who: "Abe", version: 1, votes: 350 },
  ]);
  contest("xx-bypoll-ae-2018", 1, 800, 100, [
    { who: "Cy", version: 3, votes: 400 },
    { who: "Bo", version: 2, votes: 300 },
  ]);
  contest("xx-assembly-2021", 1, 1000, 100, [
    { who: "Tia", version: 4, votes: 300 },
    { who: "Al", version: 1, votes: 200 },
    { who: "Be", version: 2, votes: 100 },
    { who: "Ce", version: 3, votes: 80 },
    { who: "Ind1", version: null, raw: "IND", votes: 60 },
    { who: "Ind2", version: null, raw: "IND", votes: 50 },
    { who: "Ind3", version: null, raw: "IND", votes: 40 },
    { who: "Ind4", version: null, raw: "IND", votes: 30 },
    { who: "Ind5", version: null, raw: "IND", votes: 20 },
    { who: "Ind6", version: null, raw: "IND", votes: 10 },
  ]);
  contest("xx-assembly-2026", 1, 1900, 777, [{ who: "Tom", version: 4, votes: null }]);
  // Beta: two elections with no result at all, and a 2021 with counts and no turnout row
  contest("xx-assembly-2016", 2, 900, null, []);
  contest("xx-assembly-2021", 2, null, 200, [
    { who: "Ann", version: 1, votes: 500 },
    { who: "Bob", version: 2, votes: 300 },
  ]);
  contest("xx-assembly-2026", 2, 1500, null, []);
  // Gamma: a tie for first
  contest("xx-assembly-2021", 3, 1000, 0, [
    { who: "Ann", version: 1, votes: 400 },
    { who: "Bob", version: 2, votes: 400 },
  ]);
  return db;
}

function withFixture<T>(fn: (db: DatabaseSync) => T): T {
  const db = fixture(open(":memory:"));
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

test("a seat's history is read in the order the table lists it, by-election included, with its party keys and labels", () => {
  const h = withFixture((db) => readSeatHistory(db, 1));
  assert.deepEqual(h.results.map((r) => [r.label, r.winner?.party.key, r.winner?.party.label, r.evidence]), [
    ["2026", "AITC", "TMC", "declared"],
    ["2021", "AITC", "TMC", "counted"],
    ["2018 by-poll", "CCC", "CCC", "counted"],
    ["2016", "BBB", "BBB", "counted"],
    ["2011", "AAA", "AAA", "counted"],
  ]);
  assert.deepEqual(h.held.map((b) => [b.label, b.party?.key, b.changedHands]), [
    ["2011", "AAA", false],
    ["2016", "BBB", true],
    ["2018 by-poll", "CCC", true],
    ["2021", "AITC", true],
    ["2026", "AITC", false],
  ]);
  assert.equal(h.handOffs, 3);
  assert.equal(heldCaption(h), "5 elections, 2011 to 2026 — changed hands 3 times");
});

test("each bar is the contest's candidates: published shares as published, worked out ones over the contest's votes polled", () => {
  const h = withFixture((db) => readSeatHistory(db, 1));
  const by = (label: string) => h.results.find((r) => r.label === label);
  assert.deepEqual(by("2011")?.bar?.segments.map((s) => [s.party?.key, s.share]), [["AAA", 50], ["BBB", 30], ["CCC", 10]]);
  assert.equal(by("2011")?.bar?.unitemised, 10);
  assert.deepEqual(by("2016")?.bar?.segments.map((s) => [s.party?.key, s.share]), [["BBB", 60], ["AAA", 35]]);
  // The by-poll polled 800, not 1000.
  assert.deepEqual(by("2018 by-poll")?.bar?.segments.map((s) => [s.party?.key, s.share]), [["CCC", 50], ["BBB", 37.5]]);
  // Ten candidates: the leading five and the other five together. An independent is a candidate with the party the source printed.
  const tens = by("2021")?.bar?.segments;
  assert.equal(tens?.length, SEGMENTS);
  assert.deepEqual(tens?.slice(0, 5).map((s) => s.party?.key), ["AITC", "AAA", "BBB", "CCC", "IND"]);
  assert.equal(tens?.[5]?.candidates, 5);
  assert.equal(tens?.[5]?.votes, 150);
  assert.equal(by("2026")?.bar, null);
});

test("an election with no result at all, and one with counts but no votes polled, are drawn as what they are", () => {
  const h = withFixture((db) => readSeatHistory(db, 2));
  assert.deepEqual(h.results.map((r) => [r.label, r.evidence, r.bar === null]), [
    ["2026", "none", true],
    ["2021", "counted", true],
    ["2016", "none", true],
  ]);
  assert.equal(h.results[1]?.note, "The votes polled are not on record and no share was published, so the shares cannot be stated and no bar is drawn.");
  assert.equal(h.undeclared, 2);
  assert.deepEqual(h.held.map((b) => b.party?.key ?? null), [null, "AAA", null]);
  assert.equal(heldCaption(h), "3 elections, 2016 to 2026 — no change of hands on record; 2 with no declared winner");
});

test("a tie for first, as the registry stores it, is a counted margin of nothing", () => {
  const r = withFixture((db) => readSeatHistory(db, 3)).results[0];
  assert.deepEqual(r?.margin, { votes: 0, basis: "counted" });
  assert.equal(r?.statement, "Ann 2021 (AAA) and Bob 2021 (BBB) polled the same 400 votes; the source declares Ann 2021 the winner.");
});

test("a seat with no contest has no history", () => {
  assert.deepEqual(withFixture((db) => readSeatHistory(db, 4)), { held: [], handOffs: 0, undeclared: 0, results: [] });
  assert.deepEqual(withFixture((db) => readSeatHistory(db, 99999)), { held: [], handOffs: 0, undeclared: 0, results: [] });
});

const live = { skip: existsSync(process.env["MANDATE_DB_PATH"] ?? DEV_DB_PATH) ? false : "no .data/registry.db" };

test("on every seat of the registry the strip says what the headline and the tile say about hands, over the table's own rows", live, () => {
  const out = readRegistry((db) => {
    const ids = all<{ id: number }>(db, `SELECT id FROM place_version WHERE kind IN ('ac', 'pc') ORDER BY id`).map((r) => r.id);
    const elections = all<{ id: string }>(db, `SELECT id FROM election`).map((r) => r.id);
    const results = new Map(readSeats(db, { elections }).map((s) => [s.contestId, s]));
    const disagree: string[] = [];
    let checked = 0;
    for (const id of ids) {
      const brief = getPlaceBrief(db, id);
      const analysis = getPlaceAnalysis(db, id, {});
      if (brief === null || analysis === null || brief.contests.length === 0) continue;
      checked++;
      const h = readSeatHistory(db, id);
      const at = `${brief.place.canonicalName} (${id})`;
      if (brief.contests.map((c) => c.contestId).join() !== h.results.map((r) => r.contestId).join()) disagree.push(`${at}: rows`);
      // The winner, runner-up and margin are the seat results' own, in the real data as in the fixture.
      for (const r of h.results) {
        const s = results.get(r.contestId);
        const same =
          s !== undefined &&
          r.winner?.party.key === s.winner?.party.key &&
          r.runnerUp?.party.key === s.runnerUp?.party.key &&
          JSON.stringify(r.margin) === JSON.stringify(s.margin === null ? null : { ...s.margin });
        if (!same) disagree.push(`${at}: ${r.contestId} against the seat results`);
      }
      const tile = placeTiles(brief, analysis).find((t) => t.label === "Changed hands")?.value;
      // "Never" is said only where every election declared a winner and there are two to compare, as the strip says it.
      const none = h.held.length === 1 ? "not comparable" : h.undeclared === 0 ? "never" : "none on record";
      if (tile !== (h.handOffs === 0 ? none : times(h.handOffs))) disagree.push(`${at}: tile ${tile} against ${h.handOffs}`);
      // The headline says it in words, or not at all where the seat never changed hands.
      const sentence = placeHeadline(brief);
      const said = /changed hands (once|twice|[\d,]+ times)/.exec(sentence)?.[1];
      const every = /changed hands at every one of its/.test(sentence);
      if (said !== undefined ? said !== times(h.handOffs) : every ? h.handOffs !== h.held.length - 1 : h.handOffs !== 0) {
        disagree.push(`${at}: headline "${sentence}" against ${h.handOffs}`);
      }
      // Nor does it call an undeclared election's predecessor a holder, or count a gap as an election nobody lost.
      if (/changed hands 0 times|from the previous holder/.test(sentence)) disagree.push(`${at}: headline "${sentence}"`);
    }
    return { checked, disagree };
  });
  assert.ok(out.ok, "the registry could not be read");
  assert.ok(out.value.checked > 0, "no seat was checked");
  assert.deepEqual(out.value.disagree, []);
});

test("the winner, runner-up and margin are the seat results' own, contest by contest: one definition, not a second", () => {
  withFixture((db) => {
    for (const versionId of [1, 2, 3]) {
      const h = readSeatHistory(db, versionId);
      const seats = readSeats(db, {
        elections: ["xx-assembly-2011", "xx-assembly-2016", "xx-bypoll-ae-2018", "xx-assembly-2021", "xx-assembly-2026"],
      }).filter((s) => s.versionId === versionId);
      assert.equal(seats.length, h.results.length);
      for (const s of seats) {
        const r = h.results.find((x) => x.contestId === s.contestId);
        assert.ok(r !== undefined, `${s.contestId} is not in the history`);
        assert.deepEqual(r.winner === null ? null : { name: r.winner.name, party: r.winner.party }, s.winner === null ? null : { name: s.winner.name, party: s.winner.party }, `winner of ${s.contestId}`);
        assert.deepEqual(r.runnerUp === null ? null : { name: r.runnerUp.name, party: r.runnerUp.party }, s.runnerUp === null ? null : { name: s.runnerUp.name, party: s.runnerUp.party }, `runner-up of ${s.contestId}`);
        assert.deepEqual(r.margin, s.margin === null ? null : { ...s.margin }, `margin of ${s.contestId}`);
      }
    }
  });
});

/* ───────────────────────────── the page ───────────────────────────── */

const PATH = join(mkdtempSync(join(tmpdir(), "mandate-seat-history-")), "registry.db");
fixture(open(PATH)).close();

function render(segments: string, route = "/constituency"): string {
  try {
    return execFileSync(
      process.execPath,
      ["--import", "./ops/probe/render/register.mjs", "./ops/probe/render/render.mjs", route, "", segments],
      { cwd: ROOT, env: { ...process.env, MANDATE_DB_PATH: PATH }, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    throw new Error(`render ${route} ${segments} failed:\n${err.stderr ?? err.message}`);
  }
}

function at(html: string, marker: string, after = 0): number {
  const i = html.indexOf(marker, after);
  assert.notEqual(i, -1, `missing in the page: ${marker}`);
  return i;
}

const text = (html: string): string => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

/** The text of the first `<span>` of that class in a fragment, the spans inside it included. */
function spanText(fragment: string, cls: string): string {
  const open = at(fragment, `<span class="${cls}"`);
  let depth = 0;
  for (let i = open; i < fragment.length; ) {
    const next = /<span\b|<\/span>/g;
    next.lastIndex = i;
    const m = next.exec(fragment);
    assert.ok(m !== null, `unclosed span ${cls}`);
    depth += m[0] === "</span>" ? -1 : 1;
    i = m.index + m[0].length;
    if (depth === 0) return text(fragment.slice(open, i)).trim();
  }
  throw new Error(`unclosed span ${cls}`);
}

test("the strip is in the header under the sentence, oldest first, each block with its year and party printed", () => {
  const html = render("xx/assembly/alpha");
  const head = at(html, 'class="iei-head"');
  const sub = at(html, 'class="iei-sub"', head);
  const strip = at(html, '<figure class="iei-held">', sub);
  const tabs = at(html, 'class="iei-tabs"', strip);
  assert.ok(head < sub && sub < strip && strip < tabs);
  const blocks = html
    .slice(strip, tabs)
    .split('<li class="')
    .slice(1)
    .map((li) => [spanText(li, "iei-held-yr"), spanText(li, "iei-held-p"), li.slice(0, li.indexOf('"')).includes("iei-held-hand")]);
  assert.deepEqual(blocks, [
    ["2011", "AAA", false],
    ["2016", "BBB", true],
    ["2018 by-poll", "CCC", true],
    ["2021", "TMC", true],
    ["2026", "TMC", false],
  ]);
  assert.match(html.slice(strip, tabs), /5 elections, 2011 to 2026 — changed hands 3 times/);
  assert.match(html.slice(strip, tabs), /A rule between two blocks is where the seat changed hands\./);
  // The ink is the party's key's: TMC is AITC, which is curated, and not the derived colour the name TMC would give.
  const inks = [...html.slice(strip, tabs).matchAll(/class="iei-held-ink" style="background:([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(inks, ["AAA", "BBB", "CCC", "AITC", "AITC"].map(fillFor));
  assert.notEqual(fillFor("AITC"), fillFor("TMC"));
});

test("an election with no declared winner is a dashed block with the words, and the strip says what a dashed block is", () => {
  const html = render("xx/assembly/beta");
  const strip = html.slice(at(html, '<figure class="iei-held">'), at(html, "</figure>", at(html, '<figure class="iei-held">')));
  assert.equal((strip.match(/iei-held-none/g) ?? []).length, 2);
  assert.equal((strip.match(/no result declared/g) ?? []).length, 2);
  assert.match(strip, /A dashed block is an election with no declared winner\./);
  assert.doesNotMatch(strip, /A rule between two blocks/, "no rule is drawn and none is explained");
});

test("a bar per election sits above the election table, which keeps every one of its rows", () => {
  const html = render("xx/assembly/alpha");
  const panel = at(html, "Every election on record");
  const list = at(html, '<ol class="iei-res-list"', panel);
  const table = at(html, '<table class="iei-t">', list);
  assert.ok(panel < list && list < table);
  const rows = html.slice(list, table).split('<li class="iei-res-row">').slice(1);
  assert.equal(rows.length, 5);
  // Newest first: the table's order. The declared 2026 draws no bar, the other four do.
  assert.deepEqual(rows.map((r) => spanText(r, "iei-res-yr")), ["2026", "2021", "2018 by-poll", "2016", "2011"]);
  assert.deepEqual(rows.map((r) => r.includes('class="iei-res-bar"')), [false, true, true, true, true]);
  assert.equal((html.slice(table).match(/<tr>/g) ?? []).length, 1 + 5, "the table is the table it was: a head row and a row per election");
  // The key prints every party, so no segment is known by its colour alone.
  const key2016 = text(rows[3] ?? "");
  assert.match(key2016, /BBB 60\.0% AAA 35\.0% not itemised 5\.0%/);
  assert.match(text(rows[4] ?? ""), /AAA 50\.0% BBB 30\.0% CCC 10\.0% not itemised 10\.0%/);
  // The page says what a bar is where one is drawn, and says nothing of bars where none is: Beta has none to explain.
  assert.match(text(html.slice(panel, list)), /Each bar is the votes polled in that election\./);
  const beta = render("xx/assembly/beta");
  assert.doesNotMatch(beta, /Each bar is the votes polled/);
  assert.equal((beta.match(/class="iei-res-bar"/g) ?? []).length, 0);
});

test("a declared-only election says so in words beside the winner and the margin, and draws no bar", () => {
  const html = render("xx/assembly/alpha");
  const list = at(html, '<ol class="iei-res-list"');
  const row = html.slice(at(html, '<li class="iei-res-row">', list), at(html, "</li>", at(html, "iei-res-yr", list)));
  const t = text(row);
  assert.match(t, /Tom 2026 \(TMC\) won by a declared margin of 777 votes\./);
  assert.match(t, /Candidate vote counts are not on record for this election, so the shares are not on record and no bar is drawn\./);
  assert.doesNotMatch(row, /iei-res-bar|iei-res-seg|iei-res-rest/);
});

test("ten candidates are five and Others (5), and the row says so; the bar's widths are the shares", () => {
  const html = render("xx/assembly/alpha");
  const rows = html.split('<li class="iei-res-row">').slice(1);
  const row2021 = rows[1] ?? "";
  assert.match(text(row2021), /TMC 30\.0% AAA 20\.0% BBB 10\.0% CCC 8\.0% IND 6\.0% Others \(5\) 15\.0% not itemised 11\.0%/);
  assert.match(text(row2021), /The 5 lowest of 10 candidates are added together as Others \(5\)\./);
  const widths = [...row2021.matchAll(/class="iei-res-(?:seg|rest)[^"]*" style="(?:flex-grow:([\d.]+))/g)].map((m) => Number(m[1]));
  assert.deepEqual(widths.map((w) => Math.round(w * 1000) / 1000), [30, 20, 10, 8, 6, 15, 11]);
  // Each segment and each swatch of the key is the ink of the party's KEY: TMC is AITC, a curated green, and its short name
  // would have given a derived one. The tail has no party, so it has no party's ink: a hatch, with no inline colour.
  const keys = ["AITC", "AAA", "BBB", "CCC", "IND"].map(fillFor);
  assert.notEqual(fillFor("AITC"), fillFor("TMC"));
  const segs = [...row2021.matchAll(/class="iei-res-(seg|rest)([^"]*)" style="flex-grow:[\d.]+(?:;background:([^";]*))?"/g)];
  assert.deepEqual(segs.map((m) => m[3] ?? null), [...keys, null, null]);
  assert.deepEqual(segs.map((m) => `${m[1]}${m[2]}`.trim()), ["seg", "seg", "seg", "seg", "seg", "seg iei-res-others", "rest"]);
  const swatches = [...row2021.matchAll(/class="iei-sw( iei-sw-others| iei-sw-rest)?"(?: style="background:([^"]*)")?/g)];
  assert.deepEqual(swatches.map((m) => m[2] ?? null), [...keys, null, null]);
});

test("the winner's swatch in the table is inked by the party's key, as the strip, the bars and the maps are", () => {
  const html = render("xx/assembly/alpha");
  const table = html.slice(at(html, '<table class="iei-t">'));
  const inks = [...table.matchAll(/class="iei-sw" style="background:([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(inks, ["AITC", "AITC", "CCC", "BBB", "AAA"].map(fillFor));
});

test("a seat with no contest has no strip, no bars and a table that says so", () => {
  const html = render("xx/assembly/delta");
  assert.doesNotMatch(html, /iei-held|iei-res/);
  assert.match(html, /No contest is on record for Delta\./);
});

test("the Analysis lens does not carry the strip or the bars", () => {
  const html = render("xx/assembly/alpha", "/constituency/analysis");
  assert.doesNotMatch(html, /iei-held|iei-res/);
});
