// What a map page says about itself, and whether it is true: the no-earlier-election sentence, the words a seat's hover
// card uses for a figure, the map's accessible name and how a keyboard gets past it, and the base a vote share is over.
//
// The registry is built here from literal data and the pages rendered in a child process (seat-tiles-page.test.ts does
// the same). One state, `mc`, seven seats, every one with an outline, and in six of them a turnout of 1,000 votes polled:
//
//   mc-assembly-2016   the first election of its house on record, so nothing earlier to compare it with
//   mc-assembly-2021   the second, with every seat comparable. Each of the six seats that has a result records its winner and
//                      runner-up and no one else, so the two of them poll 900 of the 1,000 votes (the other 100 are candidates
//                      the registry does not hold). The seventh seat has no result and no turnout.
//   mc-bypoll-2018     a by-election of two of the seats, which has an earlier election too and still compares with none
//
// And a second state, `uv`, whose one election published winners and a declared margin and no vote counts (seat titles).
//
// Margins in votes in 2021, and so in per cent of the 1,000 polled: seat 1 AAA 60 (6%), seat 2 BBB 300 (30%), seat 3 AAA 10
// (1%), seat 4 AAA 200 (20%), seat 5 BBB 100 (10%), seat 6 AAA 400 (40%). AAA wins four seats and BBB two, and they poll
// 2,835 and 2,565 votes: of the 6,000 polled that is 47.25% and 42.75%, and of the 5,400 the candidates hold 52.5% and 47.5%.

import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { open } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";
import { SHARED_FRAME, electionMapView } from "./election-map.ts";

const ROOT = new URL("../../../../", import.meta.url).pathname;

function fixture(db: DatabaseSync): DatabaseSync {
  migrate(db, "2026-08-12T00:00:00.000Z");
  db.exec(`
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('e1','Delimitation','2008-02-19');
    INSERT INTO place (id, kind, canonical_name) VALUES ('in','nation','India');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('mc','state','Mc State','in');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('uv','state','Uv State','in');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('pp','state','Pp State','in');
    INSERT INTO source (id, kind, publisher, title, retrieved_at, doc_hash) VALUES ('s1','static_module','P','Results','2026-08-12','sha256:0');
    INSERT INTO source (id, kind, publisher, title, retrieved_at, doc_hash) VALUES ('s2','static_module','P','Outlines','2026-08-12','sha256:0');
    INSERT INTO party (id, name, short_name) VALUES ('AAA','A Party','AAA');
    INSERT INTO party (id, name, short_name) VALUES ('BBB','B Party','BBB');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (1,'AAA','1990-01-01','A Party');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (2,'BBB','1990-01-01','B Party');
  `);
  const place = db.prepare(`INSERT INTO place (id, kind, canonical_name, parent_id) VALUES (?, 'ac', ?, 'mc')`);
  const version = db.prepare(
    `INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, reservation)
     VALUES (?, ?, 'mc', 'ac', 'e1', ?, ?, 'general')`,
  );
  const outline = db.prepare(
    `INSERT INTO place_geometry (place_version_id, path, centroid_x, centroid_y, view_box, source_id) VALUES (?, ?, 1, 1, ?, 's2')`,
  );
  const seats = [1, 2, 3, 4, 5, 6, 7].map((n) => {
    place.run(`mc.ac.00${n}`, `Seat ${n}`);
    version.run(n, `mc.ac.00${n}`, n, `Seat ${n}`);
    const [x, y] = [100 + ((n - 1) % 3) * 20, 100 + Math.floor((n - 1) / 3) * 20];
    outline.run(n, `M${x} ${y}L${x + 10} ${y}L${x + 10} ${y + 10}L${x} ${y + 10}Z`, SHARED_FRAME);
    return n;
  });

  const election = db.prepare(
    `INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, occurrence)
     VALUES (?, ?, 'state', ?, 'e1', ?, 'declared', 'ac', ?, 1)`,
  );
  election.run("mc-assembly-2016", "assembly", "mc", "MC 2016", 2016);
  election.run("mc-bypoll-2018", "bypoll", "mc", "MC 2018 by-poll", 2018);
  election.run("mc-assembly-2021", "assembly", "mc", "MC 2021", 2021);
  election.run("uv-assembly-2021", "assembly", "uv", "UV 2021", 2021);
  election.run("pp-assembly-2011", "assembly", "pp", "PP 2011", 2011);
  election.run("pp-assembly-2016", "assembly", "pp", "PP 2016", 2016);
  election.run("pp-assembly-2021", "assembly", "pp", "PP 2021", 2021);

  // `uv`: three seats and an election that published winners and a declared margin and no vote counts, with a turnout nothing
  // corroborates, so no seat has a share of its margin. Seats 8 and 9 have a declared margin of 100 and 20 votes; seat 10 has none.
  // Seat 30 has a declared margin and no outline, so the map and the tiles cannot draw it.
  for (const n of [8, 9, 10, 30]) {
    db.prepare(`INSERT INTO place (id, kind, canonical_name, parent_id) VALUES (?, 'ac', ?, 'uv')`).run(`uv.ac.0${n}`, `Seat ${n}`);
    db.prepare(
      `INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, reservation)
       VALUES (?, ?, 'uv', 'ac', 'e1', ?, ?, 'general')`,
    ).run(n, `uv.ac.0${n}`, n, `Seat ${n}`);
    const x = 100 + (n - 8) * 20;
    if (n !== 30) outline.run(n, `M${x} 100L${x + 10} 100L${x + 10} 110L${x} 110Z`, SHARED_FRAME);
  }

  const person = db.prepare(`INSERT INTO person (id, canonical_name, created_at) VALUES (?, ?, '2026-08-12')`);
  const contestRow = db.prepare(`INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES (?, ?, ?, 'declared')`);
  const candidacy = db.prepare(`INSERT INTO candidacy (id, contest_id, person_id, party_version_id, status) VALUES (?, ?, ?, ?, ?)`);
  const result = db.prepare(
    `INSERT INTO result (contest_id, candidacy_id, revision, votes, "rank", is_winner, margin, source_id, ingested_at)
     VALUES (?, ?, 0, ?, ?, ?, ?, 's1', '2026-08-12')`,
  );
  const turnout = db.prepare(`INSERT INTO turnout (contest_id, scope, voters, electors, source_id) VALUES (?, 'contest', 1000, 2000, 's1')`);
  /** A contest of 1,000 votes polled, of which the winner (party 1 or 2) and the runner-up hold 900 between them. */
  const contest = (electionId: string, versionId: number, winner: 1 | 2, margin: number): void => {
    const id = `${electionId}:${versionId}`;
    contestRow.run(id, electionId, versionId);
    turnout.run(id);
    const won = (900 + margin) / 2;
    for (const [who, pv, rank] of [["w", winner, 1], ["r", winner === 1 ? 2 : 1, 2]] as const) {
      person.run(`p-${id}-${who}`, `Person ${id} ${who}`);
      candidacy.run(`${id}-${who}`, id, `p-${id}-${who}`, pv, rank === 1 ? "elected" : "defeated");
      result.run(id, `${id}-${who}`, rank === 1 ? won : 900 - won, rank, rank === 1 ? 1 : 0, rank === 1 ? margin : null);
    }
  };
  const run2021: [1 | 2, number][] = [[1, 60], [2, 300], [1, 10], [1, 200], [2, 100], [1, 400]];
  seats.slice(0, 6).forEach((v, i) => contest("mc-assembly-2016", v, i % 2 === 0 ? 1 : 2, 100 + i * 20));
  seats.slice(0, 6).forEach((v, i) => contest("mc-assembly-2021", v, (run2021[i] as [1 | 2, number])[0], (run2021[i] as [1 | 2, number])[1]));
  // The seventh seat was contested in both and the source gave no result for it.
  contestRow.run("mc-assembly-2016:7", "mc-assembly-2016", 7);
  contestRow.run("mc-assembly-2021:7", "mc-assembly-2021", 7);
  contest("mc-bypoll-2018", 1, 2, 80);
  contest("mc-bypoll-2018", 2, 1, 40);
  // `uv`: a winner, no vote counts, and a declared margin for two of the three. The third is a winner the source gave only a
  // published vote share for (a result row must hold some figure), so it has no margin.
  for (const [v, margin] of [[8, 100], [9, 20], [10, null], [30, 5]] as const) {
    const id = `uv-assembly-2021:${v}`;
    contestRow.run(id, "uv-assembly-2021", v);
    turnout.run(id);
    person.run(`p-${id}-w`, `Person ${id} w`);
    candidacy.run(`${id}-w`, id, `p-${id}-w`, v === 9 ? 2 : 1, "elected");
    if (margin === null) {
      db.prepare(
        `INSERT INTO result (contest_id, candidacy_id, revision, votes, vote_share, "rank", is_winner, margin, source_id, ingested_at)
         VALUES (?, ?, 0, NULL, 45, 1, 1, NULL, 's1', '2026-08-12')`,
      ).run(id, `${id}-w`);
    } else {
      result.run(id, `${id}-w`, null, 1, 1, margin);
    }
  }

  // `pp`: six seats, three elections, and ten parties. In 2021 nine of them stand and PX does not; PX won seats in 2011 and
  // 2016 only, so it has a row in the run of elections and nothing on the 2021 map. Each seat polls 1,000 and records its two
  // leading candidates. 2021: P1 beats P2 450 to 360 (seat 11), P3 beats P4 (12), P5 beats P6 (13), P7 beats P1 450 to 340
  // (14), P8 beats P7 350 to 340 (15) and P9 beats P2 450 to 340 (16). P8 polls least (350) and wins a seat, so the party that
  // does not fit in eight rows is one with a seat, while P4 and P6 are listed with none.
  const parties = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "PX"];
  parties.forEach((p, i) => {
    db.prepare(`INSERT INTO party (id, name, short_name) VALUES (?, ?, ?)`).run(p, `${p} Party`, p);
    db.prepare(`INSERT INTO party_version (id, party_id, valid_from, name) VALUES (?, ?, '1990-01-01', ?)`).run(11 + i, p, `${p} Party`);
  });
  const standings = (electionId: string, v: number, ...rows: [string, number][]): void => {
    const id = `${electionId}:${v}`;
    contestRow.run(id, electionId, v);
    turnout.run(id);
    rows.forEach(([party, votes], i) => {
      person.run(`p-${id}-${i}`, `Person ${id} ${i}`);
      candidacy.run(`${id}-${i}`, id, `p-${id}-${i}`, 11 + parties.indexOf(party), i === 0 ? "elected" : "defeated");
      result.run(id, `${id}-${i}`, votes, i + 1, i === 0 ? 1 : 0, i === 0 ? votes - (rows[1] as [string, number])[1] : null);
    });
  };
  for (let n = 11; n <= 16; n += 1) {
    db.prepare(`INSERT INTO place (id, kind, canonical_name, parent_id) VALUES (?, 'ac', ?, 'pp')`).run(`pp.ac.0${n}`, `Seat ${n}`);
    db.prepare(
      `INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, reservation)
       VALUES (?, ?, 'pp', 'ac', 'e1', ?, ?, 'general')`,
    ).run(n, `pp.ac.0${n}`, n, `Seat ${n}`);
    outline.run(n, `M${100 + (n - 11) * 20} 100L${110 + (n - 11) * 20} 100L${110 + (n - 11) * 20} 110L${100 + (n - 11) * 20} 110Z`, SHARED_FRAME);
  }
  for (const [election, who] of [["pp-assembly-2011", ["P1", "P1", "P1", "P1", "PX", "PX"]], ["pp-assembly-2016", ["P1", "P1", "P1", "P1", "P1", "PX"]]] as const) {
    who.forEach((w, i) => standings(election, 11 + i, [w, 450], [w === "P1" ? "P2" : "P1", 300]));
  }
  standings("pp-assembly-2021", 11, ["P1", 450], ["P2", 360]);
  standings("pp-assembly-2021", 12, ["P3", 450], ["P4", 360]);
  standings("pp-assembly-2021", 13, ["P5", 450], ["P6", 360]);
  standings("pp-assembly-2021", 14, ["P7", 450], ["P1", 340]);
  standings("pp-assembly-2021", 15, ["P8", 350], ["P7", 340]);
  standings("pp-assembly-2021", 16, ["P9", 450], ["P2", 340]);

  // `lk`: a Lok Sabha election of three parliamentary seats of `mc`, drawn in the corner of the shared frame where West Bengal
  // is, so the national frame is a small window onto the country and most of its states' outlines lie outside it.
  election.run("lk-2024", "general", "in", "LK 2024", 2024);
  db.exec(`UPDATE election SET house = 'pc', level = 'union' WHERE id = 'lk-2024'`);
  for (const n of [21, 22, 23]) {
    db.prepare(`INSERT INTO place (id, kind, canonical_name, parent_id) VALUES (?, 'pc', ?, 'mc')`).run(`mc.pc.0${n}`, `Seat ${n}`);
    db.prepare(
      `INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, reservation)
       VALUES (?, ?, 'mc', 'pc', 'e1', ?, ?, 'general')`,
    ).run(n, `mc.pc.0${n}`, n, `Seat ${n}`);
    const x = 400 + (n - 21) * 12;
    outline.run(n, `M${x} 290L${x + 10} 290L${x + 10} 300L${x} 300Z`, SHARED_FRAME);
    contest("lk-2024", n, n === 22 ? 2 : 1, 100);
  }
  return db;
}

const PATH = join(mkdtempSync(join(tmpdir(), "mandate-map-claims-")), "registry.db");
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

/* ───────────────────── an election with nothing earlier to compare it with ───────────────────── */

test("the first election of a house on record is not said to have been redrawn", () => {
  // THE CLAIM WAS: "Seat-level comparison unavailable: the constituencies were redrawn after the previous election". There is
  // no previous election, and the registry holds one set of boundaries for every seat of it: nothing was redrawn.
  for (const [route, segments, query] of [["/state", "mc", "election=mc-assembly-2016"], ["/election", "mc-assembly-2016", ""]] as const) {
    const t = text(render(route, query, segments));
    assert.doesNotMatch(t, /redrawn/, `${route}: ${t.match(/.{60}redrawn.{60}/)?.[0]}`);
    assert.match(t, /No earlier election of this house is on record, so there is nothing to compare this one with\./, `${route} says nothing of why it has no comparison`);
  }
});

test("an election that has an earlier one still compares with it, and says nothing about there being none", () => {
  for (const [route, segments, query] of [["/state", "mc", "election=mc-assembly-2021"], ["/election", "mc-assembly-2021", ""]] as const) {
    const t = text(render(route, query, segments));
    assert.doesNotMatch(t, /No earlier election/, route);
    assert.match(t, /changed hands/, `${route} lost its comparison`);
  }
});

test("a by-election is compared with nothing and says nothing of an earlier election, as before", () => {
  const t = text(render("/election", "", "mc-bypoll-2018"));
  assert.doesNotMatch(t, /No earlier election|redrawn/);
});

test("the first election's view counts no seat as incomparable, and a later one counts only the seats redrawn since", () => {
  const db = open(PATH);
  try {
    const first = electionMapView(db, "mc-assembly-2016");
    assert.equal(first.previous, null);
    assert.equal(first.incomparableSeats, 0, "every seat of the first election was counted as redrawn");
    assert.equal(first.flips, null);
    const second = electionMapView(db, "mc-assembly-2021");
    assert.equal(second.previous?.id, "mc-assembly-2016");
    assert.equal(second.incomparableSeats, 0, "nothing was redrawn between the two");
    assert.equal(second.flips?.comparable, 6);
  } finally {
    db.close();
  }
});

/* ───────────────────────── the map's accessible name, and getting past it ───────────────────────── */

/** The map's column, from its opening to the anchor the skip link points at, whichever shape the seats are drawn in. */
function mapColumn(html: string): string {
  const start = html.indexOf('<div class="iei-map-col"');
  const end = html.indexOf('<div id="after-map"></div>', start);
  assert.ok(start !== -1 && end !== -1, "the page has no map column that ends at an after-map anchor");
  return html.slice(start, end);
}

const MAPS = [
  ["/state", "", "mc", "map"],
  ["/state", "shape=tiles", "mc", "tiles"],
  ["/election", "", "mc-assembly-2021", "map"],
  ["/election", "shape=tiles", "mc-assembly-2021", "tiles"],
] as const;

test("a map's name says what it shows and that a seat is a link, and promises no list of every result", () => {
  // IT USED TO END "The full result for every seat is in the list that follows." The list holds twelve seats, or forty or sixty
  // when narrowed, so the one sentence only a screen-reader user hears was false on every page that has a map.
  for (const [route, query, segments, shape] of MAPS) {
    const column = mapColumn(render(route, query, segments));
    const svg = /<svg [^>]*>/.exec(column)?.[0] ?? "";
    const label = /aria-label="([^"]*)"/.exec(svg)?.[1] ?? "";
    assert.match(label, /Each seat links to its own page\.$/, `${route} ${shape}: ${label}`);
    assert.doesNotMatch(label, /full result|list that follows|every seat/, `${route} ${shape}: ${label}`);
    assert.match(label, shape === "map" ? /7 of 7 constituencies drawn\./ : /7 of 7 constituencies as equal tiles\./, `${route} ${shape}: ${label}`);
  }
});

test("a map is a group of links, not an image with links inside it", () => {
  // `role="img"` makes its descendants presentational while the keyboard still stops on every one of them (axe's
  // nested-interactive, serious): 288 tab stops in an image. A group keeps the links exposed under the same name.
  for (const [route, query, segments, shape] of MAPS) {
    const column = mapColumn(render(route, query, segments));
    assert.match(column, /<svg [^>]*role="group"/, `${route} ${shape}`);
    assert.doesNotMatch(column, /role="img"/, `${route} ${shape}`);
    assert.ok(/<a href="\/constituency\//.test(column), `${route} ${shape} has no seat links`);
  }
});

test("a keyboard can skip the map: the link is beside the column, before it, and points at an anchor at its end", () => {
  for (const [route, query, segments, shape] of MAPS) {
    const html = render(route, query, segments);
    const column = mapColumn(html);
    // BESIDE THE COLUMN, NOT IN IT: the column is sticky from 1024px up, a sticky box is a stacking context, and a skip link
    // inside it took focus under the page bar. It is the link before the column, and nothing is between them.
    const at = html.indexOf(column);
    assert.equal(html.slice(at - `<a class="iei-skip" href="#after-map">Skip the ${shape}</a>`.length, at), `<a class="iei-skip" href="#after-map">Skip the ${shape}</a>`, `${route} ${shape}`);
    assert.match(column, /^<div class="iei-map-col"[^>]*><figure/, `${route} ${shape}: the column opens with the figure`);
    assert.equal(html.match(/id="after-map"/g)?.length, 1, `${route} ${shape}: the anchor is not unique`);
    // The anchor is in the map's own column, so the next stop after it is the legend beside the map.
    assert.ok(html.indexOf('id="after-map"') < html.indexOf('class="iei-atlas-side"'), `${route} ${shape}`);
  }
});

/* ───────────────────────── what a seat's hover card says of a figure ───────────────────────── */

/** Every drawn seat's hover line, in the order drawn, for the map or for the tiles. */
function titles(html: string): string[] {
  const start = Math.max(html.indexOf('<g class="iei-map-fills"'), html.indexOf('<g class="iei-tiles"'));
  const region = html.slice(start, html.indexOf("</svg>", start));
  return [...region.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => m[1] as string);
}

test("a winner's hover line names the margin as a margin, where the number could read as the party's share", () => {
  // IT READ "SEAT 1 — AAA, 6.0%", which is the winning margin over votes polled and looks like a vote share: AAA polled 48.0%
  // of the votes in that seat. The margin tab's line said "6.0%, 60 votes" and the same figure, unlabelled.
  for (const query of ["", "shape=tiles"]) {
    const lines = titles(render("/election", query, "mc-assembly-2021"));
    assert.deepEqual(lines.slice(0, 3), ["SEAT 1 — AAA, won by 6.0%", "SEAT 2 — BBB, won by 30.0%", "SEAT 3 — AAA, won by 1.0%"], query);
    assert.equal(lines[6], "SEAT 7 — no winner recorded", query);
  }
});

test("the margin tab's hover line says the figure is a margin, and where a share is not known it says the votes and no dash", () => {
  const known = titles(render("/election", "mode=margin", "mc-assembly-2021"));
  assert.deepEqual(known.slice(0, 2), ["SEAT 1 — 6.0% margin, 60 votes", "SEAT 2 — 30.0% margin, 300 votes"]);
  // No seat of `uv` has a share of its margin (a declared margin and no turnout to divide it by), so the page does not offer the
  // margin tab there and a link into it shows the winners, with no "— —" and no bare votes. The line for a declared margin
  // among seats that have a share is seatTitle's, which a package test cannot import (src/ is outside the package).
  for (const query of ["mode=margin", "mode=margin&shape=tiles"]) {
    assert.deepEqual(titles(render("/election", query, "uv-assembly-2021")), ["SEAT 8 — AAA", "SEAT 9 — BBB", "SEAT 10 — AAA"], query);
  }
  // And the winners tab of the same election has never had a share to print.
  assert.deepEqual(titles(render("/election", "", "uv-assembly-2021")), ["SEAT 8 — AAA", "SEAT 9 — BBB", "SEAT 10 — AAA"]);
});

/* ───────────────────────── a bar with no seat in it leads nowhere ───────────────────────── */

test("a bar of the margin histogram with no seat in it is not a link", () => {
  // The 2021 margins are 1%, 6%, 10%, 20%, 30% and 40%: six bins hold a seat and fifteen hold none. Following an empty one
  // dimmed the whole map and emptied the list under a heading with no explanation.
  const html = render("/election", "", "mc-assembly-2021");
  const figure = html.slice(html.indexOf('<figure class="iei-fig iei-dist"'), html.indexOf("</figure>", html.indexOf('<figure class="iei-fig iei-dist"')));
  assert.deepEqual(
    [...figure.matchAll(/<a href="[^"]*[?&]bin=(\d+)[^"]*">/g)].map((m) => Number(m[1])),
    [0, 6, 10, 20, 30, 40],
  );
  assert.equal(figure.match(/<title>/g)?.length, 21, "every bar still says how many seats it holds, linked or not");
  assert.match(figure, /<title>2–4% — 0 seats<\/title>/);
});

test("a selection that matches no seat says so, and the bar that was selected can still be released", () => {
  const html = render("/election", "bin=2", "mc-assembly-2021");
  assert.match(html, /<h3 class="iei-list-title">Seats decided by 2 to 4 percent, in seat order<\/h3><p class="iei-list-count">0 of 0<\/p><\/div><p class="iei-absent">No seat matches this selection\.<\/p>/);
  // The way back from a selection is the bar that was selected, and it is a link even though no seat is in it.
  const figure = html.slice(html.indexOf('<figure class="iei-fig iei-dist"'), html.indexOf("</figure>", html.indexOf('<figure class="iei-fig iei-dist"')));
  assert.match(figure, /<a href="\/election\/mc-assembly-2021#map"><g opacity="1">/);
});

/* ───────────────────────── a list cut short says what is not in it ───────────────────────── */

test("the party rows are the eight biggest by vote share, and a party that is not among them is counted under them with its seats", () => {
  // Nine parties stand, the plot draws nine, and the rows stopped at eight without a word: P8 won a seat and polled least, so
  // the party missing from the list was one with a seat, while P4 and P6 were listed with none.
  const html = render("/state", "", "pp");
  const rows = html.slice(html.indexOf('<ul class="iei-partyrows"'));
  assert.equal(rows.slice(0, rows.indexOf("</ul>")).match(/<li>/g)?.length, 8);
  assert.equal(html.match(/class="iei-vs-dot"/g)?.length, 9, "the plot beside them draws all nine");
  assert.match(text(html), /Not listed: 1 smaller party, with 1 seat\./);
  // A short list says nothing of the kind.
  assert.doesNotMatch(text(render("/state", "election=pp-assembly-2016", "pp")), /Not listed/);
});

/* ───────────────────────── a row that leads to no seats is not a link ───────────────────────── */

/** The run of elections' rows, in order: the party each names and whether the row is a link. */
function runRows(html: string): [string, string][] {
  return [...html.matchAll(/<(a|div) ([^>]*)class="iei-traj-row"([^>]*)>(?:(?!iei-traj-row).)*?<span class="iei-traj-name"><span [^>]*><\/span>([^<]*)<\/span>/gs)].map((m) => [m[4] as string, m[1] as string]);
}

test("a party in the run of elections that won no seat in the election shown is not a link to its seats on that map", () => {
  // PX won seats in 2011 and 2016 and did not stand in 2021. Its row linked to `?party=PX#map`, which the page does not offer
  // for 2021, so following it reloaded the page at the map with nothing isolated.
  const html = render("/state", "", "pp");
  assert.deepEqual(runRows(html), [["P1", "a"], ["PX", "div"], ["P1", "a"], ["PX", "div"]], "seats, then vote share");
  assert.equal(html.match(/title="Won no seat in this election"/g)?.length, 2);
  // In an election it won seats in, the same row is a link, and so it is in every election the party stands in.
  for (const election of ["pp-assembly-2016", "pp-assembly-2011"]) {
    assert.deepEqual(runRows(render("/state", `election=${election}`, "pp")), [["P1", "a"], ["PX", "a"], ["P1", "a"], ["PX", "a"]], election);
  }
});

/* ───────────────────────── the country under a national map is drawn once ───────────────────────── */

test("a national frame draws each state's outline once, and only the outlines the frame meets", () => {
  // IT WROTE EVERY OUTLINE TWICE, once as the canvas under the seats and once as the borders over them, with identical path data,
  // and all 36 of them although the frame was West Bengal alone: 105 kB of a 160 kB page for outlines most of which lay outside
  // the picture.
  const html = render("/election", "", "lk-2024");
  const outlines = [...html.matchAll(/ d="(M[^"]{400,})"/g)].map((m) => m[1] as string);
  assert.ok(outlines.length > 0, "no state outline is drawn");
  assert.equal(new Set(outlines).size, outlines.length, "an outline is written more than once");
  assert.ok(outlines.length < 36, `${outlines.length} outlines for a frame the size of one state`);

  // Both layers are those outlines by reference, in the order they were: the canvas under the seats, the borders over them.
  const uses = (layer: string): string[] => {
    const at = html.indexOf(`<g class="${layer}"`);
    return [...html.slice(at, html.indexOf("</g>", at)).matchAll(/<use href="#([^"]*)"/g)].map((m) => m[1] as string);
  };
  const defs = [...html.matchAll(/<path id="([^"]*)"/g)].map((m) => m[1] as string);
  assert.deepEqual(uses("iei-map-canvas"), defs);
  assert.deepEqual(uses("iei-map-borders"), defs);
  assert.ok(html.indexOf('<g class="iei-map-canvas"') < html.indexOf('<g class="iei-map-fills"'));
  assert.ok(html.indexOf('<g class="iei-map-fills"') < html.indexOf('<g class="iei-map-borders"'));
  // A stroke in a map is in device pixels, and a stylesheet rule does not reach what `use` draws, so it is on the outline itself.
  assert.match(html, /<path id="[^"]*" d="M[^"]*" vector-effect="non-scaling-stroke"><\/path>/);
  // And the seats are all there.
  assert.equal(titles(html).length, 3);
});

test("every element a map draws as a state border is one the stylesheet draws as a line", () => {
  // Two components write `.iei-map-borders`: the front page's map draws a `path` per state and the election map a `use` of an
  // outline it wrote once. A rule for the one element and not the other leaves the other with the browser's default, a black
  // fill over every state colour under it, and the page's HTML shows no sign of it.
  const css = readFileSync(join(ROOT, "src/app/iei.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selectors: (m[1] as string).split(",").map((s) => s.trim()), body: m[2] as string }));
  const drawn = (selector: string): boolean =>
    rules.some((r) => r.selectors.includes(selector) && /fill:\s*none/.test(r.body) && /stroke:\s*var\(/.test(r.body));

  const pages = [["/", "", ""], ["/election", "", "lk-2024"]] as const;
  for (const [route, query, segments] of pages) {
    const html = render(route, query, segments);
    const layers = [...html.matchAll(/<g class="iei-map-borders"[^>]*>([\s\S]*?)<\/g>/g)];
    assert.equal(layers.length, 1, `${route}: ${layers.length} border layers`);
    const tags = new Set([...(layers[0]?.[1] ?? "").matchAll(/<(\w+)[ >]/g)].map((m) => m[1] as string));
    assert.ok(tags.size > 0, `${route}: the border layer is empty`);
    // A national constituency map has a heavier line of its own over the same layer.
    const within = html.includes("iei-map-national") ? [".iei-map-borders", ".iei-map-national .iei-map-borders"] : [".iei-map-borders"];
    for (const tag of tags) {
      for (const scope of within) assert.ok(drawn(`${scope} ${tag}`), `${route}: no rule draws a <${tag}> under "${scope}" as a line`);
    }
  }
});

test("a state's own map, and the tiles, draw no country under them", () => {
  for (const [route, query, segments] of [["/state", "", "mc"], ["/election", "", "lk-2024"], ["/election", "shape=tiles", "lk-2024"]] as const) {
    const html = render(route, query, segments);
    assert.equal(/<g class="iei-map-canvas"/.test(html), route === "/election" && query === "", `${route} ${query}`);
  }
});

/* ───────────────────────── a share too small for the row's decimals ───────────────────────── */

/** Render a component of `src/components/iei` with each set of props, in one child process (the .tsx loader costs a second). */
function renderComponent(file: string, name: string, props: readonly Record<string, unknown>[]): string[] {
  const script = `
    import { createElement } from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { readFileSync } from 'node:fs';
    const C = (await import(${JSON.stringify(`file://${ROOT}src/components/iei/${file}`)}))[${JSON.stringify(name)}];
    process.stdout.write(JSON.stringify(JSON.parse(readFileSync(0, 'utf8')).map((p) => renderToStaticMarkup(createElement(C, p)))));
  `;
  return JSON.parse(
    execFileSync(process.execPath, ["--import", "./ops/probe/render/register.mjs", "--input-type=module", "-e", script], {
      cwd: ROOT,
      encoding: "utf8",
      input: JSON.stringify(props),
      maxBuffer: 16 * 1024 * 1024,
    }),
  ) as string[];
}

test("a seat's margin share is bounded by the smallest figure the row can print, not by a coarser one", () => {
  // The row prints two decimals, and a share it would print as 0.00% is printed as a bound. The bound was "<0.1%", so a margin
  // of 0.004% read as larger than one of 0.04% ("0.04%"); it is "<0.01%", which is what two decimals can say.
  const seat = (marginPct: number) => ({
    seat: { partyLabel: "AAA", partyKey: "AAA", runnerUpLabel: "BBB", runnerUpKey: "BBB", marginVotes: 1, marginBasis: "counted", marginPct, turnout: { state: "reported", pct: 50 } },
  });
  const [tiny, floor, small, ordinary, none] = renderComponent("SeatList.tsx", "RowContest", [seat(0.004), seat(0.0049), seat(0.04), seat(12.345), seat(0)]).map((h) => text(h).replace(/&lt;/g, "<"));
  assert.match(tiny as string, /· <0\.01%$/);
  assert.match(floor as string, /· <0\.01%$/);
  assert.match(small as string, /· 0\.04%$/);
  assert.match(ordinary as string, /· 12\.35%$/);
  assert.match(none as string, /· 0\.00%$/, "a margin of exactly nothing is nothing");
});

/* ───────────────────────── a seat the map cannot draw is still one the page can reach ───────────────────────── */

test("the caption names the seats that have no boundary, as links to their pages, on the map and on the tiles", () => {
  // A seat with no outline is on neither the map nor the tiles, and where the list shows twelve it was reachable from nowhere
  // but a search. The caption already said how many; it says which, for a few.
  const seat30 = '<a class="iei-body-link" href="/constituency/uv/assembly/seat-30">Seat 30</a>';
  const map = render("/election", "", "uv-assembly-2021");
  assert.ok(map.includes(`3 of 4 drawn — no boundary on record for the other 1: ${seat30}.`), "the map's caption");
  const tiles = render("/election", "shape=tiles", "uv-assembly-2021");
  assert.ok(tiles.includes(`1 has no boundary on record, so no tile: ${seat30}.`), "the tiles' caption");
  // Every seat drawn says nothing of the kind.
  assert.doesNotMatch(render("/election", "", "mc-assembly-2021"), /no boundary on record/);
});

test("two undrawn seats of one name are told apart by their district, and a long list is a count and no names", () => {
  const seat = (name: string, district: string | null, n: number) => ({ versionId: n, name, districtName: district, href: `/constituency/wb/assembly/s${n}` });
  const [twins, many, one, noHref] = renderComponent("SeatTiles.tsx", "Unmapped", [
    { seats: [seat("Bishnupur", "Bankura", 1), seat("Joynagar", "South 24 Parganas", 2), seat("Bishnupur", "South 24 Parganas", 3)] },
    { seats: Array.from({ length: 9 }, (_, i) => seat(`Seat ${i}`, null, i)) },
    { seats: [seat("Howrah", null, 4)] },
    { seats: [{ versionId: 5, name: "Nowhere", districtName: null, href: null }] },
  ]).map((h) => text(h).replace(/ ,/g, ","));
  assert.equal(twins, ": Bishnupur (Bankura), Joynagar, Bishnupur (South 24 Parganas)");
  assert.equal(many, "", "nine is too many to name");
  assert.equal(one, ": Howrah");
  assert.equal(noHref, ": Nowhere", "a seat with no page is named and not linked");
});

/* ───────────────────────── a selected link says so with aria-current ───────────────────────── */

test("the isolated party's links are marked current, as a link can be, and no link is marked pressed", () => {
  // `aria-pressed` belongs to a button: on a link axe calls it critical (aria-allowed-attr), and a screen reader may ignore it,
  // so nothing programmatic said which party was selected. Tabs and the seat arc already use aria-current.
  for (const [route, segments, query] of [["/state", "mc", "election=mc-assembly-2021&party=AAA"], ["/election", "mc-assembly-2021", "party=AAA"]] as const) {
    const html = render(route, query, segments);
    assert.doesNotMatch(html, /aria-pressed/, route);
    const current = [...html.matchAll(/<a [^>]*aria-current="true"[^>]*>(.*?)<\/a>/g)].map((m) => text(m[1] as string));
    assert.ok(current.some((t) => /^AAA\b/.test(t)), `${route}: the legend does not mark AAA as current: ${current.join(" | ")}`);
    assert.ok(!current.some((t) => /^BBB\b/.test(t)), `${route}: BBB is marked current though AAA is isolated: ${current.join(" | ")}`);
  }
});

test("no page puts aria-pressed on a link: the product has no toggle button, and a link cannot have it", () => {
  const src = new URL("../../../../src/", import.meta.url);
  const files = (readdirSync(src, { recursive: true }) as string[]).filter((f) => /\.tsx?$/.test(f));
  assert.deepEqual(
    files.filter((f) => /aria-pressed/.test(readFileSync(new URL(f, src), "utf8"))),
    [],
    "use aria-current for a selected link",
  );
});

/* ───────────────────────── what a party's share of the vote is over ───────────────────────── */

test("a party's vote share is over the votes polled in the seats that have counts, not over the candidates' own sum", () => {
  // The registry holds the leading candidates of a seat, so their sum falls short of the votes polled and a share over it is
  // inflated: AAA's 2,835 votes are 47.25% of the 6,000 polled and would be 52.5% of the 5,400 the candidates hold.
  const html = render("/election", "", "mc-assembly-2021");
  assert.match(html, /<title>AAA: 47\.3% of the vote, 57\.1% of the seats \(4 of 7\) — \+9\.9 points<\/title>/);
  assert.match(html, /<title>BBB: 42\.8% of the vote, 28\.6% of the seats \(2 of 7\) — −14\.2 points<\/title>/);
  assert.doesNotMatch(html, /52\.5% of the vote|47\.5% of the vote/);
});

test("the plot says what its two shares are over, and they are over different seats when a seat has no result", () => {
  const said = /Vote share is of the votes polled in the 6 seats with candidate counts; seat share is of all 7\./;
  assert.match(text(render("/election", "", "mc-assembly-2021")), said);
  assert.match(text(render("/election", "", "mc-assembly-2016")), said);
});

test("the state page's vote shares are over the same base, in the plot and in the run of elections", () => {
  const html = render("/state", "election=mc-assembly-2021", "mc");
  assert.match(html, /<title>AAA: 47\.3% of the vote, 57\.1% of the seats \(4 of 7\)/);
  // The run of elections prints the share of the newest election, whole: 47% and 43%, not the 53% and 48% of the candidates' sum.
  const now = [...html.matchAll(/class="iei-traj-now">([^<]*)</g)].map((m) => m[1]);
  assert.ok(now.includes("47%") && now.includes("43%"), `the vote-share column reads ${now.join(" ")}`);
  assert.ok(!now.includes("53%") && !now.includes("48%"), `the vote-share column reads ${now.join(" ")}`);
  assert.match(text(html), /full height = \d+% of votes polled/);
});
