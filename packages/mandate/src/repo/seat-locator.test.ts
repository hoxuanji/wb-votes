// The seat locator: a seat's outline among the other seats of its house in its state, in one frame (seat-locator.ts), and the
// page that draws it.
//
// The registry is built here from literal data through the real migrations, because the live one cannot show a seat whose
// neighbour has no outline, an outline in another projection, or a tie between two seats' names that both have one:
//
//   xx  five assembly seats and three Lok Sabha seats under one order, one more assembly seat under a later order, and
//         Alpha    drawn; won by BBB in 2016 and by AITC (short name TMC) in 2021
//         Beta     two seats of that name, both drawn: a tie, so each is addressed by its registry id. The first has a 2021
//                  contest with no declared winner and a 2016 winner, the second has no contest at all
//         Delta    no outline
//         Eps      an outline in another projection, which is withheld
//         Lok One / Lok Two  drawn, Lok Three not; Lok One won by BBB in 2024
//         Old      a seat of the later order, drawn, which is not a neighbour of anything under the first
//   yy  one assembly seat, drawn: a state's other seats are not a neighbour of it
//   zz  one assembly seat, drawn, and no other seat of its house: nothing to be among
//   ww  two assembly seats of which only one is drawn: the same
//   bb  two assembly seats and no outline: the no-map case

import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { open } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";
import { SHARED_FRAME, electionMapView } from "./election-map.ts";
import { fillFor } from "../viz/party-ink.ts";
import { locatorCaption, locatorDescription, locatorSeatTitle, seatLocator, squareFrame } from "./seat-locator.ts";
import type { SeatLocatorView } from "./seat-locator.ts";

const ROOT = new URL("../../../../", import.meta.url).pathname;

/** The box a path occupies, read back out of the `M x y L x y Z` the fixture writes. */
const rect = (x: number, y: number, w = 10, h = 10): string => `M${x} ${y}L${x + w} ${y}L${x + w} ${y + h}L${x} ${y + h}Z`;

function fixture(db: DatabaseSync): DatabaseSync {
  migrate(db, "2026-08-12T00:00:00.000Z");
  db.exec(`
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('e1','Delimitation','2008-02-19');
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('e2','Later delimitation','2023-03-01');
    INSERT INTO place (id, kind, canonical_name) VALUES ('in','nation','India');
    INSERT INTO source (id, kind, publisher, title, retrieved_at, doc_hash) VALUES ('s1','static_module','P','Results','2026-08-12','sha256:0');
    INSERT INTO source (id, kind, publisher, title, retrieved_at, doc_hash) VALUES ('s2','static_module','P','Outlines','2026-08-12','sha256:0');
    INSERT INTO party (id, name, short_name) VALUES ('AITC','All India Trinamool Congress','TMC');
    INSERT INTO party (id, name, short_name) VALUES ('BBB','B Party','BBB');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (1,'AITC','1998-01-01','All India Trinamool Congress');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (2,'BBB','1990-01-01','B Party');
  `);
  const place = db.prepare(`INSERT INTO place (id, kind, canonical_name, parent_id) VALUES (?, ?, ?, ?)`);
  for (const [id, name] of [["xx", "Xx State"], ["yy", "Yy State"], ["zz", "Zz State"], ["ww", "Ww State"], ["rr", "Rr State"], ["bb", "Bb State"]] as const) {
    place.run(id, "state", name, "in");
  }
  const version = db.prepare(
    `INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, reservation)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'general')`,
  );
  const outline = db.prepare(
    `INSERT INTO place_geometry (place_version_id, path, centroid_x, centroid_y, view_box, source_id) VALUES (?, ?, 1, 1, ?, 's2')`,
  );
  let next = 0;
  const seen = new Set<string>();
  /** One seat version; `drawn` is its path, or null for no outline, with the frame it is written in. */
  const seat = (
    state: string,
    kind: "ac" | "pc",
    n: number,
    name: string,
    drawn: string | null,
    frame = SHARED_FRAME,
    epoch = "e1",
  ): number => {
    const id = ++next;
    const placeId = `${state}.${kind}.00${n}`;
    if (!seen.has(placeId)) place.run(placeId, kind, name, state);
    seen.add(placeId);
    version.run(id, placeId, state, kind, epoch, n, name);
    if (drawn !== null) outline.run(id, drawn, frame);
    return id;
  };
  const alpha = seat("xx", "ac", 1, "Alpha", rect(0, 0));
  const beta2 = seat("xx", "ac", 2, "Beta", rect(10, 0));
  seat("xx", "ac", 3, "Beta", rect(20, 0));
  const delta = seat("xx", "ac", 4, "Delta", null);
  seat("xx", "ac", 5, "Eps", rect(100, 100), "0 0 10 10");
  seat("xx", "ac", 9, "Old", rect(40, 0), SHARED_FRAME, "e2");
  const lokOne = seat("xx", "pc", 1, "Lok One", rect(0, 0, 30, 30));
  seat("xx", "pc", 2, "Lok Two", rect(30, 0, 30, 30));
  seat("xx", "pc", 3, "Lok Three", null);
  // A house with no election has no voting epoch, so none of its seats is current and none has a page: each of these states
  // held one assembly election in 2021, in which every seat was won by AITC.
  const others = [
    seat("yy", "ac", 1, "Yonder", rect(200, 200)),
    seat("zz", "ac", 1, "Zed", rect(0, 0)),
    seat("ww", "ac", 1, "Wye", rect(0, 0)),
    seat("ww", "ac", 2, "Wex", null),
    seat("rr", "ac", 1, "Big", rect(0, 0, 100, 100)),
    seat("rr", "ac", 2, "Tiny", rect(40, 40, 2, 2)),
    seat("bb", "ac", 1, "Bee One", null),
    seat("bb", "ac", 2, "Bee Two", null),
  ];

  const election = db.prepare(
    `INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, occurrence)
     VALUES (?, ?, ?, ?, 'e1', ?, 'declared', ?, ?, 1)`,
  );
  election.run("xx-assembly-2016", "assembly", "state", "xx", "XX 2016", "ac", 2016);
  election.run("xx-assembly-2021", "assembly", "state", "xx", "XX 2021", "ac", 2021);
  election.run("ls-2024", "general", "union", "in", "LS 2024", "pc", 2024);
  for (const state of ["yy", "zz", "ww", "rr", "bb"]) {
    election.run(`${state}-assembly-2021`, "assembly", "state", state, `${state} 2021`, "ac", 2021);
  }

  const person = db.prepare(`INSERT INTO person (id, canonical_name, created_at) VALUES (?, ?, '2026-08-12')`);
  const contestRow = db.prepare(`INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES (?, ?, ?, 'declared')`);
  const candidacy = db.prepare(
    `INSERT INTO candidacy (id, contest_id, person_id, party_version_id, status) VALUES (?, ?, ?, ?, 'elected')`,
  );
  const result = db.prepare(
    `INSERT INTO result (contest_id, candidacy_id, revision, votes, "rank", is_winner, margin, source_id, ingested_at)
     VALUES (?, ?, 0, 600, 1, 1, 100, 's1', '2026-08-12')`,
  );
  /** A contest the party (1 is AITC, 2 is BBB) won, or one the source declared no winner for. */
  const contest = (electionId: string, versionId: number, winner: 1 | 2 | null): void => {
    const id = `${electionId}:${versionId}`;
    contestRow.run(id, electionId, versionId);
    if (winner === null) return;
    person.run(`p-${id}`, `Person ${id}`);
    candidacy.run(`c-${id}`, id, `p-${id}`, winner);
    result.run(id, `c-${id}`);
  };
  contest("xx-assembly-2016", alpha, 2);
  contest("xx-assembly-2021", alpha, 1);
  contest("xx-assembly-2016", beta2, 2);
  contest("xx-assembly-2021", beta2, null);
  contest("xx-assembly-2021", delta, 1);
  contest("ls-2024", lokOne, 2);
  for (const id of others) {
    const state = (db.prepare(`SELECT jurisdiction_id AS s FROM place_version WHERE id = ?`).get(id) as { s: string }).s;
    contest(`${state}-assembly-2021`, id, 1);
  }
  return db;
}

/** The version id of the seat of that state, body and name (the first, for the tied pair). */
function versionOf(db: DatabaseSync, state: string, kind: "ac" | "pc", name: string): number {
  const row = db
    .prepare(`SELECT id FROM place_version WHERE jurisdiction_id = ? AND kind = ? AND canonical_name = ? ORDER BY id`)
    .get(state, kind, name) as { id: number } | undefined;
  assert.ok(row !== undefined, `no seat ${state} ${kind} ${name} in the fixture`);
  return row.id;
}

function located(state: string, kind: "ac" | "pc", name: string): SeatLocatorView | null {
  const db = fixture(open(":memory:"));
  try {
    return seatLocator(db, versionOf(db, state, kind, name));
  } finally {
    db.close();
  }
}

function locatedOrFail(state: string, kind: "ac" | "pc", name: string): SeatLocatorView {
  const v = located(state, kind, name);
  assert.ok(v !== null, `${state} ${kind} ${name} has no locator`);
  return v;
}

/* ───────────────────────────── the view ───────────────────────────── */

test("a seat with an outline is located among the other seats of its house, state and epoch, in one frame", () => {
  const v = locatedOrFail("xx", "ac", "Alpha");
  assert.equal(v.body, "assembly");
  assert.deepEqual(v.state, { id: "xx", name: "Xx State" });
  assert.deepEqual({ id: v.seat.id, name: v.seat.name, path: v.seat.path }, { id: "xx.ac.001", name: "Alpha", path: rect(0, 0) });
  assert.deepEqual(v.seat.bounds, { x0: 0, y0: 0, x1: 10, y1: 10 });
  // The other drawn seats of the same house, state and order, in seat order. Neither Old (a later order) nor Yonder (another
  // state) nor Lok One (the other house) is among them, and nor are Delta (no outline) or Eps (an outline in another projection).
  assert.deepEqual(v.neighbours.map((n) => [n.id, n.name]), [["xx.ac.002", "Beta"], ["xx.ac.003", "Beta"]]);
  assert.deepEqual(v.neighbours.map((n) => n.path), [rect(10, 0), rect(20, 0)]);
  // The sentence counts the house under that order (Alpha, two Betas, Delta, Eps); the picture draws the three it can.
  assert.equal(v.seats, 5);
});

test("the frame is square, holds every outline drawn, and is fitted to them rather than to the withheld one", () => {
  const v = locatedOrFail("xx", "ac", "Alpha");
  // Three drawn seats side by side: 30 across and 10 down, 4% of the larger side added all round, then the short side grown
  // to meet the long one about the same centre. Eps, 100 away in another projection, is nowhere in it.
  assert.equal(v.viewBox, "-1.2 -11.2 32.4 32.4");
  const [x, y, w, h] = v.viewBox.split(" ").map(Number) as [number, number, number, number];
  assert.equal(w, h);
  for (const path of [v.seat.path, ...v.neighbours.map((n) => n.path)]) {
    for (const [px, py] of [...path.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])] as const)) {
      assert.ok(px >= x && px <= x + w && py >= y && py <= y + h, `${path} leaves the frame`);
    }
  }
});

test("a neighbour is addressed by its name, or by its registry id where another seat of its state and body has that name", () => {
  const v = locatedOrFail("xx", "ac", "Alpha");
  assert.deepEqual(v.neighbours.map((n) => n.href), ["/constituency/xx/assembly/xx.ac.002", "/constituency/xx/assembly/xx.ac.003"]);
  // From a Beta, Alpha is a neighbour at its own name, and the other Beta is still at its id.
  const beta = locatedOrFail("xx", "ac", "Beta");
  assert.deepEqual(beta.neighbours.map((n) => [n.name, n.href]), [
    ["Alpha", "/constituency/xx/assembly/alpha"],
    ["Beta", "/constituency/xx/assembly/xx.ac.003"],
  ]);
});

test("the seat is coloured by the party that won it at its latest election, by the key the maps colour it with", () => {
  const v = locatedOrFail("xx", "ac", "Alpha");
  // 2016 was won by BBB and 2021 by AITC, whose short name is TMC: the key is the party's id, as on the maps, and the label is
  // what a reader reads.
  assert.deepEqual(v.seat.latest, { year: 2021, winner: { key: "AITC", label: "TMC" } });

  const db = fixture(open(":memory:"));
  try {
    const onMap = electionMapView(db, "xx-assembly-2021").seats.find((s) => s.placeId === "xx.ac.001");
    assert.equal(onMap?.partyKey, v.seat.latest?.winner?.key, "the locator colours the seat by another party than the state map does");
  } finally {
    db.close();
  }
});

test("a latest contest with no declared winner leaves the seat without a party, and an older winner is not borrowed", () => {
  const v = locatedOrFail("xx", "ac", "Beta");
  assert.deepEqual(v.seat.latest, { year: 2021, winner: null });
});

test("a seat with no contest on record has no election to be coloured by", () => {
  const db = fixture(open(":memory:"));
  try {
    const second = db.prepare(`SELECT id FROM place_version WHERE place_id = 'xx.ac.003'`).get() as { id: number };
    assert.equal(seatLocator(db, second.id)?.seat.latest, null);
  } finally {
    db.close();
  }
});

test("a Lok Sabha seat is located among the state's Lok Sabha seats, not its assembly seats", () => {
  const v = locatedOrFail("xx", "pc", "Lok One");
  assert.equal(v.body, "lok-sabha");
  assert.deepEqual(v.neighbours.map((n) => [n.name, n.href]), [["Lok Two", "/constituency/xx/lok-sabha/lok-two"]]);
  assert.equal(v.seats, 3);
  assert.deepEqual(v.seat.latest, { year: 2024, winner: { key: "BBB", label: "BBB" } });
  // The frame is the Lok Sabha seats' and not the assembly seats'.
  assert.equal(v.viewBox, "-2.4 -17.4 64.8 64.8");
});

test("a seat with no outline has no locator, however many of its neighbours have one", () => {
  assert.equal(located("xx", "ac", "Delta"), null);
  assert.equal(located("xx", "pc", "Lok Three"), null);
  // An outline in another projection is withheld, so it is no outline for this purpose either.
  assert.equal(located("xx", "ac", "Eps"), null);
});

test("a state with no outline at all has no locator", () => {
  assert.equal(located("bb", "ac", "Bee One"), null);
});

test("a seat with nothing to be among has no locator: a lone drawn seat, or one whose neighbours are all undrawn", () => {
  assert.equal(located("zz", "ac", "Zed"), null);
  assert.equal(located("ww", "ac", "Wye"), null);
});

test("an id that is not a seat has no locator", () => {
  const db = fixture(open(":memory:"));
  try {
    assert.equal(seatLocator(db, 99999), null);
  } finally {
    db.close();
  }
});

/* ───────────────────────────── the words ───────────────────────────── */

test("the frame is grown to a square about its centre", () => {
  assert.equal(squareFrame("0.0 0.0 10.0 20.0"), "-5.0 0.0 20.0 20.0");
  assert.equal(squareFrame("0.0 0.0 20.0 10.0"), "0.0 -5.0 20.0 20.0");
  assert.equal(squareFrame("3.0 4.0 7.0 7.0"), "3.0 4.0 7.0 7.0");
});

test("the description, caption and tooltip say what the picture draws and what it cannot", () => {
  const v = locatedOrFail("xx", "ac", "Alpha");
  assert.equal(locatorDescription(v), "Alpha, among the 5 assembly seats of Xx State");
  assert.equal(locatorCaption(v), "3 of 5 assembly seats drawn — no boundary on record for the other 2.");
  assert.equal(locatorSeatTitle(v), "Alpha — won by TMC in 2021");
  assert.equal(locatorSeatTitle(locatedOrFail("xx", "ac", "Beta")), "Beta — no winner declared in 2021");

  const lok = locatedOrFail("xx", "pc", "Lok One");
  assert.equal(locatorDescription(lok), "Lok One, among the 3 Lok Sabha seats of Xx State");
  assert.equal(locatorCaption(lok), "2 of 3 Lok Sabha seats drawn — no boundary on record for the other 1.");

  // A house drawn whole says so, and the count is in Indian grouping like the rest of the page.
  const whole: SeatLocatorView = { ...v, seats: 1234, neighbours: new Array(1233).fill(v.neighbours[0]) };
  assert.equal(locatorCaption(whole), "All 1,234 assembly seats of Xx State drawn.");
  assert.equal(locatorSeatTitle({ ...v, seat: { ...v.seat, latest: null } }), "Alpha");
});

/* ───────────────────────────── the page ───────────────────────────── */

const PATH = join(mkdtempSync(join(tmpdir(), "mandate-seat-locator-")), "registry.db");
fixture(open(PATH)).close();

function render(segments: string, route = "/constituency"): string {
  try {
    return execFileSync(
      process.execPath,
      ["--import", "./ops/probe/render/register.mjs", "./ops/probe/render/render.mjs", route, "", segments],
      { cwd: ROOT, env: { ...process.env, MANDATE_DB_PATH: PATH }, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    throw new Error(`render ${route} ${segments} failed:\n${err.stderr ?? err.message}`);
  }
}

function at(html: string, marker: string, after = 0): number {
  const i = html.indexOf(marker, after);
  assert.notEqual(i, -1, `missing in the page: ${marker}`);
  return i;
}

test("the seat page draws the locator beside its header, with the description a screen reader is given", () => {
  const html = render("xx/assembly/alpha");
  const head = at(html, 'class="iei-head iei-head-seat"');
  const figure = at(html, '<figure class="iei-loc">', head);
  // The header's text first, then the figure, then the anchor its skip link lands on, then the lens tabs.
  const sub = at(html, 'class="iei-sub"', head);
  const target = at(html, '<div id="after-locator">', figure);
  assert.ok(head < sub && sub < figure && figure < target && target < at(html, 'class="iei-tabs"', target));

  const svg = html.slice(at(html, "<svg", figure), at(html, "</svg>", figure));
  assert.match(svg, /role="group"[^>]*aria-labelledby="iei-loc-t"[^>]*aria-describedby="iei-loc-d"/);
  assert.match(svg, /<title id="iei-loc-t">Where Alpha is<\/title>/);
  assert.match(svg, /<desc id="iei-loc-d">Alpha, among the 5 assembly seats of Xx State<\/desc>/);
  assert.match(html.slice(figure), /<figcaption>.*3 of 5 assembly seats drawn — no boundary on record for the other 2\.<\/figcaption>/);
  // The skip link is the figure's first focusable thing, and it goes where the anchor is.
  assert.ok(at(html, 'href="#after-locator"', figure) < at(html, "<svg", figure));
});

test("each neighbour is a link to its own page, named by the seat's name, and the seat is neither a link nor drawn twice", () => {
  const html = render("xx/assembly/alpha");
  const svg = html.slice(at(html, "<svg", at(html, "iei-loc")), at(html, "</svg>"));
  const links = [...svg.matchAll(/<a href="([^"]*)"[^>]*><title>([^<]*)<\/title><path d="([^"]*)"/g)].map((m) => [m[1], m[2], m[3]]);
  assert.deepEqual(links, [
    ["/constituency/xx/assembly/xx.ac.002", "Beta", rect(10, 0)],
    ["/constituency/xx/assembly/xx.ac.003", "Beta", rect(20, 0)],
  ]);
  const seat = /<path d="([^"]*)" class="iei-loc-seat" style="fill:([^"]*)"><title>([^<]*)<\/title>/.exec(svg);
  assert.ok(seat !== null, "the seat is not drawn");
  assert.equal(seat[1], rect(0, 0));
  assert.equal(seat[3], "Alpha — won by TMC in 2021");
  // The seat's ink is the ink of the party's key (AITC), which is a curated colour. Its short name TMC is none, and would have
  // given the derived colour the history table's swatch has.
  assert.equal(seat[2], fillFor("AITC"));
  assert.notEqual(fillFor("AITC"), fillFor("TMC"));
  assert.equal((svg.match(/class="iei-loc-seat"/g) ?? []).length, 1);
  // No neighbour is prefetched: a seat page viewed would otherwise ask for every other seat of its state.
  assert.doesNotMatch(svg, /prefetch/);
});

test("the name is drawn once beside the seat, and a seat too small to find is ringed while one that is not, is not", () => {
  const html = render("xx/assembly/alpha");
  const label = html.slice(at(html, 'class="iei-loc-label"'), at(html, "</g>", at(html, 'class="iei-loc-label"')));
  assert.match(label, /<text [^>]*>Alpha<\/text>/);
  assert.equal((html.match(/class="iei-loc-label"/g) ?? []).length, 1);

  // Alpha is a third of its frame wide, so about 99 units across in a box of 320: nothing to ring.
  assert.doesNotMatch(html, /iei-loc-ring/);
  // Tiny is 2 units in a 108-unit frame, about 6 pixels across in a box of 320, so it is ringed and its name sits clear of the ring.
  const tiny = render("rr/assembly/tiny");
  const ring = /<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)" class="iei-loc-ring"/.exec(tiny);
  assert.ok(ring !== null, "a seat 6 units across is not ringed");
  assert.equal(Number(ring[3]), 14);
  const text = /<text x="([\d.]+)" y="([\d.]+)"[^>]*text-anchor="(\w+)"[^>]*>Tiny<\/text>/.exec(tiny);
  assert.ok(text !== null, "the small seat's name is not drawn");
  assert.ok(Math.hypot(Number(text[1]) - Number(ring[1]), Number(text[2]) - Number(ring[2])) > 14, "the name is over the ring");
  assert.doesNotMatch(render("rr/assembly/big"), /iei-loc-ring/);
});

test("a tied seat is reached by its registry id and has its locator", () => {
  const html = render("xx/assembly/xx.ac.003");
  assert.match(html, /<h1 class="iei-answer">Beta<\/h1>/);
  assert.match(html, /<desc id="iei-loc-d">Beta, among the 5 assembly seats of Xx State<\/desc>/);
  assert.match(html, /<a href="\/constituency\/xx\/assembly\/xx\.ac\.002">/);
});

test("a Lok Sabha seat page says it is among the Lok Sabha seats", () => {
  const html = render("xx/lok-sabha/lok-one");
  assert.match(html, /<desc id="iei-loc-d">Lok One, among the 3 Lok Sabha seats of Xx State<\/desc>/);
  assert.doesNotMatch(html, /xx\/assembly\//, "an assembly seat is linked from the Lok Sabha locator");
});

test("a seat with no outline renders its header as it always was, with nothing in the locator's place", () => {
  for (const segments of ["xx/assembly/delta", "bb/assembly/bee-one", "zz/assembly/zed", "xx/assembly/eps"]) {
    const html = render(segments);
    assert.match(html, /<div class="iei-head"><p class="iei-eyebrow">/, `${segments}: the header carries the locator's class`);
    assert.doesNotMatch(html, /iei-loc|after-locator|iei-head-seat/, `${segments}: something of the locator is in the page`);
  }
});

test("the locator is on the Brief and not on the Analysis lens", () => {
  assert.doesNotMatch(render("xx/assembly/alpha", "/constituency/analysis"), /iei-loc/);
});
