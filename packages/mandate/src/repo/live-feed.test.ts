// The live feed: what a file must be to be read as a board, and the one sentence a board says about itself.
//
// The validator is the product's refusal to show a count it cannot stand behind, so each rule has its own test, and each test changes ONE
// thing in a feed that is otherwise valid: a test that broke two would pass for the wrong reason. The sentence is held to the finding
// audit (finding.ts) over generated boards, because a sentence built from a board is only as honest as the worst board it is given.

import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditFinding, text } from "./finding.ts";
import { liveSentence, parseLiveFeed, readLiveFeed } from "./live-feed.ts";
import type { LiveBoard } from "./situation-types.ts";

const NOW = new Date("2026-11-03T12:00:00Z");

/** A feed that is valid in every respect, as a plain value a test can bend one field of. */
function feed(): Record<string, any> {
  return {
    version: 1,
    boards: [
      {
        election: { id: null, name: "Demo Assembly 2026", jurisdictionId: "as", jurisdictionName: "Assam", kind: "assembly", year: 2026 },
        status: "counting",
        asOf: "2026-11-03T11:50:00Z",
        seats: { total: 126, declared: 96, majority: 64 },
        parties: [
          { party: { key: "BJP", label: "BJP" }, won: 28, leading: 22 },
          { party: { key: "INC", label: "INC" }, won: 14, leading: 11 },
        ],
        projections: [
          {
            publisher: "Demo Pollster A",
            kind: "exit_poll",
            publishedOn: "2026-11-01",
            url: "https://example.com/demo-pollster-a",
            method: "Invented respondents, for a visual check.",
            ranges: [
              { party: { key: "BJP", label: "BJP" }, low: 58, high: 68 },
              { party: { key: "INC", label: "INC" }, low: 40, high: 50 },
            ],
          },
        ],
        events: [{ at: "2026-11-03T08:00:00Z", text: "Counting begins.", url: null }],
      },
    ],
  };
}

const run = (f: unknown, now = NOW, fresh?: number) => parseLiveFeed(JSON.stringify(f), now, fresh);
const refused = (f: unknown, why: RegExp, label: string): void => {
  const r = run(f);
  assert.ok("error" in r, `${label}: a bad feed was read as a board`);
  assert.match((r as { error: string }).error, why, label);
};
/** The valid feed with `change` applied to its one board. */
const bent = (change: (b: Record<string, any>) => void): Record<string, any> => {
  const f = feed();
  change(f["boards"][0]);
  return f;
};

/* ────────────────────────────── reading a file ────────────────────────────── */

test("no path, or no file at the path, is no live election and not an error", () => {
  assert.equal(readLiveFeed(undefined, NOW), null);
  assert.equal(readLiveFeed("", NOW), null, "an empty MANDATE_LIVE_PATH is an unset one");
  const dir = mkdtempSync(join(tmpdir(), "live-feed-"));
  try {
    assert.equal(readLiveFeed(join(dir, "nothing.json"), NOW), null);
    assert.equal(readLiveFeed(join(dir, "no-such-dir", "feed.json"), NOW), null);
    writeFileSync(join(dir, "plain"), "x");
    assert.equal(readLiveFeed(join(dir, "plain", "under-a-file.json"), NOW), null, "a path through a file is no feed");
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("a file that is there is read, and its boards come back checked", () => {
  const dir = mkdtempSync(join(tmpdir(), "live-feed-"));
  try {
    writeFileSync(join(dir, "feed.json"), JSON.stringify(feed()));
    const r = readLiveFeed(join(dir, "feed.json"), NOW);
    assert.ok(r !== null && "boards" in r);
    assert.equal(r.boards.length, 1);
    const b = r.boards[0] as LiveBoard;
    assert.equal(b.election.jurisdictionName, "Assam");
    assert.deepEqual(b.seats, { total: 126, declared: 96, majority: 64 });
    assert.equal(b.projections[0]?.publisher, "Demo Pollster A");
    assert.equal(b.stale, false);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("a file that is not a feed is an error with a reason, and the path of the file is not in it", () => {
  const dir = mkdtempSync(join(tmpdir(), "live-feed-"));
  try {
    writeFileSync(join(dir, "broken.json"), "{ not json");
    const bad = readLiveFeed(join(dir, "broken.json"), NOW);
    assert.ok(bad !== null && "error" in bad);
    assert.match(bad.error, /not valid JSON/);
    assert.ok(!bad.error.includes(dir), "the server's path is not shown to a reader");

    mkdirSync(join(dir, "a-directory.json"));
    const d = readLiveFeed(join(dir, "a-directory.json"), NOW);
    assert.ok(d !== null && "error" in d);
    assert.ok(!d.error.includes(dir));

    writeFileSync(join(dir, "huge.json"), " ".repeat(1_000_001));
    const huge = readLiveFeed(join(dir, "huge.json"), NOW);
    assert.ok(huge !== null && "error" in huge);
    assert.match(huge.error, /larger than/);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("nothing a file can hold makes the reader throw", () => {
  const garbage = ["", "null", "true", "3", '"x"', "[]", "{}", '{"version":1}', '{"version":1,"boards":3}', '{"version":1,"boards":[null,1,"x",[],{}]}',
    '{"version":1,"boards":[{"election":3,"status":[],"asOf":{},"seats":null,"parties":"x"}]}', "\u0000\u0001", "{\"version\":1,\"boards\":[]"];
  for (const g of garbage) {
    const r = parseLiveFeed(g, NOW);
    assert.ok("boards" in r || typeof r.error === "string", g);
  }
  assert.deepEqual(run({ version: 1, boards: [] }), { boards: [] }, "a feed with nothing running is valid and empty");
});

/* ────────────────────────────── staleness ────────────────────────────── */

test("a board is stale when its own timestamp is older than the freshness window, and not before", () => {
  const at = (iso: string, fresh?: number) => (run(bent((b) => (b["asOf"] = iso)), NOW, fresh) as { boards: LiveBoard[] }).boards[0]?.stale;
  assert.equal(at("2026-11-03T11:30:00Z"), false, "exactly thirty minutes old is not older than thirty minutes");
  assert.equal(at("2026-11-03T11:29:59Z"), true);
  assert.equal(at("2026-11-03T11:50:00Z"), false);
  assert.equal(at("2026-11-03T11:50:00Z", 5), true, "the window is a parameter");
  assert.equal(at("2026-11-03T13:00:00Z"), false, "a producer's clock ahead of the server's is not a stale count");
  assert.equal(at("2026-11-03T17:20:00+05:30"), false, "a zone offset is honoured: this is 11:50 UTC");
  assert.equal(at("2026-11-03T16:20:00+05:30"), true, "and this is 10:50 UTC");
});

/* ────────────────────────────── the rules ────────────────────────────── */

test("only version 1 is read, and an unknown key is refused wherever it is", () => {
  refused({ ...feed(), version: 2 }, /version/, "version 2");
  refused({ ...feed(), version: "1" }, /version/, "version as text");
  const { version: _v, ...noVersion } = feed();
  refused(noVersion, /missing "version"/, "no version");
  refused({ ...feed(), extra: 1 }, /unknown key "extra"/, "top level");
  refused(bent((b) => (b["stale"] = false)), /unknown key "stale"/, "stale is the reader's to decide");
  refused(bent((b) => (b["seats"]["leadng"] = 1)), /unknown key "leadng"/, "a typo in a nested object");
  refused(bent((b) => (b["parties"][0]["leadng"] = 3)), /unknown key "leadng"/, "a misspelt party field");
  refused(bent((b) => (b["election"]["state"] = "as")), /unknown key "state"/, "election");
  refused(bent((b) => (b["projections"][0]["probability"] = 0.8)), /unknown key "probability"/, "a probability is not a field");
  refused(bent((b) => (b["projections"][0]["ranges"][0]["mid"] = 60)), /unknown key "mid"/, "range");
  refused(bent((b) => (b["events"][0]["author"] = "x")), /unknown key "author"/, "event");
  refused(bent((b) => (b["parties"][0]["party"]["colour"] = "red")), /unknown key "colour"/, "party");
});

test("every field a board needs is needed", () => {
  for (const k of ["election", "status", "asOf", "seats", "parties"]) refused(bent((b) => delete b[k]), new RegExp(`missing "${k}"`), k);
  for (const k of ["total", "declared", "majority"]) refused(bent((b) => delete b["seats"][k]), new RegExp(`missing "${k}"`), `seats.${k}`);
  for (const k of ["name", "jurisdictionName", "kind", "year"]) refused(bent((b) => delete b["election"][k]), new RegExp(`missing "${k}"`), `election.${k}`);
  for (const k of ["won", "leading", "party"]) refused(bent((b) => delete b["parties"][0][k]), new RegExp(`missing "${k}"`), `party.${k}`);
  const ok = run(bent((b) => {
    delete b["projections"];
    delete b["events"];
    delete b["election"]["id"];
    delete b["election"]["jurisdictionId"];
  })) as { boards: LiveBoard[] };
  assert.deepEqual([ok.boards[0]?.projections, ok.boards[0]?.events, ok.boards[0]?.election.id], [[], [], null], "the optional ones default to none");
});

test("a projection with no publisher is refused: the registry shows what others published and never a number that is nobody's", () => {
  refused(bent((b) => delete b["projections"][0]["publisher"]), /missing "publisher"/, "no publisher");
  refused(bent((b) => (b["projections"][0]["publisher"] = "")), /publisher: must be a non-empty string/, "empty publisher");
  refused(bent((b) => (b["projections"][0]["publisher"] = "   ")), /publisher: must be a non-empty string/, "blank publisher");
  refused(bent((b) => (b["projections"][0]["publisher"] = null)), /publisher/, "null publisher");
  refused(bent((b) => (b["projections"][0]["publisher"] = 7)), /publisher/, "numeric publisher");
});

test("a projection's kind and date are checked", () => {
  refused(bent((b) => (b["projections"][0]["kind"] = "forecast")), /kind: must be one of exit_poll, opinion_poll, agency_projection/, "kind");
  refused(bent((b) => delete b["projections"][0]["kind"]), /missing "kind"/, "no kind");
  for (const bad of ["2026-02-30", "2026-13-01", "03/11/2026", "2026-11-03T10:00:00Z", "", "2026-1-3", 20261103, null]) {
    refused(bent((b) => (b["projections"][0]["publishedOn"] = bad)), /publishedOn: must be an ISO date/, String(bad));
  }
  const ok = run(bent((b) => (b["projections"][0]["publishedOn"] = "2024-02-29")));
  assert.ok("boards" in ok, "29 February in a leap year is a date");
  refused(bent((b) => (b["projections"][0]["publishedOn"] = "2026-02-29")), /publishedOn/, "29 February in a year that is not");
});

test("a range is 0 <= low <= high, in whole seats, within the seats there are, for a named party", () => {
  const range = (change: (r: Record<string, any>) => void) => bent((b) => change(b["projections"][0]["ranges"][0]));
  refused(range((r) => ((r["low"] = 70), (r["high"] = 60))), /low 70 is above high 60/, "low above high");
  refused(range((r) => (r["low"] = -1)), /low: must be a whole number from 0/, "negative low");
  refused(range((r) => (r["low"] = 1.5)), /low: must be a whole number/, "fractional low");
  refused(range((r) => (r["high"] = 127)), /high: must be a whole number from 0 to 126/, "more seats than there are");
  refused(range((r) => (r["high"] = "60")), /high: must be a whole number/, "text");
  refused(range((r) => delete r["low"]), /missing "low"/, "no low");
  refused(range((r) => delete r["party"]["label"]), /missing "label"/, "a range needs a party label");
  refused(range((r) => delete r["party"]["key"]), /missing "key"/, "a range needs a party key");
  refused(range((r) => (r["party"]["key"] = "")), /key: must be a non-empty string/, "an empty party key");
  refused(bent((b) => (b["projections"][0]["ranges"] = [])), /needs at least one range/, "no ranges");
  refused(bent((b) => (b["projections"][0]["ranges"][1]["party"] = { key: "BJP", label: "BJP" })), /listed twice/, "one party twice");
  const ok = run(range((r) => ((r["low"] = 60), (r["high"] = 60))));
  assert.ok("boards" in ok, "low equal to high is a point, and allowed");
  const zero = run(range((r) => ((r["low"] = 0), (r["high"] = 0))));
  assert.ok("boards" in zero, "0 is allowed");
});

test("a link must be http or https, in a projection and in an event", () => {
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "ftp://example.com/f", "example.com/page", "not a url", ""]) {
    refused(bent((b) => (b["projections"][0]["url"] = bad)), /url: must be/, `projection ${bad}`);
    refused(bent((b) => (b["events"][0]["url"] = bad)), /url: must be/, `event ${bad}`);
  }
  assert.ok("boards" in run(bent((b) => (b["events"][0]["url"] = "http://example.com/x"))));
});

test("an event needs a moment and a sentence, and the moment needs a zone", () => {
  refused(bent((b) => delete b["events"][0]["at"]), /missing "at"/, "no at");
  refused(bent((b) => delete b["events"][0]["text"]), /missing "text"/, "no text");
  refused(bent((b) => (b["events"][0]["text"] = " ")), /text: must be a non-empty string/, "blank text");
  refused(bent((b) => (b["events"][0]["at"] = "2026-11-03T08:00:00")), /at: must be an ISO timestamp with a zone/, "no zone");
  refused(bent((b) => (b["events"][0]["at"] = "2026-11-03")), /at: must be an ISO timestamp/, "a date is not a moment");
  refused(bent((b) => (b["events"][0]["at"] = "2026-11-03T25:00:00Z")), /at: must be an ISO timestamp/, "hour 25");
  refused(bent((b) => (b["asOf"] = "yesterday")), /asOf: must be an ISO timestamp/, "asOf");
  refused(bent((b) => (b["asOf"] = "2026-11-03T11:50:00")), /asOf: must be an ISO timestamp with a zone/, "asOf with no zone");
  refused(bent((b) => (b["events"][0]["text"] = "x".repeat(2001))), /longer than/, "a paragraph");
});

test("the seats: declared is within total, and majority is the integer above half", () => {
  refused(bent((b) => (b["seats"]["declared"] = 127)), /declared: must be a whole number from 0 to 126/, "declared above total");
  refused(bent((b) => (b["seats"]["declared"] = -1)), /declared/, "negative declared");
  refused(bent((b) => (b["seats"]["total"] = 0)), /total/, "no seats");
  refused(bent((b) => (b["seats"]["majority"] = 63)), /majority: 63 is not the integer above half of 126 \(64\)/, "majority is half, not above it");
  refused(bent((b) => (b["seats"]["majority"] = 65)), /majority: 65 is not the integer above half/, "majority above");
  refused(bent((b) => (b["seats"]["majority"] = "64")), /majority/, "text");
  // 543: half is 271.5, so the integer above half is 272.
  const ls = run(bent((b) => ((b["seats"] = { total: 543, declared: 96, majority: 272 }), (b["projections"] = []))));
  assert.ok("boards" in ls, "an odd total");
  refused(bent((b) => ((b["seats"] = { total: 543, declared: 96, majority: 271 }), (b["projections"] = []))), /majority/, "odd total, half rounded down");
  const even = run(bent((b) => ((b["seats"] = { total: 294, declared: 96, majority: 148 }), (b["projections"] = []))));
  assert.ok("boards" in even, "294 seats need 148");
});

test("the parties together cannot hold more seats than there are, or than have a known status", () => {
  refused(
    bent((b) => (b["parties"] = [{ party: { key: "A", label: "A" }, won: 100, leading: 20 }, { party: { key: "B", label: "B" }, won: 5, leading: 5 }])),
    /add up to 130, which is more than the 126 seats there are/,
    "more than total",
  );
  refused(
    bent((b) => (b["parties"][0]["leading"] = 60)),
    /add up to 113, which is more than the 96 seats with a known status/,
    "more than declared",
  );
  refused(bent((b) => (b["parties"][0]["won"] = -1)), /won: must be a whole number from 0 up/, "negative");
  refused(bent((b) => (b["parties"][0]["leading"] = 0.5)), /leading: must be a whole number/, "fraction");
  refused(bent((b) => (b["parties"][1]["party"] = { key: "BJP", label: "again" })), /"BJP" is listed twice/, "a party twice");
  const exact = run(bent((b) => (b["parties"][0]["leading"] = 22 + 96 - 75)));
  assert.ok("boards" in exact, "holding exactly the seats with a known status is allowed");
  assert.ok("boards" in run(bent((b) => (b["parties"] = []))), "a count that has not begun lists no party");
});

test("one bad board refuses the whole feed, and the error says which and how many more", () => {
  const f = feed();
  f["boards"].push(JSON.parse(JSON.stringify(f["boards"][0])));
  f["boards"][1]["seats"]["declared"] = 500;
  f["boards"][1]["status"] = "over";
  const r = run(f) as { error: string };
  assert.match(r.error, /boards\[1\]/);
  assert.match(r.error, /and 1 more/);
  assert.ok(!("boards" in r), "no board of a feed with a bad board is returned");
});

test("election fields: the kind, the year, and the names", () => {
  refused(bent((b) => (b["election"]["kind"] = "municipal")), /kind: must be one of assembly, lok_sabha/, "kind");
  refused(bent((b) => (b["election"]["year"] = 26)), /year: must be a whole number/, "year");
  refused(bent((b) => (b["election"]["year"] = "2026")), /year/, "year as text");
  refused(bent((b) => (b["election"]["name"] = "")), /name: must be a non-empty string/, "name");
  refused(bent((b) => (b["status"] = "over")), /status: must be one of polling, counting, declared/, "status");
  assert.ok("boards" in run(bent((b) => ((b["election"]["id"] = "as-assembly-2026"), (b["election"]["jurisdictionId"] = "as")))));
});

/* ────────────────────────────── the sentence ────────────────────────────── */

const boardOf = (parties: [string, number, number][], seats = { total: 126, declared: 96, majority: 64 }): LiveBoard => ({
  election: { id: null, name: "E", jurisdictionId: null, jurisdictionName: "J", kind: "assembly", year: 2026 },
  status: "counting",
  asOf: "2026-11-03T11:50:00Z",
  stale: false,
  seats,
  parties: parties.map(([label, won, leading]) => ({ party: { key: label, label }, won, leading })),
  projections: [],
  events: [],
});

test("the sentence says which party leads or holds the most seats, of how many declared, and the majority line", () => {
  assert.equal(liveSentence(boardOf([["BJP", 28, 22], ["INC", 14, 11]])), "BJP leads or holds 50 of 96 declared seats; majority is 64.");
  assert.equal(liveSentence(boardOf([["INC", 14, 11], ["BJP", 28, 22]])), "BJP leads or holds 50 of 96 declared seats; majority is 64.", "not the order of the list");
  assert.equal(liveSentence(boardOf([["BJP", 0, 3]])), "BJP leads or holds 3 of 96 declared seats; majority is 64.", "leads alone are counted");
});

test("parties level for most seats are said to be level, and none is called the leader", () => {
  assert.equal(
    liveSentence(boardOf([["BJP", 20, 5], ["INC", 25, 0], ["TMC", 1, 1]])),
    "BJP and INC are level on 25 of 96 declared seats; majority is 64.",
  );
  assert.equal(
    liveSentence(boardOf([["A", 5, 0], ["B", 4, 1], ["C", 5, 0], ["D", 1, 0]])),
    "A, B and C are level on 5 of 96 declared seats; majority is 64.",
  );
});

test("where no party holds a seat the sentence says so and still gives the counts", () => {
  assert.equal(liveSentence(boardOf([], { total: 294, declared: 0, majority: 148 })), "No party leads or holds a seat; 0 of 294 seats declared; majority is 148.");
  assert.equal(liveSentence(boardOf([["BJP", 0, 0]], { total: 294, declared: 0, majority: 148 })), "No party leads or holds a seat; 0 of 294 seats declared; majority is 148.");
});

/** A small deterministic generator, so a failing board can be rebuilt from its seed. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LABELS = ["TMC", "BJP", "INC", "CPM", "DMK", "AIADMK", "SP", "BSP", "BJD", "NCP", "AAP"];
/** Words a sentence about a count must not use: pronouns, the audit's own list, and anything that reads as a prospect. */
const BANNED =
  /\b(he|she|his|her|him|they|their|them|it|its|we|us|our|never|only|first time|will|would|expected|likely|predict\w*|forecast\w*|project\w*|poised|headed|on course|set to|win|wins|winning|victory|defeated|beat)\b/i;

function generated(seed: number): LiveBoard {
  const rand = mulberry32(seed);
  const int = (lo: number, hi: number): number => lo + Math.floor(rand() * (hi - lo + 1));
  const total = int(1, 600);
  const declared = int(0, total);
  let left = declared;
  const labels = [...LABELS].sort(() => rand() - 0.5).slice(0, int(0, 8));
  const level = int(0, 3) === 0; // a quarter of the boards are built to have a tie for most
  let shared: number | null = null;
  const parties: [string, number, number][] = labels.map((label) => {
    let n = int(0, left);
    if (level) {
      shared ??= n;
      n = Math.min(shared, left);
    }
    left -= n;
    const won = int(0, n);
    return [label, won, n - won];
  });
  return boardOf(parties, { total, declared, majority: Math.floor(total / 2) + 1 });
}

test("every number in the sentence is one of the board's own, over generated boards, and the audit's words are absent", () => {
  let ties = 0;
  let none = 0;
  for (let seed = 1; seed <= 1500; seed += 1) {
    const b = generated(seed);
    const said = liveSentence(b);
    // The board's numbers: the three seat counts, each party's won and leading and the two together, and every label's own digits.
    const own = [
      b.seats.total, b.seats.declared, b.seats.majority,
      ...b.parties.flatMap((p) => [p.won, p.leading, p.won + p.leading]),
    ];
    const haystack = [...own, ...b.parties.map((p) => p.party.label)].join(" ");
    const bad = auditFinding({ shape: "live", parts: [text(said)] }, { haystack, hasCounts: true });
    assert.deepEqual(bad, [], `seed ${seed}: ${said}`);
    // The audit's own check is a substring test ("1" is in "126"), so the stronger one: each number is a member of the set.
    const known = new Set(own.map(String));
    for (const run of said.match(/\d+/g) ?? []) assert.ok(known.has(run), `seed ${seed}: ${run} is not one of the board's numbers in "${said}"`);
    assert.ok(!BANNED.test(said), `seed ${seed}: a banned word in "${said}"`);
    assert.ok(said.endsWith("."), said);
    assert.match(said, /majority is \d+\.$/, said);
    assert.ok(said.includes(`majority is ${b.seats.majority}.`), said);

    // The claim itself: the party named holds the most, and a tie names no leader.
    const held = b.parties.map((p) => p.won + p.leading);
    const top = Math.max(0, ...held);
    const named = b.parties.filter((p) => said.startsWith(`${p.party.label} leads or holds ${p.won + p.leading} of`));
    const atTop = b.parties.filter((p) => p.won + p.leading === top);
    if (top === 0) {
      none += 1;
      assert.ok(said.startsWith("No party leads or holds a seat"), said);
    } else if (atTop.length === 1) {
      assert.equal(named.length, 1, said);
      assert.equal(named[0]?.party.label, atTop[0]?.party.label, said);
    } else {
      ties += 1;
      assert.ok(!said.includes("leads or holds"), `seed ${seed}: a tie is not a leader: ${said}`);
      assert.ok(said.includes(` are level on ${top} of ${b.seats.declared} declared seats`), said);
    }
  }
  assert.ok(ties > 50 && none > 20, `the generator should reach ties and empty boards (ties ${ties}, none ${none})`);
});

test("a board read from a file says the same sentence as the board built by hand", () => {
  const r = run(feed()) as { boards: LiveBoard[] };
  assert.equal(liveSentence(r.boards[0] as LiveBoard), "BJP leads or holds 50 of 96 declared seats; majority is 64.");
});
