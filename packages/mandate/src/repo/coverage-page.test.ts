// The coverage page, on a registry built here from literal data and rendered in a child process (house-arc-page.test.ts
// does the same).
//
//   br  a state with an assembly election of 1,300 candidacies in one seat: 100 with a result and 1,200 without
//   dl  a union territory with one Lok Sabha seat, contested
//   ka  a state with a seat and no election

import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { open } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";

const ROOT = new URL("../../../../", import.meta.url).pathname;

function fixture(db: DatabaseSync): DatabaseSync {
  migrate(db, "2026-08-12T00:00:00.000Z");
  db.exec(`
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('e1','Delimitation','2008-02-19');
    INSERT INTO source (id, kind, publisher, title, retrieved_at, doc_hash) VALUES ('s1','static_module','P','Results','2026-08-12','sha256:0');
    INSERT INTO place (id, kind, canonical_name) VALUES ('in','nation','India');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('br','state','Bihar','in'), ('ka','state','Karnataka','in'), ('dl','ut','Delhi','in');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('br.ac.001','ac','SEAT A','br'), ('dl.pc.001','pc','SEAT B','dl'), ('ka.ac.001','ac','SEAT C','ka');
    INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, reservation)
      VALUES (1,'br.ac.001','br','ac','e1',1,'SEAT A','general'), (2,'dl.pc.001','dl','pc','e1',1,'SEAT B','general'),
             (3,'ka.ac.001','ka','ac','e1',1,'SEAT C','general');
    INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, occurrence)
      VALUES ('br-assembly-2020','assembly','state','br','e1','Bihar Legislative Assembly election, 2020','declared','ac',2020,1),
             ('ls-2024','general','union','in','e1','Indian general election, 2024','declared','pc',2024,1);
    INSERT INTO contest (id, election_id, place_version_id, lifecycle)
      VALUES ('c1','br-assembly-2020',1,'declared'), ('c2','ls-2024',2,'declared');
    INSERT INTO party (id, name, short_name) VALUES ('AAA','A Party','AAA');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (1,'AAA','1990-01-01','A Party');
  `);
  const person = db.prepare(`INSERT INTO person (id, canonical_name, created_at) VALUES (?, ?, '2026-08-12')`);
  const candidacy = db.prepare(`INSERT INTO candidacy (id, contest_id, person_id, party_version_id, status) VALUES (?, ?, ?, 1, ?)`);
  const result = db.prepare(
    `INSERT INTO result (contest_id, candidacy_id, revision, votes, "rank", is_winner, margin, source_id, ingested_at)
     VALUES (?, ?, 0, 600, ?, ?, 200, 's1', '2026-08-12')`,
  );
  db.exec("BEGIN");
  for (let n = 1; n <= 1300; n++) {
    person.run(`p${n}`, `Person ${n}`);
    candidacy.run(`k${n}`, "c1", `p${n}`, n === 1 ? "elected" : n <= 100 ? "defeated" : "contesting");
    if (n <= 100) result.run("c1", `k${n}`, n, n === 1 ? 1 : 0);
  }
  person.run("pl", "Lok Sabha Person");
  candidacy.run("kl", "c2", "pl", "elected");
  result.run("c2", "kl", 1, 1);
  db.exec("COMMIT");
  return db;
}

const PATH = join(mkdtempSync(join(tmpdir(), "mandate-coverage-page-")), "registry.db");
fixture(open(PATH)).close();

function render(query: string): string {
  try {
    return execFileSync(
      process.execPath,
      ["--import", "./ops/probe/render/register.mjs", "./ops/probe/render/render.mjs", "/coverage", query, ""],
      { cwd: ROOT, env: { ...process.env, MANDATE_DB_PATH: PATH }, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    throw new Error(`render /coverage ${query} failed:\n${err.stderr ?? err.message}`);
  }
}

const text = (html: string): string => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

test("the geography table counts the states an election has a contest in, against the 36, and not the 36 it names", () => {
  const t = text(render("election=br-assembly-2020"));
  // Bihar by its assembly and Delhi by the Lok Sabha: two of 36, which is 5.6%. Karnataka has a seat and no election.
  assert.match(t, /States and union territories[^|]*? 2 36 5\.6%/);
  assert.doesNotMatch(t, /States and union territories[^|]*? 36 36 100\.0%/);
});

test("the elections row names the states and union territories with an election, and the national election apart", () => {
  const t = text(render(""));
  assert.match(t, /1 jurisdiction, 2020-2024, 2 elections, 1 of them national/);
});

test("a count of a thousand or more is grouped in the hint under the tile, as in the tile", () => {
  const t = text(render("election=br-assembly-2020"));
  assert.match(t, /Candidate records 1,300 1,200 of them carry no result row/);
});

test("the page counts no file in the repo", () => {
  const t = text(render(""));
  assert.doesNotMatch(t, /sit in the repo|sitting in this repo|fourteen manifestos|14 party manifestos/);
});

/* ────────────────────────────── the ledger of subject areas ────────────────────────────── */

const LABELS = [
  "Elections", "Census overlays", "Historical trends", "Delimitation changes", "Cabinet and portfolios", "MLA/MP performance",
  "Parliamentary sessions", "Bills", "Voting records", "Government schemes", "Budget allocations", "Public spending",
  "Constituency development funds", "Promises vs delivery", "Political funding", "Court cases", "RTI datasets", "Coalitions",
];

/** The page without the exact table's disclosure, which is where every row keeps every column. */
const outsideTwin = (html: string): string => html.replace(/<details class="iei-twin">[\s\S]*?<\/details>/g, " ");
const twinOf = (html: string): string => /<details class="iei-twin">([\s\S]*?)<\/details>/.exec(html)?.[1] ?? "";

test("the ledger is groups by status, each headed once with its count of the eighteen", () => {
  const html = outsideTwin(render(""));
  const heads = [...html.matchAll(/<h3 id="iei-led-([a-z-]+)">([\s\S]*?)<\/h3>/g)].map((m) => [m[1] as string, text(m[2] as string)] as const);
  assert.ok(heads.length >= 2, JSON.stringify(heads));
  const order = ["present", "empty", "no-model"];
  const at = heads.map((h) => order.indexOf(h[0]));
  assert.deepEqual(at, [...at].sort((a, b) => a - b), "the groups are not in the order data, table, no model");
  const counts = heads.map((h) => Number(/(\d+) of 18/.exec(h[1])?.[1]));
  assert.equal(counts.reduce((a, b) => a + b, 0), 18, `the groups hold ${counts.join(" + ")} of the eighteen subjects`);
  // A status is a word in a group's head and is not said on each subject again.
  assert.equal((text(html).match(/Not modelled/g) ?? []).length, 1, "'Not modelled' is said on more than the group");
});

test("every one of the eighteen subjects is on the page outside the exact table, by name", () => {
  const t = text(outsideTwin(render("")));
  for (const label of LABELS) assert.ok(t.includes(label), `${label} is not in the groups`);
});

test("what every subject of a group lacks is said once, in the group, and not on its subjects", () => {
  const t = text(outsideTwin(render("")));
  assert.ok((t.match(/On every subject in this group: no rows · no reach measured\./g) ?? []).length >= 1, "no group says what its subjects lack");
  assert.doesNotMatch(outsideTwin(render("")), />none</, "'none' is printed as a subject's row count");
});

test("the exact table keeps all eighteen rows with their five columns, behind a disclosure", () => {
  const html = render("");
  const twin = twinOf(html);
  assert.match(html, /<details class="iei-twin"><summary>The exact table: all 18 subject areas<\/summary>/);
  const rows = [...twin.matchAll(/<tr><th scope="row">([\s\S]*?)<\/tr>/g)];
  assert.equal(rows.length, 18, "the exact table lost a row");
  for (const [, row] of rows) assert.equal((row as string).match(/<td/g)?.length, 4, "a row lost a column");
  const t = text(twin);
  for (const label of LABELS) assert.ok(t.includes(label), `${label} is not in the exact table`);
  // The words of every row are in it: the status of each, and the question and the source.
  assert.ok((t.match(/Not modelled/g) ?? []).length >= 11);
  assert.match(t, /Who won this seat, by how much, and how has it behaved across cycles\?/);
  assert.match(t, /PRS India, Lok Sabha bill tracker/);
});

test("the twin is not an evidence drawer, so the page keeps its drawers", () => {
  const html = render("");
  assert.ok((html.match(/class="iei-ev(?:\s|")/g) ?? []).length <= 3);
  assert.doesNotMatch(twinOf(html), /iei-ev/);
});
