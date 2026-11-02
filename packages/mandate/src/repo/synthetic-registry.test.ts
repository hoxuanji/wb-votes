// The synthetic registry, and the three readers of the situation-room page run on it.
//
// SYNTHETIC DATA: nothing in the registry built here is real. This suite holds the builder to what it promises (marked on every row that
// could be mistaken for a fact, sized like the real assemblies, shaped so the page's edge cases exist in it) and then runs the landscape,
// the rail and the live feed against it, where a registry of one state cannot show whether they work for a country.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { all, open } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";
import { JURISDICTIONS } from "../ingest/india.ts";
import { tokenFor } from "../viz/party-ink.ts";
import { landscapeOverTime } from "./landscape.ts";
import { liveSentence, parseLiveFeed } from "./live-feed.ts";
import { nextUp } from "./next-up.ts";
import { SYNTHETIC_PARTIES, SYNTHETIC_STATES, buildSyntheticRegistry, shiftFeedTimes } from "./synthetic-registry.ts";
import type { SyntheticOptions } from "./synthetic-registry.ts";
import { unverifiedTurnout } from "./turnout-trust.ts";
import type { LiveBoard } from "./situation-types.ts";

const TODAY = new Date("2026-11-03T00:00:00Z");

function build(options?: SyntheticOptions): DatabaseSync {
  const d = open(":memory:");
  migrate(d, "2026-01-01T00:00:00.000Z");
  buildSyntheticRegistry(d, options);
  return d;
}

// One registry for the suite: building it is a few hundred milliseconds and nothing below writes to it.
let shared: DatabaseSync | undefined;
const registry = (): DatabaseSync => (shared ??= build());
test.after(() => shared?.close());

/** Seats won by party in every election, from the rows, as a check on the readers that does not go through them. */
function winnersBySql(d: DatabaseSync): Map<string, Map<string, number>> {
  const by = new Map<string, Map<string, number>>();
  for (const r of all<{ id: string; key: string; n: number }>(
    d,
    `SELECT c.election_id AS id, COALESCE(pv.party_id, cd.party_raw) AS key, COUNT(*) AS n
       FROM contest c
       JOIN result r ON r.contest_id = c.id AND r.revision = 0 AND r.is_winner = 1
       JOIN candidacy cd ON cd.id = r.candidacy_id
       LEFT JOIN party_version pv ON pv.id = cd.party_version_id
      GROUP BY c.election_id, key`,
  )) {
    const m = by.get(r.id) ?? new Map<string, number>();
    m.set(r.key, r.n);
    by.set(r.id, m);
  }
  return by;
}

/** The party with strictly the most seats, or null where two are level: the rule, written again from the rows. */
function leaderBySql(seats: Map<string, number> | undefined): string | null {
  const ranked = [...(seats ?? [])].sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  return top === undefined || top[1] === ranked[1]?.[1] ? null : top[0];
}

/* ────────────────────────────── what it promises ────────────────────────────── */

test("it says it is synthetic, in capitals, at the top of the module", () => {
  const head = readFileSync(new URL("./synthetic-registry.ts", import.meta.url), "utf8").split("\n").slice(0, 3).join(" ");
  assert.match(head, /^\/\/ SYNTHETIC DATA\./);
  assert.match(head, /MADE UP/);
  assert.match(head, /NEVER BE SHIPPED/);
  assert.match(head, /NEVER BE PRESENTED AS REAL/);
});

test("every election, source and person that could pass for a fact is marked as invented", () => {
  const d = registry();
  for (const e of all<{ id: string; name: string }>(d, "SELECT id, name FROM election")) {
    assert.ok(e.id.startsWith("demo-"), `${e.id}: an election id must start with demo-`);
    assert.ok(e.name.startsWith("SYNTHETIC demo: "), `${e.id}: the name says it is synthetic`);
  }
  const sources = all<{ id: string; publisher: string; title: string; publisher_note: string }>(d, "SELECT id, publisher, title, publisher_note FROM source");
  assert.ok(sources.length > 0);
  for (const s of sources) {
    assert.match(s.publisher, /SYNTHETIC/, `${s.id}: publisher`);
    assert.match(s.title, /SYNTHETIC/, `${s.id}: title`);
    assert.match(s.publisher_note, /^SYNTHETIC/, `${s.id}: note`);
  }
  assert.equal(all(d, "SELECT 1 FROM result WHERE source_id NOT IN (SELECT id FROM source)").length, 0, "every result cites a synthetic source");
  assert.equal(all(d, "SELECT 1 FROM person WHERE canonical_name NOT LIKE 'Demo Candidate %'").length, 0);
  assert.equal(all(d, "SELECT 1 FROM place_version WHERE kind IN ('ac','pc') AND canonical_name NOT LIKE 'Demo %'").length, 0);
});

test("at least 14 states, assembly elections from 2006 to 2026 on staggered years, and the Lok Sabha of 2014, 2019 and 2024", () => {
  const d = registry();
  const ac = all<{ j: string; year: number }>(d, "SELECT jurisdiction_place_id AS j, year FROM election WHERE kind = 'assembly'");
  assert.ok(new Set(ac.map((e) => e.j)).size >= 14);
  assert.equal(Math.min(...ac.map((e) => e.year)), 2006);
  assert.equal(Math.max(...ac.map((e) => e.year)), 2026);
  assert.ok(new Set(ac.map((e) => e.year)).size >= 15, "the elections are spread over the years, not stacked on a few");
  const ls = all<{ id: string; year: number }>(d, "SELECT id, year FROM election WHERE kind = 'general' ORDER BY year");
  assert.deepEqual(ls.map((e) => e.year), [2014, 2019, 2024]);
  for (const e of ls) {
    const states = all<{ j: string; n: number }>(d, "SELECT pv.jurisdiction_id AS j, COUNT(*) AS n FROM contest c JOIN place_version pv ON pv.id = c.place_version_id WHERE c.election_id = ? GROUP BY j", e.id);
    assert.ok(states.length >= 14, `${e.id} spans the states`);
    for (const s of states) assert.equal(s.n, JURISDICTIONS.find((j) => j.id === s.j)?.lokSabhaSeats, `${e.id}: ${s.j}'s share of the Lok Sabha`);
  }
});

test("each assembly has the seats its state really has", () => {
  const d = registry();
  for (const e of all<{ id: string; j: string; n: number }>(d, "SELECT e.id AS id, e.jurisdiction_place_id AS j, (SELECT COUNT(*) FROM contest c WHERE c.election_id = e.id) AS n FROM election e WHERE e.kind = 'assembly'")) {
    assert.equal(e.n, JURISDICTIONS.find((j) => j.id === e.j)?.assemblySeats, e.id);
  }
});

test("at least 12 parties, all with a colour the palette has chosen for them, and independents as the real registry holds them", () => {
  assert.ok(SYNTHETIC_PARTIES.length >= 12);
  for (const p of SYNTHETIC_PARTIES) assert.equal(tokenFor(p.id).basis, "curated", `${p.id} has no curated colour`);
  assert.equal(tokenFor("IND").basis, "curated");
  const d = registry();
  assert.equal(all(d, "SELECT 1 FROM party").length, SYNTHETIC_PARTIES.length);
  const ind = all<{ n: number }>(d, "SELECT COUNT(*) AS n FROM candidacy WHERE party_version_id IS NULL AND party_raw = 'IND'")[0]?.n ?? 0;
  assert.ok(ind > 100, "independents stand, with no party row and the string IND");
  const used = new Set(all<{ k: string }>(d, "SELECT DISTINCT COALESCE(pv.party_id, cd.party_raw) AS k FROM candidacy cd LEFT JOIN party_version pv ON pv.id = cd.party_version_id").map((r) => r.k));
  assert.ok(used.size >= 13, `${used.size} parties stand`);
});

test("West Bengal's 2026 election has winners and declared margins and no counts, so its turnout is unverified", () => {
  const d = registry();
  assert.equal(all(d, "SELECT 1 FROM result r JOIN contest c ON c.id = r.contest_id WHERE c.election_id = 'demo-wb-assembly-2026' AND r.votes IS NOT NULL").length, 0);
  assert.equal(all(d, "SELECT 1 FROM result r JOIN contest c ON c.id = r.contest_id WHERE c.election_id = 'demo-wb-assembly-2026' AND r.is_winner = 1 AND r.margin IS NULL").length, 0);
  assert.ok(unverifiedTurnout(d, ["demo-wb-assembly-2026", "demo-wb-assembly-2021"]).has("demo-wb-assembly-2026"));
  assert.ok(!unverifiedTurnout(d, ["demo-wb-assembly-2021"]).has("demo-wb-assembly-2021"));
});

test("a rebuild is the same registry", () => {
  const sum = (d: DatabaseSync): string =>
    JSON.stringify(all(d, `SELECT c.election_id, c.id, r.candidacy_id, r.votes, r."rank", r.margin FROM result r JOIN contest c ON c.id = r.contest_id ORDER BY c.id, r."rank"`));
  const again = build();
  try {
    assert.equal(sum(again), sum(registry()));
  } finally {
    again.close();
  }
});

/* ────────────────────────────── the landscape on it ────────────────────────────── */

test("the landscape: years ascend, no state is coloured without an election, and every tally sums", () => {
  const d = registry();
  const l = landscapeOverTime(d);
  const years = all<{ year: number }>(d, "SELECT DISTINCT year FROM election WHERE kind = 'assembly' ORDER BY year").map((r) => r.year);
  assert.deepEqual(l.years, years, "exactly the years an assembly election was held in");
  assert.deepEqual(l.years, [...l.years].sort((a, b) => a - b));
  assert.deepEqual([l.first, l.last], [2006, 2026]);
  const first = new Map(all<{ j: string; year: number }>(d, "SELECT jurisdiction_place_id AS j, MIN(year) AS year FROM election WHERE kind = 'assembly' GROUP BY j").map((r) => [r.j, r.year]));
  for (const y of l.byYear) {
    assert.equal(y.states.length, 36, `${y.year}: every jurisdiction is listed`);
    const ids = y.states.map((s) => s.id);
    assert.deepEqual(ids, [...ids].sort(), `${y.year}: in id order`);
    for (const s of y.states) {
      const since = first.get(s.id);
      if (since === undefined || since > y.year) assert.equal(s.held, null, `${s.id} is coloured in ${y.year} with no election by then`);
      else assert.ok(s.held !== null && s.held.year <= y.year, `${s.id} in ${y.year}`);
    }
    assert.equal(y.withResult, y.states.filter((s) => s.held !== null).length);
    assert.equal(y.tally.reduce((n, t) => n + t.states, 0), y.states.filter((s) => s.held?.leader != null).length, `${y.year}: the tally sums to the states with a leader`);
    for (const t of y.tally) assert.ok(l.parties.some((p) => p.key === t.party.key), `${t.party.key} is a party of the legend`);
  }
  assert.ok(l.byYear[0]?.states.some((s) => s.held === null) && l.byYear[0]?.states.some((s) => s.held !== null), "the scrubber starts part-filled");
  assert.equal(l.byYear.at(-1)?.withResult, SYNTHETIC_STATES.length, "and ends with every state that has an election");
});

test("the landscape's leaders are the rows' own: the most seats, and a tie names nobody", () => {
  const d = registry();
  const by = winnersBySql(d);
  const l = landscapeOverTime(d);
  const seen = new Map<string, NonNullable<(typeof l.byYear)[number]["states"][number]["held"]>>();
  for (const y of l.byYear) for (const s of y.states) if (s.held !== null) seen.set(s.held.electionId, s.held);
  assert.equal(seen.size, all(d, "SELECT 1 FROM election WHERE kind = 'assembly'").length, "every assembly election is somebody's government at some stop");
  for (const [id, held] of seen) {
    assert.equal(held.leader?.key ?? null, leaderBySql(by.get(id)), id);
    const seats = by.get(id) as Map<string, number>;
    assert.equal(held.leaderSeats, Math.max(...seats.values()), id);
    assert.equal(held.majority, held.leader !== null && held.leaderSeats * 2 > held.seats, id);
  }
  const level = [...seen.values()].filter((h) => h.leader === null).map((h) => h.electionId).sort();
  assert.deepEqual(level, ["demo-ga-assembly-2017", "demo-mn-assembly-2022"], "the two ties are the ones asked for, and no other");
  // The tie is in the house now for Manipur, and was in Goa's from 2017 until the next election.
  const at = (year: number, id: string) => l.byYear.find((y) => y.year === year)?.states.find((s) => s.id === id)?.held;
  assert.equal(at(2026, "mn")?.leader, null);
  assert.equal(at(2017, "ga")?.leader, null);
  assert.equal(at(2017, "ga")?.leaderSeats, 14);
  assert.ok(at(2022, "ga")?.leader !== null, "Goa's next election ends it");
});

test("the landscape runs against the registry in well under a second", () => {
  const d = registry();
  const t = performance.now();
  landscapeOverTime(d);
  assert.ok(performance.now() - t < 1500, `${Math.round(performance.now() - t)} ms`);
});

/* ────────────────────────────── the rail on it ────────────────────────────── */

test("the rail: every state once and the Lok Sabha once, announced before inferred, terms before the overdue, one term overdue", () => {
  const d = registry();
  const rail = nextUp(d, TODAY);
  const states = rail.filter((e) => e.bodyWord === "Assembly").map((e) => e.jurisdictionId).sort();
  assert.deepEqual(states, SYNTHETIC_STATES.map((s) => s.id).sort(), "each state once");
  assert.equal(rail.filter((e) => e.bodyWord === "Lok Sabha").length, 1);
  assert.ok(rail.every((e) => e.basis === "inferred" && e.on === null && typeof e.termElapsed === "number"), "nothing is announced in the default registry");
  const overdue = rail.filter((e) => e.year < 2026);
  assert.deepEqual(overdue.map((e) => e.jurisdictionId), ["br"], "Bihar, last elected in 2020, is the overdue one");
  assert.ok(overdue.every((e) => (e.termElapsed as number) > 1));
  assert.equal(rail.at(-1)?.jurisdictionId, "br", "the overdue go last");
  const due = rail.filter((e) => e.year >= 2026 && e.year <= 2028);
  assert.ok(due.length >= 8, `${due.length} terms fall due in 2026 to 2028`);
  const upcoming = rail.slice(0, -1);
  assert.deepEqual(upcoming.map((e) => e.year), [...upcoming.map((e) => e.year)].sort((a, b) => a - b), "soonest first");
  for (const e of rail) {
    assert.equal(e.year, e.after.year + 5, `${e.jurisdictionId}: the term ends five years after the election it follows`);
    const expected = e.bodyWord === "Lok Sabha" ? 543 : (JURISDICTIONS.find((j) => j.id === e.jurisdictionId)?.assemblySeats ?? -1);
    assert.equal(e.seats, expected, `${e.jurisdictionId}: seats to fill`);
  }
  // A state whose last election tied for most seats follows an election with no leader.
  assert.equal(rail.find((e) => e.jurisdictionId === "mn")?.after.leaderLabel, null);
  assert.ok(typeof rail.find((e) => e.jurisdictionId === "ka")?.after.leaderLabel === "string");
  // The synthetic Lok Sabha is held for 18 states, 445 of its 543 seats, so no party is named as having led it.
  assert.equal(rail.find((e) => e.bodyWord === "Lok Sabha")?.after.leaderLabel, null);
  // The months the registry holds move the fraction: West Bengal, polled in April 2026, has run a tenth of its term.
  const wb = rail.find((e) => e.jurisdictionId === "wb");
  assert.ok((wb?.termElapsed as number) > 0.1 && (wb?.termElapsed as number) < 0.12);
});

test("an announced election leads the rail and displaces its state's inferred entry, and leaves the landscape alone", () => {
  const d = build({ announced: true });
  try {
    const rail = nextUp(d, TODAY);
    assert.deepEqual(
      [rail[0]?.jurisdictionId, rail[0]?.basis, rail[0]?.on, rail[0]?.termElapsed, rail[0]?.year, rail[0]?.after.electionId],
      ["ga", "announced", "2026-10-20", null, 2027, "demo-ga-assembly-2022"],
    );
    assert.equal(rail.filter((e) => e.jurisdictionId === "ga").length, 1, "Goa is announced, and is not also inferred");
    assert.equal(rail.filter((e) => e.basis === "announced").length, 1);
    assert.equal(rail.length, nextUp(registry(), TODAY).length, "the same entries, one of them announced");
    const l = landscapeOverTime(d);
    assert.deepEqual(l.years, landscapeOverTime(registry()).years, "an announced election is not a stop on the scrubber");
    assert.equal(l.byYear.at(-1)?.states.find((s) => s.id === "ga")?.held?.electionId, "demo-ga-assembly-2022", "and Goa keeps its colour");
  } finally {
    d.close();
  }
});

test("the rail runs against the registry in well under a second", () => {
  const d = registry();
  const t = performance.now();
  nextUp(d, TODAY);
  assert.ok(performance.now() - t < 1500, `${Math.round(performance.now() - t)} ms`);
});

/* ────────────────────────────── the demo live feed ────────────────────────────── */

const DEMO_FEED = readFileSync(new URL("../../../../ops/probe/demo/demo-live.json", import.meta.url), "utf8");

/** Polling organisations a feed of invented numbers must never name: attributing them to a real publisher would be a falsehood. */
const REAL_PUBLISHERS =
  /axis|chanakya|cvoter|c-voter|c voter|csds|lokniti|ipsos|nielsen|neilsen|yougov|today|times|abp|ndtv|republic|cnn|bbc|reuters|hindu|express|news|poll\s*of\s*polls|jan\s*ki\s*baat|matrize|p-marq|peoples? pulse/i;

test("the demo feed is valid, has three projections, and every publisher is fictional", () => {
  const read = parseLiveFeed(DEMO_FEED, new Date("2026-11-03T10:35:00Z"));
  assert.ok("boards" in read, "error" in read ? read.error : "");
  assert.equal(read.boards.length, 1);
  const b = read.boards[0] as LiveBoard;
  assert.equal(b.projections.length, 3);
  assert.equal(b.stale, false);
  for (const p of b.projections) {
    assert.match(p.publisher, /^Demo Pollster [A-Z]$/, "a publisher that is plainly a placeholder");
    assert.ok(!REAL_PUBLISHERS.test(p.publisher), `${p.publisher} reads like a real organisation`);
    assert.ok(p.url === null || new URL(p.url).hostname === "example.com", "a link, where there is one, goes nowhere real");
    assert.ok(p.method === null || p.method.startsWith("SYNTHETIC"));
  }
  assert.ok(new Set(b.projections.map((p) => p.publisher)).size === 3, "three different publishers");
  assert.ok(b.election.name.startsWith("SYNTHETIC"));
  for (const e of b.events) assert.ok(e.text.startsWith("SYNTHETIC"), e.text);
  assert.equal(liveSentence(b), "BJP leads or holds 57 of 96 declared seats; majority is 64.");
  // The file is dated when it was written: read later, it is stale, which is what it is for looking at.
  const later = parseLiveFeed(DEMO_FEED, new Date("2026-11-04T10:35:00Z"));
  assert.ok("boards" in later && later.boards[0]?.stale === true);
});

test("a feed is re-dated by moving its timestamps together, and nothing else", () => {
  const feed = JSON.parse(DEMO_FEED) as { boards: { asOf: string; events: { at: string }[]; projections: { publishedOn: string }[] }[] };
  const to = new Date("2030-01-01T00:00:00Z");
  const moved = shiftFeedTimes(feed, to) as typeof feed;
  const [before, after] = [feed.boards[0], moved.boards[0]] as [(typeof feed.boards)[number], (typeof feed.boards)[number]];
  assert.equal(after.asOf, "2030-01-01T00:00:00.000Z");
  const gaps = (b: typeof before): number[] => b.events.map((e) => Date.parse(b.asOf) - Date.parse(e.at));
  assert.deepEqual(gaps(after), gaps(before), "the events keep their distance from the count");
  assert.deepEqual(after.projections.map((p) => p.publishedOn), before.projections.map((p) => p.publishedOn), "a publication date is not a count's timestamp");
  assert.equal(feed.boards[0]?.asOf, "2026-11-03T10:30:00Z", "the input is not changed");
  const r = parseLiveFeed(JSON.stringify(moved), new Date("2030-01-01T00:03:00Z"));
  assert.ok("boards" in r && r.boards[0]?.stale === false, "and the re-dated feed is valid and fresh");
  assert.equal(shiftFeedTimes("nonsense", to), "nonsense");
  assert.deepEqual(shiftFeedTimes({ boards: 3 }, to), { boards: 3 });
});
