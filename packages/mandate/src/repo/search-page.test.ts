// The search page and what it prints, on a registry built here from literal data and rendered in a child process
// (house-arc-page.test.ts does the same).
//
//   hh  a state of ten assembly seats in two districts, and three Lok Sabha seats
//   zz  a state with no election
//
//   hh-assembly-2021  eight contested seats: AITC (short name TMC) 5, BBB 2, CCC 1; DDD is every runner-up the seats
//                     name and wins nothing, so it has no row in the party landscape
//   hh-assembly-2026  two seats: one declared, and one where the source says "elected" and wrote no result row, each
//                     with a candidate who has no result row of their own
//
//   ten people named Sukanta, so a group is cut at eight, and one Sukhanta, who only sounds like them

import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { blockingKeys } from "../core/index.ts";
import { open, openRead } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";
import { PER_GROUP, outcomeWords, searchAll } from "./search.ts";

const ROOT = new URL("../../../../", import.meta.url).pathname;
const NOW = "2026-08-12T00:00:00.000Z";

function fixture(db: DatabaseSync): DatabaseSync {
  migrate(db, NOW);
  db.exec(`
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('e1','Delimitation','2008-02-19');
    INSERT INTO place (id, kind, canonical_name) VALUES ('in','nation','India');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('hh','state','Hh State','in');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('zz','state','Zz State','in');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('hh.north','district','North Hh','hh');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('hh.south','district','South Twenty Hh','hh');
    INSERT INTO source (id, kind, publisher, title, retrieved_at, doc_hash) VALUES ('s1','static_module','P','Results','2026-08-12','sha256:0');
    INSERT INTO party (id, name, short_name) VALUES ('AITC','All India Trinamool Congress','TMC');
    INSERT INTO party (id, name, short_name) VALUES ('BBB','B Party','BBB');
    INSERT INTO party (id, name, short_name) VALUES ('CCC','C Party','CCC');
    INSERT INTO party (id, name, short_name) VALUES ('DDD','D Party','DDD');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (1,'AITC','1998-01-01','All India Trinamool Congress');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (2,'BBB','1990-01-01','B Party');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (3,'CCC','1990-01-01','C Party');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (4,'DDD','1990-01-01','D Party');
    INSERT INTO ingest_run (pipeline, parser_version, started_at, finished_at, status) VALUES ('static:fixture','v1','${NOW}','${NOW}','ok');
  `);
  const place = db.prepare(`INSERT INTO place (id, kind, canonical_name, parent_id) VALUES (?, ?, ?, 'hh')`);
  const version = db.prepare(
    `INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, reservation, district_place_id)
     VALUES (?, ?, 'hh', ?, 'e1', ?, ?, 'general', ?)`,
  );
  for (let n = 1; n <= 10; n++) {
    place.run(`hh.ac.${String(n).padStart(3, "0")}`, "ac", `Seat ${n}`);
    version.run(n, `hh.ac.${String(n).padStart(3, "0")}`, "ac", n, `Seat ${n}`, n <= 5 ? "hh.north" : "hh.south");
  }
  for (let n = 1; n <= 3; n++) {
    place.run(`hh.pc.00${n}`, "pc", `Pc ${n}`);
    version.run(100 + n, `hh.pc.00${n}`, "pc", n, `Pc ${n}`, null);
  }
  const election = db.prepare(
    `INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, occurrence)
     VALUES (?, ?, ?, ?, 'e1', ?, 'declared', ?, ?, 1)`,
  );
  election.run("hh-assembly-2021", "assembly", "state", "hh", "Hh Legislative Assembly election, 2021", "ac", 2021);
  election.run("hh-assembly-2026", "assembly", "state", "hh", "Hh Legislative Assembly election, 2026", "ac", 2026);
  election.run("ls-2024", "general", "union", "in", "Indian general election, 2024", "pc", 2024);

  const person = db.prepare(`INSERT INTO person (id, canonical_name, names, review_state, created_at) VALUES (?, ?, '{}', 'auto', '${NOW}')`);
  const alias = db.prepare(
    `INSERT INTO person_alias (person_id, name, script, norm_key, kind, source_id) VALUES (?, ?, 'latn', ?, 'primary', 's1')`,
  );
  const contestRow = db.prepare(`INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES (?, ?, ?, 'declared')`);
  const candidacy = db.prepare(`INSERT INTO candidacy (id, contest_id, person_id, party_version_id, status) VALUES (?, ?, ?, ?, ?)`);
  const result = db.prepare(
    `INSERT INTO result (contest_id, candidacy_id, revision, votes, "rank", is_winner, margin, source_id, ingested_at)
     VALUES (?, ?, 0, ?, ?, ?, ?, 's1', '${NOW}')`,
  );
  /** A person with the alias rows a search reads, and the id. */
  const named = (id: string, name: string): string => {
    person.run(id, name);
    for (const k of blockingKeys(name)) alias.run(id, name, k);
    return id;
  };
  /** A candidate in a contest; `rank` null writes no result row at all. */
  const stand = (contest: string, who: string, party: 1 | 2 | 3 | 4, status: string, rank: 1 | 2 | null): void => {
    const id = `${contest}:${who}`;
    candidacy.run(id, contest, who, party, status);
    if (rank !== null) result.run(contest, id, rank === 1 ? 600 : 400, rank, rank === 1 ? 1 : 0, rank === 1 ? 200 : null);
  };
  /** A seat's contest, won by `winner` of party `pv`, with `runner` of DDD second. */
  const contest = (electionId: string, version: number, winner: string, pv: 1 | 2 | 3, runner: string): void => {
    const id = `${electionId}:${version}`;
    contestRow.run(id, electionId, version);
    stand(id, winner, pv, "elected", 1);
    stand(id, runner, 4, "defeated", 2);
  };
  // Eight Sukantas win a seat each; two lose one, and a Sukhanta shares their phonetic key without sharing their letters
  const win = "abcdefgh".split("").map((c) => named(`sukanta-${c}`, `Sukanta ${c.toUpperCase()}`));
  const lose = [named("sukanta-i", "Sukanta I"), named("sukanta-j", "Sukanta J"), named("sukhanta-roy", "Sukhanta Roy")];
  [1, 1, 1, 1, 1, 2, 2, 3].forEach((pv, i) =>
    contest("hh-assembly-2021", i + 1, win[i] as string, pv as 1 | 2 | 3, lose[i] ?? named(`runner-${i + 1}`, `Runner ${i + 1}`)),
  );
  // 2026: a declared seat, and a seat where the source says "elected" and wrote no result row at all
  contestRow.run("hh-assembly-2026:1", "hh-assembly-2026", 1);
  stand("hh-assembly-2026:1", named("declared-winner", "Declared Winner"), 1, "elected", 1);
  stand("hh-assembly-2026:1", named("waiting-person", "Waiting Person"), 4, "contesting", null);
  contestRow.run("hh-assembly-2026:2", "hh-assembly-2026", 2);
  stand("hh-assembly-2026:2", named("elected-norow", "Elected Norow"), 2, "elected", null);
  stand("hh-assembly-2026:2", named("second-waiting", "Second Waiting"), 4, "contesting", null);
  // THE LOK SABHA, of which this state sends three
  [1, 1, 2].forEach((pv, i) =>
    contest("ls-2024", 101 + i, named(`mp-${i}`, `Mp Person ${i}`), pv as 1 | 2, named(`mp-runner-${i}`, `Mp Runner ${i}`)),
  );
  return db;
}

const PATH = join(mkdtempSync(join(tmpdir(), "mandate-search-page-")), "registry.db");
fixture(open(PATH)).close();

function render(route: string, query: string, segments = ""): string {
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
const search = (q: string): string => render("/search", `q=${encodeURIComponent(q)}`);
const found = (q: string) => {
  const d = openRead(PATH);
  try {
    return searchAll(d, q);
  } finally {
    d.close();
  }
};

/** The text of the panel headed `title`, up to the next section. */
function panel(html: string, title: string): string {
  const at = html.indexOf(`>${title}</h2>`);
  assert.notEqual(at, -1, `no panel titled ${title}`);
  const close = html.indexOf("<section", at);
  return html.slice(at, close === -1 ? undefined : close);
}

// ── what a group says it found ─────────────────────────────────────────────────────────────────────

test("a group counts what matched in all, and lists the first PER_GROUP of it", () => {
  const seats = found("Seat");
  assert.equal(seats.constituencies.length, PER_GROUP);
  assert.equal(seats.counts.constituencies, 10);
  assert.equal(seats.total, 10);
  const people = found("Sukanta");
  assert.equal(people.people.length, PER_GROUP);
  assert.equal(people.counts.people, 10);
  assert.equal(people.total, 10, "the one name that only sounds like it is not a match");
  assert.equal(people.counts.alike, 1);
  // under the cap the count is the list
  const pcs = found("Pc");
  assert.deepEqual([pcs.constituencies.length, pcs.counts.constituencies], [3, 3]);
});

test("the headline counts every match, and a panel cut at eight says how many there are", () => {
  const seats = search("Seat");
  assert.match(text(seats), /10 matches for “Seat” across constituencies/);
  assert.match(text(panel(seats, "Constituencies")), /first 8 of 10/);
  const people = search("Sukanta");
  assert.match(text(people), /10 matches for “Sukanta” across people/);
  assert.match(text(panel(people, "People")), /first 8 of 10/, "the people panel used to say nothing at all");
  assert.doesNotMatch(text(panel(search("Pc"), "Constituencies")), /first \d+ of/, "a panel that lists every match says so by saying nothing");
});

// ── a person's outcome, in the person page's words ─────────────────────────────────────────────────

test("a person's outcome is won, lost or no result declared, and never the registry's status word", () => {
  const row = (isWinner: boolean, latestStatus: Parameters<typeof outcomeWords>[0]["latestStatus"]) => ({ isWinner, latestStatus });
  assert.equal(outcomeWords(row(true, "elected")), "won");
  assert.equal(outcomeWords(row(false, "elected")), "won", "the one seat with the source's word and no result row, which the person page also calls a win");
  assert.equal(outcomeWords(row(false, "defeated")), "lost");
  assert.equal(outcomeWords(row(false, "contesting")), "no result declared");
  assert.equal(outcomeWords(row(false, null)), "outcome not recorded");
  assert.equal(outcomeWords(row(false, "withdrawn")), "withdrawn", "a withdrawal is not a defeat");

  const waiting = text(search("Waiting Person"));
  assert.match(waiting, /Waiting Person[^.]*seat won by Declared Winner/, "a nomination in a declared seat names who has it, as the person page does");
  assert.doesNotMatch(waiting, /contesting/);
  const second = text(search("Second Waiting"));
  assert.match(second, /Second Waiting[^.]*seat won by Elected Norow/);
  assert.doesNotMatch(second, /contesting/);
  assert.match(text(search("Elected Norow")), /Elected Norow[^.]*· won ·/);
  assert.match(text(search("Runner 4")), /Runner 4[^.]*· lost ·/);
});

// ── the note under the people ──────────────────────────────────────────────────────────────────────

test("the sounds-like note does not say no name contains the query when names do", () => {
  const some = text(panel(search("Sukanta"), "Sounds like “Sukanta”"));
  assert.match(some, /Sukhanta Roy/);
  assert.doesNotMatch(some, /No recorded name contains what you typed/);
  assert.match(some, /a suggestion to check, not a person found/);
  // and where none does, the sentence is true and stays
  const none = text(panel(search("Sukanth"), "Sounds like “Sukanth”"));
  assert.match(none, /No recorded name contains what you typed/);
  assert.match(none, /first 8 of 11/, "the panel is cut at eight and says so");
});

// ── districts ──────────────────────────────────────────────────────────────────────────────────────

test("a district is searchable, and its row opens its page", () => {
  const r = found("South Twenty");
  assert.deepEqual(r.districts.map((h) => [h.id, h.label, h.href]), [["hh.south", "South Twenty Hh", "/district/hh/south"]]);
  assert.equal(r.districts[0]?.detail, "District · 5 assembly seats · Hh State");
  assert.equal(r.total, 1);
  const html = search("South Twenty");
  assert.match(text(html), /1 match for “South Twenty” across districts/);
  assert.match(text(panel(html, "Districts")), /South Twenty Hh/);
  // the page it opens is there
  assert.match(text(render("/district", "", "hh/south")), /South Twenty Hh/);
});

// ── a party hit opens a row only where there is one ────────────────────────────────────────────────

test("a party hit links to the landscape only where the front page has a row for the party", () => {
  const home = render("/", "");
  const ids = new Set([...home.matchAll(/id="(party-[^"]*)"/g)].map((m) => m[1]));
  assert.ok(ids.has("party-aitc") && ids.has("party-bbb"), "the fixture's governing party and the one with a Lok Sabha seat have a row");
  assert.ok(!ids.has("party-ccc") && !ids.has("party-ddd"), "the one with no seat in the latest houses, and the one that wins nothing, have none");

  const html = search("party");
  const hits = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1] as string).filter((li) => /Party/.test(li));
  assert.equal(hits.length, 3, "B, C and D");
  for (const li of hits) {
    const letter = /([BCD]) Party/.exec(li)?.[1]?.toLowerCase();
    const anchor = `party-${letter}${letter}${letter}`;
    const href = /href="\/#(party-[^"]*)"/.exec(li)?.[1];
    if (ids.has(anchor)) assert.equal(href, anchor, `${anchor} has a row and its hit does not open it`);
    else {
      assert.equal(href, undefined, `${anchor} has no row and its hit links to one`);
      assert.match(text(li), /not in the party landscape/);
    }
  }
});

// ── the tab, and the search engines ────────────────────────────────────────────────────────────────

test("a result page is titled for its query and left out of search engines, and the empty search is not", () => {
  const meta = (q: string): unknown =>
    JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--import", "./ops/probe/render/register.mjs", "--input-type=module", "-e",
          `const m = await import("./src/app/search/page.tsx"); process.stdout.write(JSON.stringify(m.generateMetadata({ searchParams: { q: ${JSON.stringify(q)} } })));`,
        ],
        { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      ),
    );
  assert.deepEqual(meta("Mamata"), { title: "Search: Mamata", robots: { index: false, follow: true } });
  assert.deepEqual(meta("  "), { title: "Search" });
  assert.deepEqual(meta(""), { title: "Search" });
});
