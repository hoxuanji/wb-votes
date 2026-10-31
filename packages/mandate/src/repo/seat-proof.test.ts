// The three proof figures, as data and words, on the registry's reference seats and on every seat in it.
//
// A figure is only worth having if it cannot disagree with the sentence it proves, so the claims held here are the ones eyes cannot check: the
// ruler is built exactly for the seats whose finding is narrow, and from the very totals the sentence prints; the list of margins is built exactly
// for the lone seats, its order is the sentence's rank and the Analysis's rank counted from the other end (ONE rank, place-baselines.ts); the strip
// has a dot for every seat the hero's rank is among and one ring; and every word they print keeps the finding's rules.

import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { DEV_DB_PATH, openRead } from "../db/open.ts";
import { all } from "../db/index.ts";
import { plain } from "./finding.ts";
import { FLAG_POINTS, NARROW_POINTS } from "./close-call.ts";
import { rankIn, widestRank } from "./place-baselines.ts";
import { placeStory } from "./place-story.ts";
import { placeView } from "./place-view.ts";
import type { PlaceView } from "./place-view.ts";
import { marginRankFigure, marginStripOf, photoFinishOf } from "./seat-proof.ts";
import { closestCounted, seatFinding, seatFlags, seatNumbers } from "./seat-story.ts";
import { currentSeat, marginRankBySql } from "./testkit.ts";

const HAVE_DB = existsSync(process.env["MANDATE_DB_PATH"] ?? DEV_DB_PATH);
const live = { skip: HAVE_DB ? false : "no .data/registry.db — run npm run registry:ingest" };
const db = HAVE_DB ? openRead() : (null as unknown as ReturnType<typeof openRead>);

type Ac = Extract<PlaceView, { kind: "ac" }>;

async function load(placeId: string, body: "assembly" | "lok-sabha" = "assembly") {
  const v = (await placeView({ level: "seat", placeId, state: "wb", body }, {})) as Ac;
  assert.equal(v.kind, "ac", `${placeId} did not load`);
  const story = { brief: v.brief, history: v.history, field: v.field, widest: v.widest };
  const finding = seatFinding(story);
  const analysis = placeStory({ brief: v.brief, history: v.history, analysis: v.analysis, ranks: v.ranks, stateShares: v.stateShares, asked: null });
  return {
    v,
    story,
    finding,
    analysis,
    finish: photoFinishOf(story, finding),
    rank: marginRankFigure(story, finding, v.margins),
    strip: marginStripOf(analysis, v.margins, v.brief),
  };
}

const seats = (): { placeId: string; kind: string }[] =>
  all<{ placeId: string; kind: string }>(db, `SELECT a.place_id AS placeId, a.kind AS kind FROM place_version a WHERE a.kind IN ('ac', 'pc') AND ${currentSeat(db, "a")} ORDER BY a.id`);

/** What a generated sentence may not say: the finding's own list, and the words this task adds to it. */
const BANNED = /\b(never|first time|only|defeated|lost to|beat|beaten|he|she|his|her|him)\b/i;

/** Every digit run of `said` occurs in `have`, commas ignored: a number is read from the inputs or the geometry, never typed. */
function unread(said: string, have: unknown): string[] {
  const hay = JSON.stringify(have).replace(/,/g, "");
  return (said.replace(/,/g, "").match(/\d+/g) ?? []).filter((run) => !hay.includes(run));
}

/** A figure with its sentences taken out, so that the check on them is not satisfied by themselves. */
const without = <T extends object>(o: T, keys: string[]): object => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));

test("a margin field is the one rank: closest first, ties by seat number, and the same rank the registry's rows give", live, async () => {
  const { v } = await load("wb.pc.10", "lok-sabha");
  const f = v.margins.get("ls-2024");
  assert.ok(f !== undefined);
  assert.equal(f.contests, 42);
  assert.equal(f.seats.length, 42);
  f.seats.forEach((s, i) => {
    assert.equal(s.rank, i + 1);
    if (i > 0) assert.ok(s.votes >= (f.seats[i - 1] as { votes: number }).votes, "not closest first");
    assert.equal(marginRankBySql(db, s.placeId, "ls-2024")?.rank, s.rank, `${s.name}: the rank is not the rows'`);
  });
  assert.equal(f.seats[0]?.name, "Bishnupur");
  assert.equal(f.seats[0]?.votes, 5_567);
  assert.equal(f.seats.at(-1)?.name, "Diamond Harbour");
  assert.equal(f.seats.at(-1)?.votes, 710_930);
  const versionId = (all<{ id: number }>(db, "SELECT id FROM place_version WHERE place_id = 'wb.pc.10'")[0] as { id: number }).id;
  const here = rankIn(f, versionId);
  assert.equal(here?.rank, 19);
  assert.equal(here?.of, 42);
  assert.equal(widestRank(f, versionId), 24, "the sentence's number is the rank counted from the other end");
  assert.equal(19 + 24, 42 + 1);
  assert.ok(f.seats.every((s) => s.href.startsWith("/constituency/wb/lok-sabha/")), "a seat's address is not its body's");
});

test("an election with a contest that declared no winner is a field whose contests outnumber its seats", live, async () => {
  const { v } = await load("wb.ac.001");
  const f = v.margins.get("wb-assembly-2026");
  assert.ok(f !== undefined);
  assert.equal(f.contests, 294);
  assert.equal(f.seats.length, 293, "Falta has no result row, so it has no margin to rank");
  assert.ok(!f.seats.some((s) => s.name === "Falta"));
});

test("Dinhata's photo finish: 116,035 against 115,978, a window of 115,900 to 116,100, and a ruler that says it is not a bar", live, async () => {
  const { finish, finding } = await load("wb.ac.007");
  assert.equal(finding.shape, "narrow");
  assert.ok(finish !== null);
  assert.equal(finish.year, 2021);
  assert.equal(finish.winner.votes, 116_035);
  assert.equal(finish.runnerUp.votes, 115_978);
  assert.equal(finish.winner.display, "Nisith Pramanik");
  assert.equal(finish.gap, 57);
  assert.equal(finish.share, "0.02");
  assert.equal(finish.geometry.ruler.lo, 115_900);
  assert.equal(finish.geometry.ruler.hi, 116_100);
  assert.match(finish.caption, /It is a ruler and not a bar, so it does not start at zero\./);
  assert.match(finish.caption, /1,15,900 to 1,16,100 votes/);
  assert.ok(finish.winner.personId !== null && finish.runnerUp.personId !== null, "a candidate is not a link");
});

test("Baharampur's list of margins: 42 bars widest first, its own the 24th, all declared and so all dashed", live, async () => {
  const { rank, finding, v } = await load("wb.pc.10", "lok-sabha");
  assert.equal(finding.shape, "lone");
  assert.ok(rank !== null && rank.shape === "drawn");
  assert.equal(rank.of, 42);
  assert.equal(rank.rank, 24);
  assert.equal(rank.rank, v.widest?.rank, "the figure's place is not the sentence's");
  assert.equal(rank.self.name, "Baharampur");
  assert.equal(rank.self.votes, 85_022);
  assert.equal(rank.widest.name, "Diamond Harbour");
  assert.equal(rank.narrowest.name, "Bishnupur");
  assert.equal(rank.bars[0]?.frac, 1);
  assert.ok(rank.bars.every((b) => b.dashed && b.basis === "declared"));
  assert.match(rank.caption, /Every bar is dashed, because every margin was declared by the source with no counts behind it\./);
  assert.deepEqual(rank.keys.map((k) => [k.code, k.n]), [["TMC", 29], ["BJP", 12], ["INC", 1]]);
  assert.equal(rank.align, "center");
});

test("the strip for Baharampur is 42 hollow dots on a log axis from 5,000 to 10 lakh with the seat ringed, 19th closest", live, async () => {
  const { strip } = await load("wb.pc.10", "lok-sabha");
  assert.ok(strip !== null);
  assert.equal(strip.of, 42);
  assert.equal(strip.noMargin, 0);
  assert.equal(strip.left, null);
  assert.equal(strip.rank.rank, 19);
  assert.equal(strip.strip.lo, 5_000);
  assert.equal(strip.strip.hi, 1_000_000);
  assert.equal(strip.strip.dots.length, 42);
  assert.equal(strip.strip.dots.filter((d) => d.self).length, 1);
  assert.ok(strip.strip.dots.every((d) => d.basis === "declared"), "a declared margin is not a hollow dot");
  assert.equal(strip.declared, 42);
  assert.match(strip.caption, /Every dot is hollow/);
  assert.match(strip.ariaLabel, /19th closest of the 42 West Bengal Lok Sabha margins of 2024/);
});

test("2026's strip leaves Falta off and says so, in words, with a count", live, async () => {
  const { strip } = await load("wb.ac.007");
  assert.ok(strip !== null);
  assert.equal(strip.of, 293);
  assert.equal(strip.contests, 294);
  assert.equal(strip.noMargin, 1);
  assert.match(strip.left ?? "", /^1 of the 294 contests of 2026 has no declared winner and so no margin, and no dot\./);
  assert.equal(strip.strip.dots.length, 293);
  assert.ok(!JSON.stringify(strip).includes("109,021") && !JSON.stringify(strip).includes("109021"), "Falta's press margin is printed");
});

test("every seat of the registry draws the figures its finding needs, and no seat draws one it does not", live, async () => {
  const kinds = new Map<string, number>();
  for (const seat of seats()) {
    const s = await load(seat.placeId, seat.kind === "pc" ? "lok-sabha" : "assembly");
    const id = `${seat.placeId} ${s.v.brief.place.canonicalName}`;
    kinds.set(s.finding.shape, (kinds.get(s.finding.shape) ?? 0) + 1);

    // The ruler is the narrow finding's, and only its.
    assert.equal(s.finish !== null, s.finding.shape === "narrow", `${id}: a ${s.finding.shape} seat ${s.finish === null ? "has no" : "has a"} ruler`);
    assert.equal(s.rank !== null, s.finding.shape === "lone", `${id}: a ${s.finding.shape} seat ${s.rank === null ? "has no" : "has a"} list of margins`);

    if (s.finish !== null) {
      const sentence = plain(s.finding.parts);
      const close = closestCounted(s.story.brief, s.story.history);
      // The totals are the sentence's totals, the gap is the finding's margin, and the share is the Flagged rule's own figure.
      assert.ok(close !== null && close.share < NARROW_POINTS, `${id}: not a close call by the one rule`);
      assert.ok(sentence.includes(new Intl.NumberFormat("en-IN").format(s.finish.winner.votes)), `${id}: the sentence does not print the winner's total`);
      assert.ok(sentence.includes(new Intl.NumberFormat("en-IN").format(s.finish.runnerUp.votes)), `${id}: the sentence does not print the runner-up's total`);
      assert.equal(s.finish.gap, Math.abs(close.result.margin?.votes ?? NaN));
      assert.equal(s.finish.gap, seatNumbers(s.story).closest?.votes);
      assert.ok(close.share < FLAG_POINTS);
      assert.ok(seatFlags(s.story).some((f) => f.text.includes(`${s.finish?.share}% of the votes polled`)), `${id}: the Flagged note does not give the ruler's share`);
      // Counted, and never an election with no counts to put on a ruler.
      assert.equal(s.story.history.results.find((r) => r.contestId === close.result.contestId)?.evidence, "counted", `${id}: a ruler for an election with no counts`);
      const r = s.finish.geometry.ruler;
      for (const n of [s.finish.winner.votes, s.finish.runnerUp.votes]) assert.ok(n >= r.lo + r.step && n <= r.hi - r.step, `${id}: ${n} is not inside the window`);
      assert.ok(s.finish.geometry.bars.ticks[0] === 0 && s.finish.geometry.bars.max >= Math.max(s.finish.winner.votes, s.finish.runnerUp.votes));
      assert.ok(s.finish.geometry.bars.fracA > 0 && s.finish.geometry.bars.fracA <= 1);
      const said = `${s.finish.caption} ${s.finish.ariaLabel}`;
      assert.doesNotMatch(said, BANNED, `${id}: ${said}`);
      assert.deepEqual(unread(said, [without(s.finish, ["caption", "ariaLabel"]), s.story.brief.place.canonicalName]), [], `${id}: a number in the ruler's words is in none of its inputs`);
      assert.doesNotMatch(said, /NaN|undefined|Infinity/);
    }

    if (s.rank !== null) {
      assert.ok(s.rank.shape === "drawn", `${id}: ${JSON.stringify(s.rank)}`);
      if (s.rank.shape === "drawn") {
        const w = s.v.widest;
        assert.ok(w !== null);
        assert.equal(s.rank.rank, w.rank, `${id}: the figure's place is not the sentence's`);
        assert.equal(s.rank.of, w.of);
        assert.equal(s.rank.bars.length, w.of);
        assert.equal(s.rank.bars.filter((b) => b.self).length, 1);
        assert.equal(s.rank.bars[s.rank.rank - 1]?.self, true, `${id}: the outlined bar is not at its place`);
        // Widest first, from zero, and the tallest is the whole height.
        s.rank.bars.forEach((b, i) => {
          if (i > 0) assert.ok(b.votes <= (s.rank?.shape === "drawn" ? (s.rank.bars[i - 1] as { votes: number }).votes : 0));
          assert.ok(b.frac > 0 && b.frac <= 1);
          assert.equal(b.dashed, b.basis === "declared");
        });
        assert.equal(s.rank.bars[0]?.frac, 1);
        // The one rank, from the other end: the Analysis's closest-first rank and this widest-first one add to one more than the field.
        const closest = s.analysis.hero?.rank;
        assert.ok(closest !== undefined && closest !== null);
        assert.equal(closest.rank + s.rank.rank, closest.of + 1, `${id}: two ranks`);
        const said = `${s.rank.caption} ${s.rank.ariaLabel}`;
        assert.doesNotMatch(said, BANNED, `${id}: ${said}`);
        assert.deepEqual(unread(said, [without(s.rank, ["caption", "ariaLabel"]), s.v.brief.place.canonicalName]), [], `${id}: a number in the list's words is in none of its inputs`);
      }
    }

    if (s.strip !== null) {
      const hero = s.analysis.hero;
      assert.ok(hero !== null && hero.rank !== null);
      assert.equal(s.strip.rank.rank, hero.rank.rank, `${id}: the strip's rank is not the hero's`);
      assert.equal(s.strip.of, hero.rank.of);
      assert.equal(s.strip.strip.dots.length + s.strip.strip.unplaced, s.strip.of);
      assert.equal(s.strip.strip.dots.filter((d) => d.self).length, s.strip.strip.unplaced === 0 || s.strip.self.votes > 0 ? 1 : 0, `${id}: not exactly one ring`);
      assert.equal(s.strip.self.votes, hero.votes, `${id}: the ringed dot is not the hero's margin`);
      assert.equal(s.strip.self.rank, hero.rank.rank);
      assert.equal(s.strip.noMargin, s.strip.contests - s.strip.of);
      assert.equal(s.strip.rows.length, s.strip.of);
      s.strip.rows.forEach((r, i) => {
        assert.equal(r.rank, i + 1);
        if (i > 0) assert.ok(r.votes >= (s.strip?.rows[i - 1] as { votes: number }).votes, "not closest first");
      });
      assert.equal(s.strip.declared + s.strip.counted, s.strip.of);
      for (const d of s.strip.strip.dots) assert.equal(d.basis === "declared", s.strip.rows.find((r) => r.placeId === d.id)?.basis === "declared");
      // A seat the election did not declare a winner for has no dot, and the words say how many.
      assert.equal(s.strip.left !== null, s.strip.noMargin > 0 || s.strip.strip.unplaced > 0, `${id}: what is left off is not said`);
      const said = `${s.strip.caption} ${s.strip.ariaLabel} ${s.strip.selfLabel} ${s.strip.left ?? ""}`;
      assert.doesNotMatch(said, BANNED, `${id}: ${said}`);
      assert.doesNotMatch(said, /NaN|undefined|Infinity|109,021|1,09,021|109021/, `${id}: ${said}`);
      assert.deepEqual(unread(said, [without(s.strip, ["caption", "ariaLabel", "selfLabel", "left"]), s.v.brief.place.canonicalName]), [], `${id}: a number in the strip's words is in none of its inputs`);
    }
  }
  for (const k of ["narrow", "lone"]) assert.ok((kinds.get(k) ?? 0) > 0, `no seat has a ${k} finding: ${JSON.stringify([...kinds])}`);
});

test("a Lok Sabha seat that is not Baharampur is ranked by the same field: the 42 are drawn once each and the places run 1 to 42", live, async () => {
  const places = new Set<number>();
  for (let n = 1; n <= 42; n++) {
    const s = await load(`wb.pc.${String(n).padStart(2, "0")}`, "lok-sabha");
    assert.ok(s.rank !== null && s.rank.shape === "drawn", `wb.pc.${n}`);
    if (s.rank !== null && s.rank.shape === "drawn") {
      places.add(s.rank.rank);
      assert.deepEqual([...new Set(s.rank.bars.map((b) => b.id))].length, 42);
    }
  }
  assert.equal(places.size, 42, "two seats share a place");
});
