// How a map page is composed: a header band, one control row, then the atlas with the map first.
//
// /state and /election used to open with a title, a headline, a section heading that said the name again, two rows of tabs
// and a caveat, so the map's top edge was at 484px on /state/wb. Where a page puts its parts is what these tests hold: the
// order of the markup (the map before the column beside it, the controls before the map), that the one place a heading
// used to restate the name is hidden from the eye and kept for a screen reader, and that what a page cannot show is said in
// the column with the list, not over the map. Where pixels land is not tested here, because no test in this repository
// has a layout engine: it was measured in a browser against saved renders (ops/probe/shot/measure.sh), and the numbers are
// in the commit message.
//
// The registry is built here from literal data, one state per case, and the pages are rendered in a child process as
// map-notice.test.ts does:
//
//   aa  a drawn map, two seats and two elections, with a Lok Sabha seat
//   bb  no outline for any seat
//   vv  a drawn map and an election that published winners and no candidate vote counts

import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { open } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";
import { SHARED_FRAME } from "./election-map.ts";
import { MODES } from "./map-selection.ts";

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
  for (const [id, name] of [["aa", "Aa"], ["bb", "Bb"], ["vv", "Vv"]] as const) place.run(id, "state", `${name} State`, "in");
  const version = db.prepare(
    `INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, reservation)
     VALUES (?, ?, ?, ?, 'e1', ?, ?, 'general')`,
  );
  const outline = db.prepare(
    `INSERT INTO place_geometry (place_version_id, path, centroid_x, centroid_y, view_box, source_id) VALUES (?, ?, 1, 1, ?, 's2')`,
  );
  let next = 0;
  const seat = (state: string, kind: "ac" | "pc", n: number, drawn: boolean): number => {
    const id = ++next;
    const placeId = `${state}.${kind}.00${n}`;
    place.run(placeId, kind, `Seat ${state}${n}`, state);
    version.run(id, placeId, state, kind, n, `Seat ${state}${n}`);
    if (drawn) outline.run(id, `M${id} 0L${id + 5} 0L${id + 5} 5L${id} 5Z`, SHARED_FRAME);
    return id;
  };
  /** A state's two assembly seats, with an outline or without. */
  const two = (state: string, drawn: boolean): [number, number] => [seat(state, "ac", 1, drawn), seat(state, "ac", 2, drawn)];
  const aa = two("aa", true);
  const bb = two("bb", false);
  const vv = two("vv", true);
  const lsAa = seat("aa", "pc", 1, true);

  const election = db.prepare(
    `INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, occurrence)
     VALUES (?, ?, ?, ?, 'e1', ?, 'declared', ?, ?, 1)`,
  );
  for (const [s, years] of [["aa", [2016, 2021]], ["bb", [2021]], ["vv", [2021]]] as const) {
    for (const year of years) election.run(`${s}-assembly-${year}`, "assembly", "state", s, `${s.toUpperCase()} ${year}`, "ac", year);
  }
  election.run("ls-2024", "general", "union", "in", "LS 2024", "pc", 2024);

  const person = db.prepare(`INSERT INTO person (id, canonical_name, created_at) VALUES (?, ?, '2026-08-12')`);
  const contestRow = db.prepare(`INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES (?, ?, ?, 'declared')`);
  const candidacy = db.prepare(
    `INSERT INTO candidacy (id, contest_id, person_id, party_version_id, status) VALUES (?, ?, ?, ?, ?)`,
  );
  const result = db.prepare(
    `INSERT INTO result (contest_id, candidacy_id, revision, votes, "rank", is_winner, margin, source_id, ingested_at)
     VALUES (?, ?, 0, ?, ?, ?, ?, 's1', '2026-08-12')`,
  );
  /**
   * One contest: the winning party (1 or 2) beat the other by `margin` votes. With `counted` false the source published the
   * winner and a declared margin and nothing else: no vote count, and no runner-up.
   */
  const contest = (electionId: string, versionId: number, winner: 1 | 2, margin: number, counted = true): void => {
    const id = `${electionId}:${versionId}`;
    contestRow.run(id, electionId, versionId);
    const won = (1000 + margin) / 2;
    for (const [who, pv, rank] of [["w", winner, 1], ["r", winner === 1 ? 2 : 1, 2]] as const) {
      if (!counted && rank === 2) continue;
      person.run(`p-${id}-${who}`, `Person ${id} ${who}`);
      candidacy.run(`${id}-${who}`, id, `p-${id}-${who}`, pv, rank === 1 ? "elected" : "defeated");
      result.run(id, `${id}-${who}`, counted ? (rank === 1 ? won : 1000 - won) : null, rank, rank === 1 ? 1 : 0, rank === 1 ? margin : null);
    }
  };
  for (const [s, ids] of [["aa", aa], ["bb", bb]] as const) {
    contest(`${s}-assembly-2021`, ids[0], 2, 60);
    contest(`${s}-assembly-2021`, ids[1], 2, 300);
  }
  contest("aa-assembly-2016", aa[0], 1, 100);
  contest("aa-assembly-2016", aa[1], 2, 20);
  contest("vv-assembly-2021", vv[0], 1, 100, false);
  contest("vv-assembly-2021", vv[1], 2, 20, false);
  contest("ls-2024", lsAa, 1, 100);
  return db;
}

const PATH = join(mkdtempSync(join(tmpdir(), "mandate-map-composition-")), "registry.db");
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

/** Where a marker first appears, failing the test if it never does. */
function at(html: string, marker: string, after = 0): number {
  const i = html.indexOf(marker, after);
  assert.notEqual(i, -1, `missing in the page: ${marker}`);
  return i;
}

const ATLAS = 'class="iei-linked iei-map-split iei-atlas"';
const SIDE = 'class="iei-atlas-side"';
const QUESTION = (mode: string): string => MODES.find((m) => m.key === mode)?.question ?? "";

/* ───────────────────────────── the order of the parts ───────────────────────────── */

test("the state page runs header band, one control row, the map, then the column beside it", () => {
  const html = render("/state", "", "aa");
  const head = at(html, 'class="iei-head iei-head-map"');
  const controls = at(html, 'class="iei-controls"', head);
  const atlas = at(html, ATLAS, controls);
  const map = at(html, '<figure class="iei-map', atlas);
  const side = at(html, SIDE, map);
  assert.ok(head < controls && controls < atlas && atlas < map && map < side);

  // The year strip, then how the seats are drawn, then the mode tabs, in the one row: the three groups sit between the row's
  // opening and the atlas.
  const row = html.slice(controls, atlas);
  const years = at(row, 'aria-label="Election"');
  const shapes = at(row, 'aria-label="How the seats are drawn"', years);
  const modes = at(row, 'aria-label="What the map shows"', shapes);
  assert.ok(years < shapes && shapes < modes);
  assert.equal(row.split('class="iei-tabs"').length - 1, 3, "three strips in the row, and no fourth");

  // A state with no outline to place tiles by has no shape strip: the row is the years and the modes, as it was.
  const none = render("/state", "", "bb");
  const noneRow = none.slice(at(none, 'class="iei-controls"'), at(none, ATLAS, at(none, 'class="iei-controls"')));
  assert.equal(noneRow.split('class="iei-tabs"').length - 1, 2, "two strips where no map is drawn");
  assert.ok(!noneRow.includes("How the seats are drawn"));

  // Nothing between the header band and the map is a visible heading.
  const between = html.slice(head, map);
  assert.deepEqual(
    [...between.matchAll(/<h([1-6])[^>]*>/g)].map((m) => m[0]).filter((h) => !/iei-sr|iei-answer/.test(h)),
    [],
    "a visible heading sits between the header and the map",
  );
});

test("the heading the map section used to print is there for a screen reader and for nobody else", () => {
  const html = render("/state", "", "aa");
  assert.match(html, /<section class="iei-sec iei-sec-atlas" id="map" aria-labelledby="map-h">/);
  assert.match(html, /<h2 id="map-h" class="iei-sr">Aa State · Winners<\/h2>/);
  // The page's name is said once, by its h1, and the old second statement of it carries no question under it either.
  assert.equal(html.split("<h1").length - 1, 1);
  assert.match(html, /<h2 id="map-h" class="iei-sr">[^<]*<\/h2><div class="iei-controls">/);
  assert.doesNotMatch(html, /<div class="iei-h"><div class="iei-h-title"><h2 id="map-h"/);
  // The drawer still names what it is evidence for.
  assert.match(html, /aria-label="Sources for Aa State · Winners: \d+"/);
});

test("the evidence drawer shares the header's eyebrow line, and is not a section heading's", () => {
  const html = render("/state", "", "aa");
  const top = at(html, 'class="iei-head-top"');
  const eyebrow = at(html, 'class="iei-eyebrow"', top);
  const drawer = at(html, 'class="iei-ev"', eyebrow);
  assert.ok(drawer < at(html, 'class="iei-controls"'), "the drawer is above the controls");
  assert.equal(html.split('class="iei-ev"').length - 1, 1, "one drawer for the page's figures");
  // Same on the election page.
  const election = render("/election", "", "aa-assembly-2021");
  const etop = at(election, 'class="iei-head-top"');
  assert.ok(at(election, 'class="iei-ev"', etop) < at(election, 'class="iei-controls"'));
});

test("the election page runs header band, the shape and mode tabs in the control row, the map, then the column beside it", () => {
  const html = render("/election", "", "aa-assembly-2021");
  const head = at(html, 'class="iei-head iei-head-map"');
  const controls = at(html, 'class="iei-controls"', head);
  const atlas = at(html, ATLAS, controls);
  const map = at(html, '<figure class="iei-map', atlas);
  assert.ok(head < controls && controls < atlas && atlas < map && map < at(html, SIDE, map));
  const row = html.slice(controls, atlas);
  assert.equal(row.split('class="iei-tabs"').length - 1, 2, "the shape strip and the mode strip, and no third");
  assert.ok(!row.includes('aria-label="Election"'), "an election has no year strip of its own");
  assert.ok(at(row, 'aria-label="How the seats are drawn"') < at(row, 'aria-label="What the map shows"'), "the shape comes before the mode");

  // Where no map is drawn there is nothing to tile, so the row is the mode strip alone, as it was.
  const bare = render("/election", "", "bb-assembly-2021");
  const bareAt = at(bare, 'class="iei-controls"');
  const bareRow = bare.slice(bareAt, at(bare, ATLAS, bareAt));
  assert.equal(bareRow.split('class="iei-tabs"').length - 1, 1, "the mode strip alone where no map is drawn");
  assert.ok(!bareRow.includes("How the seats are drawn"));
});

test("the column beside the map opens with what the map answers, in the mode's own words", () => {
  for (const mode of ["winners", "flips", "margin", "runnerup"]) {
    for (const [route, segments] of [["/state", "aa"], ["/election", "aa-assembly-2021"]] as const) {
      const html = render(route, `mode=${mode}`, segments);
      const side = at(html, SIDE);
      const q = `<p class="iei-atlas-q">${QUESTION(mode)}</p>`;
      assert.equal(at(html, q), side + SIDE.length + 1, `${route} ${mode}: the question is not the column's first thing`);
    }
  }
});

/* ───────────────────────────── what a page cannot show, and where it is said ───────────────────────────── */

const CAVEAT_FACTS = [
  /No candidate vote counts were published for this election\./,
  /Winners and turnout are on record;/,
  /margins over votes polled, competitiveness and vote-to-seat conversion are not,/,
  /so a row says what is not reported,/,
  /a chart that needs them is left out or replaced by a sentence, never drawn as zero\./,
];

test("the no-vote-counts caveat sits in the column with the list, above the list and not above the map, and says everything it said", () => {
  const html = render("/state", "", "vv");
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  for (const fact of CAVEAT_FACTS) assert.match(text, fact);
  const caveat = at(html, '<p class="iei-caveat">');
  assert.ok(at(html, '<figure class="iei-map') < caveat, "it is not over the map");
  assert.ok(at(html, SIDE) < caveat, "it is in the column beside the map");
  assert.ok(caveat < at(html, '<ul class="iei-list iei-list-tight"'), "it is above the list it explains");

  // An election that published counts has no caveat.
  assert.doesNotMatch(render("/state", "", "aa"), /iei-caveat/);
});

test("the no-map notice is in the column with the list on the state page, and above the atlas on the election page", () => {
  const state = render("/state", "", "bb");
  const notice = at(state, "No boundary map is loaded for these 2 constituencies.");
  assert.ok(at(state, SIDE) < notice && notice < at(state, '<ul class="iei-list iei-list-tight"'));

  const election = render("/election", "", "bb-assembly-2021");
  const enotice = at(election, "No boundary map is loaded for these 2 constituencies.");
  assert.ok(at(election, 'class="iei-controls"') < enotice && enotice < at(election, ATLAS), "above the atlas, below the controls");
});

test("a Lok Sabha view of a state says what it is narrowed to, in the column with the list", () => {
  const html = render("/state", "house=pc", "aa");
  const note = at(html, "narrowed to the seats in Aa State.");
  assert.ok(at(html, SIDE) < note && note < at(html, '<ul class="iei-list iei-list-tight"'));
  assert.ok(html.includes("See the whole country"));
});

test("with no map there is one column and nothing for a second to hold", () => {
  for (const [route, segments] of [["/state", "bb"], ["/election", "bb-assembly-2021"]] as const) {
    const html = render(route, "", segments);
    const atlas = at(html, ATLAS);
    const grid = html.slice(atlas, at(html, "</section>", atlas));
    assert.doesNotMatch(grid, /iei-map-col|<figure class="iei-map/, `${route}: a map column is in the grid`);
    assert.equal(grid.split(SIDE).length - 1, 1);
  }
});

/* ───────────────────────────── what only the stylesheet can say ───────────────────────────── */

const CSS = readFileSync(join(ROOT, "src/app/iei.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

test("the map column sticks from 1024px up, below the page bar, and only on the pages that have an atlas", () => {
  // Stickiness cannot be seen without a browser that scrolls. What can be held is that the rule exists, where, and that
  // the offset clears the bar it would otherwise slide under.
  const block = /@media \(min-width: 1024px\) \{\s*\.iei-atlas \.iei-map-col \{([^}]*)\}/.exec(CSS);
  assert.ok(block !== null, "no sticky rule for .iei-atlas .iei-map-col at 1024px");
  assert.match(block[1] as string, /position:\s*sticky/);
  assert.match(block[1] as string, /top:\s*calc\(var\(--iei-12\)\s*\+\s*var\(--iei-4\)\)/);

  // The bar is sticky and --iei-12 tall, so a map stuck any higher than --iei-12 + --iei-4 would be under it.
  const bar = /\.iei-top \{([^}]*)\}/.exec(CSS);
  assert.ok(bar !== null);
  assert.match(bar[1] as string, /position:\s*sticky/);
  assert.match(bar[1] as string, /min-height:\s*var\(--iei-12\)/);

  // Nothing else is stuck but the bar and an atlas's map column. The home page's map column is the same class, and a rule
  // for `.iei-map-col` alone would have stuck it too.
  const sticky = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => /position:\s*sticky/.test(m[2] as string))
    .map((m) => (m[1] as string).trim());
  assert.deepEqual(sticky.sort(), [".iei-atlas .iei-map-col", ".iei-top"]);
});

test("a column that is the grid's only child takes the row", () => {
  assert.match(CSS, /\.iei-atlas-side:only-child \{[^}]*grid-column:\s*1 \/ -1/);
  assert.match(CSS, /\.iei-atlas-side:only-child \{[^}]*max-width:\s*88ch/);
});
