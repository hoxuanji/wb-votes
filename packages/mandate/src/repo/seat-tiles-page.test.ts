// The tile view of the map: every seat one equal tile, placed near where the seat is, coloured and worded exactly as the map colours
// and words it.
//
// The registry is built here from literal data and the pages rendered in a child process (map-composition.test.ts does the same):
//
//   tt  six assembly seats with outlines in a 3 by 2 block, two elections (so Flips is a mode)
//   pp  four assembly seats, three with an outline and one without
//   bb  two assembly seats, none with an outline

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
  for (const [id, name] of [["tt", "Tt"], ["pp", "Pp"], ["bb", "Bb"]] as const) place.run(id, "state", `${name} State`, "in");
  const version = db.prepare(
    `INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, reservation)
     VALUES (?, ?, ?, 'ac', 'e1', ?, ?, 'general')`,
  );
  const outline = db.prepare(
    `INSERT INTO place_geometry (place_version_id, path, centroid_x, centroid_y, view_box, source_id) VALUES (?, ?, 1, 1, ?, 's2')`,
  );
  let next = 0;
  /** A seat; `at` is its place in a 3-wide block of squares, or null for no outline. */
  const seat = (state: string, n: number, at: number | null): number => {
    const id = ++next;
    place.run(`${state}.ac.00${n}`, "ac", `Seat ${state}${n}`, state);
    version.run(id, `${state}.ac.00${n}`, state, n, `Seat ${state}${n}`);
    if (at !== null) {
      const [x, y] = [100 + (at % 3) * 20, 100 + Math.floor(at / 3) * 20];
      outline.run(id, `M${x} ${y}L${x + 10} ${y}L${x + 10} ${y + 10}L${x} ${y + 10}Z`, SHARED_FRAME);
    }
    return id;
  };
  const tt = [0, 1, 2, 3, 4, 5].map((i) => seat("tt", i + 1, i));
  const pp = [seat("pp", 1, 0), seat("pp", 2, 1), seat("pp", 3, 2), seat("pp", 4, null)];
  const bb = [seat("bb", 1, null), seat("bb", 2, null)];

  const election = db.prepare(
    `INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, occurrence)
     VALUES (?, 'assembly', 'state', ?, 'e1', ?, 'declared', 'ac', ?, 1)`,
  );
  election.run("tt-assembly-2016", "tt", "TT 2016", 2016);
  election.run("tt-assembly-2021", "tt", "TT 2021", 2021);
  election.run("pp-assembly-2021", "pp", "PP 2021", 2021);
  election.run("bb-assembly-2021", "bb", "BB 2021", 2021);

  const person = db.prepare(`INSERT INTO person (id, canonical_name, created_at) VALUES (?, ?, '2026-08-12')`);
  const contestRow = db.prepare(`INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES (?, ?, ?, 'declared')`);
  const candidacy = db.prepare(`INSERT INTO candidacy (id, contest_id, person_id, party_version_id, status) VALUES (?, ?, ?, ?, ?)`);
  const result = db.prepare(
    `INSERT INTO result (contest_id, candidacy_id, revision, votes, "rank", is_winner, margin, source_id, ingested_at)
     VALUES (?, ?, 0, ?, ?, ?, ?, 's1', '2026-08-12')`,
  );
  const contest = (electionId: string, versionId: number, winner: 1 | 2, margin: number): void => {
    const id = `${electionId}:${versionId}`;
    contestRow.run(id, electionId, versionId);
    const won = (1000 + margin) / 2;
    for (const [who, pv, rank] of [["w", winner, 1], ["r", winner === 1 ? 2 : 1, 2]] as const) {
      person.run(`p-${id}-${who}`, `Person ${id} ${who}`);
      candidacy.run(`${id}-${who}`, id, `p-${id}-${who}`, pv, rank === 1 ? "elected" : "defeated");
      result.run(id, `${id}-${who}`, rank === 1 ? won : 1000 - won, rank, rank === 1 ? 1 : 0, rank === 1 ? margin : null);
    }
  };
  tt.forEach((v, i) => {
    contest("tt-assembly-2016", v, i % 2 === 0 ? 1 : 2, 40 + i * 30);
    contest("tt-assembly-2021", v, i < 3 ? 1 : 2, 20 + i * 40);
  });
  pp.forEach((v, i) => contest("pp-assembly-2021", v, i < 2 ? 1 : 2, 100 + i * 10));
  bb.forEach((v, i) => contest("bb-assembly-2021", v, 1, 50 + i * 10));
  return db;
}

const PATH = join(mkdtempSync(join(tmpdir(), "mandate-seat-tiles-")), "registry.db");
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

const text = (html: string): string => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const unescape = (s: string): string => s.replace(/&amp;/g, "&");

/** Every drawn seat as its hover line and what it is filled with and how strongly, whether it is a polygon or a tile. */
function seats(html: string, tag: "path" | "rect"): Map<string, { fill: string; opacity: string; href: string | null }> {
  const out = new Map<string, { fill: string; opacity: string; href: string | null }>();
  const start = html.indexOf(tag === "path" ? '<g class="iei-map-fills"' : '<g class="iei-tiles"');
  if (start === -1) return out;
  const region = html.slice(start, html.indexOf("</svg>", start));
  for (const m of region.matchAll(new RegExp(`(<a href="[^"]*">)?<${tag} ([^>]*)><title>([^<]*)</title>`, "g"))) {
    const attr = (name: string): string | undefined => new RegExp(`(?:^| )${name}="([^"]*)"`).exec(m[2] as string)?.[1];
    out.set(m[3] as string, {
      fill: attr("fill") ?? "",
      opacity: attr("opacity") ?? "1",
      href: m[1] === undefined ? null : unescape(/href="([^"]*)"/.exec(m[1])![1] as string),
    });
  }
  return out;
}

test("the tile view has one tile per seat that has an outline, each a link to its own seat page", () => {
  const html = render("/state", "shape=tiles", "tt");
  const tiles = seats(html, "rect");
  assert.equal(tiles.size, 6);
  const hrefs = [...tiles.values()].map((t) => t.href);
  assert.ok(hrefs.every((h) => h !== null && h.startsWith("/constituency/")), `hrefs: ${hrefs.join(" ")}`);
  assert.equal(new Set(hrefs).size, 6);
  assert.doesNotMatch(html, /class="iei-map-fills"/, "the polygons are not also drawn");
});

test("a tile is the colour the map gives the same seat and says what the map says, in every mode", () => {
  for (const mode of MODES.map((m) => m.key)) {
    const map = seats(render("/state", `mode=${mode}`, "tt"), "path");
    const tiles = seats(render("/state", `mode=${mode}&shape=tiles`, "tt"), "rect");
    assert.equal(map.size, 6, `${mode}: the map draws six seats`);
    assert.deepEqual(
      [...tiles].map(([title, t]) => [title, t.fill, t.opacity]).sort(),
      [...map].map(([title, t]) => [title, t.fill, t.opacity]).sort(),
      `${mode}: tiles and polygons disagree`,
    );
  }
});

test("the map is the default, and the control offers Tiles as a link that keeps everything else", () => {
  const html = render("/state", "mode=margin", "tt");
  assert.doesNotMatch(html, /iei-tiles/);
  const group = /<div class="iei-tabs" role="group" aria-label="How the seats are drawn">([\s\S]*?)<\/div>/.exec(html);
  assert.ok(group !== null, "no Map / Tiles control");
  assert.match(group[1] as string, /aria-current="true"[^>]*>Map</);
  const tiles = /<a [^>]*href="([^"]*)"[^>]*>Tiles</.exec(group[1] as string);
  assert.ok(tiles !== null, "no link to Tiles");
  assert.match(unescape(tiles[1] as string), /^\/state\/tt\?mode=margin&shape=tiles#map$/);
});

test("every link of the selection carries the chosen shape, so the reader stays in the tiles", () => {
  const html = render("/state", "shape=tiles", "tt");
  const tabs = [...html.matchAll(/<a ([^>]*class="iei-tab[^"]*"[^>]*)>([^<]*)</g)].map(
    (m) => [unescape(/href="([^"]*)"/.exec(m[1] as string)?.[1] ?? ""), m[2] as string] as const,
  );
  assert.ok(tabs.length >= 6, `only ${tabs.length} tabs found`);
  for (const [href, label] of tabs) {
    if (label === "Map") assert.doesNotMatch(href, /shape=/, "the Map tab drops the shape");
    else assert.match(href, /shape=tiles/, `${label}: ${href}`);
  }
});

test("a seat with no outline is not tiled, and the caption says how many were left out", () => {
  const html = render("/state", "shape=tiles", "pp");
  assert.equal(seats(html, "rect").size, 3);
  const t = text(html.slice(html.indexOf('<figure class="iei-map iei-map-tiles"')));
  assert.match(t, /3 of 4 constituencies are tiled/);
  assert.match(t, /1 has no boundary on record, so no tile/);
});

test("a seat the selection leaves out is turned down on the tiles as it is on the map", () => {
  const tiles = seats(render("/state", "party=AAA&shape=tiles", "tt"), "rect");
  const map = seats(render("/state", "party=AAA", "tt"), "path");
  assert.equal([...tiles.values()].filter((t) => t.opacity === "0.18").length, 3);
  assert.deepEqual(
    [...tiles].map(([k, t]) => [k, t.opacity]).sort(),
    [...map].map(([k, t]) => [k, t.opacity]).sort(),
  );
});

test("where no map is drawn there is no control, and asking for tiles changes nothing", () => {
  const plain = render("/state", "", "bb");
  assert.doesNotMatch(plain, /How the seats are drawn/);
  assert.doesNotMatch(plain, /iei-tiles/);
  assert.doesNotMatch(render("/state", "shape=tiles", "bb"), /iei-tiles/);
});

test("the election page has the control and the tiles too", () => {
  const html = render("/election", "shape=tiles", "tt-assembly-2021");
  assert.match(html, /aria-label="How the seats are drawn"/);
  assert.equal(seats(html, "rect").size, 6);
});

test("a tile is square-cornered to the system's radius and the tiles are separated by the surface, never by a stroke", () => {
  const html = render("/state", "shape=tiles", "tt");
  const rect = /<rect [^>]*>/.exec(html.slice(html.indexOf('<g class="iei-tiles"')));
  assert.ok(rect !== null);
  assert.doesNotMatch(rect[0], /stroke/);
  assert.match(rect[0], /rx="2"/);
});

test("the page stays far under the page budget", () => {
  assert.ok(render("/state", "shape=tiles", "tt").length < 340_000);
});
