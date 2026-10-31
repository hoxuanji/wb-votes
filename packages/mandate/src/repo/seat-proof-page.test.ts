// The three proof figures, rendered: on the pages of the registry's reference seats, and on a registry built here for the shapes the live one does
// not hold (an election with a contest that declared no winner, so a list of margins that would be a list of some of them).
//
// The registry built here:
//
//   xx  three assembly seats and two elections
//     Alpha  2021 counted, TMC over BJP by 60 votes of 100,500 polled (narrow: 0.06 points); 2026 declared, TMC by 900
//     Beta   2026 declared, BJP by 12,000: the one election on record
//     Gamma  2026: a contest, and nobody declared its winner
//   yy  three assembly seats, each with the one election 2026, each declared, so that the list of margins is whole

import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { DEV_DB_PATH } from "../db/open.ts";
import { open } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";

const ROOT = new URL("../../../../", import.meta.url).pathname;
const HAVE_DB = existsSync(process.env["MANDATE_DB_PATH"] ?? DEV_DB_PATH);
const live = { skip: HAVE_DB ? false : "no .data/registry.db — run npm run registry:ingest" };

function fixture(db: DatabaseSync): DatabaseSync {
  migrate(db, "2026-08-12T00:00:00.000Z");
  db.exec(`
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('e1','Delimitation','2008-02-19');
    INSERT INTO place (id, kind, canonical_name) VALUES ('in','nation','India');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('xx','state','Xx State','in');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('yy','state','Yy State','in');
    INSERT INTO source (id, kind, publisher, title, retrieved_at, doc_hash) VALUES ('s1','static_module','P','Results','2026-08-12','sha256:0');
    INSERT INTO party (id, name, short_name) VALUES ('AITC','All India Trinamool Congress','TMC');
    INSERT INTO party (id, name, short_name) VALUES ('BJP','Bharatiya Janata Party','BJP');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (1,'AITC','1998-01-01','All India Trinamool Congress');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (2,'BJP','1980-01-01','Bharatiya Janata Party');
  `);
  const place = db.prepare(`INSERT INTO place (id, kind, canonical_name, parent_id) VALUES (?, 'ac', ?, ?)`);
  const version = db.prepare(
    `INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, reservation) VALUES (?, ?, ?, 'ac', 'e1', ?, ?, 'general')`,
  );
  const election = db.prepare(
    `INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, occurrence)
     VALUES (?, 'assembly', 'state', ?, 'e1', ?, 'declared', 'ac', ?, 1)`,
  );
  const person = db.prepare(`INSERT INTO person (id, canonical_name, created_at) VALUES (?, ?, '2026-08-12')`);
  const contestRow = db.prepare(`INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES (?, ?, ?, 'declared')`);
  const candidacy = db.prepare(`INSERT INTO candidacy (id, contest_id, person_id, party_version_id, party_raw, status) VALUES (?, ?, ?, ?, NULL, 'contesting')`);
  const result = db.prepare(
    `INSERT INTO result (contest_id, candidacy_id, revision, votes, "rank", is_winner, margin, source_id, ingested_at) VALUES (?, ?, 0, ?, ?, ?, ?, 's1', '2026-08-12')`,
  );
  const turnout = db.prepare(`INSERT INTO turnout (contest_id, scope, electors, voters, source_id) VALUES (?, 'contest', ?, ?, 's1')`);

  let next = 0;
  const seat = (state: string, n: number, name: string): number => {
    const id = ++next;
    place.run(`${state}.ac.00${n}`, name, state);
    version.run(id, `${state}.ac.00${n}`, state, n, name);
    return id;
  };
  type Row = { who: string; version: number; votes: number | null };
  const contest = (state: string, year: number, v: number, electors: number, voters: number, margin: number, rows: Row[]): void => {
    const id = `${state}-assembly-${year}:${v}`;
    contestRow.run(id, `${state}-assembly-${year}`, v);
    if (voters > 0) turnout.run(id, electors, voters);
    rows.forEach((r, i) => {
      person.run(`p-${id}-${i}`, `${r.who}`);
      candidacy.run(`c-${id}-${i}`, id, `p-${id}-${i}`, r.version);
      result.run(id, `c-${id}-${i}`, r.votes, i + 1, i === 0 ? 1 : 0, i === 0 ? margin : null);
    });
  };

  for (const [state, years] of [["xx", [2021, 2026]], ["yy", [2026]]] as const) {
    for (const year of years) election.run(`${state}-assembly-${year}`, state, `${state}-assembly-${year}`, year);
  }
  const [alpha, beta, gamma] = [seat("xx", 1, "Alpha"), seat("xx", 2, "Beta"), seat("xx", 3, "Gamma")];
  const [pi, qu, ra] = [seat("yy", 1, "Pi"), seat("yy", 2, "Qu"), seat("yy", 3, "Ra")];
  contest("xx", 2021, alpha, 140000, 100500, 60, [{ who: "Tia", version: 1, votes: 50030 }, { who: "Bea", version: 2, votes: 49970 }]);
  contest("xx", 2026, alpha, 140000, 120000, 900, [{ who: "Tom", version: 1, votes: null }]);
  contest("xx", 2026, beta, 140000, 120000, 12000, [{ who: "Bo", version: 2, votes: null }]);
  contestRow.run(`xx-assembly-2026:${gamma}`, "xx-assembly-2026", gamma);
  contest("yy", 2026, pi, 140000, 120000, 1000, [{ who: "Pia", version: 1, votes: null }]);
  contest("yy", 2026, qu, 140000, 120000, 4000, [{ who: "Quin", version: 2, votes: null }]);
  contest("yy", 2026, ra, 140000, 120000, 2500, [{ who: "Rae", version: 1, votes: null }]);
  return db;
}

const PATH = join(mkdtempSync(join(tmpdir(), "mandate-seat-proof-page-")), "registry.db");
fixture(open(PATH)).close();

function render(route: string, seat: string, state: string, body = "assembly", dbPath?: string): string {
  try {
    return execFileSync(process.execPath, ["--no-warnings", "--import", "./ops/probe/render/register.mjs", "./ops/probe/render/render.mjs", route, "", `${state}/${body}/${seat}`], {
      cwd: ROOT,
      env: dbPath === undefined ? process.env : { ...process.env, MANDATE_DB_PATH: dbPath },
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    throw new Error(`render ${route} ${state}/${body}/${seat} failed:\n${err.stderr ?? err.message}`);
  }
}

const text = (html: string): string => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
const count = (html: string, re: RegExp): number => (html.match(re) ?? []).length;
const seatFig = (html: string, id: string): string => {
  const start = html.indexOf(`id="${id}"`);
  assert.notEqual(start, -1, `no section ${id}`);
  return html.slice(start, html.indexOf("</section>", start));
};

/* ───────────────────────────── the fixture ───────────────────────────── */

test("a narrow counted result has a ruler: two bars, two dots, the gap bracketed, and a twin with the exact figures", () => {
  const html = render("/constituency", "alpha", "xx", "assembly", PATH);
  const f = seatFig(html, "finish");
  assert.equal(count(f, /class="iei-pf-bar"/g), 2);
  assert.equal(count(f, /class="iei-pf-dot/g), 2);
  assert.equal(count(f, /class="iei-pf-dot iei-pf-dot-w"/g), 1, "the winner is the ringed dot, and one only");
  const t = text(f);
  // 50,030 against 49,970: a gap of 60 on a grid of 50, from 49,900 to 50,100.
  assert.match(t, /49,900 to 50,100 votes/);
  assert.match(t, /60 votes/);
  assert.match(t, /It is a ruler and not a bar, so it does not start at zero\./);
  assert.equal(count(f, /class="iei-pf-tick"/g), 5);
  assert.match(f, /<details class="iei-twin"><summary>The exact figures<\/summary>/);
  assert.match(t, /Gap 0\.06% of the votes polled 60/);
  assert.equal(count(html, /id="rank"/g), 0);
  assert.equal(count(html, /class="iei-ev(?:\s|")/g) <= 3, true, "the figure added an evidence drawer");
});

test("the 2026 election of a seat that had a close 2021 draws no ruler for 2026: a declared margin has no totals to put on one", () => {
  const html = render("/constituency", "alpha", "xx", "assembly", PATH);
  assert.equal(count(html, /id="finish"/g), 1);
  assert.ok(!text(seatFig(html, "finish")).includes("2026"), "the ruler is for 2026");
  assert.match(text(seatFig(html, "finish")), /2021: the two leading totals/);
});

test("a list of margins that would leave a contest out is not drawn: one sentence says how many are missing", () => {
  const html = render("/constituency", "beta", "xx", "assembly", PATH);
  const r = seatFig(html, "rank");
  assert.equal(count(r, /iei-rk-bar/g), 0);
  assert.match(text(r), /1 of the 3 contests of 2026 has no declared margin, so a place among all of them cannot be drawn\./);
  assert.equal(count(html, /id="finish"/g), 0);
});

test("a whole list of margins is drawn: a bar each, the seat outlined, every bar dashed, and the list under it links the others", () => {
  const html = render("/constituency", "qu", "yy", "assembly", PATH);
  const r = seatFig(html, "rank");
  assert.equal(count(r, /class="iei-rk-col(?: |")/g), 3);
  assert.equal(count(r, /iei-rk-self/g), 1);
  assert.equal(count(r, /class="iei-rk-bar iei-rk-bar-d"/g), 3);
  const t = text(r);
  assert.match(t, /The 3 Yy State Assembly margins of 2026, widest first\./);
  assert.match(t, /Qu 4,000 · 1st widest of 3/);
  assert.match(t, /Every bar is dashed, because every margin was declared by the source with no counts behind it\./);
  // The widest is the 4,000 of Qu itself, so it is first; the list has Ra and Pi after it, each a link to its own page.
  assert.match(r, /<a href="\/constituency\/yy\/assembly\/ra">Ra<\/a>/);
  assert.match(r, /<a href="\/constituency\/yy\/assembly\/pi">Pi<\/a>/);
  assert.doesNotMatch(r, /<a href="\/constituency\/yy\/assembly\/qu">/, "the seat links to itself in its own list");
  assert.match(r, /<tr aria-current="true">/);
});

test("the strip counts the contest nobody declared and leaves it off, with a dashed ring in the sentence", () => {
  const html = render("/constituency/analysis", "beta", "xx", "assembly", PATH);
  const s = seatFig(html, "field");
  assert.equal(count(s, /class="iei-st-dot/g), 2);
  assert.equal(count(s, /iei-st-dot-me/g), 1);
  assert.equal(count(s, /iei-st-dot-d/g), 2, "a declared margin is not a hollow dot");
  assert.match(text(s), /1 of the 3 contests of 2026 has no declared winner and so no margin, and no dot\./);
  assert.match(s, /class="iei-st-none"/);
  assert.match(text(s), /Beta 12,000 votes/);
  assert.match(text(s), /The 2 Xx State Assembly seats in 2026|2 Xx State Assembly seats in 2026/);
});

test("the strip of a whole election is a hollow dot for each seat, ringed once, with an exact table of as many rows", () => {
  const html = render("/constituency/analysis", "pi", "yy", "assembly", PATH);
  const s = seatFig(html, "field");
  assert.equal(count(s, /<i class="iei-st-dot/g), 3);
  assert.equal(count(s, /iei-st-dot-me/g), 1);
  assert.equal(count(s, /<tr/g), 1 + 3, "a head and a row for each dot");
  assert.equal(count(s, /class="iei-st-none"/g), 0, "nothing is left off");
  assert.match(text(s), /Every dot is hollow, because every margin was declared by the source with no counts behind it\./);
  // Pi is the closest of three (1,000 against 2,500 and 4,000), and says so as the Analysis's hero does.
  assert.match(s, /aria-label="Pi&#x27;s margin of 1,000 votes is the closest of the 3 Yy State Assembly margins of 2026\."/);
  assert.match(text(html), /The closest of 3 declared margins that year/);
  assert.match(s, /title="Pi · TMC · 1,000 votes \(declared\)"/);
});

test("Gamma, which declared no winner, has no figure of any of the three kinds", () => {
  const brief = render("/constituency", "gamma", "xx", "assembly", PATH);
  const an = render("/constituency/analysis", "gamma", "xx", "assembly", PATH);
  for (const id of ["finish", "rank"]) assert.equal(count(brief, new RegExp(`id="${id}"`, "g")), 0);
  assert.equal(count(an, /id="field"/g), 0);
});

/* ───────────────────────────── the live registry ───────────────────────────── */

test("Dinhata's page has the ruler, Baharampur's the list, Mekliganj's neither, and the Analysis of each has a strip", live, () => {
  const din = render("/constituency", "dinhata", "wb");
  assert.equal(count(din, /id="finish"/g), 1);
  assert.equal(count(din, /id="rank"/g), 0);
  assert.match(text(seatFig(din, "finish")), /57 votes/);
  assert.match(text(seatFig(din, "finish")), /1,15,900 to 1,16,100 votes/);

  const bhm = render("/constituency", "baharampur", "wb", "lok-sabha");
  const r = seatFig(bhm, "rank");
  assert.equal(count(r, /class="iei-rk-col(?: |")/g), 42);
  assert.equal(count(r, /iei-rk-self/g), 1);
  assert.equal(count(r, /class="iei-rk-bar iei-rk-bar-d"/g), 42);
  assert.equal(count(r, /<tr/g), 43);
  assert.equal(count(r, /<a href="\/constituency\/wb\/lok-sabha\//g), 41);
  assert.match(text(r), /Baharampur 85,022 · 24th widest of 42/);
  assert.equal(count(bhm, /id="finish"/g), 0);

  const mek = render("/constituency", "mekliganj", "wb");
  assert.equal(count(mek, /id="finish"/g) + count(mek, /id="rank"/g), 0);

  for (const [seat, body, dots] of [["dinhata", "assembly", 293], ["baharampur", "lok-sabha", 42], ["mekliganj", "assembly", 293]] as const) {
    const an = render("/constituency/analysis", seat, "wb", body);
    const s = seatFig(an, "field");
    assert.equal(count(s, /<i class="iei-st-dot/g), dots, seat);
    assert.equal(count(s, /iei-st-dot-me/g), 1, seat);
    assert.equal(count(s, /<tr/g), 1 + dots, seat);
    assert.doesNotMatch(text(an), /NaN|undefined|Infinity/);
  }
});

test("a seat with no 2026 result row, Falta, draws its strip for the election it has, and prints no press margin", live, () => {
  const an = render("/constituency/analysis", "falta", "wb");
  const s = seatFig(an, "field");
  assert.match(text(s), /margins of 2021/);
  assert.ok(!/109,021|1,09,021|109021/.test(an), "Falta's press margin is printed");
  const brief = render("/constituency", "falta", "wb");
  assert.ok(!/109,021|1,09,021|109021/.test(brief), "Falta's press margin is printed");
});

test("the new markup is small: the pages stay far under the budget, and add no evidence drawer", live, () => {
  for (const [route, seat, body] of [
    ["/constituency", "dinhata", "assembly"],
    ["/constituency", "baharampur", "lok-sabha"],
    ["/constituency/analysis", "dinhata", "assembly"],
    ["/constituency/analysis", "mekliganj", "assembly"],
    ["/constituency/analysis", "baharampur", "lok-sabha"],
  ] as const) {
    const html = render(route, seat, "wb", body);
    assert.ok(Buffer.byteLength(html) < 340_000, `${route} ${seat}: ${Buffer.byteLength(html)} bytes of markup`);
    assert.ok(count(html, /class="iei-ev(?:\s|")/g) <= 3, `${route} ${seat}: more than three evidence drawers`);
  }
});

test("the figures' words and marks follow the page's rules: no pronoun, no unconditional claim, a declared margin is not drawn as a counted one", live, () => {
  const pages = [
    seatFig(render("/constituency", "dinhata", "wb"), "finish"),
    seatFig(render("/constituency", "baharampur", "wb", "lok-sabha"), "rank"),
    seatFig(render("/constituency/analysis", "baharampur", "wb", "lok-sabha"), "field"),
    seatFig(render("/constituency/analysis", "dinhata", "wb"), "field"),
  ];
  for (const p of pages) {
    const t = text(p).replace(/<[^>]*>/g, "");
    assert.doesNotMatch(t, /\b(never|first time|only|defeated|lost to|beat|he|she|his|her|him)\b/i, t.slice(0, 200));
    assert.doesNotMatch(t, /NaN|undefined|Infinity/);
    // Ink never carries a meaning alone: a party's dot or bar has its code in the key and its row in the table.
  }
  // A strip or a list of declared margins never has a solid dot or a solid bar, and a dashed one is never solid.
  const bhm = render("/constituency/analysis", "baharampur", "wb", "lok-sabha");
  assert.equal(count(seatFig(bhm, "field"), /class="iei-st-dot"/g), 0, "a declared margin is a solid dot");
});
