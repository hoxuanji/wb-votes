// A figure with nothing to plot is one sentence, and a figure with something to plot is still the figure.
//
// WHY THESE ARE LITERAL. The figures are `.tsx`, which `node --test` cannot import (it strips types, not JSX), so
// they are rendered in a child process through the same Babel hook the page renderer uses (ops/probe/render), as
// render.test.ts does for whole routes. The data is written out here rather than read from a registry: what a
// figure does with nothing, or with one point, is a property of the figure, and a registry that happens to hold
// West Bengal 2026 is not needed to say it. The last tests render the real pages, and skip without the dev registry.

import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { DEV_DB_PATH, openRead } from "../db/open.ts";
import { electionMapView } from "../repo/election-map.ts";

const ROOT = new URL("../../../../", import.meta.url).pathname;
const DISTRIBUTION = pathToFileURL(`${ROOT}src/components/iei/Distribution.tsx`).href;

type Case = { component: string; props: Record<string, unknown> };

/** Render each case in ONE child process (the hook costs a second to start) and return the markup, in order. */
function renderAll(cases: readonly Case[]): string[] {
  const script = `
    import { createElement } from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { readFileSync } from 'node:fs';
    const D = await import(${JSON.stringify(DISTRIBUTION)});
    const href = (x) => '/pick?' + x;
    const out = JSON.parse(readFileSync(0, 'utf8')).map(({ component, props }) =>
      renderToStaticMarkup(createElement(D[component], { hrefFor: href, selected: null, ...props })));
    process.stdout.write(JSON.stringify(out));
  `;
  const stdout = execFileSync(
    process.execPath,
    ["--import", "./ops/probe/render/register.mjs", "--input-type=module", "-e", script],
    { cwd: ROOT, encoding: "utf8", input: JSON.stringify(cases), maxBuffer: 16 * 1024 * 1024 },
  );
  return JSON.parse(stdout) as string[];
}

/** The sentence a figure becomes: one paragraph, no markup inside it, one full stop at the end. */
function assertSentence(html: string, label: string): void {
  const m = /^<p class="iei-absent">([^<]+)<\/p>$/.exec(html);
  assert.ok(m !== null, `${label}: expected one <p class="iei-absent"> and nothing else, got ${html.slice(0, 200)}`);
  const text = m[1] as string;
  assert.ok(text.endsWith("."), `${label}: not a sentence: ${text}`);
  assert.equal(text.split(". ").length, 1, `${label}: more than one sentence: ${text}`);
  assert.doesNotMatch(html, /<svg|<figure|<figcaption|<ul|<line|<circle|<text/, `${label}: a frame survived`);
}

/* ───────────────────────────── the data, literally ───────────────────────────── */

const vs = (key: string, votePct: number | null, seatPct: number, seats: number) => ({
  type: "vote_seat_efficiency",
  party: { key, label: key },
  votePct,
  seatPct,
  deltaPp: votePct === null ? null : seatPct - votePct,
  seats,
  contested: 10,
  seatsPerPoint: votePct === null || votePct === 0 ? null : seats / votePct,
});

/** The margin histogram's 21 bins (2-point steps to 40, then one overflow bin), with `n` seats in each named bin. */
function bins(inBin: Record<number, number> = {}) {
  const out = [];
  for (let lo = 0; lo < 40; lo += 2) out.push({ lo, hi: lo + 2, n: inBin[lo] ?? 0, overflow: false });
  out.push({ lo: 40, hi: null, n: inBin[40] ?? 0, overflow: true });
  return out;
}

const bands = (n: number[]) =>
  ["lt1", "1to2", "2to5", "5to10", "safe"].map((key, i) => ({ key, label: `band ${key}`, n: n[i] ?? 0 }));

const pair = { from: { key: "TMC", label: "TMC" }, to: { key: "BJP", label: "BJP" }, count: 3 };

const election = (id: string, year: number) => ({ id, year, epochId: "delim-2008" });
const point = (year: number, seats: number, seatPct: number | null, votePct: number | null) => ({
  year,
  epochId: "delim-2008",
  seats,
  seatPct,
  votePct,
});
const run = (points: ReturnType<typeof point>[], key = "BJP") => ({ key, label: key, points });
const traj = (years: number[], parties: ReturnType<typeof run>[]) => ({
  elections: years.map((y) => election(`e-${y}`, y)),
  parties,
  epochBreaks: [],
});

/* ───────────────────────────── vote share against seat share ───────────────────────────── */

test("with no vote share known the plot is the page's own sentence, not a frame with no points", () => {
  const [none, empty] = renderAll([
    // West Bengal 2026: three parties with seats, and a vote share for none.
    { component: "VoteSeatPlot", props: { rows: [vs("TMC", null, 40, 4), vs("BJP", null, 60, 6)] } },
    { component: "VoteSeatPlot", props: { rows: [] } },
  ]) as [string, string];
  for (const [html, label] of [[none, "unknown shares"], [empty, "no rows"]] as const) {
    assertSentence(html, label);
    assert.match(html, /^<p class="iei-absent">No candidate vote counts were published for this election, /, label);
  }
});

test("with one vote share known the plot is drawn: the frame, the parity line, one marker and the caption", () => {
  const [one, many] = renderAll([
    { component: "VoteSeatPlot", props: { rows: [vs("TMC", 40, 50, 5), vs("BJP", null, 50, 5)] } },
    { component: "VoteSeatPlot", props: { rows: [vs("TMC", 40, 50, 5), vs("BJP", 30, 50, 5)] } },
  ]) as [string, string];
  assert.match(one, /^<figure class="iei-fig iei-vs"><svg viewBox="0 0 400 400" role="img" aria-label="Vote share against seat share\. TMC 40\.0% of the vote and 50\.0% of the seats\./);
  assert.match(one, /class="iei-vs-parity"/);
  assert.equal(one.match(/<circle /g)?.length, 1, "the party with no vote share is not a marker");
  assert.match(one, /vote share →/);
  assert.match(one, /<figcaption>Above the line, a party won a larger share of seats than of votes\. Select a party to find its seats on the map\.<\/figcaption><\/figure>$/);
  assert.equal(many.match(/<circle /g)?.length, 2);
});

/* ───────────────────────────── the margin distribution ───────────────────────────── */

test("with no seat in any bin the histogram is a sentence, and with one seat it is the histogram", () => {
  const [none, noBins, one] = renderAll([
    { component: "MarginDistribution", props: { bins: bins(), total: 0 } },
    { component: "MarginDistribution", props: { bins: [], total: 0 } },
    { component: "MarginDistribution", props: { bins: bins({ 4: 1 }), total: 1 } },
  ]) as [string, string, string];
  assertSentence(none, "all bins empty");
  assertSentence(noBins, "no bins");
  assert.match(one, /^<figure class="iei-fig iei-dist"><svg viewBox="0 0 100 34" role="img"/);
  assert.equal(one.match(/<title>/g)?.length, 21, "one hit area per bin");
  assert.match(one, /<title>4–6% — 1 seat<\/title>/);
  assert.match(one, /<span>40%\+<\/span>/);
  assert.match(one, /Margin over votes polled\. Select a bar to find those seats on the map\./);
});

/* ───────────────────────────── the competitiveness bands ───────────────────────────── */

test("with no seat in any band the bands are a sentence, and with one seat they are the bar", () => {
  const [none, one] = renderAll([
    { component: "MarginBands", props: { bands: bands([0, 0, 0, 0, 0]) } },
    { component: "MarginBands", props: { bands: bands([0, 1, 0, 0, 0]) } },
  ]) as [string, string];
  assertSentence(none, "all bands empty");
  assert.match(one, /^<div class="iei-bands"><div class="iei-bands-bar" role="img" aria-label="Winning margins across 1 seats: 1 decided by band 1to2\.">/);
  assert.match(one, /<ul class="iei-bands-key">/);
});

/* ───────────────────────────── the flip matrix ───────────────────────────── */

test("with no pair the flip matrix is a sentence, and with one pair it is the list", () => {
  const [none, one] = renderAll([
    { component: "FlipMatrix", props: { pairs: [] } },
    { component: "FlipMatrix", props: { pairs: [pair] } },
  ]) as [string, string];
  assertSentence(none, "no pairs");
  assert.match(one, /^<ul class="iei-flipmx" aria-label="Seats that changed hands/);
  assert.equal(one.match(/<li>/g)?.length, 1);
});

/* ───────────────────────────── the trajectory ───────────────────────────── */

test("a trajectory with nothing to draw is a sentence, and one with something is drawn", () => {
  const two = [point(2016, 2, 20, 30), point(2021, 5, 50, 40)];
  const noVotes = [point(2016, 2, 20, null), point(2021, 5, 50, null)];
  const [single, noElections, noParties, noVoteSeries, seatsDrawn, onePoint, oneVote] = renderAll([
    // One election is a point, not a run.
    { component: "Trajectory", props: { data: traj([2021], [run([point(2021, 5, 50, 40)])]), metric: "seatPct" } },
    { component: "Trajectory", props: { data: traj([], []), metric: "seatPct" } },
    // Two elections and no party with the record to draw: the axis footer would have been printed under nothing.
    { component: "Trajectory", props: { data: traj([2016, 2021], []), metric: "seatPct" } },
    // No vote count in any election: every row would be an empty strip beside a dash.
    { component: "Trajectory", props: { data: traj([2016, 2021], [run(noVotes)]), metric: "votePct" } },
    // The same data, by seats, is drawn: the seats are known.
    { component: "Trajectory", props: { data: traj([2016, 2021], [run(noVotes)]), metric: "seatPct" } },
    { component: "Trajectory", props: { data: traj([2016, 2021], [run(two)]), metric: "seatPct" } },
    // Two elections, and a vote share for one of them: one point is a dot, not a sentence.
    { component: "Trajectory", props: { data: traj([2016, 2021], [run([point(2016, 2, 20, null), point(2021, 5, 50, 40)])]), metric: "votePct" } },
  ]) as [string, string, string, string, string, string, string];
  assertSentence(single, "one election");
  assertSentence(noElections, "no elections");
  assertSentence(noParties, "no parties");
  assertSentence(noVoteSeries, "no vote share anywhere");
  assert.match(noVoteSeries, /No candidate vote counts were published for these elections/);
  assert.match(seatsDrawn, /^<div class="iei-traj">/, "the seat series of the same data is known");
  assert.match(seatsDrawn, /<polygon /);
  assert.match(onePoint, /^<div class="iei-traj"><a [^>]*class="iei-traj-row"/);
  assert.match(onePoint, /<polyline /);
  assert.match(onePoint, /2016 · full height = 50% of seats/);
  assert.match(oneVote, /<circle /);
  assert.doesNotMatch(oneVote, /<polyline /);
  assert.doesNotMatch(oneVote, /iei-absent/);
});

/* ───────────────────────────── the real pages ───────────────────────────── */

const DB = process.env["MANDATE_DB_PATH"] ?? DEV_DB_PATH;

/** Whether the dev registry holds a West Bengal election with seats and no vote share: the case the page defect was found on. */
function noVoteElection(): string | null {
  if (!existsSync(DB)) return null;
  const db = openRead();
  for (const id of ["wb-assembly-2026"]) {
    const v = electionMapView(db, id);
    if (v.election !== null && v.voteSeat.length > 0 && v.voteSeat.every((r) => r.votePct === null)) return id;
  }
  return null;
}

function page(route: string, query: string, segments: string): string {
  return execFileSync(
    process.execPath,
    ["--import", "./ops/probe/render/register.mjs", "./ops/probe/render/render.mjs", route, query, segments],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
  );
}

const noVotes = noVoteElection();
const live = { skip: noVotes === null ? "the dev registry has no election with seats and no vote share" : false };

test("the state page for an election with no vote share keeps its seat bars and loses the plot", live, () => {
  const html = page("/state", `election=${noVotes}`, "wb");
  const at = html.indexOf('id="parties"');
  assert.ok(at > 0, "the party landscape section is gone");
  const parties = html.slice(at, html.indexOf("</section>", at));
  assert.match(parties, /No candidate vote counts were published for this election, so no party/);
  assert.doesNotMatch(parties, /<svg|<figure|<figcaption|iei-vs|seat share →|Above the line/);
  assert.match(parties, /iei-partyrows-seat/, "the seat-share bars are kept");
  assert.doesNotMatch(parties, /iei-partyrows-vote|The pale bar is vote share/, "a vote bar would be a zero");
  assert.match(parties, /aria-label="Seat share by party"/);
});

test("the election page for an election with no vote share says so in the vote-to-seats section", live, () => {
  const html = page("/election", "", noVotes as string);
  const at = html.indexOf('id="votes"');
  assert.ok(at > 0, "the section is gone");
  const section = html.slice(at, html.indexOf("</section>", at));
  assert.match(section, /No candidate vote counts were published for this election/);
  assert.doesNotMatch(section, /<svg|<figure|<figcaption/);
});

test("the pages of an election with vote shares still draw the plot", live, () => {
  const state = page("/state", "election=wb-assembly-2021", "wb");
  assert.match(state, /<figure class="iei-fig iei-vs">/);
  assert.match(state, /iei-partyrows-vote/);
  assert.match(state, /The pale bar is vote share/);
  assert.match(state, /aria-label="Vote share, seat share and the gap between them"/);
  assert.match(page("/election", "", "wb-assembly-2021"), /<figure class="iei-fig iei-vs">/);
});
