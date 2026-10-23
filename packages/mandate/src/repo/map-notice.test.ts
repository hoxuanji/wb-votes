// Why a page has no map, and what it offers when it has none.
//
// A page that cannot draw its map used to say the seats "were redrawn and the new boundaries are not on record" whenever it
// drew nothing, and kept offering "find on map" on every seat. West Bengal's four elections are all under the 2008 order and
// the registry holds no outline for it: nothing was redrawn, and a link to a map that is not there does nothing. The view now
// says which it is (`geometry.status`) and the pages print only what is true of it.
//
// The registry is built here from literal data, one state per case, because the seed registry holds no constituency outline
// at all and so can show only one of the three. The pages are rendered in a child process, as render.test.ts does, against a
// file the child can read.

import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { open } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";
import { electionMapView, SHARED_FRAME } from "./election-map.ts";
import { stateView } from "./state-view.ts";

const ROOT = new URL("../../../../", import.meta.url).pathname;

/**
 * Seven states, each a case.
 *
 *   aa  drawn: two seats under epoch e1, both with an outline in the shared frame. Elections 2016 and 2021, so it has flips.
 *   bb  no-geometry: the same two elections, and no outline anywhere.
 *   cc  redrawn: 2016 under e1 with outlines, 2023 under e2 (newer) with none. Its Lok Sabha seat is the same.
 *   dd  no-geometry: both seats have an outline, in another projection, which is withheld.
 *   ee  2016 under e1 with no outline, 2023 under e2 with outlines: outlines of a NEWER epoch only.
 *   ff  no-geometry: under e2 with no outline; the registry holds a district outline of ff under e1, and aa's seats, which
 *       are not ff's seats.
 *   gg  an election with no seats at all.
 *
 * ls-2024 has one seat in each of aa (outline), bb (none) and cc (e2, none). bb-bypoll-2018 fills one seat of bb.
 */
function fixture(db: DatabaseSync): DatabaseSync {
  migrate(db, "2026-08-12T00:00:00.000Z");
  db.exec(`
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('e1','Delimitation','2008-02-19');
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('e2','Redrawn','2023-03-01');
    INSERT INTO place (id, kind, canonical_name) VALUES ('in','nation','India');
    INSERT INTO source (id, kind, publisher, title, retrieved_at, doc_hash) VALUES ('s1','static_module','P','Results','2026-08-12','sha256:0');
    INSERT INTO source (id, kind, publisher, title, retrieved_at, doc_hash) VALUES ('s2','static_module','P','Outlines','2026-08-12','sha256:0');
    INSERT INTO party (id, name, short_name) VALUES ('AAA','A Party','AAA');
    INSERT INTO party (id, name, short_name) VALUES ('BBB','B Party','BBB');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (1,'AAA','1990-01-01','A Party');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (2,'BBB','1990-01-01','B Party');
  `);
  const place = db.prepare(`INSERT INTO place (id, kind, canonical_name, parent_id) VALUES (?, ?, ?, ?)`);
  for (const [id, name] of [["aa", "Aa"], ["bb", "Bb"], ["cc", "Cc"], ["dd", "Dd"], ["ee", "Ee"], ["ff", "Ff"], ["gg", "Gg"]] as const) {
    place.run(id, "state", `${name} State`, "in");
  }
  place.run("ff.d1", "district", "Ff North", "ff");
  const version = db.prepare(
    `INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, reservation)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'general')`,
  );
  const outline = db.prepare(
    `INSERT INTO place_geometry (place_version_id, path, centroid_x, centroid_y, view_box, source_id) VALUES (?, ?, 1, 1, ?, 's2')`,
  );
  /** A seat's version under one epoch, with an outline in `frame` or none. */
  let next = 0;
  const seat = (state: string, kind: "ac" | "pc", n: number, epoch: string, frame: string | null): number => {
    const id = ++next;
    const placeId = `${state}.${kind}.00${n}`;
    if (!db.prepare(`SELECT 1 FROM place WHERE id = ?`).get(placeId)) place.run(placeId, kind, `Seat ${state}${n}`, state);
    version.run(id, placeId, state, kind, epoch, n, `Seat ${state}${n}`);
    if (frame !== null) outline.run(id, `M${id} 0L${id + 5} 0L${id + 5} 5L${id} 5Z`, frame);
    return id;
  };
  /** A state's two assembly seats under one epoch. */
  const two = (state: string, epoch: string, frame: string | null): [number, number] => [
    seat(state, "ac", 1, epoch, frame),
    seat(state, "ac", 2, epoch, frame),
  ];
  const aa = two("aa", "e1", SHARED_FRAME);
  const bb = two("bb", "e1", null);
  const cc1 = two("cc", "e1", SHARED_FRAME);
  const cc2 = two("cc", "e2", null);
  const dd = two("dd", "e1", "0 0 400 580");
  const ee1 = two("ee", "e1", null);
  const ee2 = two("ee", "e2", SHARED_FRAME);
  const ff = two("ff", "e2", null);
  version.run(++next, "ff.d1", "ff", "district", "e1", null, "Ff North");
  outline.run(next, "M0 0L9 0L9 9Z", "0 0 400 580");
  const lsAa = seat("aa", "pc", 1, "e1", SHARED_FRAME);
  const lsBb = seat("bb", "pc", 1, "e1", null);
  seat("cc", "pc", 1, "e1", SHARED_FRAME);
  const lsCc = seat("cc", "pc", 1, "e2", null);

  const election = db.prepare(
    `INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, occurrence)
     VALUES (?, ?, ?, ?, 'e1', ?, 'declared', ?, ?, 1)`,
  );
  for (const s of ["aa", "bb", "cc", "dd", "ee", "ff", "gg"]) {
    for (const year of s === "cc" ? [2016, 2023] : s === "ee" ? [2016, 2023] : s === "ff" || s === "dd" ? [2021] : [2016, 2021]) {
      election.run(`${s}-assembly-${year}`, "assembly", "state", s, `${s.toUpperCase()} ${year}`, "ac", year);
    }
  }
  election.run("ls-2024", "general", "union", "in", "LS 2024", "pc", 2024);
  election.run("bb-bypoll-2018", "bypoll", "state", "bb", "BB 2018 by-election", "ac", 2018);

  const person = db.prepare(`INSERT INTO person (id, canonical_name, created_at) VALUES (?, ?, '2026-08-12')`);
  const contestRow = db.prepare(`INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES (?, ?, ?, 'declared')`);
  const candidacy = db.prepare(
    `INSERT INTO candidacy (id, contest_id, person_id, party_version_id, status) VALUES (?, ?, ?, ?, ?)`,
  );
  const result = db.prepare(
    `INSERT INTO result (contest_id, candidacy_id, revision, votes, "rank", is_winner, margin, source_id, ingested_at)
     VALUES (?, ?, 0, ?, ?, ?, ?, 's1', '2026-08-12')`,
  );
  const turnout = db.prepare(`INSERT INTO turnout (contest_id, scope, voters, electors, source_id) VALUES (?, 'contest', ?, ?, 's1')`);
  /** One contest: the winning party (1 or 2) beat the other by `margin` of 1,000 votes polled. */
  const contest = (election: string, versionId: number, winner: 1 | 2, margin: number): void => {
    const id = `${election}:${versionId}`;
    contestRow.run(id, election, versionId);
    const won = (1000 + margin) / 2;
    for (const [who, pv, rank] of [["w", winner, 1], ["r", winner === 1 ? 2 : 1, 2]] as const) {
      person.run(`p-${id}-${who}`, `Person ${id} ${who}`);
      candidacy.run(`${id}-${who}`, id, `p-${id}-${who}`, pv, rank === 1 ? "elected" : "defeated");
      result.run(id, `${id}-${who}`, rank === 1 ? won : 1000 - won, rank, rank === 1 ? 1 : 0, rank === 1 ? margin : null);
    }
    turnout.run(id, 1000, 2000);
  };
  // Seat 1 changes hands between the two elections of aa and bb, and seat 2 does not.
  for (const [s, ids] of [["aa", aa], ["bb", bb]] as const) {
    contest(`${s}-assembly-2016`, ids[0], 1, 100);
    contest(`${s}-assembly-2016`, ids[1], 2, 20);
    contest(`${s}-assembly-2021`, ids[0], 2, 60);
    contest(`${s}-assembly-2021`, ids[1], 2, 300);
  }
  for (const [election, ids] of [
    ["cc-assembly-2016", cc1], ["cc-assembly-2023", cc2], ["dd-assembly-2021", dd],
    ["ee-assembly-2016", ee1], ["ee-assembly-2023", ee2], ["ff-assembly-2021", ff],
  ] as const) {
    contest(election, ids[0], 1, 100);
    contest(election, ids[1], 2, 20);
  }
  contest("bb-bypoll-2018", bb[0], 1, 100);
  contest("ls-2024", lsAa, 1, 100);
  contest("ls-2024", lsBb, 2, 20);
  contest("ls-2024", lsCc, 1, 50);
  return db;
}

const memory = (): DatabaseSync => fixture(open(":memory:"));

/* ───────────────────────────── the view says which ───────────────────────────── */

const status = (d: DatabaseSync, election: string, scope?: string) => electionMapView(d, election, scope).geometry.status;

test("a seat with an outline in the shared frame is a drawn map", () => {
  const d = memory();
  try {
    const g = electionMapView(d, "aa-assembly-2021").geometry;
    assert.deepEqual({ status: g.status, drawable: g.drawable, total: g.total }, { status: "drawn", drawable: 2, total: 2 });
  } finally {
    d.close();
  }
});

test("an election with no outline for its epoch, or for any older one, has no geometry and was not redrawn", () => {
  const d = memory();
  try {
    const g = electionMapView(d, "bb-assembly-2021").geometry;
    assert.deepEqual({ status: g.status, drawable: g.drawable, total: g.total }, { status: "no-geometry", drawable: 0, total: 2 });
  } finally {
    d.close();
  }
});

test("seats of an epoch newer than every epoch that has outlines are redrawn, and the older election is still drawn", () => {
  const d = memory();
  try {
    assert.equal(status(d, "cc-assembly-2023"), "redrawn");
    assert.equal(status(d, "cc-assembly-2016"), "drawn");
  } finally {
    d.close();
  }
});

test("an outline in another projection is withheld, so the map is not drawn, and it is a boundary on record, so nothing was redrawn", () => {
  const d = memory();
  try {
    const g = electionMapView(d, "dd-assembly-2021").geometry;
    assert.deepEqual(
      { status: g.status, drawable: g.drawable, otherFrames: g.otherFrames },
      { status: "no-geometry", drawable: 0, otherFrames: 2 },
    );
  } finally {
    d.close();
  }
});

test("outlines of a newer epoch than the seats' own are not a redraw of the seats", () => {
  const d = memory();
  try {
    assert.equal(status(d, "ee-assembly-2016"), "no-geometry");
    assert.equal(status(d, "ee-assembly-2023"), "drawn");
  } finally {
    d.close();
  }
});

test("only outlines of the jurisdiction's own seats of the house count: another state's, and a district's, do not", () => {
  const d = memory();
  try {
    // aa's older outlines and ff's own district outline are both on record, and neither is an outline of an ff seat.
    assert.equal(status(d, "ff-assembly-2021"), "no-geometry");
  } finally {
    d.close();
  }
});

test("a general election narrowed to a state is judged by that state's seats", () => {
  const d = memory();
  try {
    assert.equal(status(d, "ls-2024"), "drawn", "aa's seat has an outline");
    assert.equal(status(d, "ls-2024", "aa"), "drawn");
    assert.equal(status(d, "ls-2024", "bb"), "no-geometry");
    assert.equal(status(d, "ls-2024", "cc"), "redrawn", "cc's older seat has an outline and its seat of this election does not");
  } finally {
    d.close();
  }
});

test("an election with no seats, or none at all, has no geometry to explain", () => {
  const d = memory();
  try {
    assert.equal(electionMapView(d, "gg-assembly-2021").seats.length, 0);
    assert.equal(status(d, "gg-assembly-2021"), "no-geometry");
    assert.equal(status(d, "no-such-election"), "no-geometry");
  } finally {
    d.close();
  }
});

test("the state view carries the status of the election it opens on", () => {
  const d = memory();
  try {
    const s = stateView(d, "cc");
    assert.equal(s.kind, "ready");
    if (s.kind === "ready") assert.equal(s.map.geometry.status, "redrawn");
  } finally {
    d.close();
  }
});

/* ───────────────────────────── the pages print only what is true of it ───────────────────────────── */

const PATH = join(mkdtempSync(join(tmpdir(), "mandate-map-notice-")), "registry.db");
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

/** The page as a reader sees it: tags stripped, entities resolved, blank lines dropped. */
function text(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&rsquo;/g, "'")
    .replace(/&mdash;/g, "—")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * The notice, as one line of the page's text. The state page points at its seat list below the notice; the election page
 * does not, because its list is the closest contests and is empty where no margin is known.
 */
const NO_GEOMETRY = (n: number, below: boolean) =>
  `No boundary map is loaded for ${n === 1 ? "this constituency" : `these ${n} constituencies`}.` +
  (below ? (n === 1 ? " Its result is in the list below." : " Every result is in the list below.") : "");
const REDRAWN = (n: number, below: boolean) =>
  `No boundary map is available for these ${n} constituencies — they were redrawn and the new boundaries are not on record.` +
  (below ? " Every result is in the list below." : "");

const lines = (t: string): string[] => t.split("\n");
/** The page's text without the notice, so everything else on it can be read for what it says about a map. */
const withoutNotice = (t: string): string =>
  lines(t)
    .filter((l) => !l.startsWith("No boundary map"))
    .join("\n");

test("each reason says its own thing on the state page, and the redrawn one is the sentence it always was", () => {
  const none = lines(text(render("/state", "", "bb")));
  assert.ok(none.includes(NO_GEOMETRY(2, true)), none.join("\n"));
  assert.doesNotMatch(none.join("\n"), /redrawn/, "a registry with no outline blames no redraw");

  const redrawn = lines(text(render("/state", "", "cc")));
  assert.ok(redrawn.includes(REDRAWN(2, true)), redrawn.join("\n"));
  assert.doesNotMatch(redrawn.join("\n"), /No boundary map is loaded/);

  const drawn = text(render("/state", "", "aa"));
  assert.doesNotMatch(drawn, /No boundary map/);
});

test("the election page says why too, without pointing at a list that is not every result, and says nothing when it draws a map", () => {
  assert.ok(lines(text(render("/election", "", "bb-assembly-2021"))).includes(NO_GEOMETRY(2, false)));
  assert.ok(lines(text(render("/election", "", "cc-assembly-2023"))).includes(REDRAWN(2, false)));
  // One seat is "this constituency", not "these 1 constituencies".
  assert.ok(lines(text(render("/election", "", "bb-bypoll-2018"))).includes(NO_GEOMETRY(1, false)));
  assert.doesNotMatch(text(render("/election", "", "aa-assembly-2021")), /No boundary map/);
  // An election with no seats has nothing to explain.
  assert.doesNotMatch(text(render("/election", "", "gg-assembly-2021")), /No boundary map/);
});

test("a one-seat election on the state page says this constituency and points at its result", () => {
  assert.ok(lines(text(render("/state", "election=bb-bypoll-2018", "bb"))).includes(NO_GEOMETRY(1, true)));
});

test("a drawn map keeps every control and caption that refers to it", () => {
  const html = render("/state", "", "aa");
  const t = text(html);
  assert.match(html, /<figure class="iei-map[ "]/, "the figure is drawn");
  assert.equal(t.split("find on map").length - 1, 2, "one on each listed seat");
  for (const kept of ["Show this on the map", "Select a band to find those seats on the map.", "Select a party to find its seats on the map."]) {
    assert.ok(t.includes(kept), `missing: ${kept}`);
  }
  // The flips legend is the one mode of the four the default does not show.
  assert.ok(text(render("/state", "mode=flips", "aa")).includes("A flipped seat wears the colour of the party that gained it."));
  assert.ok(html.includes('aria-label="What the map shows"'));
  assert.ok(text(render("/state", "seat=aa.ac.001", "aa")).includes("unfocus"), "the focused seat offers to be released");

  const election = text(render("/election", "", "aa-assembly-2021"));
  for (const kept of [
    "Select a bar to find those seats on the map.",
    "Select a party to find its seats on the map.",
    "Show this on the map",
  ]) {
    assert.ok(election.includes(kept), `missing on the election page: ${kept}`);
  }
  assert.ok(text(render("/election", "mode=margin", "aa-assembly-2021")).includes("Brightest where the margin was smallest."));
  assert.ok(text(render("/election", "mode=flips", "aa-assembly-2021")).includes("Flipped seats wear the colour of the party that gained them."));
});

test("a page that draws no map offers no way to find a seat on one, and no caption refers to it", () => {
  // Both reasons, the state page and the election page, and each of the four modes (a mode changes the legend).
  const pages: [string, string, string][] = [];
  for (const mode of ["winners", "flips", "margin", "runnerup"]) {
    pages.push(["/state", `mode=${mode}`, "bb"], ["/election", `mode=${mode}`, "bb-assembly-2021"]);
  }
  pages.push(["/state", "", "cc"], ["/election", "", "cc-assembly-2023"], ["/state", "", "dd"], ["/state", "election=ee-assembly-2016", "ee"]);
  pages.push(["/election", "", "bb-bypoll-2018"], ["/state", "election=bb-bypoll-2018", "bb"]);
  for (const [route, query, segments] of pages) {
    const where = `${route} ${query} ${segments}`;
    const html = render(route, query, segments);
    const page = withoutNotice(text(html));
    assert.ok(html.includes("No boundary map"), `${where}: the notice is missing`);
    assert.doesNotMatch(page, /\bmap\b/i, `${where}: something still refers to the map`);
    assert.doesNotMatch(page, /find on map|unfocus/, where);
    // Two captions that refer to the map without saying "map": they describe how its seats are coloured.
    assert.doesNotMatch(page, /wears? the colour|Brightest/, `${where}: a caption describes colours that are not drawn`);
    assert.doesNotMatch(html, /[?&;]seat=/, `${where}: a link would focus a seat on a map that is not there`);
    assert.doesNotMatch(html, /aria-label="What the map shows"/, where);
    assert.doesNotMatch(html, /<figure class="iei-map[ "]/, `${where}: a map is drawn`);
  }
});
