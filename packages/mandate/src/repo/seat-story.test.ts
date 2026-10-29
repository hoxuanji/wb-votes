// What the seat page says, on literals and on every seat of the registry.
//
// The finding is a computed sentence, so the claims worth holding are the ones that cannot be made by eye: every number in it is in its inputs, a
// margin without counts is "declared", and nobody who stood in 2026 is said to have been defeated. They are held on every one of the registry's
// current seats, not on the three that were looked at.

import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { DEV_DB_PATH, openRead } from "../db/open.ts";
import { all, get } from "../db/index.ts";
import { auditFinding, plain } from "./finding.ts";
import { getPlaceBrief } from "./place.ts";
import { readSeatField } from "./seat-field.ts";
import { readSeatHistory } from "./seat-history.ts";
import { money, ordinal, panelScale, rosterLead, seatFinding, seatFlags, seatLimits, seatNumbers } from "./seat-story.ts";
import type { Widest } from "./seat-story.ts";
import { currentSeat } from "./testkit.ts";

const HAVE_DB = existsSync(process.env["MANDATE_DB_PATH"] ?? DEV_DB_PATH);
const live = { skip: HAVE_DB ? false : "no .data/registry.db — run npm run registry:ingest" };
const db = HAVE_DB ? openRead() : (null as unknown as ReturnType<typeof openRead>);

/** Where a one-election seat stands among the winners' margins of its election in its state: from the result table, by a route of its own. */
function widestOf(versionId: number, electionId: string, state: string, scope: string): Widest | null {
  const rows = all<{ vid: number; margin: number }>(
    db,
    `SELECT pv.id AS vid, ABS(r.margin) AS margin
       FROM result r JOIN contest c ON c.id = r.contest_id JOIN place_version pv ON pv.id = c.place_version_id
      WHERE c.election_id = ? AND r.is_winner = 1 AND r.revision = 0 AND r.margin IS NOT NULL AND pv.jurisdiction_id = ?
      ORDER BY margin DESC, vid`,
    electionId,
    state,
  );
  const at = rows.findIndex((r) => r.vid === versionId);
  return at < 0 ? null : { rank: at + 1, of: rows.length, scope };
}

function load(versionId: number) {
  const brief = getPlaceBrief(db, versionId)!;
  const history = readSeatHistory(db, versionId);
  const field = readSeatField(db, versionId);
  const only = brief.contests.length === 1 ? brief.contests[0] : undefined;
  const widest =
    only === undefined || brief.place.jurisdictionId === null
      ? null
      : widestOf(versionId, only.electionId, brief.place.jurisdictionId, "West Bengal " + (brief.place.kind === "pc" ? "Lok Sabha" : "Assembly"));
  return { brief, history, field, widest };
}
const seat = (placeId: string) => load(get<{ id: number }>(db, "SELECT id FROM place_version WHERE place_id = ? ORDER BY id DESC LIMIT 1", placeId)!.id);

test("Mekliganj's finding is a rise: the third try of a person the registry has followed through the seat", live, () => {
  const f = seatFinding(seat("wb.ac.001"));
  assert.equal(f.shape, "rise");
  assert.equal(plain(f.parts), "Dadhiram Ray BJP won Mekliganj at the third try: 3rd in 2016, 2nd in 2021, 1st in 2026, by a declared 29,584 votes.");
  const person = f.parts.find((p) => "person" in p);
  assert.deepEqual(person, { person: { id: "dadhiram-ray-a22815", name: "Dadhiram Ray" } });
});

test("Dinhata is narrow, and says who had how many votes of the 57 that decided it", live, () => {
  const s = seat("wb.ac.007");
  const f = seatFinding(s);
  assert.equal(f.shape, "narrow");
  assert.match(plain(f.parts), /decided by 57 votes in 2021: Nisith Pramanik BJP 1,16,035, Udayan Guha TMC 1,15,978\./);
  assert.ok(seatFlags(s).some((x) => /57 votes, 0\.02% of the votes polled/.test(x.text)), "the 57-vote election is not flagged");
  assert.equal(seatNumbers(s).closest?.votes, 57);
});

test("a one-election Lok Sabha seat says where its declared margin stands among the margins of its election", live, () => {
  const f = seatFinding(seat("wb.pc.10"));
  assert.equal(f.shape, "lone");
  assert.match(plain(f.parts), /Yusuf Pathan TMC won Baharampur in 2024, by a declared 85,022 votes, the 24th widest of the 42 West Bengal Lok Sabha margins\./);
});

test("a seat that changed hands at every election says so, in the headline's own words", live, () => {
  const f = seatFinding(seat("wb.ac.112"));
  assert.equal(f.shape, "hands");
  assert.match(plain(f.parts), /changed hands at every one of its 4 recorded elections/);
});

test("Falta has no 2026 result row: the finding is about the last election that has one, and the page says what the candidacy record says", live, () => {
  const s = seat("wb.ac.152");
  const f = seatFinding(s);
  const said = plain([...f.parts, ...(f.standfirst ?? [])]);
  assert.doesNotMatch(said, /won Falta in 2026/);
  assert.match(said, /No 2026 result is loaded; the candidacy record names Debangshu Panda as elected/);
  assert.doesNotMatch(JSON.stringify(seatNumbers(s)) + said, /109,?021|71\.2/, "the provisional claim's margin or share is printed");
  assert.ok(seatFlags(s).some((x) => x.rule === "a candidacy and a result that disagree"));
  assert.equal(seatNumbers(s).hero?.newerMissing, 2026);
});

test("every seat of the registry gets a finding that keeps the rules, and numbers that are numbers", live, () => {
  const seats = all<{ id: number }>(
    db,
    `SELECT a.id AS id FROM place_version a WHERE a.kind IN ('ac', 'pc') AND ${currentSeat(db, "a")} ORDER BY a.id`,
  );
  assert.ok(seats.length >= 300, `only ${seats.length} current seats`);
  const kinds = new Map<string, number>();
  for (const { id } of seats) {
    const s = load(id);
    const f = seatFinding(s);
    kinds.set(f.shape, (kinds.get(f.shape) ?? 0) + 1);
    const newest = s.history.results.find((r) => r.winner !== null);
    const problems = auditFinding(f, { haystack: JSON.stringify(s), hasCounts: newest?.evidence === "counted" });
    assert.deepEqual(problems, [], `seat ${id} (${s.brief.place.canonicalName}): ${plain(f.parts)}`);
    const nums = JSON.stringify(seatNumbers(s));
    assert.doesNotMatch(nums, /NaN|Infinity/, `seat ${id}: a figure is not a number`);
    seatLimits(s);
    seatFlags(s);
  }
  for (const k of ["rise", "narrow", "hands", "hold", "lone", "plain"]) assert.ok((kinds.get(k) ?? 0) > 0, `no seat has a ${k} finding: ${JSON.stringify([...kinds])}`);
});

test("the hero never shows a 2026 turnout, an electors total or a share of votes polled for an election that published no counts", live, () => {
  const s = seat("wb.ac.001");
  const n = seatNumbers(s);
  assert.equal(n.hero?.basis, "declared");
  assert.equal(n.share?.year, 2021, "the share tile is for the newest counted election");
  assert.equal(n.turnout?.year, 2021);
  assert.equal(n.turnout?.pending, 2026);
  assert.doesNotMatch(JSON.stringify(n), /96\.6|93\.0/);
  assert.equal(n.hero?.delta?.votes, 14899);
  assert.equal(n.share?.share.toFixed(2), "49.98");
});

test("a seat the record cannot fill more than one tile for merges them into one note of what is not on record", live, () => {
  const n = seatNumbers(seat("wb.pc.10"));
  assert.equal(n.share, null);
  assert.equal(n.turnout, null);
  assert.equal(n.hero?.spark.enough, false);
  assert.ok(n.absent !== null && n.absent.length >= 2);
  assert.equal(n.hero?.noDelta, "no comparison: one election on record");
});

test("one scale for every panel of a seat, never under 60, so the line at 50 has ground on both sides", live, () => {
  assert.equal(panelScale(seat("wb.ac.001").field), 60);
  assert.equal(panelScale({ elections: [], lookAlikes: [] }), 60);
});

test("the roster's lead sentence is computed from the field, and counts only those who declared", live, () => {
  const e = seat("wb.ac.001").field.elections[0]!;
  assert.equal(rosterLead(e), "11 candidates stood in 2026: 5 for named parties and 6 independents. Ages 33 to 74. Declared assets run from Rs 40,627 to Rs 4.37 crore.");
  assert.match(rosterLead(seat("wb.ac.112").field.elections[0]!), /of the 14 who declared\.$/);
});

test("what a seat's record cannot say is each stated once, and only where it is true", live, () => {
  const mek = seatLimits(seat("wb.ac.001")).map((l) => l.id);
  assert.deepEqual(mek.slice(0, 2), ["declared", "cap"]);
  assert.ok(mek.some((id) => id.startsWith("look-")) && mek.includes("census"));
  const bah = seatLimits(seat("wb.pc.10")).map((l) => l.id);
  assert.ok(!bah.includes("cap") && !bah.some((id) => id.startsWith("look-")), "a one-election seat is told about a five-candidate cap or look-alikes");
});

test("rupees are said the way a reader says them, and ordinals are right", () => {
  assert.equal(money(40627), "Rs 40,627");
  assert.equal(money(6337495), "Rs 63.37 lakh");
  assert.equal(money(43650807), "Rs 4.37 crore");
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 24].map(ordinal), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "24th"]);
});
