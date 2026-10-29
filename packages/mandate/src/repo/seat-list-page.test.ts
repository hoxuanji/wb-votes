// What the seat list beside a map says on the pages: its heading, the district chooser apart from it, and a row that lacks a figure.
//
// seat-list.test.ts holds the rules on literals. This holds that the two pages use them: that the heading is there, is read from
// the order the list was built in, and names what the reader narrowed it to; that the chooser comes before the heading and
// says what choosing does once; and that a row with nothing to show for its runner-up or its margin says so in words.
//
// The registry is built here from literal data, one state per case, and the pages are rendered in a child process as
// map-composition.test.ts does:
//
//   dd  a drawn map and an election with vote counts, in two districts (three seats, margins of 6%, 30% and 1% of the votes)
//   uu  a drawn map and an election that published winners and a declared margin and nothing else, with a turnout nothing corroborates
//   nn  an election with vote counts and no outline for any seat, in two districts

import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { open } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";
import { SHARED_FRAME } from "./election-map.ts";

const ROOT = new URL("../../../../", import.meta.url).pathname;

function fixture(db: DatabaseSync): DatabaseSync {
  migrate(db, "2026-08-12T00:00:00.000Z");
  db.exec(`
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('e1','Delimitation','2008-02-19');
    INSERT INTO place (id, kind, canonical_name) VALUES ('in','nation','India');
    INSERT INTO source (id, kind, publisher, title, retrieved_at, doc_hash) VALUES ('s1','static_module','P','Results','2026-08-12','sha256:0');
    INSERT INTO source (id, kind, publisher, title, retrieved_at, doc_hash) VALUES ('s2','static_module','P','Outlines','2026-08-12','sha256:0');
    INSERT INTO party (id, name, short_name) VALUES ('AAA','A Party','AAA');
    INSERT INTO party (id, name, short_name) VALUES ('BBB','B Party','BBB');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (1,'AAA','1990-01-01','A Party');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (2,'BBB','1990-01-01','B Party');
  `);
  const place = db.prepare(`INSERT INTO place (id, kind, canonical_name, parent_id) VALUES (?, ?, ?, ?)`);
  for (const [id, name] of [["dd", "Dd"], ["uu", "Uu"], ["nn", "Nn"]] as const) place.run(id, "state", `${name} State`, "in");
  place.run("dd.n", "district", "Dd North", "dd");
  place.run("dd.s", "district", "Dd South", "dd");
  place.run("nn.n", "district", "Nn North", "nn");
  place.run("nn.s", "district", "Nn South", "nn");
  const version = db.prepare(
    `INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, reservation, district_place_id)
     VALUES (?, ?, ?, 'ac', 'e1', ?, ?, 'general', ?)`,
  );
  const outline = db.prepare(
    `INSERT INTO place_geometry (place_version_id, path, centroid_x, centroid_y, view_box, source_id) VALUES (?, ?, 1, 1, ?, 's2')`,
  );
  let next = 0;
  const seat = (state: string, n: number, drawn: boolean, district: string | null = null): number => {
    const id = ++next;
    const placeId = `${state}.ac.00${n}`;
    place.run(placeId, "ac", `Seat ${state}${n}`, state);
    version.run(id, placeId, state, n, `Seat ${state}${n}`, district);
    if (drawn) outline.run(id, `M${id} 0L${id + 5} 0L${id + 5} 5L${id} 5Z`, SHARED_FRAME);
    return id;
  };
  const dd = [seat("dd", 1, true, "dd.n"), seat("dd", 2, true, "dd.n"), seat("dd", 3, true, "dd.s")];
  const uu = [seat("uu", 1, true), seat("uu", 2, true)];
  const nn = [seat("nn", 1, false, "nn.n"), seat("nn", 2, false, "nn.s")];

  const election = db.prepare(
    `INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, occurrence)
     VALUES (?, 'assembly', 'state', ?, 'e1', ?, 'declared', 'ac', 2021, 1)`,
  );
  for (const s of ["dd", "uu", "nn"]) election.run(`${s}-assembly-2021`, s, `${s.toUpperCase()} 2021`);

  const person = db.prepare(`INSERT INTO person (id, canonical_name, created_at) VALUES (?, ?, '2026-08-12')`);
  const contestRow = db.prepare(`INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES (?, ?, ?, 'declared')`);
  const candidacy = db.prepare(
    `INSERT INTO candidacy (id, contest_id, person_id, party_version_id, status) VALUES (?, ?, ?, ?, ?)`,
  );
  const result = db.prepare(
    `INSERT INTO result (contest_id, candidacy_id, revision, votes, "rank", is_winner, margin, source_id, ingested_at)
     VALUES (?, ?, 0, ?, ?, ?, ?, 's1', '2026-08-12')`,
  );
  const turnout = db.prepare(`INSERT INTO turnout (contest_id, scope, voters, electors, source_id) VALUES (?, 'contest', 1000, 2000, 's1')`);
  /**
   * One contest of 1000 votes polled: the winning party (1 or 2) beat the other by `margin` votes. With `counted` false the
   * source published the winner and a declared margin and nothing else: no vote count, and no runner-up. The turnout is held
   * either way, and is what nothing corroborates when there are no counts.
   */
  const contest = (electionId: string, versionId: number, winner: 1 | 2, margin: number, counted = true): void => {
    const id = `${electionId}:${versionId}`;
    contestRow.run(id, electionId, versionId);
    turnout.run(id);
    const won = (1000 + margin) / 2;
    for (const [who, pv, rank] of [["w", winner, 1], ["r", winner === 1 ? 2 : 1, 2]] as const) {
      if (!counted && rank === 2) continue;
      person.run(`p-${id}-${who}`, `Person ${id} ${who}`);
      candidacy.run(`${id}-${who}`, id, `p-${id}-${who}`, pv, rank === 1 ? "elected" : "defeated");
      result.run(id, `${id}-${who}`, counted ? (rank === 1 ? won : 1000 - won) : null, rank, rank === 1 ? 1 : 0, rank === 1 ? margin : null);
    }
  };
  contest("dd-assembly-2021", dd[0] as number, 1, 60);
  contest("dd-assembly-2021", dd[1] as number, 2, 300);
  contest("dd-assembly-2021", dd[2] as number, 1, 10);
  contest("uu-assembly-2021", uu[0] as number, 1, 100, false);
  contest("uu-assembly-2021", uu[1] as number, 2, 20, false);
  contest("nn-assembly-2021", nn[0] as number, 1, 60);
  contest("nn-assembly-2021", nn[1] as number, 2, 300);
  return db;
}

const PATH = join(mkdtempSync(join(tmpdir(), "mandate-seat-list-page-")), "registry.db");
fixture(open(PATH)).close();

function render(route: string, query: string, segments: string): string {
  try {
    return execFileSync(
      process.execPath,
      ["--import", "./ops/probe/render/register.mjs", "./ops/probe/render/render.mjs", route, query, segments],
      { cwd: ROOT, env: { ...process.env, MANDATE_DB_PATH: PATH }, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    throw new Error(`render ${route} ${query} ${segments} failed:\n${err.stderr ?? err.message}`);
  }
}

/** The list's heading and its count, as the page prints them, and the aria-label of the list under it. */
function headed(html: string): { title: string; count: string; label: string } {
  const m = /<h3 class="iei-list-title">([^<]*)<\/h3><p class="iei-list-count">([^<]*)<\/p><\/div>(?:<p class="iei-absent">[^<]*<\/p>)?(?:<p class="iei-note iei-list-said">[^<]*<\/p>)?<ul class="iei-list iei-list-tight" aria-label="([^"]*)"/.exec(html);
  assert.ok(m !== null, "the list has no heading directly above it");
  return { title: m[1] as string, count: m[2] as string, label: m[3] as string };
}

/** The seats listed, in order, by the name each row links with. */
function rows(html: string): string[] {
  const list = html.slice(html.indexOf('<ul class="iei-list iei-list-tight"'));
  return [...list.slice(0, list.indexOf("</ul>")).matchAll(/<li><div class="iei-row-h">(?:<a [^>]*>|<span [^>]*>)([^<]*)</g)].map((m) => m[1] as string);
}

/* ───────────────────────────── the heading, on both pages ───────────────────────────── */

test("a state page's list is headed with what it is and how much of it is shown", () => {
  const html = render("/state", "", "dd");
  assert.deepEqual(headed(html), { title: "Closest contests", count: "3 of 3", label: "Closest contests" });
  assert.deepEqual(rows(html), ["Seat dd3", "Seat dd1", "Seat dd2"], "the order is by margin, as it was");
});

test("an election with no vote counts is headed as the seat order it is, on the state page", () => {
  const html = render("/state", "", "uu");
  assert.deepEqual(headed(html), { title: "In seat order", count: "2 of 2", label: "In seat order" });
  assert.deepEqual(rows(html), ["Seat uu1", "Seat uu2"]);
  assert.doesNotMatch(html, /Closest contests/);
});

test("the page that draws no map has the same headings", () => {
  const html = render("/state", "", "nn");
  assert.deepEqual(headed(html), { title: "Closest contests", count: "2 of 2", label: "Closest contests" });
  assert.doesNotMatch(html, /find on map/, "and offers no way to find a seat on a map that is not there");
  assert.deepEqual(headed(render("/election", "", "nn-assembly-2021")), { title: "Closest contests", count: "2 of 2", label: "Closest contests" });
});

test("a narrowing is named in the heading, with the order and the count of what it narrowed to", () => {
  assert.deepEqual(headed(render("/state", "district=dd.n", "dd")), {
    title: "Seats in Dd North, closest first",
    count: "2 of 2",
    label: "Seats in Dd North, closest first",
  });
  assert.equal(headed(render("/state", "party=AAA", "dd")).title, "Seats won by AAA, closest first");
  assert.equal(headed(render("/state", "party=AAA", "dd")).count, "2 of 2");
  assert.equal(headed(render("/state", "party=AAA&district=dd.n", "dd")).title, "Seats won by AAA in Dd North, closest first");
  assert.equal(headed(render("/state", "party=AAA&mode=runnerup", "dd")).title, "Seats where AAA came second, closest first");
  assert.equal(headed(render("/state", "band=5to10", "dd")).title, "Seats decided by 5–10%, closest first");
  assert.equal(headed(render("/state", "band=5to10", "dd")).count, "1 of 1");
  // The order of a narrowed list is the order it was: smallest margin first.
  assert.deepEqual(rows(render("/state", "party=AAA", "dd")), ["Seat dd3", "Seat dd1"]);
});

test("the election page heads its closest contests, and a selection in the seat order it lists it in", () => {
  const html = render("/election", "", "dd-assembly-2021");
  assert.deepEqual(headed(html), { title: "Closest contests", count: "3 of 3", label: "Closest contests" });
  assert.deepEqual(rows(html), ["Seat dd3", "Seat dd1", "Seat dd2"]);

  const party = render("/election", "party=AAA", "dd-assembly-2021");
  assert.equal(headed(party).title, "Seats won by AAA, in seat order");
  assert.deepEqual(rows(party), ["Seat dd1", "Seat dd3"], "the election page lists a selection in seat order, and says so");

  const bin = render("/election", "bin=0", "dd-assembly-2021");
  assert.deepEqual(headed(bin), { title: "Seats decided by 0 to 2 percent, in seat order", count: "1 of 1", label: "Seats decided by 0 to 2 percent, in seat order" });
});

test("an election with no margin on any seat lists its first seats in seat order, as the state page does, and says so", () => {
  const html = render("/election", "", "uu-assembly-2021");
  assert.equal(headed(html).title, "In seat order");
  assert.equal(headed(html).count, "2 of 2");
  assert.equal(rows(html).length, 2, "the seats are listed, not an empty list under a sentence about why");
  assert.doesNotMatch(html, /none can be ranked/);
});

test("the count is said once: there is no second note under the list", () => {
  for (const html of [render("/state", "", "dd"), render("/state", "district=dd.n", "dd"), render("/election", "party=AAA", "dd-assembly-2021")]) {
    assert.doesNotMatch(html, /First \d+ of/);
  }
});

/* ───────────────────────────── the chooser, apart from the list ───────────────────────────── */

test("the district chooser comes before the list's heading, and says once what choosing does", () => {
  const html = render("/state", "", "dd");
  const chooser = html.indexOf('<details class="iei-districts"');
  const heading = html.indexOf('<div class="iei-list-head">');
  const list = html.indexOf('<ul class="iei-list iei-list-tight"');
  assert.ok(chooser !== -1 && chooser < heading && heading < list, "chooser, then the heading, then the list");
  assert.ok(html.slice(chooser, heading).includes("</details>"), "the chooser has closed before the heading opens");
  assert.match(html, /<summary>2 districts — select one to zoom the map and narrow the list<\/summary>/);
  assert.doesNotMatch(html, /or open one|select to filter/);
  // Every row of the chooser says what its link does, so the heading need not.
  assert.equal(html.split("open →").length - 1, 2);
});

test("a chooser on a page with no map does not offer to zoom one", () => {
  const html = render("/state", "", "nn");
  assert.match(html, /<summary>2 districts — select one to narrow the list<\/summary>/);
  assert.doesNotMatch(html, /zoom the map/);
});

/* ───────────────────────────── a row that lacks a figure ───────────────────────────── */

test("a list whose every row lacks a runner-up and a share says so once, in the page's own words, and each row shows the margin it does have", () => {
  const html = render("/state", "", "uu");
  assert.match(html, /<b>100 votes \(declared\)<\/b>/);
  // Said once above the rows (two seats here, both without a runner-up, a share or a corroborated turnout) ...
  assert.match(
    html,
    /<p class="iei-note iei-list-said">On every seat in this list: no runner-up recorded · share of votes polled\u00a0— verification pending · turnout — verification pending\.<\/p>/,
  );
  // ... and not repeated on a row: a wall of one sentence after every seat name is what this replaced.
  const list = html.slice(html.indexOf('<ul class="iei-list iei-list-tight"'));
  const body = list.slice(0, list.indexOf("</ul>"));
  assert.doesNotMatch(body, /no runner-up recorded|verification pending/, "a row repeats what the list said once");
  assert.doesNotMatch(body, /· —|>—</, "a bare dash is left in a row");
});

test("a row with everything known says nothing is missing", () => {
  const list = render("/state", "", "dd");
  const rowsHtml = list.slice(list.indexOf('<ul class="iei-list iei-list-tight"'));
  const body = rowsHtml.slice(0, rowsHtml.indexOf("</ul>"));
  assert.doesNotMatch(body, /iei-absent/);
  assert.match(body, /<b>10 votes<\/b>/);
  assert.match(body, / over /);
});
