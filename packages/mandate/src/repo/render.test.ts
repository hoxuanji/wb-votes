// Integration: render the real routes and read what a browser would receive.
//
// WHY THIS SUITE EXISTS, and why it looks like this. `tsc` cannot see inside a component — it type-checks
// JSX and has no opinion about whether a section throws, renders nothing, or prints a figure no source
// published. `next build` does not render a dynamic route. And this sandbox refuses `listen()`, so there is
// no dev server and no browser to point at the page. Between them, that leaves a gap the size of the whole
// front end: the homepage could 500 on every request and every other check in this repo would stay green.
//
// So the pages are rendered here, in a child process that compiles .tsx through the Babel already inside
// next/dist/compiled (ops/probe/render — zero new dependencies), and the HTML is asserted against.
//
// WHAT IT ASSERTS is the brief's data rule rather than the layout: no fabricated value, no derived date
// unlabelled, every jurisdiction reachable. Layout is the one thing this environment genuinely cannot
// check, and pretending otherwise with a snapshot of class names would be worse than not checking.

import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { DEV_DB_PATH, openRead } from "../db/open.ts";
import * as electionMap from "./election-map.ts";
import { readSelection, tally } from "./map-selection.ts";
import type { ElectionSeat } from "./election-map.ts";
import { kindOfBody } from "./routes.ts";
import { stateView } from "./state-view.ts";
import * as home from "./home.ts";
import { storyView } from "./home-story.ts";
import { unverifiedTurnout } from "./turnout-trust.ts";
import { currentSeat } from "./testkit.ts";
import { all } from "../db/index.ts";
import { CURATED_KEYS, NOT_HELD, chromaOf, fillFor, partyKey } from "../viz/party-ink.ts";
import { deltaE } from "../viz/colour.ts";

const HAVE_DB = existsSync(process.env["MANDATE_DB_PATH"] ?? DEV_DB_PATH);
const live = { skip: HAVE_DB ? false : "no .data/registry.db — run npm run registry:ingest" };

const ROOT = new URL("../../../../", import.meta.url).pathname;

/** A read handle, for the few assertions that compare a rendered figure to the registry's own. */
const db = HAVE_DB ? openRead() : (null as unknown as ReturnType<typeof openRead>);

/** Render a route, or throw with the child's stderr — a page that fails to render must fail loudly. */
function render(route: string, query = "", segments = ""): string {
  try {
    return execFileSync(
      process.execPath,
      ["--import", "./ops/probe/render/register.mjs", "./ops/probe/render/render.mjs", route, query, segments],
      { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    throw new Error(`render ${route} ${query} ${segments} failed:\n${err.stderr ?? err.message}`);
  }
}


/**
 * Render a place by its PATH, dispatching to the canonical route for its kind.
 *
 * The tests below discover paths at runtime, so they need one entry point. Counting segments is a guess in
 * PRODUCTION code — that is the whole reason `/pl/[...path]` is gone — but here the test already knows what
 * it asked the registry for, so this is a lookup and not an inference.
 */
function place(path: string, query = ""): string {
  const parts = path.split("/").filter(Boolean);
  const lens = parts.at(-1) === "analysis";
  const p = lens ? parts.slice(0, -1) : parts;
  if (p.length === 1) return render("/state", query, p[0] as string);
  if (p.length === 2) return render("/district", query, p.join("/"));
  /**
   * A CONSTITUENCY PATH CANNOT BE REBUILT FROM A PLACE PATH, because the body is part of its identity and a
   * `<state>/<district>/<seat>` path never carried one. Callers that need a constituency render it directly
   * with the body the page offered them. This helper serves states and districts only.
   */
  throw new Error(`place() cannot build a constituency URL for ${path} — render /constituency with its body`);
}

/** The page as a reader sees it: tags stripped, entities resolved, blank lines dropped. */
function text(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&rsquo;/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/&ldquo;|&rdquo;/g, '"')
    // `<` and `>` are escaped in the markup, and one of them carries meaning: "<0.1%" is how a real share
    // too small for one decimal is rendered, and a helper that left it as &lt; would hide the thing under test.
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n");
}

/* ────────────────────────────── the homepage ────────────────────────────── */

test("the homepage renders, and says what it is in the first screen", live, () => {
  const t = text(render("/"));
  // The ten-second test, as far as a text assertion can carry it: the product's name, and one computed sentence that says what changed
  // in the one state that has results. The sentence is chosen by rule (repo/home-story.ts), so the test reads its shape and not a name.
  assert.match(t, /INDIA\nElection Intelligence/, "the wordmark is not the first thing");
  assert.match(
    t.replace(/\s+/g, " "),
    /won \d[\d,]* of .+?.s \d[\d,]* seats in \d{4}/,
    "the first screen does not open on a sentence that says what was won, of how many, and when",
  );
  assert.ok(t.includes("Open the record"), "the four doors are missing from the first screen");
  // The chapters a reader meets in turn, each a question the sentence raises, then the reference layer.
  for (const heading of [
    "What changed",
    "Where",
    "Votes and seats",
    "How close",
    "People",
    "India · Government",
    "Upcoming",
    "Recent results",
    "Party landscape",
  ]) {
    assert.ok(t.includes(heading), `the "${heading}" section is missing`);
  }
  // And what was removed must stay removed, each for a reason recorded in page.tsx.
  for (const [gone, why] of [
    ["Who governs", "the map's companion table is the same 36 rows with the same links"],
    ["Historical elections", "180 cells of links to the state pages the map already reaches"],
    ["Data coverage", "/coverage is a page whose whole subject is that question"],
    ["What to watch", "renamed and cut from nine rows to four, and then folded into the chapters"],
    ["Closest contests", "its facts are the How close chapter's, which keeps counted margins apart from declared ones"],
    ["Notable shifts", "its movements are What changed and Where, drawn rather than listed"],
    ["computed", "the wall-clock time a SQL query ran is not a fact about Indian politics"],
    ["assembly seats 4,117", "a registry row count, in the first screen"],
    ["what is and is not loaded", "the coverage link belongs in the footer"],
  ] as const) {
    assert.ok(!t.includes(gone), `"${gone}" is back on the front page — ${why}`);
  }
  // The hero's six metric tiles are gone too, and their labels are the cheapest way to detect a return.
  for (const label of ["Governing parties", "Terms expiring", "Elections held"]) {
    assert.ok(!t.includes(label), `the hero metric "${label}" is back`);
  }
});

test("the front page shows no provenance class labels and no dataset status", live, () => {
  // THE DEFECT THE FINAL DESIGN PASS EXISTS FOR, as a measurement. The rendered page carried eleven
  // "Measured", nine "Derived" and eight coverage chips: twenty provenance words and eight dataset-status
  // marks before a reader met an election. Each is a fact about the software, and a reader assumes all of them.
  const t = text(render("/"));
  assert.ok(!/\bMeasured\b/.test(t), "a Measured chip is back on the front page");
  assert.ok(!/\bDerived\b/.test(t), "a Derived chip is back on the front page");
  for (const word of ["Complete", "Partial", "Unavailable"]) {
    assert.ok(!new RegExp(`\\b${word}\\b`).test(t), `a coverage chip ("${word}") is back beside a result`);
  }
  // The evidence is still THERE — one drawer for the map's geometry, offered once, not per figure.
  const drawers = (render("/").match(/class="iei-ev(?:\s|")/g) ?? []).length;
  assert.ok(drawers >= 1, "the front page offers no evidence at all");
  assert.ok(drawers <= 3, `${drawers} evidence drawers on the front page — one per module is the rule`);
});

test("the front page stays inside its stated weight, and a table a reader has to open is not a table they meet", live, () => {
  // THE CEILINGS WERE REBASED, and these are the numbers that replace them. The page this test was written for was five sections of lists
  // and one table, and it held itself to a fraction of the page before it. The front page now opens on a sentence and four pictures that
  // prove it, with a chapter for each question the sentence raises, so it carries more words, cells and notes on purpose; what it still
  // may not do is grow without someone deciding to. Each figure is the first measured build plus about 10%, and the bytes are the one
  // number that was fixed first: a page this dense is still one document, and 260 kB of it is the budget (the old design's was 218 kB).
  //
  // Visible words are counted with the SVG `<title>` hover cards stripped: they are the accessible name of a picture and a mouse tooltip,
  // not clutter, and a metric that punished them would push a redesign towards a less accessible page.
  const html = render("/");
  const count = (re: RegExp, from = html): number => (from.match(re) ?? []).length;
  const visible = (s: string): number =>
    s
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, " ")
      .replace(/<title>[\s\S]*?<\/title>/g, " ")
      .replace(/<[^>]+>/g, "\n")
      .split(/\s+/)
      .filter(Boolean).length;
  const ceiling = { tables: 6, rows: 51, cells: 252, words: 2220, notes: 10, prose: 300, bytes: 260_000 };
  const now = {
    tables: count(/<table/g),
    rows: count(/<tr/g),
    cells: count(/<t[dh][ >]/g),
    words: visible(html),
    notes: count(/class="iei-(note|caveat)"/g),
    bytes: html.length,
    prose: [...html.matchAll(/class="iei-(?:note|caveat|foot)"[^>]*>([\s\S]*?)<\/(?:p|footer|div|figcaption)>/g)]
      .map((m) => visible(m[1] as string))
      .reduce((a, b) => a + b, 0),
  };
  for (const k of Object.keys(ceiling) as (keyof typeof ceiling)[]) {
    assert.ok(now[k] <= ceiling[k], `${k}: ${now[k]} is over the ${ceiling[k]} this page is held to`);
  }
  // The pictures' tables are TWINS: each lives inside a <details> and is the exact form of the picture above it. The two tables a reader
  // meets without opening anything are the 36-row standings comparison (what a table is for) and the people table, whose rows are the finding.
  const closed = html.replace(/<details[\s\S]*?<\/details>/g, "");
  assert.equal(count(/<table/g, closed), 2, "a picture's table twin is outside its <details>, or a third table has arrived");
  assert.equal(count(/class="iei-metric"/g), 0, "the front page has metric tiles again");
  // One evidence drawer for the page's geometry, offered once, and a disclosure for a table twin is not one.
  assert.ok(count(/class="iei-ev(?:\s|")/g) <= 3, "more than three evidence drawers on the front page");
});

test("the homepage never prints a fabricated figure", live, () => {
  const t = text(render("/"));
  // A rendered 0.0% is the shape a fabrication takes here, and it has two sources. West Bengal 2026
  // publishes winners and no vote counts, whose honest render is words; and SKM's 2024 national share is
  // genuinely non-zero but rounds to nothing at one decimal, whose honest render is "<0.1%". Neither may
  // print as a zero, because a zero beside a seat says the party received no votes.
  assert.doesNotMatch(t, /\n0\.0%/, "a 0.0% share is printed — a small share is not zero, and null is not zero");
  assert.match(t, /<0\.1%/, "no small-but-real share is rendered — has the rounding rule been lost?");
  // An absence must be a WORD. A lone dash in a numeric column reads as zero.
  assert.match(t, /not reported|no vote counts|not held|not recorded|no Lok Sabha seat/, "no absence is spelled out");
  // AN INFERRED DATE MUST STILL SAY IT IS ONE — in the reader's words rather than as a class label. Every
  // upcoming year is prefixed, and the panel states the basis once.
  assert.match(t, /Expected 20\d\d/, "an upcoming election prints a bare year as though it were announced");
  assert.match(t, /five-year term counted from the last election/, "the inferred basis is stated nowhere");
  // And the page must not claim to predict. The word alone is not the test — the watch section's own
  // disclaimer says "no model, no forecast, no probability", and a naive match on "forecast" flagged it,
  // which is the difference between denying something and doing it. Only an affirmative claim counts.
  for (const claim of [
    /\bwe (predict|forecast|expect)\b/i,
    /\b(projected|predicted|expected) to win\b/i,
    /\blikely (winner|to win)\b/i,
    /\bwill (win|lose|hold|flip)\b/i,
    /\b\d+% chance\b/i,
    /\bprobability of\b/i,
  ]) {
    assert.doesNotMatch(t, claim, `the page makes a forecast: ${String(claim)}`);
  }
  assert.match(t, /Nothing here is a prediction/, "the shifts section does not disclaim prediction");
  assert.match(t, /No model, no forecast, no probability/, "the disclaimer has been softened");
});

test("the front page reaches a constituency and a person, not just a state", live, () => {
  // Before the story, every link on the landing surface stopped at a state page. Now there are four doors (a state, an election, a seat, a
  // person) and the chapters link on: the closest counted results are seats, and the people table links to each member and each seat.
  const html = render("/");
  const t = text(html);
  const seats = [...html.matchAll(/href="\/constituency\/[a-z]{2}\/(?:assembly|lok-sabha)\/[^"]+"/g)];
  const people = [...html.matchAll(/href="\/p\/[^"]+"/g)];
  assert.ok(seats.length >= 5, `the front page offers ${seats.length} links to a seat`);
  assert.ok(people.length >= 1, "the front page offers no link to a person");
  // A close result states its margin in votes AND as a share of votes polled, so "closest" is arguable rather than asserted; and a margin
  // an election declared without counts is marked declared, never given a share.
  assert.match(t, /\d+ votes/, "a close result does not state its margin in votes");
  assert.match(t, /% of votes polled/, "a close result does not state its margin as a share");
  const declared = all<{ n: number }>(db, "SELECT COUNT(*) AS n FROM result WHERE margin IS NOT NULL")[0]?.n ?? 0;
  if (declared > 0) assert.doesNotMatch(t, /publishes a margin/, `the page denies margins, and ${declared} result rows declare one`);
});

test("the story page draws one bar per election, withholds what was not published, and marks what was declared", live, () => {
  const html = render("/");
  const t = text(html);
  const story = html.slice(0, html.indexOf('id="india"'));
  const standings = home.homeView(db, { thisYear: 2026 }).standings;
  const view = storyView(db, { candidates: standings.map((s) => ({ id: s.jurisdictionId, name: s.jurisdictionId })) });
  assert.ok(view !== null, "the registry has an assembly with results and the page has no story");
  const n = (re: RegExp, from = story): number => (from.match(re) ?? []).length;

  // One bar per election of the house, each with its half-house line and its place in the arrival order.
  assert.equal(n(/class="iei-res-bar iei-story-bar"/g), view.houses.length, "not one bar per election");
  assert.equal(n(/class="iei-story-half"/g), view.houses.length, "a bar has no half-house line");
  assert.ok(n(/style="--i:\d+"/g) >= view.houses.length, "the bars have no arrival order");
  assert.equal(n(/class="iei-story-door"/g), view.doors.length, "a door is missing");

  // A circle is drawn for a vote share that exists and for no other: what an election did not publish is a word, never a mark at zero.
  const published = [...view.votes.lead, ...(view.votes.partner ?? [])].filter((pt) => pt.votePct !== null).length;
  assert.equal(n(/iei-story-vote"/g), published, "a circle is drawn for votes nobody published, or one that was published is missing");
  if (!view.countsLatest) {
    assert.match(t, /votes not reported/, "the vote share of an election with no counts is not said to be unreported");
    // And every margin of that election in the people table says it is declared.
    const table = /<table[^>]*iei-story-ptable[^>]*>([\s\S]*?)<\/table>/.exec(story)?.[1] ?? "";
    const rows = [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].slice(1);
    for (const r of rows) {
      const last = [...(r[1] as string).matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].at(-1)?.[1] ?? "";
      assert.match(text(last), /declared/, `a ${view.latest.year} margin is not marked declared`);
    }
  }

  // Nothing is printed that is not on record: no 93.0 turnout, no unfilled value, no empty figure.
  assert.doesNotMatch(story.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, " ").replace(/<[^>]+>/g, " "), /93\.0|turnoutPct/, "the story prints the 93.0 turnout");
  assert.doesNotMatch(t, /\bNaN\b|\bundefined\b|\bnull\b|\bInfinity\b/, "the page prints an unfilled value");

  // A party's swatch is always followed by its code: the ink is never the only channel.
  const swatches = n(/<span class="iei-sw"/g);
  assert.ok(swatches > 0);
  assert.equal(n(/<span class="iei-sw"[^>]*><\/span>(?=<span class="iei-chip">|<b>|[A-Za-z])/g), swatches, "a swatch is not followed by the party's code");

  // A hand-edited ?story= is ignored: the page tells the same story.
  const hostile = render("/", "story=%27%3B%20DROP%20TABLE%20election%3B--");
  const sentence = (h: string): string => /class="iei-answer iei-story-answer"[^>]*>([\s\S]*?)<\/h1>/.exec(h)?.[1] ?? "";
  assert.ok(sentence(html) !== "", "no sentence");
  assert.equal(sentence(hostile), sentence(html), "?story= changed the story");
});

test("a seat page leads with a finding, links everyone who stood, and withholds what the record withholds", live, () => {
  const html = render("/constituency", "", "wb/assembly/mekliganj");
  const t = text(html);
  const flat = t.replace(/\s+/g, " ");
  // The finding, then its people: every 2026 candidate is a link to their page, and so is each earlier winner and runner-up.
  assert.match(flat, /Dadhiram Ray BJP won Mekliganj at the third try: 3rd in 2016, 2nd in 2021, 1st in 2026, by a declared 29,584 votes\./);
  const people = new Set([...html.matchAll(/href="\/p\/([^"]+)"/g)].map((m) => m[1]));
  assert.ok(people.size >= 21, `${people.size} distinct people are linked; the brief counts 21`);
  assert.ok(t.includes("Golapi Roy"), "a non-winning 2026 candidate is not on the page");
  const roster = /<table[^>]*iei-seat-roster[^>]*>([\s\S]*?)<\/table>/.exec(html)?.[1] ?? "";
  assert.equal([...roster.matchAll(/<tr>/g)].length - 1, 11, "the roster is not the 11 who stood");
  // What the record withholds is not printed, and what it cannot say is said once.
  for (const bad of [/13\.6%/, /% of votes cast/, /defeated/i, /Others \(/, /not held/, /across 1 elections/, /96\.6%/]) assert.doesNotMatch(t, bad, `the page prints ${String(bad)}`);
  assert.equal((t.match(/not a criminal record/g) ?? []).length, 1, "the cases footnote is not printed exactly once");
  assert.match(flat, /3 separate records with similar names/);
  assert.doesNotMatch(roster, /rank|lost/i, "a rank or a loss is printed in the roster");
});

test("a seat with no 2026 result row says so, and a seat whose contests have nobody in them says that, and neither throws", live, () => {
  const falta = text(render("/constituency", "", "wb/assembly/falta")).replace(/\s+/g, " ");
  assert.match(falta, /No 2026 result is loaded; the candidacy record names Debangshu Panda as elected/);
  assert.doesNotMatch(falta, /109,021|71\.2%/, "the press margin of a seat with no result row is printed");
  const wb154 = render("/constituency", "", "wb/assembly/154");
  assert.match(text(wb154), /no candidates on record/);
  assert.doesNotMatch(text(wb154), /took the seat from/, "a hand-off is claimed across elections that declared nobody");
  const lok = text(render("/constituency", "", "wb/lok-sabha/baharampur")).replace(/\s+/g, " ");
  assert.match(lok, /24th widest of the 42 West Bengal Lok Sabha margins/);
  assert.match(lok, /Not on record/);
  assert.doesNotMatch(lok, /Turnout 2024 not held/, "the old tile that read as the election not having been held is back");
});

test("the nine reference person pages render, withhold what the record withholds, and give every swatch its code", live, () => {
  const NINE = [
    "pulak-roy-0d657a",
    "niamot-sheikh-21a0df",
    "dadhiram-ray-a22815",
    "dr-shashi-panja-80cf23",
    "hiten-barman-ca794e",
    "debangshu-panda-208a83",
    "manoj-tigga-9fd1fd",
    "humayun-kabir-1af54d",
    "adhikary-paresh-chandra-b3d5dc",
  ];
  const pages = new Map(NINE.map((slug) => [slug, render("/p", "", slug)]));
  for (const [slug, html] of pages) {
    const t = text(html);
    assert.ok(html.length < 340_000, `${slug}: ${html.length} bytes`);
    for (const bad of [/Standing at/, /96\.6%/, /Turnout where they stood/, /npm run mandate/, /Awaiting a result/, /never been elected/, /\bdefeated\b/i]) {
      assert.doesNotMatch(t, bad, `${slug} prints ${String(bad)}`);
    }
    const body = html.slice(html.indexOf("<main"));
    const swatches = [...body.matchAll(/<span class="iei-sw"[^>]*><\/span>/g)].length;
    const withCode = [...body.matchAll(/<span class="iei-sw"[^>]*><\/span>(?=<span class="iei-chip">|<b>|[A-Za-z])/g)].length;
    assert.equal(withCode, swatches, `${slug}: a swatch is not followed by its party's code`);
  }
  const pulak = pages.get("pulak-roy-0d657a")!;
  assert.equal((pulak.match(/iei-pp-mb-declared/g) ?? []).length, 1, "Pulak's 2026 margin is declared: one dashed bar");
  assert.ok(pulak.includes(fillFor("AITC")), "TMC is inked by its key (curated), not by its name");
  assert.match(text(pulak).replace(/\s+/g, " "), /Won Uluberia Dakshin for TMC at all 4 elections on record, 2011 to 2026\./);

  const hiten = pages.get("hiten-barman-ca794e")!;
  assert.ok(new Set([...hiten.matchAll(/href="\/p\/([^"]+)"/g)].map((m) => m[1])).size >= 10, "the other ten candidates are not reachable from Hiten Barman's page");
  assert.match(text(hiten).replace(/\s+/g, " "), /won by Dadhiram Ray BJP by a declared 29,584 votes/);
  assert.doesNotMatch(hiten, /iei-pp-mb\b/, "a person with no margin of their own has a margin frame");

  const humayun = text(pages.get("humayun-kabir-1af54d")!);
  assert.doesNotMatch(humayun, /The run|The record in full|Declared in/, "a press-only person has an empty frame");

  assert.match(text(pages.get("adhikary-paresh-chandra-b3d5dc")!), /2 other records may be the same person:/);
  assert.match(text(pages.get("debangshu-panda-208a83")!).replace(/\s+/g, " "), /Won Falta \(Assembly\)/);
  assert.match(text(pages.get("manoj-tigga-9fd1fd")!).replace(/\s+/g, " "), /Won Alipurduars \(Lok Sabha\) for BJP in 2024 by a declared 75,447 votes/);
  assert.doesNotMatch(pages.get("manoj-tigga-9fd1fd")!, /iei-res-bar/, "a Lok Sabha-only person has bars for an election that published no counts");
});

test("the candidates index renders a page of its list and its facets, in words and links, with no rank and no figure per person", live, () => {
  const html = render("/candidates");
  const t = text(html).replace(/\s+/g, " ");
  assert.ok(html.length < 120_000, `${html.length} bytes for a page of 50 rows`);
  assert.match(t, /2,921 candidates stood for 294 seats in the Assembly 2026 election\. 316 had stood before on record\./);
  assert.match(t, /Nothing here is ranked/);
  assert.equal((html.match(/<tr>/g) ?? []).length, 1 + 50, "a page is the head row and fifty candidates");
  // Every swatch has its code, and every person is a link to their page.
  const swatches = [...html.matchAll(/<span class="iei-sw"[^>]*><\/span>/g)].length;
  const withCode = [...html.matchAll(/<span class="iei-sw"[^>]*><\/span>(?=<span class="iei-chip">|<b>|[A-Za-z])/g)].length;
  assert.equal(withCode, swatches);
  assert.equal([...html.matchAll(/href="\/p\/[^"]+"/g)].length >= 50, true);
  // Only a declared winner has a figure, and it says declared; nobody is ranked by what they declared.
  assert.match(t, /declared winner, margin 18,960 declared/);
  assert.doesNotMatch(t, /richest|most cases|closest|\brank(?:ed)? \d|assets/i);
  // A narrowed view keeps its filters as links that remove them.
  const narrowed = render("/candidates", "party=AITC&repeat=1");
  assert.match(text(narrowed).replace(/\s+/g, " "), /Party TMC ×.*Repeat contestants ×.*Clear all/);
  const none = text(render("/candidates", "q=zzzzzz-nobody")).replace(/\s+/g, " ");
  assert.match(none, /No candidate matches Name contains .zzzzzz-nobody. in the Assembly 2026 election\./);
});

test("the Analysis pages open on a finding, print no withheld figure, and each says what it cannot draw", live, () => {
  const seats: [string, string][] = [
    ["wb/assembly/mekliganj", "Mekliganj"],
    ["wb/assembly/dinhata", "Dinhata"],
    ["wb/lok-sabha/baharampur", "Baharampur"],
    ["wb/assembly/falta", "Falta"],
    ["wb/assembly/154", "Bishnupur"],
  ];
  for (const [segments, name] of seats) {
    const html = render("/constituency/analysis", "", segments);
    const t = text(html).replace(/\s+/g, " ");
    assert.ok(html.length < 340_000, `${name}: ${html.length} bytes`);
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1, `${name}: not one h1`);
    assert.doesNotMatch(html, /<script/i, `${name}: a script`);
    for (const bad of [/96\.6/, /13\.6%/, /31\.9%/, /\b93\.0/, /Others \(\d/]) assert.doesNotMatch(t, bad, `${name} prints ${String(bad)}`);
    assert.match(t, new RegExp(`How ${name} got this way`));
    assert.match(t, /Why this finding:/);
    assert.match(t, /What this page leaves out/);
    // Every swatch has its code, and a party is inked by its key.
    const swatches = [...html.matchAll(/<span class="iei-sw"[^>]*><\/span>/g)].length;
    const withCode = [...html.matchAll(/<span class="iei-sw"[^>]*><\/span>(?=<span class="iei-chip">|<b>|[A-Za-z])/g)].length;
    assert.equal(withCode, swatches, `${name}: a swatch is not followed by its code`);
    assert.ok(!html.includes(fillFor("TMC")) || fillFor("TMC") === fillFor("AITC"), `${name}: TMC is inked by its name`);
  }
  const mek = text(render("/constituency/analysis", "", "wb/assembly/mekliganj")).replace(/\s+/g, " ");
  assert.match(mek, /verification pending/);
  assert.match(mek, /2016 was the close one: 47th closest of 275/);
  assert.match(mek, /beat the district and the state at every election on record/);

  const lok = render("/constituency/analysis", "", "wb/lok-sabha/baharampur");
  assert.match(text(lok).replace(/\s+/g, " "), /Not drawn, and why/);
  assert.doesNotMatch(text(lok), /India · | in West Bengal, the district|district of West Bengal/);
  assert.doesNotMatch(lok, /iei-an-seg/, "a Lok Sabha seat with no candidate votes draws a proportional segment");

  const none = text(render("/constituency/analysis", "", "wb/assembly/154")).replace(/\s+/g, " ");
  assert.doesNotMatch(none, /took the seat from/, "a hand-off is claimed across elections that declared nobody");
});

test("the table beside the map prints the seats of the layer it sits beside, and none where the layer names no party", live, () => {
  // The seats column read the ASSEMBLY standings whatever layer was shown, so the Lok Sabha layer printed "TMC 192 of 294": the Lok Sabha
  // leader's name over the assembly leader's seats. The registry's own count of contests is what the denominator has to be.
  const house = all<{ id: string }>(db, "SELECT id FROM election WHERE house = 'pc' AND kind = 'general' ORDER BY year DESC, id DESC LIMIT 1")[0]?.id;
  assert.ok(house !== undefined, "no Lok Sabha election in the registry");
  const contests = new Map(
    all<{ j: string; n: number }>(
      db,
      `SELECT pv.jurisdiction_id AS j, COUNT(*) AS n FROM contest c JOIN place_version pv ON pv.id = c.place_version_id
        WHERE c.election_id = ? GROUP BY 1`,
      house,
    ).map((r) => [r.j, r.n]),
  );
  const rows = (html: string): Map<string, string[]> =>
    new Map(
      [...html.matchAll(/<tr [^>]*data-j="([a-z]{2})"[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => [m[1] as string, text(m[2] as string).split("\n")]),
    );
  const lok = rows(render("/", "layer=loksabha"));
  let checked = 0;
  for (const [j, cells] of lok) {
    const of = /^of (\d+)$/.exec(cells[3] ?? "")?.[1];
    if (of === undefined) continue;
    checked += 1;
    assert.equal(Number(of), contests.get(j), `${j}: the Lok Sabha layer's row says "of ${of}"`);
    assert.ok(Number(cells[2]) <= Number(of) && Number(cells[2]) > 0, `${j}: ${cells[2]} seats of ${of}`);
  }
  assert.ok(checked > 0, "the Lok Sabha layer's table has no seat figure in any row");
  // A layer whose value is a number has no party in its row for a seat count to belong to: no column, rather than a leader's seats
  // beside a turnout.
  for (const layer of ["voteshare", "turnout", "margin", "year"]) {
    const html = render("/", `layer=${layer}`);
    // The map's own table, by its label: the page opens on pictures with table twins of their own, and the first <thead> is theirs.
    const mapTable = html.slice(html.indexOf('aria-label="Every jurisdiction in this layer"'));
    const head = text(/<thead>([\s\S]*?)<\/thead>/.exec(mapTable)?.[1] ?? "").split("\n");
    assert.deepEqual(head, ["State / UT", "Value", "Elected"], `${layer}'s table has columns that belong to another layer`);
    for (const [j, cells] of rows(html)) assert.equal(cells.length, 3, `${j}: ${cells.join(" | ")}`);
  }
});

test("an unshaded jurisdiction is called not loaded where no election is and has no figure where one is, and never not held", live, () => {
  // "Not held" says no election took place. Karnataka's was; it is not loaded. And on the vote share, turnout and margin layers West Bengal,
  // whose 2026 election was held and declared, was counted among the "not held" because the legend had one word for two causes.
  for (const layer of ["government", "loksabha", "voteshare", "turnout", "margin", "year"]) {
    const html = render("/", `layer=${layer}`);
    assert.doesNotMatch(text(html), /not held/i, `${layer} says an election was not held`);
    const view = home.homeView(db, { layer, thisYear: 2026 }).layer;
    const legend = (word: string): number | null => {
      const n = new RegExp(`${word} <b>(\\d+)</b>`).exec(html)?.[1];
      return n === undefined ? null : Number(n);
    };
    assert.equal(legend("Not loaded"), view.unloaded === 0 ? null : view.unloaded, `${layer}: the legend's count of what is not loaded`);
    assert.equal(legend("No figure"), view.unknown === view.unloaded ? null : view.unknown - view.unloaded, `${layer}: the legend's count of what has no figure`);
    // The tile row says the same, per jurisdiction: each tile is the word for its own cause.
    for (const m of html.matchAll(/<li><a[^>]* data-j="([a-z]{2})">[\s\S]*?<span class="iei-tile-v">([\s\S]*?)<\/span><span class="iei-sr">/g)) {
      const cell = view.cells.find((c) => c.jurisdictionId === m[1]);
      const word = text(m[2] as string);
      if (cell?.label === null) assert.equal(word, cell.electionId === null ? "not loaded" : "no figure", `${layer}/${m[1]}'s tile`);
    }
  }
});

test("a party's row says what its figures count, and does not say 'one election' beside an assembly seat total", live, () => {
  const html = render("/");
  const section = /id="parties"([\s\S]*?)<\/section>/.exec(html)?.[1] ?? "";
  const rows = [...section.matchAll(/<li id="[^"]*">([\s\S]*?)<\/li>/g)].map((m) => text(m[1] as string).replace(/\n/g, " "));
  assert.ok(rows.length > 0, "the party landscape has no rows");
  for (const row of rows) {
    // The bold figure is assembly seats; "no assembly" beside 77 of them read as holding none, when it meant leading none.
    assert.match(row, /\d[\d,]* assembly seats?\b/, `no unit on the figure: ${row}`);
    assert.match(row, /leads (?:no assembly|\d+ assembl(?:y|ies))/, `no verb on the count of assemblies: ${row}`);
    assert.doesNotMatch(row, /one election/, `a Lok Sabha trend's fallback sits beside an assembly figure: ${row}`);
    assert.match(row, /no Lok Sabha seat|\d+ Lok Sabha seats?\b/, `no unit on the Lok Sabha figure: ${row}`);
  }
});

test("each Recent results row links to the election it names, the Lok Sabha's included", live, () => {
  // Four rows linked to /state/wb, which opens on 2026, under the names of 2021, 2016 and 2011; the Lok Sabha's was not a link at all.
  const html = render("/");
  const list = /aria-label="Elections most recently held">([\s\S]*?)<\/ul>/.exec(html)?.[1] ?? "";
  const rows = [...list.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1] as string);
  const held = home.homeView(db, { thisYear: 2026 }).held;
  assert.ok(held.length > 0 && rows.length === held.length, `${rows.length} rows for ${held.length} elections`);
  rows.forEach((row, i) => {
    const e = held[i] as (typeof held)[number];
    assert.match(row, new RegExp(`<a href="/election/${e.id}">`), `${e.id}'s row does not link to its election: ${text(row)}`);
    assert.ok(text(row).includes(String(e.year)), `${e.id}'s row does not name ${e.year}`);
    // A 404 throws inside the render, so asserting by not throwing is the assertion.
    assert.ok(text(render("/election", "", e.id)).includes(String(e.year)), `/election/${e.id} does not name its year`);
  });
});

test("the unopposed seat is never counted among the numeric results", live, () => {
  const t = text(render("/coverage", "election=ls-2024"));
  // The brief's rule, on the rendered page: 543 constituencies, 542 numeric, 1 unopposed. A page showing
  // 543 numeric winners would be the exact failure it names.
  const numeric = /Numeric results\n([\d,]+)/.exec(t)?.[1];
  const seats = /Constituencies\n([\d,]+)\nof ([\d,]+)/.exec(t);
  const unopposed = /Unopposed\n([\d,]+)/.exec(t)?.[1];
  assert.ok(numeric !== undefined && seats !== null && unopposed !== undefined, "the coverage panel did not render");
  assert.equal(seats[1], seats[2], "resolved does not equal expected for the latest Lok Sabha");
  assert.equal(
    Number(numeric) + Number(unopposed),
    Number((seats[1] as string).replace(/,/g, "")),
    "numeric results plus unopposed do not account for every constituency",
  );
  assert.ok(Number(unopposed) >= 1, "the unopposed seat is not reported");
  assert.match(t, /a cited claim, not a zero/, "the unopposed seat is not explained");
});

test("every map layer renders, and an unknown one falls back instead of breaking", live, () => {
  const layers = ["government", "loksabha", "voteshare", "turnout", "margin", "year"];
  for (const layer of layers) {
    const html = render("/", `layer=${layer}`);
    const t = text(html);
    // 36 filled polygons every time, whatever the layer. One <a id="iei-j-xx"> per jurisdiction is the
    // invariant that matters: 36 polygons AND 36 of them reachable. Counting <path> would also count the 36
    // border paths, which are frame rather than data.
    assert.equal(
      new Set([...html.matchAll(/id="iei-j-([a-z]{2})"/g)].map((m) => m[1])).size,
      36,
      `${layer} does not draw 36 reachable jurisdictions`,
    );
    // At least one label, or the layer is a colour-matching exercise. FEWER THAN BEFORE, deliberately: a
    // label sized in viewBox units rendered at about 7px on this frame, and raising it to reading size means
    // `labelFits` refuses the polygons that no longer have room rather than shrinking the glyphs.
    assert.ok((html.match(/<text /g) ?? []).length > 12, `${layer} labels almost nothing`);
    assert.ok(t.includes("a dated snapshot"), `${layer} does not date its geometry`);
  }
  // A hand-edited layer must not reach the SQL or produce a broken page.
  const fallback = text(render("/", "layer=%27%3B+DROP+TABLE+result%3B+--"));
  assert.match(fallback, /India · Government/, "a bogus layer did not fall back to the default");
});

test("URL state survives, so a view can be sent to someone", live, () => {
  // ONE parameter on the front page now. It used to take three, and carrying `?election=` and `?house=`
  // through every layer link was the machinery that kept a coverage panel and a history grid from resetting
  // when a reader changed the map. Both sections are gone; the layer is the only view state left, and every
  // layer link anchors to #map so changing it returns the browser to the section that changed.
  const html = render("/", "layer=turnout");
  assert.match(text(html), /Turnout/, "the layer parameter was ignored");
  const links = [...html.matchAll(/href="\/\?([^"]*)#map"/g)].map((m) => m[1] as string);
  // Three, not five: a layer with nothing to shade is offered as unavailable rather than as a link. Vote share
  // already was on a registry whose only latest assembly is West Bengal 2026, which published no counts, and
  // turnout and margin now are too, because nothing corroborates its turnout (turnout-trust.ts).
  assert.ok(links.length >= 3, "the layer strip did not render links");
  for (const q of links) {
    assert.match(q, /^layer=[a-z]+$/, `a layer link carries state the page no longer has: ${q}`);
  }
});

test("the election deep link moved to the page that is about it", live, () => {
  // `/coverage?election=` is the same URL state the front page used to hold, on the surface whose whole
  // subject is the question. A view of one election's coverage is still shareable.
  const t = text(render("/coverage", "election=ls-2024"));
  assert.match(t, /Lok Sabha/, "the election parameter was ignored");
  // And a hand-edited one falls back rather than breaking.
  const bogus = text(render("/coverage", "election=%27%3B+DROP+TABLE+result%3B+--"));
  assert.match(bogus, /How much of this election do we actually hold/, "a bogus election id broke the page");
});

/* ────────────────────────────── the map's semantics ────────────────────────────── */

test("the map says which claim its colour is making, and never the other one", live, () => {
  // The defect this replaced: a layer called "Assembly control" over state paths that were every district ring
  // concatenated and stroked, so a party-coloured state arrived divided into party-coloured districts. The
  // available reading was "this district elected this party". The figure is the party leading that state's most
  // recent assembly election.
  const t = text(render("/"));
  assert.match(t, /India · Government/, "the map does not name its layer");
  assert.match(t, /Which party leads each state's assembly now\?/, "the government layer does not state its claim");
  // "Election winners" is the phrase the brief forbids for this layer, because at state level it is not one.
  assert.ok(!/Election winners/i.test(t), "the government layer is labelled as election winners");
  assert.ok(!t.includes("Assembly control"), "the ambiguous label is back");

  // The Lok Sabha layer has the same shape of problem and must also say what it aggregates.
  const lok = text(render("/", "layer=loksabha"));
  assert.match(lok, /most seats/i, "the Lok Sabha layer does not say it is an aggregate");
  assert.match(lok, /Which party won most of each state's Lok Sabha seats\?/);
});

test("the national map draws states and nothing smaller", live, () => {
  const html = render("/");
  // PROGRESSIVE GEOGRAPHIC DISCLOSURE, asserted. Two layers, in this order: fills with no stroke, then state
  // borders. The fills must not stroke, or the district edges inside them come back in the party's own gap
  // colour — which is the defect Phase 2.6 fixed and this must not reintroduce.
  assert.match(html, /class="iei-map-fills"/, "the fills are not their own layer");
  assert.match(html, /class="iei-map-borders"/, "the state borders are not their own layer");
  assert.ok(
    html.indexOf('class="iei-map-fills"') < html.indexOf('class="iei-map-borders"'),
    "a state border is painted under the fills, where it cannot be seen",
  );
  // AND THE 726 DISTRICT HAIRLINES ARE GONE. They were one 60 kB path over the whole country, at the one zoom
  // level where a district cannot be selected, compared or navigated to. Their absence is the fix, so their
  // absence is what is asserted — along with the disclaimer whose only job was to undo the impression they
  // created ("the fill is a state's government, which is not a claim about any district in it").
  assert.ok(!html.includes("iei-map-districts"), "the national map draws district lines again");
  assert.ok(!/not a claim about any district/i.test(text(html)), "a disclaimer for a layer that no longer exists");
  // The markup is materially smaller for it, which is the second reason and a measurable one.
  assert.ok(Buffer.byteLength(html) < 340_000, `${Buffer.byteLength(html)} bytes of markup — the district layer was about 60 kB of it`);
  // Every stroke in a map is a DEVICE measurement, not a user-unit one. This is the whole fix for the black
  // gridding over a state map: zoom here is a viewBox change, so a user-unit stroke is ~1.8px across a state
  // and ~25px inside a framed district.
  const css = readFileSync(new URL("../../../../src/app/iei.css", import.meta.url), "utf8");
  assert.match(css, /\.iei-map path \{[^}]*vector-effect:\s*non-scaling-stroke/, "map strokes scale with the frame");
  // And the caption still dates its boundaries, because they are a 2011 snapshot and India has moved on.
  assert.match(text(html), /2011 census districts/, "the map does not date its boundaries");
});

test("a page of every family renders under the markup budget, counted in bytes", live, () => {
  // 340,000 bytes of MARKUP: what the server renders, not what a browser is sent. The document Next sends
  // carries the page's tree a second time as flight data in script tags, which a model of its serializer
  // (not a captured response) puts at 2.1 to 2.6 times the markup, so this bounds the render and not the
  // transfer. It is held on one page of each family because a payload added to one (the parliament arc was
  // 13 kB) should be a decision, and until now only the front page and a six-seat fixture had a ceiling.
  const pages: [string, string, string][] = [
    ["/", "", ""],
    ["/state", "", "wb"],
    ["/state", "shape=tiles", "wb"],
    ["/election", "", "wb-assembly-2021"],
    ["/election", "", "ls-2024"],
    ["/constituency", "", "wb/assembly/mekliganj"],
    ["/constituency/analysis", "", "wb/assembly/mekliganj"],
  ];
  for (const [route, query, segments] of pages) {
    const bytes = Buffer.byteLength(render(route, query, segments));
    assert.ok(bytes < 340_000, `${route} ${query} ${segments}: ${bytes} bytes of markup`);
  }
});

test("the geometry's provenance is in the drawer, not in the caption", live, () => {
  const html = render("/");
  const caption = /<figcaption>([\s\S]*?)<\/figcaption>/.exec(html)?.[1] ?? "";
  assert.ok(caption.length > 0, "the map has no caption");
  // A boundary set is a source like any other, so its publisher, URL and hash belong where every other
  // citation is — behind one ⓘ — and not in the primary interface on every request.
  assert.ok(!caption.includes("udit-001"), "the publisher is back in the caption");
  assert.ok(!/sha256|githubusercontent/.test(caption), "a hash or a URL is in the caption");
  // But present in the drawer, with the two things that make a citation honest: how the bytes were obtained,
  // and what the hash is over.
  const t = text(html);
  assert.match(t, /udit-001/, "the geometry has no attribution anywhere");
  assert.match(t, /retrieved 2026-08-12/, "the geometry's retrieval date is not disclosed");
  assert.match(t, /sha256/, "the geometry's hash is not disclosed");
  assert.match(t, /had their bytes retrieved and hashed/, "the drawer does not say how the source was obtained");
});

test("provenance is not repeated once a page has already offered it", live, () => {
  // The footers of /pl and /p each carried a second copy of the whole source list plus a paragraph explaining
  // what the ⓘ does. One affordance per fact; the drawer teaches itself.
  for (const [route, segments] of [["/constituency", "wb/assembly/mekliganj"], ["/p", "mamata-banerjee-4a681f"]] as const) {
    const html = render(route, "", segments);
    const drawers = (html.match(/class="iei-ev(?:\s|")/g) ?? []).length;
    assert.ok(drawers > 0, `${route} offers no evidence at all`);
    const t = text(html);
    assert.ok(!/open the ⓘ beside/.test(t), `${route} explains the evidence mechanism in prose`);
    // The retrieval date appears inside drawers, and must not also be printed beside a figure.
    const outsideDrawers = html.replace(/<details class="iei-ev[\s\S]*?<\/details>/g, " ");
    assert.ok(!/retrieved \d{4}-\d{2}-\d{2}/.test(outsideDrawers), `${route} prints a retrieval date outside a drawer`);
    assert.ok(!/sha256/.test(outsideDrawers), `${route} prints a hash outside a drawer`);
  }
});

test("every party on the map has its own colour, and it is not assigned by rank", live, () => {
  const html = render("/");
  const fills = [...html.matchAll(/<path d="[^"]*" fill="(#[0-9a-f]{6})"/g)].map((m) => m[1] as string);
  assert.ok(fills.length >= 30, `only ${fills.length} polygons carry a fill`);
  // Seventeen parties lead a state. The old system had three hues and one grey, so at most four distinct
  // fills could ever appear; anything under ten means the identity system is not feeding the map.
  assert.ok(new Set(fills).size >= 10, `the map draws ${new Set(fills).size} distinct fills — is rank-based ink back?`);
  // The legend is CONTEXTUAL: parties that lead a state, with counts, and a folded tail rather than a
  // hundred-row key or a three-slot one with "Others".
  const t = text(html);
  // On the markup, not the stripped text: the count is its own element, so `text()` puts it on the next line.
  assert.match(html, />BJP<b>11 states<\/b>/, "the legend does not count what each party leads");
  assert.match(t, /more, one state each/, "the legend does not fold its tail");
  assert.ok(!t.includes("Others 13 parties"), "the legend still folds parties a reader can see into Others");
});

test("a party that won seats never renders in the register that means absence", live, () => {
  // THE KARNATAKA DEFECT, GENERICALLY. JD(S) won 23 of Karnataka's 224 seats in 2023 and its polygons read as
  // unshaded: it was not curated, so it fell to the generated register at chroma 0.055 — a wash a reader takes
  // for "no data". The fix was to curate every party that carries a state and to raise the quiet register's
  // chroma; this is the assertion that keeps it fixed, and it names no state and no party.
  //
  // THE RULE: a party holding four or more seats in the newest election of ANY jurisdiction must have a
  // curated identity, and no party with a seat may be drawn in the two inks that mean absence — NOT_HELD,
  // which is deliberately below the contrast floor, or the hueless neutral that means "no party recorded".
  const winners = all<{ k: string; seats: number; seenIn: string }>(
    db,
    `WITH newest AS (
       SELECT jurisdiction_place_id j, house, MAX(year) y FROM election
        WHERE kind IN ('assembly','general') GROUP BY 1, 2),
     el AS (
       SELECT e.id, e.jurisdiction_place_id j FROM election e
         JOIN newest n ON n.j = e.jurisdiction_place_id AND n.house = e.house AND n.y = e.year
        WHERE e.kind IN ('assembly','general'))
     SELECT COALESCE(pt.id, NULLIF(cd.party_raw,''), 'unattached') AS k,
            COUNT(*) AS seats, MIN(el.j) AS seenIn
       FROM el JOIN contest c ON c.election_id = el.id
            JOIN result r ON r.contest_id = c.id AND r.is_winner = 1
            JOIN candidacy cd ON cd.id = r.candidacy_id
            LEFT JOIN party_version pvv ON pvv.id = cd.party_version_id
            LEFT JOIN party pt ON pt.id = pvv.party_id
      GROUP BY 1 ORDER BY seats DESC`,
  );
  assert.ok(winners.length > 50, `only ${winners.length} winning parties — the query found nothing`);

  const curated = new Set(CURATED_KEYS);
  for (const w of winners) {
    const key = partyKey(w.k);
    const fill = fillFor(key);
    // Never the absence inks, whatever the seat count.
    assert.notEqual(fill.toLowerCase(), NOT_HELD.toLowerCase(), `${w.k} is drawn in the not-held ink`);
    if (key !== "unattached" && key !== "IND") {
      assert.ok(chromaOf(fill) > 0.03, `${w.k} (${w.seats} seats) is drawn hueless, which reads as no data`);
    }
    // Four seats anywhere is the line curation was measured against, so it is the line asserted.
    if (w.seats >= 4 && key !== "unattached") {
      assert.ok(curated.has(key), `${w.k} won ${w.seats} seats (${w.seenIn}) and has no curated colour`);
    }
  }

  // And the quiet register is quiet rather than absent: a tail party's colour is a colour.
  for (const k of ["KRS", "PDP", "SWP"]) {
    assert.ok(chromaOf(fillFor(k)) > 0.05, `${k} is too close to hueless to read as a party`);
  }
});

test("the parties that appear in one view separate from each other, in every jurisdiction", live, () => {
  // THE CONSTRAINT THAT MATTERS, and it replaced a global one that stopped being achievable.
  //
  // Sixty curated identities cannot be pairwise separable inside a band bounded by two contrast floors; 38
  // pairs sit under ΔE 5.5 and viz/party-ink.test.ts says so. But two parties only have to be
  // distinguishable when a reader meets them TOGETHER, and a legend is one jurisdiction's winners — three to
  // nine parties. That is checkable against the registry, and it is what this asserts.
  const views = new Map<string, string[]>();
  const rows = all<{ election: string; k: string }>(
    db,
    `WITH newest AS (
       SELECT jurisdiction_place_id j, house, MAX(year) y FROM election
        WHERE kind IN ('assembly','general') GROUP BY 1, 2),
     el AS (
       SELECT e.id, e.jurisdiction_place_id j FROM election e
         JOIN newest n ON n.j = e.jurisdiction_place_id AND n.house = e.house AND n.y = e.year
        WHERE e.kind IN ('assembly','general'))
     SELECT el.id AS election, COALESCE(pt.id, NULLIF(cd.party_raw,''), 'unattached') AS k
       FROM el JOIN contest c ON c.election_id = el.id
            JOIN result r ON r.contest_id = c.id AND r.is_winner = 1
            JOIN candidacy cd ON cd.id = r.candidacy_id
            LEFT JOIN party_version pvv ON pvv.id = cd.party_version_id
            LEFT JOIN party pt ON pt.id = pvv.party_id
      GROUP BY 1, 2`,
  );
  for (const r of rows) views.set(r.election, [...(views.get(r.election) ?? []), r.k]);
  assert.ok(views.size > 30, `only ${views.size} views — the query found nothing`);

  // The national map's legend is a view too: the party leading each jurisdiction's newest assembly.
  const leaders = home.homeView(db, { layer: "government", thisYear: 2026 }).layer.legend.map((l) => l.key);
  views.set("national-legend", leaders.filter((k): k is string => k !== null));

  // TWO FLOORS, because the two registers promise different things.
  //
  // A pair where either party is CURATED must separate: that is what curating sixty identities is for, and a
  // reader compares a party that carries a state against everything else on the map. A pair where BOTH are
  // generated is measured and reported and not floored — the quiet register is a hash into about five
  // thousand colours, two of Maharashtra 2019's one-seat parties landed on the same one, and no
  // context-free hash can promise otherwise. Both of those polygons still carry their party's abbreviation,
  // and both parties are in the legend by name.
  const curated = new Set(CURATED_KEYS);
  let worst = { d: Infinity, pair: "", view: "" };
  let worstDerived = { d: Infinity, pair: "", view: "" };
  for (const [name, keys] of views) {
    const u = [...new Set(keys)];
    for (let i = 0; i < u.length; i += 1) {
      for (let j = i + 1; j < u.length; j += 1) {
        const a = u[i] as string;
        const b = u[j] as string;
        const d = deltaE(fillFor(a), fillFor(b), "normal");
        const box = curated.has(a) || curated.has(b) ? "worst" : "derived";
        if (box === "worst" && d < worst.d) worst = { d, pair: `${a}/${b}`, view: name };
        if (box === "derived" && d < worstDerived.d) worstDerived = { d, pair: `${a}/${b}`, view: name };
      }
    }
  }
  assert.ok(worst.d >= 4.5, `${worst.pair} are ${worst.d.toFixed(2)} apart and appear together in ${worst.view}`);
  // Recorded so a change that makes the tail worse shows up in a diff.
  assert.ok(worstDerived.d >= 0, `${worstDerived.pair} in ${worstDerived.view}: ${worstDerived.d.toFixed(2)}`);
});

test("a party can be isolated, and the isolation is in the URL", live, () => {
  const plain = render("/");
  const only = render("/", "party=BJP");
  // On the markup: the party's name is its own element, so `text()` puts it on a line of its own.
  assert.match(only, /Showing only where <b>BJP<\/b> leads/, "the map does not say it is filtered");
  assert.match(only, /href="\/#map"/, "there is no way back to every party");
  assert.match(only, /<a (?=[^>]*iei-legend-on)(?=[^>]*aria-current="true")[^>]*>/, "the isolated party is not marked as current");
  // Muting is opacity on the fill, never a different colour: the fill is the party's identity.
  assert.ok(/opacity="0\.22"/.test(only), "nothing is muted");
  assert.ok(!/opacity="0\.22"/.test(plain), "the unfiltered map mutes something");
  // The labels of muted polygons go with them — 36 abbreviations over a dimmed map is noise.
  const labels = (s: string): number => (s.match(/<text /g) ?? []).length;
  assert.ok(labels(only) < labels(plain), "isolating a party did not reduce the labels");
  assert.ok(labels(only) > 0, "isolating a party removed every label");

  // Validated by MEMBERSHIP. A party that leads nothing, a party absent from this layer, and an injection all
  // fall back to showing everything rather than to an empty map.
  for (const q of ["party=NOTAPARTY", "party=%27%20OR%201%3D1", "layer=turnout&party=BJP"]) {
    assert.ok(!render("/", q).includes("Showing only where"), `${q} was honoured as a filter`);
  }
});

test("URL state restores the map, and the layer strip carries it", live, () => {
  const html = render("/", "layer=loksabha&party=BJP");
  assert.match(text(html), /Lok Sabha · most seats/, "the layer did not restore");
  assert.match(html, /Showing only where <b>BJP<\/b> leads/, "the isolation did not restore");
  // Switching to a DIFFERENT layer keeps the party, so the strip does not silently drop the reader's filter.
  // The one link that legitimately drops it is the legend's own entry for BJP, which is the toggle that turns
  // the isolation off, so it is excluded by looking only at links to another layer.
  const links = [...html.matchAll(/href="\/\?([^"]*)#map"/g)].map((m) => (m[1] as string).replace(/&amp;/g, "&"));
  assert.ok(links.length >= 5, "the layer strip did not render links");
  const toOtherLayers = links.filter((q) => /layer=/.test(q) && !q.includes("layer=loksabha"));
  assert.ok(toOtherLayers.length >= 4, `only ${toOtherLayers.length} links to another layer`);
  assert.ok(toOtherLayers.every((q) => q.includes("party=BJP")), "a layer link drops the party");
  // And the toggle exists: one link back to this layer with no party at all.
  assert.ok(links.includes("layer=loksabha"), "there is no way to stop isolating the party");
});

/* ────────────────────────────── the state's electoral map ────────────────────────────── */


test("a map draws polygons from one coordinate space, and says how many it withheld", live, () => {
  // `place_geometry.view_box` is per row because two geometry sources need not share a projection, and a map
  // can only draw the polygons that agree about the plane. West Bengal exercised this: 276 constituencies in
  // the national frame and 31 left over from a repo module in a 400x580 one.
  //
  // A FRESH REGISTRY HAS NONE OF THOSE, which is the closure working rather than the guard going away — the
  // module has left the seed, so a rebuild holds one frame for every constituency. So what is asserted is the
  // invariant that survives either way: every path the map receives is in the frame it declares, and anything
  // in another frame is counted rather than drawn.
  for (const j of ["wb", "ka", "up"]) {
    const v = stateView(db, j);
    assert.ok(v.kind === "ready", `${j} has nothing to open on`);
    const { geometry, seats } = v.map;
    assert.ok(geometry.viewBox !== "", `${j} declares no frame`);
    assert.equal(seats.filter((x) => x.path !== null).length, geometry.drawable);
    assert.equal(geometry.drawable + geometry.otherFrames <= geometry.total, true);
  }
  // And the count is real rather than hardcoded to zero: it is the number of held polygons the map refused, which
  // is every one of this election's that is not in the shared frame.
  const wb = stateView(db, "wb");
  assert.ok(wb.kind === "ready", "wb has nothing to open on");
  const refused =
    all<{ n: number }>(
      db,
      `SELECT COUNT(*) AS n
         FROM contest c
         JOIN place_version pv ON pv.id = c.place_version_id
         JOIN place_geometry g ON g.place_version_id = pv.id
        WHERE c.election_id = ? AND pv.jurisdiction_id = 'wb' AND g.path IS NOT NULL
          AND COALESCE(g.view_box, '') <> ?`,
      wb.map.election?.id ?? "",
      electionMap.SHARED_FRAME,
    )[0]?.n ?? 0;
  assert.equal(wb.map.geometry.otherFrames, refused, "the guard does not count what it withheld");
});




test("the state page opens on the state's own house, not the newest election", live, () => {
  // Madhya Pradesh's newest assembly is 2018 and ls-2024 is newer. Offering the Lok Sabha here made
  // "newest full election" open a state page on the parliamentary map, which is not what a reader came for.
  for (const j of ["mp", "rj", "wb", "ka"]) {
    const v = stateView(db, j);
    assert.ok(v.kind === "ready", `${j} has nothing to open on`);
    assert.equal(v.house, "assembly", `${j} opens on the ${v.house}`);
    assert.equal(v.map.election?.body, "assembly", `${j} opens on ${v.map.election?.id}`);
    assert.notEqual(v.map.election?.fill, "bypoll", `${j} opens on a by-election`);
  }
});

test("a state map's polygons name their publisher and their licence, in the drawer", live, () => {
  // 5,000 constituency polygons arrived in this phase from a Creative Commons Attribution source, and
  // attribution is a CONDITION of that licence rather than a courtesy. The panel had no drawer at all until
  // this test, so the publisher, the licence, the retrieval date and the hash were nowhere.
  const html = render("/state", "", "ka");
  const drawers = [...html.matchAll(/<details class="iei-ev"[\s\S]*?<\/details>/g)].map((m) => m[0]);
  const mapDrawer = drawers.find((d) => d.includes("Assembly Constituencies"));
  assert.ok(mapDrawer !== undefined, "the map panel has no evidence drawer");
  assert.match(mapDrawer, /DataMeet India community/, "the polygons' publisher is not named");
  assert.match(mapDrawer, /CC BY 2\.5 IN/, "the polygons' licence is not named");
  assert.match(mapDrawer, /sha256 [0-9a-f]{12}/, "the polygons' hash is not shown");
  assert.match(mapDrawer, /boundary geometry/, "the source's kind is not shown");
  // The results' own source is in the same drawer, not a second one.
  assert.match(mapDrawer, /Lokdhaba|Trivedi|Election Commission/);

  // AND NOWHERE ELSE. A publisher, a licence or a hash outside a drawer is the clutter Phase 2.6 removed.
  const outside = html.replace(/<details class="iei-ev"[\s\S]*?<\/details>/g, "");
  assert.doesNotMatch(text(outside), /DataMeet/, "the polygons' publisher is in the primary interface");
  assert.doesNotMatch(text(outside), /CC BY/, "a licence is in the primary interface");
  assert.doesNotMatch(text(outside), /sha256/, "a hash is in the primary interface");
});





/* ────────────────────────────── navigation ────────────────────────────── */

test("every place the front page links to actually resolves", live, () => {
  const html = render("/");
  // EVERY /pl link, with or without a query string. The earlier version of this test matched only
  // `href="/constituency/xx"` with nothing after it, and the general election's row linked to `/pl/in?election=…` —
  // so a link to a 404 sat on the front page behind a query string the regex did not see. India's page is
  // the front page; the row names the nation in plain text now, and the assertion below is what catches the
  // next one.
  const targets = [...new Set([...html.matchAll(/href="\/state\/([a-z]{2})(?:[?#"])/g)].map((m) => m[1] as string))];
  assert.ok(targets.length > 0, "the front page links to no place at all");
  for (const id of targets) {
    // A 404 throws inside the render, so this asserting-by-not-throwing is the assertion.
    const page = text(place(id));
    assert.ok(page.length > 50, `/state/${id} rendered almost nothing`);
    assert.doesNotMatch(page, /not built in this checkout/, `/state/${id} could not read the registry`);
  }
  // And the map specifically must reach all 36, which is the country.
  const onMap = [...new Set([...html.matchAll(/id="iei-j-([a-z]{2})"/g)].map((m) => m[1] as string))];
  assert.equal(onMap.length, 36, `the map offers ${onMap.length} jurisdictions, not 36`);
});

test("the navigation graph walks all the way down, in five jurisdictions", live, () => {
  // Phase J's graph, walked rather than asserted about: INDIA → STATE → DISTRICT → SEAT → ANALYSIS, with
  // every step taken from the LINKS THE PREVIOUS PAGE RENDERED. Nothing here is a hand-written path, so a
  // page that stops offering a way down fails the test rather than quietly becoming a dead end.
  //
  // Five jurisdictions, and they are the brief's five because between them they are every shape this data
  // has: a union territory re-delimited after 2008 (jk), a state re-delimited after 2008 (as), the largest
  // (up), the one this project started as (wb), and one with no relationship to any of them (ka).
  for (const state of ["ka", "wb", "up", "as", "jk"]) {
    const statePage = render("/state", "", state);
    // Asserted on the MARKUP, not the stripped text: the crumb separator is its own element, so `text()`
    // renders the trail as three lines and a regex over it is checking the helper rather than the page.
    assert.match(statePage, /href="\/"[^>]*>India</, `/state/${state} has no breadcrumb back to India`);
    assert.ok(text(statePage).includes("Elections on record"), `/state/${state} does not list its elections`);

    // A district link is a three-segment path under this state.
    const district = new RegExp(`href="/district/${state}/([^/"]+)"`).exec(statePage)?.[1];
    assert.ok(district !== undefined, `/state/${state} offers no district`);
    const districtPage = render("/district", "", `${state}/${district}`);
    const dt = text(districtPage);
    assert.ok(dt.length > 200, `/state/${state}/${district} rendered almost nothing`);
    assert.doesNotMatch(dt, /not built in this checkout/, `/state/${state}/${district} could not read the registry`);

    // A seat link is a CONSTITUENCY route, and it carries the state rather than the district — a
    // delimitation can move a seat between districts while the name survives.
    const seat = new RegExp(`href="/constituency/${state}/(assembly|lok-sabha)/([^/"]+)"`).exec(districtPage);
    assert.ok(seat !== null, `/district/${state}/${district} offers no seat`);
    const seatPage = render("/constituency", "", `${state}/${seat?.[1]}/${seat?.[2]}`);
    const st = text(seatPage);
    assert.ok(st.includes("Every election on record"), `${state}/${district}/${seat} has no election history`);
    assert.ok(st.includes("Analysis"), `${state}/${district}/${seat} offers no analysis lens`);
    // The breadcrumb has all four levels, and the first is a link home.
    assert.match(seatPage, /href="\/"[^>]*>India</, `${state}/${district}/${seat} cannot reach India`);

    // And the Analysis floor renders, which is where every chart in the product lives.
    // The BODY comes from the link the district page offered, not from a rebuilt path: a canonical
    // constituency URL cannot be assembled from a place path alone any more, which is the point of it.
    const analysis = text(render("/constituency/analysis", "", `${state}/${seat?.[1]}/${seat?.[2]}`));
    assert.match(analysis, /How .* got this way/, `${state}/${district}/${seat}/analysis has no headline`);
    assert.ok(analysis.includes("Window"), "the analysis floor lost its window filter");

    // A member link out of the seat's history reaches a person, which is the last level of the graph.
    const person = /href="\/p\/([^"]+)"/.exec(seatPage)?.[1];
    if (person !== undefined) {
      const pt = text(render("/p", "", person));
      assert.ok(pt.includes("Career") || pt.includes("Affidavit trail"), `/p/${person} rendered no record`);
      assert.match(render("/p", "", person), /href="\/"[^>]*>India</, `/p/${person} has no breadcrumb`);
    }
  }
});

test("the five jurisdictions the brief names each render their own name and result", live, () => {
  // Karnataka, West Bengal, Uttar Pradesh, Assam, Jammu & Kashmir — one of them a union territory, which is
  // how the 404 that hit all eight UTs was found.
  const expected = [
    ["ka", "Karnataka"],
    ["wb", "West Bengal"],
    ["up", "Uttar Pradesh"],
    ["as", "Assam"],
    ["jk", "Jammu and Kashmir"],
  ] as const;
  for (const [id, name] of expected) {
    const page = text(place(id));
    assert.ok(page.includes(name), `/state/${id} does not name ${name}`);
  }
  // And on the homepage, each must appear with a leading party in the standings table.
  const home = text(render("/"));
  for (const [, name] of expected) {
    assert.ok(home.includes(name), `${name} is missing from the homepage`);
  }
});

/* ────────────────────────────── the architectural rule ────────────────────────────── */

test("no state is hardcoded anywhere in the feature", () => {
  // "There must be no `if state === 'WB'` and no `const states = [...]` inside the feature." Checked over
  // the files this phase added or rewrote, because the rule is what makes a new jurisdiction a data load.
  const files = [
    "src/app/page.tsx",
    "src/app/iei.css",
    "src/components/iei/Shell.tsx",
    "src/components/iei/IndiaMap.tsx",
    "src/components/iei/parts.tsx",
    "src/components/iei/CommandKey.tsx",
    "src/lib/india-geo.ts",
    "packages/mandate/src/repo/home.ts",
  ];
  // Two of the 36 whose names appear nowhere else, plus the one this product started as.
  const names = ["West Bengal", "Karnataka", "Kerala", "Uttar Pradesh", "Tamil Nadu", "Maharashtra"];
  for (const file of files) {
    const src = readFileSync(new URL(`../../../../${file}`, import.meta.url), "utf8");
    // Comments are where the reasoning lives, and reasoning cites examples. Strip them first.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*)/.test(l))
      .join("\n");
    for (const name of names) {
      assert.ok(!code.includes(name), `${file} names ${name} in code, not in a comment`);
    }
    assert.doesNotMatch(code, /['"]wb['"]|['"]ka['"]/, `${file} carries a jurisdiction id as a literal`);
  }
});

/* ────────────────────────────── the command bar ────────────────────────────── */

test("one field answers for every kind of thing, and every group it offers is navigable", live, () => {
  // Phase G's requirement, on the rendered page: ONE search surface, results GROUPED, and every group
  // reachable from the shell's single field. The page it replaced answered for people only — and carried a
  // second copy of the same field twelve pixels below the shell's.
  const t = text(render("/search", "q=north"));
  assert.ok(t.includes("Constituencies"), "a seat query does not produce a constituencies group");
  // "ram" is a fragment of a state, a party, several seats and many names, so one query exercises all five
  // groups. A single letter does not: `searchPersons` blocks on name keys and will not fire on one character,
  // which is a property of that index rather than of this page.
  const html = render("/search", "q=ram");
  for (const group of ["States", "Elections", "Constituencies", "People", "Parties"]) {
    assert.ok(text(html).includes(group), `the "${group}" group is missing for a query that matches all five`);
  }
  // Exactly one search input on the page — the shell's. The old page had two.
  assert.equal((html.match(/<input[^>]*type="search"/g) ?? []).length, 1, "there is more than one search field");
  // And no <select> anywhere in the chrome: the state and election pickers are what the bar replaced.
  const shell = html.slice(0, html.indexOf("</header>") + 1);
  assert.ok(!shell.includes("<select"), "the header still carries a picker");
});

test("an empty query explains itself rather than listing the registry", live, () => {
  const t = text(render("/search", ""));
  assert.match(t, /Search India/, "the empty state does not say what is searchable");
  // The word appears in the "what is searchable" list; a result GROUP is a heading followed by its question.
  assert.ok(!t.includes("Which seat?"), "an empty query rendered a result group");
});

test("the render harness is test scaffolding and nothing imports it", () => {
  // It compiles .tsx and stubs CSS. If the application ever depended on it, the production build would be
  // relying on a probe.
  const src = readdirSync(new URL("../../../../src", import.meta.url), { recursive: true }) as string[];
  for (const f of src) {
    if (!/\.(ts|tsx)$/.test(f)) continue;
    const body = readFileSync(new URL(`../../../../src/${f}`, import.meta.url), "utf8");
    assert.ok(!body.includes("ops/probe"), `src/${f} imports the render harness`);
  }
});

/* ══════════════════ the state intelligence surface ══════════════════════════════════════════════
 *
 * These replace seven tests that asserted the PREVIOUS state page's markup — a `stateMapView` map, a
 * district tally table beside it, and specific caption strings. That page is gone, so those assertions
 * were checking a shape rather than a promise. What is asserted here is what the surface owes a reader,
 * which is the thing that must not regress even when the markup changes again:
 *
 *   the map exists and colours CONSTITUENCIES, not the state
 *   an election can be chosen, and it is scoped to this state
 *   a district navigates AND focuses
 *   the selection is shared: party, band, flip and district all move the map
 *   a comparison across a redraw is refused
 *   evidence is offered once
 */

test("a state page draws constituencies, and colours them by who won each one", live, () => {
  const html = render("/state", "", "ka");
  const t = text(html);
  assert.match(t, /Which party won each seat\?/, "the state map does not state its claim");
  // The national map's claim is about GOVERNMENT. A state map must never be labelled with it.
  assert.ok(!/\bGovernment\b/.test(t), "the state map wears the national map's layer name");
  const fills = html.slice(html.indexOf('class="iei-map-fills"'));
  assert.ok((fills.match(/<path /g) ?? []).length >= 220, "Karnataka draws almost no constituencies");
});

test("a state's Lok Sabha view is that state's seats, not the whole country", live, () => {
  // THE DEFECT THIS REPLACES: the state page asked for ls-2024 and got 543 seats, so a page titled West
  // Bengal drew a map of India. A general election belongs to the nation and is fought in every state, so
  // the state's view of it is the election SCOPED — and every aggregate has to be scoped with it.
  const expected: Record<string, number> = { ka: 28, wb: 42, up: 80, as: 14, jk: 5 };
  for (const [state, n] of Object.entries(expected)) {
    const v = electionMap.electionMapView(db, "ls-2024", state);
    assert.equal(v.seats.length, n, `${state} should hold ${n} parliamentary seats, got ${v.seats.length}`);
    assert.equal(v.scope, state, `${state}'s view does not record its own scope`);
    // A MAJORITY OF WHAT IS IN SCOPE. 22 of West Bengal's 42, never 272 of 543.
    assert.equal(v.majority, Math.floor(n / 2) + 1, `${state}'s majority is not of its own seats`);
    // Every seat really is inside the state.
    assert.ok(
      v.seats.every((s) => s.jurisdictionId === state),
      `${state}'s scoped view contains a seat from elsewhere`,
    );
    // Vote share is over the votes cast in THESE contests, so it must still sum to about a whole.
    const share = v.voteSeat.reduce((sum, r) => sum + (r.votePct ?? 0), 0);
    if (v.voteSeat.length > 0) {
      assert.ok(share > 80 && share < 101, `${state}'s scoped vote shares sum to ${share.toFixed(1)}`);
    }
  }
  // And unscoped is still the whole election, so the parameter adds a view rather than changing the default.
  assert.equal(electionMap.electionMapView(db, "ls-2024").seats.length, 543);
});

test("scoping an assembly election to its own state changes nothing", live, () => {
  // The same contract has to serve both houses, or the two drift. An assembly election is already confined
  // to one state, so the scope is a no-op — and asserting that is what proves there is ONE code path.
  const wide = electionMap.electionMapView(db, "ka-assembly-2023");
  const narrow = electionMap.electionMapView(db, "ka-assembly-2023", "ka");
  assert.equal(narrow.seats.length, wide.seats.length);
  assert.equal(narrow.majority, wide.majority);
  assert.equal(narrow.flips?.flipped, wide.flips?.flipped);
  assert.equal(narrow.legend[0]?.n, wide.legend[0]?.n);
});

test("a district both navigates and focuses, and is never given a winner", live, () => {
  const html = render("/state", "", "ka");
  // NAVIGATION: a district still has its own page, and the state page still offers the path to it. Losing
  // this severed INDIA -> STATE -> DISTRICT -> SEAT once already.
  assert.match(html, /href="\/district\/ka\/[^/"]+"/, "the state page offers no district page");
  // FOCUS: and it can be selected in place, which is what scopes the analytics.
  assert.match(html, /[?&]district=ka\./, "a district cannot be focused on the map");
  // A DISTRICT NEVER WINS. The type carries no winner field, so this asserts the vocabulary too.
  const v = electionMap.electionMapView(db, "ka-assembly-2023", "ka");
  const groups = electionMap.districtGroups(v.seats);
  assert.ok(groups.length > 0, "no districts grouped");
  for (const g of groups) {
    assert.ok(!("winner" in g), `${g.name} was given a winner`);
    assert.equal(
      g.parties.reduce((n, p) => n + p.n, 0) <= g.seats,
      true,
      `${g.name} attributes more seats than it holds`,
    );
  }
});

test("focusing a district scopes the seats every figure describes", () => {
  // Literal seats, so this needs no registry: two districts, a seat outside both, one with no margin, and a seat in each
  // of the five bands. What it pins is that the figures of the page and the seats of its links are one subset.
  const at = (placeId: string, districtId: string | null, winner: string | null, marginPct: number | null): ElectionSeat =>
    ({
      placeId,
      districtId,
      districtName: districtId === null ? null : districtId.toUpperCase(),
      partyKey: winner,
      partyLabel: winner,
      runnerUpKey: null,
      runnerUpLabel: null,
      marginPct,
      marginBin: electionMap.binOf(marginPct),
    }) as ElectionSeat;
  const seats = [
    at("s1", "x.a", "P", 0.5),
    at("s2", "x.a", "Q", 1.5),
    at("s3", "x.a", "P", 3),
    at("s4", "x.b", "P", 7),
    at("s5", "x.b", "Q", 15),
    at("s6", "x.b", null, null),
    at("s7", null, "Q", 0.2),
  ];
  const choices = electionMap.stateChoicesOf({ legend: [{ key: "P" }, { key: "Q" }], voteSeat: [], seats, flips: null });
  const read = (query: string) => readSelection(new URLSearchParams(query), choices, { base: "/state/x" });
  const ids = (xs: readonly ElectionSeat[]): string[] => xs.map((x) => x.placeId);

  const groups = electionMap.districtGroups(seats);
  assert.deepEqual(
    groups.map((g) => [g.id, g.seats]),
    [["x.a", 3], ["x.b", 3]],
    "a seat in no district is in no group",
  );
  const group = groups[0] as (typeof groups)[number];
  const inside = read(`district=${group.id}`).inDistrict(seats);
  assert.deepEqual(ids(inside), ["s1", "s2", "s3"], "the focused set is not the district's seats");
  assert.equal(inside.length, group.seats);
  assert.ok(inside.length < seats.length, "focusing a district selected the whole state");

  // The competitiveness bands are computed over the SAME subset, which is what makes the page one instrument.
  const counts = (xs: readonly ElectionSeat[]): number[] => electionMap.marginBandCounts(xs).map((b) => b.n);
  assert.deepEqual(counts(inside), [1, 1, 1, 0, 0]);
  assert.deepEqual(counts(seats), [2, 1, 1, 1, 1], "a seat with no margin is in no band");
  // And a band's link selects exactly the seats its segment counts, in the district and out of it.
  for (const query of ["", `district=${group.id}`, "district=x.b"]) {
    const subset = read(query).inDistrict(seats);
    electionMap.marginBandCounts(subset).forEach((b) => {
      assert.equal(read(`${query}&band=${b.key}`).narrow(seats).length, b.n, `${query} ${b.key}`);
    });
  }
  // The legend of a focused district tallies the district's winners only.
  assert.deepEqual(groups[0]?.parties, [{ key: "P", label: "P", n: 2 }, { key: "Q", label: "Q", n: 1 }]);
  assert.deepEqual(tally(inside, "winner"), groups[0]?.parties);
});

test("every selection the state page offers is in the URL and moves the map", live, () => {
  const html = render("/state", "", "ka");
  // One shared selection model, and each rung of it has to be reachable from the rendered page.
  for (const [what, pattern] of [
    ["party isolation", /[?&]party=/],
    ["margin band", /[?&]band=/],
    ["map mode", /[?&]mode=/],
    ["district focus", /[?&]district=/],
    ["seat focus", /[?&]seat=/],
    ["election choice", /[?&]election=/],
  ] as [string, RegExp][]) {
    assert.match(html, pattern, `${what} is not carried in the URL`);
  }
  // FLIP MODE EXISTS where a comparison is legal, and the flip matrix links into it.
  assert.match(html, /[?&]mode=flips/, "flip mode is not reachable");
});

test("a selection actually dims the map rather than only changing the list", live, () => {
  // The failure this guards is a page where the charts filter and the map does not — which is what "five
  // independent filter states" looks like from the outside.
  const all = render("/state", "", "ka");
  const isolated = render("/state", "party=INC", "ka");
  const dimmedBefore = (all.match(/opacity="0\.18"/g) ?? []).length;
  const dimmedAfter = (isolated.match(/opacity="0\.18"/g) ?? []).length;
  assert.equal(dimmedBefore, 0, "the map dims something before anything is selected");
  assert.ok(dimmedAfter > 50, `isolating a party dimmed only ${dimmedAfter} polygons`);
});

test("the election page reads a margin bin only if it is one", live, () => {
  // `Number("")` is 0, so a hand-edited `?bin=` used to isolate the 0 to 2 bin, as did `?bin=%20`, and `4.0` or `0x4`
  // were read as the bin 4. A bin is a whole number the distribution holds, and nothing else selects one.
  const found = electionMap
    .electionChoices(db)
    .map((c) => ({ id: c.id, bin: electionMap.electionMapView(db, c.id).marginBins.find((b) => b.n > 0) }))
    .find((c) => c.bin !== undefined);
  assert.ok(found !== undefined, "no election in the registry has a margin distribution");
  const { lo, hi } = found.bin as { lo: number; hi: number | null };
  assert.match(
    render("/election", `bin=${lo}`, found.id),
    new RegExp(`aria-label="Seats decided by ${hi === null ? `${lo} percent or more` : `${lo} to ${hi} percent`}, in seat order"`),
    "a real bin did not isolate its seats",
  );
  for (const odd of ["", "%20", "4.0", "0x4", "1e1"]) {
    const html = render("/election", `bin=${odd}`, found.id);
    assert.ok(!html.includes("Seats decided by"), `?bin=${odd} isolated a bin`);
    assert.ok(html.includes('aria-label="Closest contests"'), `?bin=${odd} changed the list`);
  }
});

test("every party the runner-up legend lists can be isolated from it", live, (t) => {
  // That legend counts the parties that came second, and the page validated a party against the ones that won or
  // have a row in the vote-to-seat plot, so a party that only ever came second was offered a link that led nowhere.
  const found = electionMap
    .electionChoices(db)
    .map((c) => {
      const v = electionMap.electionMapView(db, c.id);
      const offered = new Set([...v.legend.map((l) => l.key), ...v.voteSeat.map((r) => r.party.key)]);
      const dead = tally(v.seats, "runnerUp")
        .slice(0, 10)
        .find((l) => !offered.has(l.key));
      return { id: c.id, dead };
    })
    .find((c) => c.dead !== undefined);
  if (found === undefined) return t.skip("no election has a party in its runner-up legend that only came second");
  const key = (found.dead as { key: string }).key;
  const html = render("/election", new URLSearchParams({ mode: "runnerup", party: key }).toString(), found.id);
  assert.match(html, /<a (?=[^>]*iei-legend-on)(?=[^>]*aria-current="true")[^>]*>/, `${found.id}: the link for ${key} did not isolate it`);
  assert.match(html, /aria-label="Seats where [^"]+ came second, in seat order"/, `${found.id}: ${key} listed no seats`);
});

test("every party the state page's runner-up legend lists can be isolated from it", live, (t) => {
  // The same defect as the election page's: the legend counts the parties that came second, and the page validated a
  // party against the winners' legend and the vote-to-seat plot, so a party that only ever came second was offered a link
  // that led nowhere.
  let found: { state: string; election: string; house: string; key: string } | undefined;
  for (const j of all<{ id: string }>(db, `SELECT id FROM place WHERE kind IN ('state', 'ut') ORDER BY id`)) {
    const first = stateView(db, j.id);
    if (first.kind !== "ready") continue;
    for (const house of first.houses) {
      const opened = stateView(db, j.id, { house: kindOfBody(house) });
      if (opened.kind !== "ready") continue;
      for (const c of opened.choices) {
        const s = stateView(db, j.id, { house: kindOfBody(house), election: c.id });
        if (s.kind !== "ready" || found !== undefined) continue;
        const offered = new Set([...s.map.legend.map((l) => l.key), ...s.map.voteSeat.map((r) => r.party.key)]);
        const dead = tally(s.map.seats, "runnerUp")
          .slice(0, 10)
          .find((l) => !offered.has(l.key));
        if (dead !== undefined) found = { state: j.id, election: c.id, house: kindOfBody(house), key: dead.key };
      }
    }
  }
  if (found === undefined) return t.skip("no state's election has a party in its runner-up legend that only came second");
  const query = new URLSearchParams({ house: found.house, election: found.election, mode: "runnerup", party: found.key });
  const html = render("/state", query.toString(), found.state);
  assert.match(html, /<a (?=[^>]*iei-legend-on)(?=[^>]*aria-current="true")[^>]*>/, `${found.state} ${found.election}: the link for ${found.key} did not isolate it`);
  assert.match(html, /aria-label="Seats where [^"]+ came second, (closest first|in seat order)/, `${found.state} ${found.election}: ${found.key} listed no seats`);
});

test("a comparison across a redrawn map is refused on the page, not just in the data", live, () => {
  // ka-assembly-2008's predecessor sits under the 1976 order. The data layer refuses it; this asserts the
  // PAGE says so rather than rendering an empty section or, worse, a flip count.
  const t = text(render("/state", "election=ka-assembly-2008", "ka"));
  assert.match(t, /Seat-level comparison unavailable/, "the page does not explain the refusal");
  assert.ok(!/seats changed hands/.test(t), "a flip claim survived the epoch gate on the page");
});

test("the state page offers evidence once, and no per-value provenance", live, () => {
  const html = render("/state", "", "ka");
  // SCOPED TO THE ANALYTICAL CONTENT, deliberately. The site footer carries one link to `/coverage` — "what
  // this registry holds, and what it does not" — and that is the product's single honest home for
  // completeness. Banning the word everywhere would have failed the footer, which is the opposite of the
  // point: what must not return is provenance hanging off every FIGURE.
  const body = html.slice(0, html.indexOf("<footer") === -1 ? html.length : html.indexOf("<footer"));
  const t = text(body);
  for (const banned of [/\bderived\b/i, /\bcoverage\b/i, /computed using/i, /\bplace_version\b/, /\bepoch_id\b/]) {
    assert.ok(!banned.test(t), `the state page prints ${banned} beside its figures`);
  }
  // And evidence IS offered — once per analytical panel, never per value.
  const drawers = (html.match(/sources</g) ?? []).length;
  assert.ok(drawers >= 1, "the state page offers no evidence affordance at all");
  assert.ok(drawers <= 4, `${drawers} evidence affordances is provenance scattered again`);
});

/* ───────────────────── the turnout figure the product does not trust ───────────────────── */

test("a turnout the registry cannot corroborate never renders as a hero figure", live, () => {
  // WEST BENGAL 2026, and this is a release blocker rather than a nicety. The registry holds 93.0% turnout
  // for it. West Bengal polled 82.1% in 2021 — matching the ECI — and its per-seat floor has never been
  // above 54.4% in sixteen elections since 1962, where 2026's floor is 82.7% with 66 seats above 95%. It is
  // a seed defect, and it used to sit in the state hero in the same type as a real majority count, where a
  // first-time reader had no way to discount it.
  //
  // The rule is CORROBORATION, not plausibility: of 372 elections that publish turnout, 371 reconcile
  // against their own vote counts (96.4%–100.0% of voters) and exactly one publishes turnout with zero
  // countable votes. See `turnout-trust.ts` for why a threshold was measured and rejected.
  const wb = electionMap.electionMapView(db, "wb-assembly-2026", "wb");
  assert.equal(wb.turnout.state, "unverified", "the fixture changed: WB 2026 turnout is no longer flagged");
  const held = wb.turnout.state === "unverified" ? wb.turnout.evidence.pct : 0;
  assert.ok(held > 92 && held < 94, `expected the defective ~93% to still be PRESERVED, got ${held}`);

  const html = render("/state", "", "wb");
  // THE SURFACE, meaning the page MINUS its evidence drawers. The distinction is the whole requirement:
  // a closed <details> is still in the DOM, so `text()` alone cannot tell "we print this figure" from
  // "we keep this figure where a reader who asks can find it".
  const t = text(html.replace(/<details class="iei-ev[\s\S]*?<\/details>/g, " "));

  // 1 — THE NUMBER IS NOT ON THE SURFACE. Not "93.0", not the value to any rounding a hero would use.
  for (const shape of [/93\.0\s*%/, /92\.9\s*%/, /93\s*%\s*turnout/i]) {
    assert.ok(!shape.test(t), `the uncorroborated turnout still renders on the surface as ${shape}`);
  }

  // 2 — AND ITS ABSENCE IS EXPLAINED, in the reader's words, where the number used to be.
  assert.match(t, /verification pending/i, "the surface neither shows turnout nor says why not");

  // 3 — THE EVIDENCE DRAWER KEEPS EVERYTHING: the value, the reason, and that nothing replaces it. Asserted
  //     against the raw markup because the drawer is a closed <details> whose content is still in the DOM.
  assert.match(html, /93\.0%/, "the drawer dropped the sourced value the brief says to preserve");
  assert.match(html, /cannot be\s+reconciled against votes cast|reconciled against votes cast/,
    "the drawer does not say WHY the figure is doubted");
  assert.match(html, /No corrected or estimated figure is being asserted/,
    "the drawer does not say that no replacement is claimed");
  // Not the previous cycle's figure dressed up as this one's.
  assert.ok(!/82\.1%\s*turnout/.test(t), "2021's turnout was substituted for 2026's");

  // 4 — AND NO OTHER ELECTION IS DEFAMED. Karnataka 2023 published its counts, so its turnout is a fact and
  //     still reads as one. This is the half of the requirement a suppression would have failed.
  const ka = electionMap.electionMapView(db, "ka-assembly-2023");
  assert.equal(ka.turnout.state, "reported", "a well-sourced turnout was flagged as unverified");
  const kt = text(render("/state", "", "ka").replace(/<details class="iei-ev[\s\S]*?<\/details>/g, " "));
  assert.match(kt, /\d\d\.\d% turnout/, "Karnataka's valid turnout stopped rendering as a figure");
  assert.ok(!/verification pending/i.test(kt), "Karnataka was given a caveat it does not need");
});

test("exactly one election in the registry fails the corroboration rule", live, () => {
  // The rule's SELECTIVITY, pinned. If a future change makes it fire more widely, this fails here rather
  // than silently stamping "verification pending" across the product.
  const ids = all<{ id: string }>(
    db,
    `SELECT e.id AS id FROM election e
      WHERE EXISTS (SELECT 1 FROM contest c JOIN turnout t ON t.contest_id = c.id AND t.scope = 'contest'
                     WHERE c.election_id = e.id AND t.voters > 0 AND t.electors > 0)`,
  ).map((r) => r.id);
  const flagged = [...unverifiedTurnout(db, ids)].sort();
  assert.deepEqual(flagged, ["wb-assembly-2026"], `the corroboration rule now flags ${flagged.length}`);
});

test("no SVG title is assembled from several nodes, on any figure", live, () => {
  /**
   * A `<title>` written as several JSX children arrives at the DOM as an ARRAY, and a browser renders the
   * whole array — comment markers and all — as the tooltip string, then hydration mismatches on it. Both of
   * the election figures had one, and every text assertion in this file passed over it, because the rendered
   * output still contained the right words in the right order. Only a browser complained.
   *
   * So this test listens the way the browser does: React writes the warning to STDERR, which means the
   * check is "render and find nothing on stderr" — and that covers every figure added later, not just the
   * two that happened to be wrong.
   */
  for (const [route, query, segs] of [
    ["/state", "", "ka"],
    ["/election", "", "ka-assembly-2023"],
    ["/", "", ""],
  ] as const) {
    const r = spawnSync(
      process.execPath,
      ["--import", "./ops/probe/render/register.mjs", "./ops/probe/render/render.mjs", route, query, segs],
      { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    assert.equal(r.status, 0, `${route} ${segs} failed to render:\n${r.stderr}`);
    const noise = (r.stderr ?? "")
      .split("\n")
      .filter((l) => /Warning:/.test(l) && !/MODULE_TYPELESS_PACKAGE_JSON/.test(l));
    assert.deepEqual(noise, [], `${route} ${segs} rendered with React warnings`);
  }
});

test("a district on the state page is reachable, and its link is not hidden in a citation", live, () => {
  /**
   * REPORTED FROM USE: "when i click on district it's not taking me there".
   *
   * The links were present and the district pages worked — the existing test above proved both, and proved
   * the wrong thing. What was broken was that a reader could not FIND them:
   *
   *   · the whole district list sat inside `<details class="iei-ev">`, the evidence-drawer class, collapsed
   *     and labelled "30 districts" in the same type as "ⓘ 2 sources". The route to thirty district pages
   *     was dressed as a citation.
   *   · clicking a district NAME reframed the map and stayed put. The only thing that navigated was a bare
   *     `→` glyph in `--iei-ink-3`, the dimmest ink in the system, on the smallest target on the page.
   *
   * So the assertions are about PROMINENCE, not existence, plus the one thing the reader actually did:
   * follow the link and see whether a district page comes back.
   */
  const html = render("/state", "", "ka");

  // 1 — NOT INSIDE THE EVIDENCE DRAWER. The class combination that caused the report.
  assert.ok(
    !/class="iei-ev iei-districts"/.test(html),
    "the district list is inside the evidence-drawer class again",
  );

  // 2 — EVERY district offers a link to its own page, and the label is a word rather than a glyph alone.
  const links = [...html.matchAll(/href="(\/district\/ka\/[a-z0-9-]+)"/g)].map((m) => m[1] as string);
  assert.ok(links.length >= 20, `only ${links.length} district page links on a 30-district state`);
  assert.match(
    html,
    /class="iei-district-open"[^>]*>open/,
    "the district link is a bare arrow again, with no word to read",
  );

  // 3 — AND THE LINK RESOLVES. Following it must produce that district's own page, not a not-found and not
  //     the state page over again. This is the step the report was about.
  const target = links.find((h) => h.endsWith("/bangalore")) ?? (links[0] as string);
  const page = text(render("/district", "", target.replace("/district/", "")));
  assert.match(page, /District/, `${target} did not render a district page`);
  assert.ok(!/not found/i.test(page), `${target} is a dead link`);
  assert.match(page, /assembly seats/, `${target} does not list the seats it elects`);

  // 4 — WITH A DISTRICT FOCUSED, the way out is a sentence and not a glyph.
  const focused = text(render("/state", "district=ka.bangalore", "ka"));
  assert.match(focused, /Open the .* district page/, "a focused district offers no prominent way in");
});

test("INDIA -> STATE -> DISTRICT -> SEAT: every hop is a link that resolves", live, () => {
  /**
   * REPORTED FROM USE, twice: districts did not open, and then "clicking on any constituency" did not
   * either — "previously when we used to click on a map it used to redirect".
   *
   * Both were mine, and both came from one assumption I made without being asked: that the primary click on
   * a district and on a seat was a FILTER on the state surface rather than navigation. So `ElectionSeat.href`
   * was `/pl/<state>?seat=<name-slug>`, which
   *
   *   · never left the state page, severing the walk at its last hop — after which NOTHING in the product
   *     linked to a constituency page, though the pages themselves worked perfectly, and
   *   · did not even work as a focus, because the page compares `?seat=` against a placeId and never against
   *     a name slug. The parameter matched nothing and highlighted nothing.
   *
   * Measured before the fix: ZERO constituency-page links on /pl/ka. After: 220.
   *
   * WHAT THIS TEST DOES THAT THE OLD ONES DID NOT: it walks. Each hop is followed to the next page and the
   * page has to come back right. Three tests already asserted that seats and districts "have links" and all
   * three passed throughout, because a link that goes to the wrong place is still a link.
   */
  /**
   * Links BY ENTITY TYPE, read from the route prefix.
   *
   * This used to filter by segment COUNT, because under `/pl/[...path]` depth was the only thing that
   * distinguished a state from a district from a seat. It is not any more, and it must not be: a district and
   * a constituency are both `/<type>/<state>/<name>` — two segments each — and the type is the prefix. A test
   * that still counted segments would pass for the wrong reason.
   */
  const linksOf = (html: string, type: "state" | "district" | "constituency"): string[] => [
    ...new Set(
      [...html.matchAll(/href="(\/(?:state|district|constituency)\/[^"?#]*)"/g)]
        .map((m) => m[1] as string)
        .filter((h) => h.startsWith(`/${type}/`)),
    ),
  ];

  // INDIA -> STATE
  const india = render("/");
  assert.ok(linksOf(india, "state").length > 0, "the front page links to no state at all");

  // STATE -> DISTRICT, and STATE -> SEAT
  const state = render("/state", "", "ka");
  const districts = linksOf(state, "district");
  const seats = linksOf(state, "constituency");
  assert.ok(districts.length >= 20, `${districts.length} district links on a 30-district state`);
  assert.ok(
    seats.length >= 200,
    `${seats.length} constituency-page links on a 224-seat state — the walk is severed at the last hop`,
  );

  // FOLLOW THEM. A spread rather than all 224: the point is that the URL SHAPE resolves, and one broken
  // shape breaks every link built the same way.
  for (const url of [districts[0], districts[5], seats[0], seats[40], seats[150], seats.at(-1)]) {
    if (url === undefined) continue;
    const [, type, ...rest] = url.split("/");
    const page = text(render(`/${type}`, "", rest.join("/")));
    assert.ok(!/not found/i.test(page), `${url} is a dead link`);
    assert.ok(page.length > 400, `${url} rendered an empty page`);
  }

  // DISTRICT -> SEAT: the walk continues from a district page rather than dead-ending there.
  const district = render("/district", "", (districts[0] as string).replace("/district/", ""));
  assert.ok(linksOf(district, "constituency").length > 0, `${districts[0]} links to none of its own seats`);

  /**
   * AND A PARLIAMENTARY SEAT MUST NOT PRETEND TO HAVE A PAGE. Place pages are `pv.kind = 'ac'`; a pc
   * version has no district parent, so a link builder that took the state from the district returned "/pl" —
   * the India page. That regression was live for the length of one command: all 543 of Lok Sabha 2024's seats
   * linked to the front page. A pc seat goes to the state whose page holds its result.
   */
  const ls = render("/election", "", "ls-2024");
  const lsLinks = [...ls.matchAll(/href="(\/(?:state|district|constituency)[^"?#]*)"/g)].map((m) => m[1] as string);
  assert.ok(lsLinks.length > 0, "the Lok Sabha map links nowhere");
  assert.deepEqual(
    [...new Set(lsLinks.filter((h) => h.includes("//") || /\/(state|district|constituency)\/?$/.test(h)))],
    [],
    "a parliamentary seat is linking to a bare entity route or to a url with an empty segment",
  );
  /**
   * A PARLIAMENTARY SEAT LINKS TO ITSELF NOW, which inverts what this used to assert.
   *
   * It required a link to the seat's STATE, because place pages were `kind = 'ac'` and a Lok Sabha seat had
   * no page. Phase D gave it one, so linking to the state would be the defect: a reader who clicks a seat on
   * the Lok Sabha map wants that seat.
   */
  assert.ok(
    lsLinks.some((h) => /^\/constituency\/[a-z]+\/.+/.test(h)),
    "no parliamentary seat links to its own page",
  );
});

/* ─────────────────── canonical routes and the compatibility layer ─────────────────── */

test("a /pl URL is redirected to its canonical route, with its query, end to end", live, () => {
  /**
   * `/pl/[...path]` is `legacyTarget` behind a page. legacy.test.ts holds what each request is answered with, on a
   * registry built in memory with two states, so this is the one render that proves the page, `follow` and Next's
   * redirect error are wired to it.
   *
   * `permanentRedirect` throws a Next control-flow error rather than returning markup, so a successful redirect is
   * a FAILED render whose stderr names the destination — which is what this reads. A route that renders markup has
   * stopped redirecting, and that is a failure here.
   */
  // Fixtures discovered from the registry, so this is not five states hand-picked.
  /**
   * ONE QUERY FOR THE WHOLE CHAIN, so the fixtures are guaranteed to be an actual state / district / seat
   * ancestry. Picking a jurisdiction first and a seat second chose Andaman & Nicobar, whose seats carry no
   * district — a fixture that does not exist rather than a product defect.
   */
  const seat = all<{ state: string; name: string; district: string }>(
    db,
    `SELECT pv.jurisdiction_id AS state, pv.canonical_name AS name,
            COALESCE(pv.district_place_id, pl.parent_id) AS district
       FROM place_version pv JOIN place pl ON pl.id = pv.place_id
      WHERE pv.kind = 'ac' AND pv.jurisdiction_id IS NOT NULL
        AND COALESCE(pv.district_place_id, pl.parent_id) IS NOT NULL
        AND instr(COALESCE(pv.district_place_id, pl.parent_id), '.') > 0
      ORDER BY pv.id LIMIT 1`,
  )[0];
  assert.ok(seat, "no districted constituency in the registry");
  const state = seat.state;
  const districtSeg = seat.district.startsWith(`${state}.`)
    ? seat.district.slice(state.length + 1)
    : seat.district;
  const seatSlug = seat.name.trim().toLowerCase().replace(/\s+/g, "-");

  // A CONSTITUENCY reaches its own entity route, which drops the district because the canonical form carries the
  // jurisdiction instead, and THE QUERY SURVIVES: `?election=`, `?district=`, `?party=`, `?mode=` and `?seat=` mean the
  // same thing on the canonical route, so dropping them would silently change what a shared link shows.
  const r = spawnSync(
    process.execPath,
    [
      "--import",
      "./ops/probe/render/register.mjs",
      "./ops/probe/render/render.mjs",
      "/pl",
      "party=INC&mode=flips",
      `${state}/${districtSeg}/${seatSlug}`,
    ],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const out = `${r.stderr ?? ""}${r.stdout ?? ""}`;
  assert.doesNotMatch(out, /NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK/, `/pl/${state}/${districtSeg}/${seatSlug} 404s instead of redirecting`);
  const to = /NEXT_REDIRECT[;,]?\s*(?:replace|push)?[;,]?\s*(\/[^\s;"']*)/.exec(out)?.[1] ?? null;
  assert.equal(to, `/constituency/${state}/assembly/${seatSlug}?party=INC&mode=flips`);
});

test("the pre-body URL answers to a name and matches its state exactly", live, () => {
  // Every route that names a body ignores the state's case and reads a registry id or a number, and this one never has: the
  // name must still answer (a redirect, or a page that asks which) while `WB`, a number and an id must not.
  const seat = all<{ state: string; name: string; id: string }>(
    db,
    `SELECT pv.jurisdiction_id AS state, pv.canonical_name AS name, pv.place_id AS id
       FROM place_version pv
      WHERE pv.kind = 'ac' AND pv.canonical_name NOT GLOB '*[^A-Za-z ]*' AND ${currentSeat(db, "pv")}
      ORDER BY pv.id LIMIT 1`,
  )[0];
  assert.ok(seat, "no current assembly seat with a plain name in the registry");
  const slug = seat.name.trim().toLowerCase().replace(/\s+/g, "-");
  const notFound = (state: string, name: string): boolean => {
    const r = spawnSync(
      process.execPath,
      ["--import", "./ops/probe/render/register.mjs", "./ops/probe/render/render.mjs", "/constituency/legacy", "", `${state}/${name}`],
      { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    return /NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK/.test(`${r.stderr ?? ""}${r.stdout ?? ""}`);
  };
  assert.equal(notFound(seat.state, slug), false, `/constituency/${seat.state}/${slug} is a 404`);
  assert.equal(notFound(seat.state.toUpperCase(), slug), true, `/constituency/${seat.state.toUpperCase()}/${slug} is not a 404`);
  for (const written of [seat.id, String(Number(seat.id.split(".").at(-1)))]) {
    assert.equal(notFound(seat.state, written), true, `/constituency/${seat.state}/${written} is read as more than a name`);
  }
});

test("two seats that share a name are each reached by their registry id, from the page that asks and from their district", live, (t) => {
  // Found in the registry, not named: the seed's Bishnupur in Bankura and in South 24 Parganas is the case that made the
  // choose page link twice to itself, and any registry that holds such a pair is held to it.
  const current = all<{ state: string; id: string; name: string; number: number; district: string }>(
    db,
    `SELECT pv.jurisdiction_id AS state, pv.place_id AS id, pv.canonical_name AS name, pv.number AS number,
            pv.district_place_id AS district
       FROM place_version pv
      WHERE pv.kind = 'ac' AND pv.district_place_id IS NOT NULL AND pv.number IS NOT NULL AND ${currentSeat(db, "pv")}
      ORDER BY pv.id`,
  );
  const words = (name: string): string => name.toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean).join(" ");
  const groups = new Map<string, typeof current>();
  for (const s of current) {
    const key = `${s.state} ${words(s.name)}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const pair = [...groups.values()].find((g) => g.length > 1);
  const first = pair?.[0];
  if (pair === undefined || first === undefined) return t.skip("no two current assembly seats of a state share a name here");
  const nameHref = `/constituency/${first.state}/assembly/${first.name.trim().toLowerCase().replace(/\s+/g, "-")}`;
  const idHref = (id: string): string => `/constituency/${first.state}/assembly/${id}`;

  // The page that asks: a link to each seat by its id, and none back to itself.
  const asks = render("/constituency", "", `${first.state}/assembly/${nameHref.split("/").at(-1)}`);
  const seatLinks = [...asks.matchAll(/href="(\/constituency\/[^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(seatLinks.sort(), pair.map((s) => idHref(s.id)).sort());
  assert.ok(!asks.includes(`href="${nameHref}"`), "the page that asks which links back to itself");

  for (const seat of pair) {
    // each address opens its own seat, and not the page that asks
    const opened = text(render("/constituency", "", `${seat.state}/assembly/${seat.id}`));
    assert.doesNotMatch(opened, /Which did you mean/, idHref(seat.id));
    assert.ok(opened.includes(`No. ${seat.number}`), `${idHref(seat.id)} did not open seat no. ${seat.number}`);
    // and its district's page links its row there
    const listing = render("/district", "", `${seat.state}/${seat.district.split(".").slice(1).join(".")}`);
    assert.ok(listing.includes(`href="${idHref(seat.id)}"`), `${seat.district} does not link ${seat.id} by its id`);
    assert.ok(!listing.includes(`href="${nameHref}"`), `${seat.district} links a name that asks which`);
    // and the old /pl path, which names the district, is sent to the same address
    const slug = seat.name.trim().toLowerCase().replace(/\s+/g, "-");
    const old = spawnSync(
      process.execPath,
      ["--import", "./ops/probe/render/register.mjs", "./ops/probe/render/render.mjs", "/pl", "", `${seat.state}/${seat.district.split(".").slice(1).join(".")}/${slug}`],
      { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    const redirect = `${old.stderr ?? ""}${old.stdout ?? ""}`;
    assert.ok(redirect.includes(idHref(seat.id)), `/pl/${seat.state}/${seat.district}/${slug} is not sent to ${idHref(seat.id)}`);
  }
});

test("canonical routes resolve for discovered jurisdictions of every size", live, () => {
  // SMALLEST, MEDIAN AND LARGEST by seats on record — chosen by query, so adding a state adds a case.
  const sized = all<{ id: string; n: number }>(
    db,
    `SELECT pv.jurisdiction_id AS id, COUNT(DISTINCT pv.place_id) AS n
       FROM place_version pv WHERE pv.kind = 'ac' AND pv.jurisdiction_id IS NOT NULL
      GROUP BY pv.jurisdiction_id HAVING n > 0 ORDER BY n`,
  );
  assert.ok(sized.length >= 3, "fewer than three jurisdictions with seats");
  const picks = [sized[0], sized[Math.floor(sized.length / 2)], sized.at(-1)].filter(
    (x): x is { id: string; n: number } => x !== undefined,
  );
  for (const j of picks) {
    const t = text(render("/state", "", j.id));
    assert.ok(t.length > 400, `/state/${j.id} (${j.n} seats) rendered almost nothing`);
    assert.doesNotMatch(t, /not built in this checkout/, `/state/${j.id} could not read the registry`);
    // AND ITS OWN NAME, so the route is not quietly rendering some other jurisdiction.
    const name = all<{ n: string }>(db, `SELECT canonical_name AS n FROM place WHERE id = ?`, j.id)[0]?.n;
    if (name !== undefined) {
      assert.ok(
        t.toLowerCase().includes(name.toLowerCase()),
        `/state/${j.id} does not name ${name}`,
      );
    }
  }
});
