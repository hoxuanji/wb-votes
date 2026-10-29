// What the Analysis page says, on the registry's reference seats and on every seat in it.
//
// The finding is chosen by a printed rule, so the claims worth holding are the ones eyes cannot: every number in a sentence is in its inputs, the word
// "declared" sits beside a margin with no counts behind it, nothing about 2026 or 2024 is a share, a turnout or a percentage, and the rule that chose
// a finding is the one that holds. They are held on all of the registry's seats, and the rule distribution is asserted to use every rule.

import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { DEV_DB_PATH, openRead } from "../db/open.ts";
import { all } from "../db/index.ts";
import { auditFinding, plain } from "./finding.ts";
import { placeView } from "./place-view.ts";
import type { PlaceView } from "./place-view.ts";
import { MOVE_POINTS, placeStory } from "./place-story.ts";
import type { PlaceStory } from "./place-story.ts";
import { currentSeat } from "./testkit.ts";

const HAVE_DB = existsSync(process.env["MANDATE_DB_PATH"] ?? DEV_DB_PATH);
const live = { skip: HAVE_DB ? false : "no .data/registry.db — run npm run registry:ingest" };
const db = HAVE_DB ? openRead() : (null as unknown as ReturnType<typeof openRead>);

type Ac = Extract<PlaceView, { kind: "ac" }>;

async function load(placeId: string, body: "assembly" | "lok-sabha" = "assembly", asked: string | null = null): Promise<{ v: Ac; s: PlaceStory }> {
  const v = await placeView({ level: "seat", placeId, state: "wb", body }, {});
  assert.equal(v.kind, "ac", `${placeId} did not load`);
  const a = v as Ac;
  return { v: a, s: placeStory({ brief: a.brief, history: a.history, analysis: a.analysis, ranks: a.ranks, stateShares: a.stateShares, asked }) };
}

test("Mekliganj: the finding is the rise, the close one is 2016, and the margin ranks are the registry's", live, async () => {
  const { s } = await load("wb.ac.001");
  assert.equal(s.finding.shape, "rise");
  assert.equal(plain(s.finding.parts), "BJP’s share of the vote here rose from 2.5% in 2011 to 42.6% in 2021, and in 2026 it took the seat from TMC by a declared 29,584 votes.");
  assert.equal(s.closeAnswer, "2016 was the close one: 47th closest of 275");
  assert.deepEqual(
    s.hero?.ranks.map((r) => [r.year, r.rank?.rank, r.rank?.of]),
    [[2011, 241, 279], [2016, 47, 275], [2021, 98, 288], [2026, 176, 293]],
  );
  assert.equal(s.hero?.votes, 29584);
  assert.equal(s.hero?.delta?.votes, 14899);
  assert.equal(s.followed?.label, "BJP");
  assert.deepEqual(s.follow.map((f) => [f.label, f.share === null ? null : Math.round(f.share * 10) / 10, f.delta]), [["2011", 2.5, null], ["2016", 12.9, 10.4], ["2021", 42.6, 29.7], ["2026", null, null]]);
  assert.equal(s.wave.answer, "BJP followed the state's rise, and ran a little ahead of it");
  assert.equal(s.turnout.answer, "Mekliganj beat the district and the state at every election on record");
  assert.ok(s.notes.some((n) => /AIFB fell 34\.2 points/.test(n.text)));
  assert.ok(s.notes.every((n) => n.rule.startsWith("Rule:")), "a note does not print its rule");
});

test("the state's shares are the state page's: the same denominator, by party, by election", live, async () => {
  const { v } = await load("wb.ac.001");
  const round = (n: number | undefined): number | undefined => (n === undefined ? undefined : Math.round(n * 10) / 10);
  const e = (y: number): string => `wb-assembly-${y}`;
  assert.deepEqual([2011, 2016, 2021].map((y) => round(v.stateShares.get(e(y))?.get("AITC"))), [38.5, 44.9, 48]);
  assert.deepEqual([2011, 2016, 2021].map((y) => round(v.stateShares.get(e(y))?.get("BJP"))), [4.1, 10.2, 38]);
  assert.equal(v.stateShares.get(e(2026)), undefined, "a 2026 state share exists for an election that published no votes");
});

test("Dinhata: a counted margin of 57 votes is the finding, the closest of 288, and the turnout answer is by sign", live, async () => {
  const { s } = await load("wb.ac.007");
  assert.equal(s.finding.shape, "close");
  assert.equal(plain(s.finding.parts), "Dinhata was decided by 57 votes in 2021, the closest of 288 counted contests that year.");
  assert.equal(s.turnout.answer, "Dinhata ran 3.0 to 4.6 points below the district at every election on record");
});

test("Baharampur: one election, one declared margin among the 42, nothing drawn that is not on record, and the page says why", live, async () => {
  const { v, s } = await load("wb.pc.10", "lok-sabha");
  assert.equal(plain(s.finding.parts), "TMC won Baharampur in 2024 by a declared 85,022 votes. One election is on record, so nothing here moves.");
  assert.equal(s.hero?.rank?.rank, 19);
  assert.equal(s.hero?.rank?.of, 42);
  assert.equal(s.hero?.delta, null);
  assert.ok(s.notDrawn.length >= 3);
  assert.equal(s.wave.panels.length, 0, "an assembly baseline is drawn for a Lok Sabha seat");
  assert.equal(s.turnout.answer, null);
  assert.equal(v.analysis.place.districtName, null, "the state is called the district of a Lok Sabha seat");
  assert.equal(v.analysis.place.stateName, "West Bengal");
  assert.ok(s.leavesOut.some((l) => /Lok Sabha seat/.test(l)));
});

test("Falta: no 2026 result, and the finding says so without a share, a turnout or a hero from 2026", live, async () => {
  const { s } = await load("wb.ac.152");
  assert.match(plain(s.finding.parts), /No winner is declared for 2026\./);
  assert.equal(s.hero?.year, 2021, "the hero is the last election that has a margin");
  assert.deepEqual(s.follow.at(-1)?.note, "no result declared");
});

test("a party asked for by label is followed; an unknown one falls back to the finding's party", live, async () => {
  assert.equal((await load("wb.ac.001", "assembly", "TMC")).s.followed?.label, "TMC");
  assert.equal((await load("wb.ac.001", "assembly", "NOT-A-PARTY")).s.followed?.label, "BJP");
});

test("every seat of the registry gets a finding that keeps the rules, and every rule is used", live, async () => {
  const seats = all<{ placeId: string; kind: string }>(
    db,
    `SELECT a.place_id AS placeId, a.kind AS kind FROM place_version a WHERE a.kind IN ('ac', 'pc') AND ${currentSeat(db, "a")} ORDER BY a.id`,
  );
  assert.ok(seats.length >= 300, `only ${seats.length} current seats`);
  const shapes = new Map<string, number>();
  for (const seat of seats) {
    const { v, s } = await load(seat.placeId, seat.kind === "pc" ? "lok-sabha" : "assembly");
    shapes.set(s.finding.shape, (shapes.get(s.finding.shape) ?? 0) + 1);
    const newest = v.history.results.find((r) => r.winner !== null);
    const problems = auditFinding(s.finding, { haystack: JSON.stringify({ b: v.brief, h: v.history, r: [...v.ranks.values()], s: s.follow }), hasCounts: s.finding.shape === "close" || newest?.evidence === "counted" });
    assert.deepEqual(problems, [], `${seat.placeId}: ${plain(s.finding.parts)}`);
    const said = JSON.stringify(s);
    assert.doesNotMatch(said, /NaN|Infinity|undefined/, `${seat.placeId}: a figure is not a number`);
    // 2026 has no share, no turnout and no percentage: every row for an election with no candidate votes is a sentence.
    for (const r of s.ladder.filter((x) => x.evidence !== "counted")) assert.equal(r.segments.length, 0, `${seat.placeId}: a segment is drawn for ${r.label}`);
    for (const t of s.turnout.rows.filter((x) => x.pending)) assert.ok(t.seat === null && t.district === null && t.state === null, `${seat.placeId}: a withheld turnout has a number`);
    assert.ok(s.notes.length <= 3);
    for (const w of s.wave.panels) for (const row of w.rows.filter((x) => x.note === "no candidate votes published")) assert.ok(row.seat === null && row.state === null);
  }
  for (const k of ["close", "every", "rise", "held", "won"]) assert.ok((shapes.get(k) ?? 0) > 0, `no seat has a ${k} finding: ${JSON.stringify([...shapes])}`);
  assert.ok(MOVE_POINTS > 0);
});
