// The Analysis page of a seat, rendered in-process over a registry built here from literal data through the real migrations.
//
//   xx  one state, two assembly seats, and three elections
//     Alpha
//         2016  counted: AIFB won over INC, with an independent, BJP and BSP behind
//         2021  counted: TMC (party id AITC) won over BJP, with AIFB, INC and BSP behind
//         2026  a declaration: TMC won by 777, no candidate's votes, and a turnout row of 1,900 voters on 2,400 electors
//     Beta  the same turnout rows as Alpha, TMC at every election, and a declared margin of 8 votes in 2026
//
// 2026 is the shape of West Bengal 2026: the election published a turnout and no counts, so its turnout has nothing to be reconciled against
// (turnout-trust.ts) and the Brief of the seat withholds it. The Analysis of the same seat has to say the same.

import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { open } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";
import { CATEGORICAL, OTHERS } from "../viz/palette.ts";
import { fillFor } from "../viz/party-ink.ts";

const ROOT = new URL("../../../../", import.meta.url).pathname;

function fixture(db: DatabaseSync): DatabaseSync {
  migrate(db, "2026-08-12T00:00:00.000Z");
  db.exec(`
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('e1','Delimitation','2008-02-19');
    INSERT INTO place (id, kind, canonical_name) VALUES ('in','nation','India');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('xx','state','Xx State','in');
    INSERT INTO source (id, kind, publisher, title, retrieved_at, doc_hash) VALUES ('s1','static_module','P','Results','2026-08-12','sha256:0');
    INSERT INTO party (id, name, short_name) VALUES ('AITC','All India Trinamool Congress','TMC');
    INSERT INTO party (id, name, short_name) VALUES ('BJP','Bharatiya Janata Party','BJP');
    INSERT INTO party (id, name, short_name) VALUES ('AIFB','All India Forward Bloc','AIFB');
    INSERT INTO party (id, name, short_name) VALUES ('INC','Indian National Congress','INC');
    INSERT INTO party (id, name, short_name) VALUES ('BSP','Bahujan Samaj Party','BSP');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (1,'AITC','1998-01-01','All India Trinamool Congress');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (2,'BJP','1980-01-01','Bharatiya Janata Party');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (3,'AIFB','1940-01-01','All India Forward Bloc');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (4,'INC','1885-01-01','Indian National Congress');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (5,'BSP','1984-01-01','Bahujan Samaj Party');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('xx.ac.001','ac','Alpha','xx');
    INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, reservation)
      VALUES (1,'xx.ac.001','xx','ac','e1',1,'Alpha','general');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('xx.ac.002','ac','Beta','xx');
    INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, reservation)
      VALUES (2,'xx.ac.002','xx','ac','e1',2,'Beta','general');
  `);
  const election = db.prepare(
    `INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, occurrence)
     VALUES (?, 'assembly', 'state', 'xx', 'e1', ?, 'declared', 'ac', ?, 1)`,
  );
  for (const year of [2016, 2021, 2026]) election.run(`xx-assembly-${year}`, `xx-assembly-${year}`, year);

  const person = db.prepare(`INSERT INTO person (id, canonical_name, created_at) VALUES (?, ?, '2026-08-12')`);
  const contestRow = db.prepare(`INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES (?, ?, ?, 'declared')`);
  const candidacy = db.prepare(
    `INSERT INTO candidacy (id, contest_id, person_id, party_version_id, party_raw, status) VALUES (?, ?, ?, ?, ?, 'contesting')`,
  );
  const result = db.prepare(
    `INSERT INTO result (contest_id, candidacy_id, revision, votes, "rank", is_winner, margin, source_id, ingested_at)
     VALUES (?, ?, 0, ?, ?, ?, ?, 's1', '2026-08-12')`,
  );
  const turnout = db.prepare(
    `INSERT INTO turnout (contest_id, scope, electors, voters, source_id) VALUES (?, 'contest', ?, ?, 's1')`,
  );
  type Row = { who: string; version: number | null; raw?: string; votes: number | null };
  const contest = (year: number, electors: number, voters: number, margin: number, rows: Row[], seat = 1): void => {
    const id = `xx-assembly-${year}:${seat}`;
    contestRow.run(id, `xx-assembly-${year}`, seat);
    turnout.run(id, electors, voters);
    rows.forEach((r, i) => {
      person.run(`p-${id}-${i}`, `${r.who} ${year}`);
      candidacy.run(`c-${id}-${i}`, id, `p-${id}-${i}`, r.version, r.raw ?? null);
      result.run(id, `c-${id}-${i}`, r.votes, i + 1, i === 0 ? 1 : 0, i === 0 ? margin : null);
    });
  };
  contest(2016, 2000, 1000, 230, [
    { who: "Abe", version: 3, votes: 480 },
    { who: "Ina", version: 4, votes: 250 },
    { who: "Ivy", version: null, raw: "IND", votes: 100 },
    { who: "Bea", version: 2, votes: 50 },
    { who: "Bo", version: 5, votes: 30 },
  ]);
  contest(2021, 2200, 1000, 100, [
    { who: "Tia", version: 1, votes: 450 },
    { who: "Bea", version: 2, votes: 350 },
    { who: "Abe", version: 3, votes: 100 },
    { who: "Ina", version: 4, votes: 40 },
    { who: "Bo", version: 5, votes: 20 },
  ]);
  contest(2026, 2400, 1900, 777, [{ who: "Tom", version: 1, votes: null }]);
  // Beta's turnout rows are Alpha's, so the state's turnout is what it was with one seat.
  contest(2016, 2000, 1000, 200, [{ who: "Tia", version: 1, votes: 600 }, { who: "Bea", version: 2, votes: 400 }], 2);
  contest(2021, 2200, 1000, 150, [{ who: "Tia", version: 1, votes: 575 }, { who: "Bea", version: 2, votes: 425 }], 2);
  contest(2026, 2400, 1900, 8, [{ who: "Tam", version: 1, votes: null }], 2);
  return db;
}

const PATH = join(mkdtempSync(join(tmpdir(), "mandate-place-analysis-page-")), "registry.db");
fixture(open(PATH)).close();

function render(query = "", route = "/constituency/analysis", seat = "alpha"): string {
  try {
    return execFileSync(
      process.execPath,
      ["--import", "./ops/probe/render/register.mjs", "./ops/probe/render/render.mjs", route, query, `xx/assembly/${seat}`],
      { cwd: ROOT, env: { ...process.env, MANDATE_DB_PATH: PATH }, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    throw new Error(`render ${route} ${query} failed:\n${err.stderr ?? err.message}`);
  }
}

const text = (html: string): string => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").replace(/&#x27;/g, "'");

/** One card: from its question to the next card's, as markup. */
function card(html: string, question: string): string {
  const start = html.indexOf(`>${question}<`);
  assert.notEqual(start, -1, `no card: ${question}`);
  const next = html.indexOf('<section', start);
  return html.slice(start, next === -1 ? undefined : next);
}

/** The rows of the first table of a fragment, each as its cells' text. */
function rows(fragment: string): string[][] {
  return [...fragment.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) =>
    [...(m[1] ?? "").matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => text(c[1] ?? "").trim()),
  );
}

const html = render();

test("the Analysis prints no figure built on 2026's unverified turnout: not the seat's, and not as a share of it", () => {
  // 1,900 voters on 2,400 electors is 79.2%; the margin of 777 over 1,900 voters is 40.9%. Both are what the Brief withholds.
  assert.doesNotMatch(html, /79\.2%|40\.9%/);
  const brief = render("", "/constituency");
  assert.match(text(brief), /verification pending/);
});

test("the Brief keeps the declared margin in votes and withholds its share: in the tile, in the headline and in the flags", () => {
  // Alpha: 777 votes over 1,900 voters is 40.9%, and Beta's 8 votes over them is 0.4%, a recount-scale margin that exists only
  // over a turnout nobody can corroborate.
  const alpha = text(render("", "/constituency"));
  assert.match(alpha, /Winning margin 2026 777 votes \(declared\) share of votes polled\s.\sverification pending · TMC/);
  assert.doesNotMatch(alpha, /40\.9%|of votes cast/);
  const beta = render("", "/constituency", "beta");
  assert.match(text(beta), /Winning margin 2026 8 votes \(declared\) share of votes polled\s.\sverification pending · TMC/);
  assert.match(text(beta), /TMC has held Beta in all 3 elections since 2016, most recently by 8 votes\./);
  assert.doesNotMatch(beta, /0\.4%|recount-scale|of votes cast/);
});

test("the turnout card says the election is withheld, compares for the newest verified one, and tables the word", () => {
  const c = card(html, "Did Alpha turn out more than Xx State?");
  assert.match(text(c), /2026: turnout is withheld \(verification pending\), because that election published no candidate vote counts/);
  assert.match(text(c), /Verified most recently, 2021: 45\.5% here against 45\.5% in/);
  assert.deepEqual(rows(c).at(-1), ["2026", "withheld", "withheld", "withheld"]);
  // the line stops at 2021: the axis is the three verified readings, not stretched to a withheld one
  assert.deepEqual(rows(c).slice(1, 3).map((r) => r[0]), ["2016", "2021"]);
});

test("the margin card keeps the declared margin in votes, withholds its share, and the table says withheld", () => {
  const c = card(html, "Is the seat getting safer or closer?");
  assert.match(text(c), /2026: 777 votes, to TMC; its share of votes cast is withheld \(verification pending\)\./);
  assert.deepEqual(rows(c).at(-1), ["2026", "withheld"]);
  assert.deepEqual(rows(c).slice(1, 3), [["2016", "23.0%"], ["2021", "10.0%"]]);
});

test("the share card lists every candidate on record, so a folded runner-up and a folded 2.5% are numbers, not dashes", () => {
  const c = card(html, "Who took what share, election by election?");
  const table = rows(c);
  assert.deepEqual(table[0], ["Election", "AIFB", "TMC", "BJP", "INC", "IND", "BSP"]);
  assert.deepEqual(table.find((r) => r[0] === "2016"), ["2016", "48.0%", "not reported", "5.0%", "25.0%", "10.0%", "3.0%"]);
  assert.deepEqual(table.find((r) => r[0] === "2021"), ["2021", "10.0%", "45.0%", "35.0%", "4.0%", "not reported", "2.0%"]);
  assert.deepEqual(table.find((r) => r[0] === "2026"), ["2026", ...Array(6).fill("no counts")]);
  // the chart folds the three smallest peaks into one grey line and says how many series it stands for, once
  assert.equal([...c.matchAll(/>Others \(3\)<\/tspan>/g)].length, 3, "one end label in each of the three frames");
  assert.doesNotMatch(c, /Rest of the field/);
});

test("a party is the colour of its identity: the line of TMC is the ink the maps give party id AITC", () => {
  const c = card(html, "Who took what share, election by election?");
  const wide = /<svg [^>]*data-frame="wide"[\s\S]*?<\/svg>/.exec(c)?.[0] ?? "";
  // A marker is drawn for every point, a line only for a party with two of them, so the markers are the claim.
  for (const id of ["AITC", "BJP", "AIFB"]) assert.ok(wide.includes(`fill="${fillFor(id)}"`), `${id}'s ink is not on its line`);
  assert.ok(wide.includes('class="iei-line-ink"') && wide.includes(`stroke="${fillFor("AIFB")}"`));
  const bars = card(render("to=2021"), "Who got the votes in 2021?");
  const wideBars = /<svg [^>]*data-frame="wide"[\s\S]*?<\/svg>/.exec(bars)?.[0] ?? "";
  for (const id of ["AITC", "BJP", "AIFB"]) assert.ok(wideBars.includes(`fill="${fillFor(id)}"`), `${id}'s ink is not on its bar`);
});

test("a card with nothing to draw says its sentence once, and its table says why each cell is empty", () => {
  const c = card(html, "Who got the votes in 2026?");
  assert.equal([...text(c).matchAll(/No candidate's vote count is on record for 2026; the margin is\./g)].length, 1);
  assert.deepEqual(rows(c).at(-1), ["TMC · Tom 2026", "no counts"]);
  const swing = card(html, "What moved between 2021 and 2026?");
  assert.deepEqual(rows(swing), [["Party", "2021", "2026", "Change"], ["TMC", "45.0%", "no counts", "no swing"]]);
});

test("the swing note is said once, and the caveats are one row a measure in a reader's words", () => {
  assert.equal([...html.matchAll(/A party absent from the earlier election has no swing/g)].length, 1);
  const panel = html.slice(html.indexOf("What these measures do not tell you"));
  const labels = [...panel.matchAll(/<span class="iei-row-t">([^<]*)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(labels, ["Turnout", "Vote share", "Margin", "Swing", "Effective number of parties", "Sources"]);
  assert.match(text(panel), /Turnout for 2026 is withheld/);
  assert.doesNotMatch(panel, /22,414|2,932|72\.9|data\/seed|`|BIASED DOWNWARD|confidence=/);
});

test("a party filter says what it narrows and which swing cards it left out, and the votes card still says who won", () => {
  const f = render("party=INC");
  const notes = text(f.slice(f.indexOf("Window"), f.indexOf("Did Alpha")));
  assert.match(notes, /INC narrows the share, votes and swing cards\. Turnout, margin and effective parties are for every party\./);
  assert.match(notes, /No swing card for 2021–2026: INC has no result in 2026\./);
  const votes = card(f, "Who got the votes in 2026?");
  assert.match(text(votes), /TMC · Tom 2026/, "the winner is named although INC is the party followed");
  // Everyone else is the neutral, not the first of the capped hues, and the party followed keeps its own ink.
  const wide = /<svg [^>]*data-frame="wide"[\s\S]*?<\/svg>/.exec(card(f, "Who took what share, election by election?"))?.[0] ?? "";
  assert.ok(wide.includes(`stroke="${OTHERS}"`) && wide.includes(`fill="${fillFor("INC")}"`));
  for (const hue of CATEGORICAL) assert.ok(!wide.includes(hue), `${hue} was given to the aggregate`);
});

test("a party the seat never fielded in the window says so, and says what the cards then show", () => {
  const f = render("party=BSP&from=2026");
  const notes = text(f.slice(f.indexOf("Window"), f.indexOf("Did Alpha")));
  assert.match(notes, /BSP has no result at Alpha in 2026, so the cards below show everyone else together and no swing is drawn\./);
  assert.doesNotMatch(f, /What moved between/, "a one-election window has no swing card");
});
