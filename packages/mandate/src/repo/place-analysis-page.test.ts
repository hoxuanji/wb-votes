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

/** The table whose caption starts with this text, as markup. */
function tableOf(page: string, caption: string): string {
  const at = page.indexOf(caption);
  assert.notEqual(at, -1, `no table captioned: ${caption}`);
  return page.slice(page.lastIndexOf("<table", at), page.indexOf("</table>", at));
}

const html = render();

test("the Analysis prints no figure built on 2026's unverified turnout: not the seat's, and not as a share of it", () => {
  // 1,900 voters on 2,400 electors is 79.2%; the margin of 777 over 1,900 voters is 40.9%. Both are what the Brief withholds.
  assert.doesNotMatch(html, /79\.2%|40\.9%/);
  const brief = render("", "/constituency");
  assert.match(text(brief), /verification pending/);
});

test("the Brief keeps the declared margin in votes and withholds its share: in the hero, in the headline and in the flags", () => {
  // Alpha: 777 votes over 1,900 voters is 40.9%, and Beta's 8 votes over them is 0.4%, a recount-scale margin that exists only
  // over a turnout nobody can corroborate.
  const alpha = text(render("", "/constituency"));
  assert.match(alpha, /Winning margin · 2026 · declared/);
  assert.match(alpha, /777 votes/);
  assert.doesNotMatch(alpha, /40\.9%|of votes cast/);
  const beta = render("", "/constituency", "beta");
  assert.match(text(beta), /Winning margin · 2026 · declared/);
  assert.match(text(beta), /TMC has held Beta in all 3 elections since 2016, most recently by 8 votes \(declared\)\./);
  assert.doesNotMatch(beta, /0\.4%|recount-scale|of votes cast/);
});

test("the turnout section says the election is withheld, draws the verified ones, and tables the word", () => {
  const section = html.slice(html.indexOf('id="turnout"'), html.indexOf('id="notes"') === -1 ? html.indexOf('id="leaves"') : html.indexOf('id="notes"'));
  assert.match(text(section), /verification pending/);
  assert.match(text(section), /The axis runs from \d+% to \d+%, not from zero/);
  const t = rows(tableOf(html, "Turnout at each election, here"));
  assert.deepEqual(t.at(-1), ["2026", "verification pending"]);
  assert.deepEqual(t.slice(1, 3).map((r) => r[0]), ["2016", "2021"]);
  assert.deepEqual(t.find((r) => r[0] === "2021")?.slice(0, 2), ["2021", "45.5%"]);
  assert.doesNotMatch(text(section), /79\.2|2,400/, "the 2026 turnout or its electors is drawn");
});

test("the record keeps the declared margin in votes, says it is declared, and withholds any share of it", () => {
  const t = rows(tableOf(html, "The record: each election"));
  assert.deepEqual(t.at(0), ["Election", "Won by", "Margin, votes", "Basis", "Rank, closest first"]);
  const r2026 = t.find((r) => r[0] === "2026");
  assert.match((r2026 ?? []).join(" | "), /TMC \| 777 declared \| declared \| \d+(st|nd|rd|th) of 2/);
  assert.match((t.find((r) => r[0] === "2016") ?? []).join(" | "), /AIFB \| 230 counted \| counted/);
  assert.match((t.find((r) => r[0] === "2021") ?? []).join(" | "), /TMC \| 100 counted \| counted/);
  assert.doesNotMatch(text(html), /40\.9%|of votes cast/);
});

test("the share table lists every candidate on record, so a runner-up is a number and an absence is 'not listed', never a dash or a zero", () => {
  const t = rows(tableOf(html, "Share of the votes polled, by candidate party"));
  assert.deepEqual(t[0], ["Party", "2016", "2021"], "2026 is not a counted election and has no column");
  const by = (p: string): string[] => (t.find((r) => r[0] === p) ?? []).slice(1).map((c) => c.replace(/\s*[+−±][\d.]+$/, ""));
  assert.deepEqual(by("AIFB"), ["48.0%", "10.0%"]);
  assert.deepEqual(by("TMC"), ["not listed", "45.0%"]);
  assert.deepEqual(by("BJP"), ["5.0%", "35.0%"]);
  assert.deepEqual(by("INC"), ["25.0%", "4.0%"]);
  assert.deepEqual(by("IND"), ["10.0%", "not listed"]);
  assert.deepEqual(by("BSP"), ["3.0%", "2.0%"]);
  assert.doesNotMatch(html, /Others \(\d|Rest of the field/, "a tail is added together under a name that is not a party's");
});

test("a party is the colour of its identity: TMC is the ink the maps give party id AITC, in the ladder, the ribbons and the follow chips", () => {
  const ladder = html.slice(html.indexOf('id="ladder"'), html.indexOf('id="close"'));
  for (const id of ["AITC", "BJP", "AIFB"]) assert.ok(ladder.includes(fillFor(id)), `${id}'s ink is not in the ladder`);
  assert.notEqual(fillFor("AITC"), fillFor("TMC"));
  assert.ok(!ladder.includes(fillFor("TMC")), "TMC is inked by its name, which is a third green");
  assert.match(ladder, /<polygon[^>]*fill-opacity/, "no ribbon joins the counted rows");
  assert.equal((ladder.match(/<polygon/g) ?? []).length > 0, true);
});

test("an election with no candidate votes is a dashed row with one sentence, and nothing proportional, and its table cells say why they are empty", () => {
  const ladder = html.slice(html.indexOf('id="ladder"'), html.indexOf('id="close"'));
  assert.equal([...text(ladder).matchAll(/won, taking it from \w+ · no candidate votes published|won, holding it from \d+ · no candidate votes published/g)].length, 1);
  assert.match(ladder, /iei-an-declared/);
  const share = rows(tableOf(html, "Share of the votes polled, by candidate party"));
  assert.ok(share.every((r) => r[0] !== "2026" && !r.includes("2026")), "a share is tabled for an election with no counts");
  const gap = rows(tableOf(html, "share here against its share across"));
  assert.ok(gap.some((r) => r[1] === "2026" && /no candidate votes published/.test(r.join(" "))));
});

test("the caveats are one entry a measure in a reader's words, computed, and the stale counts are gone", () => {
  const panel = html.slice(html.indexOf('id="leaves"'), html.indexOf('id="tables"'));
  const labels = [...panel.matchAll(/<dt>([^<]*)<\/dt>/g)].map((m) => m[1]);
  assert.deepEqual(labels, ["Turnout", "Vote share", "Margin", "Swing", "Effective number of parties", "Sources"]);
  assert.match(text(panel), /Turnout for 2026 is withheld/);
  assert.doesNotMatch(panel, /22,414|2,932|72\.9|data\/seed|`|BIASED DOWNWARD|confidence=/);
  assert.match(text(panel), /2026: only the winner, the party and a declared margin are on record/);
});

test("a party the reader follows is highlighted, and says what it follows; the finding does not change with it", () => {
  const f = render("party=INC");
  const follow = f.slice(f.indexOf('aria-label="Follow one party"'), f.indexOf("</aside>"));
  assert.match(follow, /aria-current="true"[^>]*>INC/);
  assert.match(text(follow), /2016 48\.0%|2016 25\.0%/);
  assert.equal(text(html.slice(html.indexOf("iei-finding"), html.indexOf("iei-an-rule"))), text(f.slice(f.indexOf("iei-finding"), f.indexOf("iei-an-rule"))), "the finding changed with the party followed");
});

test("a party the window cannot show says so, and says whom it follows instead", () => {
  const f = render("party=BSP&from=2026");
  assert.match(text(f), /BSP has no result at Alpha in this window, so \w+ is followed instead\./);
  assert.doesNotMatch(f, /iei-an-seg/, "a one-election window with no counts draws a proportional segment");
});
