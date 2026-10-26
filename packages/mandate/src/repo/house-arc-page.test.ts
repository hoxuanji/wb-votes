// The house as a parliament arc, on the pages that carry it.
//
// The state page and the election page open with a map. Under it, the house is drawn once more as the picture a legislature is read
// by: one dot per seat, in the party that won it, with the leader's distance from a majority at its centre. These tests hold what
// the picture claims, on a registry built here from literal data and pages rendered in a child process (map-composition.test.ts does
// the same):
//
//   hh-assembly-2021   a full house of 8 seats: AITC (short name TMC) 4, BBB 2, CCC 1, and one seat with no declared winner
//   hh-bypoll-ae-2022  a by-election for two of them, which decides no house
//
// Where the pixels land is measured against saved renders (ops/probe/shot/measure.sh), not here.

import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { open } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";
import { fillFor, NOT_HELD } from "../viz/party-ink.ts";

const ROOT = new URL("../../../../", import.meta.url).pathname;

function fixture(db: DatabaseSync): DatabaseSync {
  migrate(db, "2026-08-12T00:00:00.000Z");
  db.exec(`
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('e1','Delimitation','2008-02-19');
    INSERT INTO place (id, kind, canonical_name) VALUES ('in','nation','India');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('hh','state','Hh State','in');
    INSERT INTO source (id, kind, publisher, title, retrieved_at, doc_hash) VALUES ('s1','static_module','P','Results','2026-08-12','sha256:0');
    INSERT INTO party (id, name, short_name) VALUES ('AITC','All India Trinamool Congress','TMC');
    INSERT INTO party (id, name, short_name) VALUES ('BBB','B Party','BBB');
    INSERT INTO party (id, name, short_name) VALUES ('CCC','C Party','CCC');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (1,'AITC','1998-01-01','All India Trinamool Congress');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (2,'BBB','1990-01-01','B Party');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (3,'CCC','1990-01-01','C Party');
  `);
  const place = db.prepare(`INSERT INTO place (id, kind, canonical_name, parent_id) VALUES (?, 'ac', ?, 'hh')`);
  const version = db.prepare(
    `INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, reservation)
     VALUES (?, ?, 'hh', 'ac', 'e1', ?, ?, 'general')`,
  );
  for (let n = 1; n <= 8; n++) {
    place.run(`hh.ac.00${n}`, `Seat ${n}`);
    version.run(n, `hh.ac.00${n}`, n, `Seat ${n}`);
  }
  const election = db.prepare(
    `INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, occurrence)
     VALUES (?, ?, 'state', 'hh', 'e1', ?, 'declared', 'ac', ?, 1)`,
  );
  election.run("hh-assembly-2021", "assembly", "HH 2021", 2021);
  election.run("hh-bypoll-ae-2022", "bypoll", "HH by-election 2022", 2022);

  const person = db.prepare(`INSERT INTO person (id, canonical_name, created_at) VALUES (?, ?, '2026-08-12')`);
  const contestRow = db.prepare(`INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES (?, ?, ?, 'declared')`);
  const candidacy = db.prepare(
    `INSERT INTO candidacy (id, contest_id, person_id, party_version_id, status) VALUES (?, ?, ?, ?, ?)`,
  );
  const result = db.prepare(
    `INSERT INTO result (contest_id, candidacy_id, revision, votes, "rank", is_winner, margin, source_id, ingested_at)
     VALUES (?, ?, 0, ?, ?, ?, ?, 's1', '2026-08-12')`,
  );
  /** A contest won by party version `winner` over `other`; with `declared` false nobody is flagged the winner. */
  const contest = (electionId: string, seat: number, winner: 1 | 2 | 3, other: 1 | 2 | 3, declared = true): void => {
    const id = `${electionId}:${seat}`;
    contestRow.run(id, electionId, seat);
    for (const [who, pv, rank] of [["w", winner, 1], ["r", other, 2]] as const) {
      person.run(`p-${id}-${who}`, `Person ${id} ${who}`);
      candidacy.run(`${id}-${who}`, id, `p-${id}-${who}`, pv, rank === 1 && declared ? "elected" : "defeated");
      result.run(id, `${id}-${who}`, rank === 1 ? 600 : 400, rank, rank === 1 && declared ? 1 : 0, rank === 1 && declared ? 200 : null);
    }
  };
  [1, 1, 1, 1, 2, 2, 3].forEach((pv, i) => contest("hh-assembly-2021", i + 1, pv as 1 | 2 | 3, pv === 2 ? 1 : 2));
  contest("hh-assembly-2021", 8, 1, 2, false);
  contest("hh-bypoll-ae-2022", 1, 2, 1);
  contest("hh-bypoll-ae-2022", 2, 2, 1);
  return db;
}

const PATH = join(mkdtempSync(join(tmpdir(), "mandate-house-arc-")), "registry.db");
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

/** The markup of the panel with this id, up to the next section. */
function panel(html: string, id: string): string {
  const open = html.indexOf(`id="${id}"`);
  assert.notEqual(open, -1, `no panel ${id} in the page`);
  const close = html.indexOf('<section class="iei-sec"', open + 1);
  return html.slice(open, close === -1 ? undefined : close);
}

type Group = { party: string; fill: string; dots: number; href: string | null; dim: boolean };

/** The party groups of the arc, in the order they are drawn. */
function groups(house: string): Group[] {
  const svg = house.slice(house.indexOf("<svg"), house.indexOf("</svg>"));
  return [...svg.matchAll(/(<a [^>]*>)?(?:<title>[^<]*<\/title>)?<g class="iei-arc-p"([^>]*)>([\s\S]*?)<\/g>/g)].map((m) => {
    const attrs = m[2] as string;
    return {
      party: /data-party="([^"]+)"/.exec(attrs)?.[1] ?? "",
      fill: /fill="([^"]+)"/.exec(attrs)?.[1] ?? "",
      dots: (m[3]!.match(/<circle/g) ?? []).length,
      href: (m[1] ?? "").replace(/&amp;/g, "&").match(/href="([^"]*)"/)?.[1] ?? null,
      dim: /data-dim="true"/.test(attrs),
    };
  });
}

const ELECTION = "hh-assembly-2021";

test("the arc has one dot per seat of the house", () => {
  const house = panel(render("/election", "", ELECTION), "house");
  assert.equal((house.match(/<circle/g) ?? []).length, 8);
});

test("each party's group holds exactly its seats, the largest first", () => {
  const g = groups(panel(render("/election", "", ELECTION), "house"));
  assert.deepEqual(g.map((x) => [x.party, x.dots]), [["AITC", 4], ["BBB", 2], ["CCC", 1]]);
});

test("a party's dots are inked by its key, so TMC is the curated green of AITC and not a second, derived one", () => {
  const g = groups(panel(render("/election", "", ELECTION), "house"));
  assert.equal(g[0]?.fill, fillFor("AITC"));
  assert.notEqual(fillFor("AITC"), fillFor("TMC"));
  assert.equal(g[1]?.fill, fillFor("BBB"));
});

test("each party's wedge links to the page's own isolation of that party, and the key says the same", () => {
  const house = panel(render("/election", "", ELECTION), "house");
  const g = groups(house);
  for (const x of g) {
    assert.ok(x.href !== null && x.href.startsWith(`/election/${ELECTION}?`) && x.href.includes(`party=${x.party}`), `${x.party}: ${x.href}`);
    const links = house.replace(/&amp;/g, "&").split(`<a href="${x.href}"`).length - 1;
    assert.equal(links, 2, `${x.href} is linked from the wedge and from the key, ${links} times in all`);
  }
});

test("a seat with no declared winner is a dot in the no-data ink, in no party and not a link", () => {
  const house = panel(render("/election", "", ELECTION), "house");
  const none = /<g class="iei-arc-none"([^>]*)>([\s\S]*?)<\/g>/.exec(house);
  assert.ok(none !== null, "no group for the undeclared seat");
  assert.match(none[1] as string, new RegExp(`fill="${NOT_HELD}"`));
  assert.equal((none[2]!.match(/<circle/g) ?? []).length, 1);
  assert.match(none[2] as string, /<title>1 seat with no declared winner<\/title>/);
  assert.doesNotMatch(house, /<a [^>]*>(?:<title>[^<]*<\/title>)?<g class="iei-arc-none"/, "the undeclared seats are inside a link");
  assert.equal(groups(house).reduce((n, x) => n + x.dots, 0), 7, "the party groups hold the seven declared seats");
});

test("the centre prints the leader's seats, the house, and how far from a majority it is", () => {
  const t = text(panel(render("/election", "", ELECTION), "house"));
  assert.match(t, /TMC\s*4\s*of 8/);
  assert.match(t, /majority 5/);
  assert.match(t, /short by 1/);
});

test("the caption says the order is by seats and does not mean left or right", () => {
  const t = text(panel(render("/election", "", ELECTION), "house"));
  assert.match(t, /Ordered by seats, largest first/);
  assert.match(t, /does not mean left or right/);
});

test("the table twin lists every party and the undeclared seat, and its seats add up to the house", () => {
  const house = panel(render("/election", "", ELECTION), "house");
  const table = house.slice(house.indexOf("<details"), house.indexOf("</details>"));
  assert.match(table, /<summary[^>]*>[^<]*Seats by party/);
  const rows = [...table.matchAll(/<tr><th scope="row">([\s\S]*?)<\/th><td[^>]*>(\d+)<\/td>/g)].map((m) => [text(m[1] as string), Number(m[2])] as const);
  assert.deepEqual(rows.map((r) => r[0]), ["TMC", "BBB", "CCC", "No declared winner"]);
  assert.equal(rows.reduce((n, r) => n + r[1], 0), 8);
});

test("with a party isolated, every other party is dimmed and its own wedge releases it", () => {
  const g = groups(panel(render("/election", "party=BBB", ELECTION), "house"));
  assert.deepEqual(g.map((x) => [x.party, x.dim]), [["AITC", true], ["BBB", false], ["CCC", true]]);
  const bbb = g.find((x) => x.party === "BBB");
  assert.ok(bbb?.href !== null && !bbb?.href?.includes("party="), `the isolated party links to ${bbb?.href}`);
});

test("on the runner-up tab a party means the runner-up, so nothing is dimmed and a wedge switches to the winners", () => {
  const g = groups(panel(render("/election", "mode=runnerup&party=BBB", ELECTION), "house"));
  assert.deepEqual(g.map((x) => x.dim), [false, false, false]);
  for (const x of g) assert.ok(x.href !== null && x.href.includes(`party=${x.party}`) && !x.href.includes("mode=runnerup"), `${x.party}: ${x.href}`);
});

test("a by-election decides no house, so it has no arc and no majority", () => {
  const html = render("/election", "", "hh-bypoll-ae-2022");
  assert.doesNotMatch(html, /id="house"/);
  assert.doesNotMatch(html, /iei-arc/);
});

test("the state page carries the same arc over the same house", () => {
  const html = render("/state", "", "hh");
  const g = groups(panel(html, "house"));
  assert.deepEqual(g.map((x) => [x.party, x.dots]), [["AITC", 4], ["BBB", 2], ["CCC", 1]]);
  assert.ok(g.every((x) => x.href !== null && x.href.startsWith("/state/hh?")), "the wedges link into the state page");
});

test("the arc comes after the map and before the competitiveness section", () => {
  const html = render("/election", "", ELECTION);
  const house = html.indexOf('id="house"');
  assert.ok(house > html.indexOf("iei-atlas"), "the arc comes after the atlas");
  const next = html.indexOf('id="margins"');
  if (next !== -1) assert.ok(house < next, "the arc comes before the competitiveness section");
});
