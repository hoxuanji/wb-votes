// Which result is THE result (decision D11, 2026-11-01): a contest's current result is the whole field at its HIGHEST
// revision, the `current_result` view of migration 018. A correction is a new revision and the row it replaced stays
// in `result`; wb-static writes one revision per contest, rewriting the whole field, so "highest" is a property of the
// contest and never of a candidacy.
//
// Built in memory because the live registry cannot show any of it: every one of its result rows is revision 0, and
// the day a correction is ingested is the day these cases first happen.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { all, open } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";
import { getPersonBrief } from "./person.ts";
import { readSeats } from "./seat-results.ts";

/**
 * One Karnataka assembly election of 2018 with two seats. Seat A (contest c1) has three candidates at revision 0:
 * a wins with 600 (margin 200), b has 400, c has 20. Seat B (contest c2) has two, at revision 0 only.
 */
function fixture(): DatabaseSync {
  const d = open(":memory:");
  migrate(d, "2026-08-12T00:00:00.000Z");
  d.exec(`
    INSERT INTO source (id, kind, retrieved_at, doc_hash) VALUES ('s1','static_module','2026-08-12','sha256:0');
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('e1','Delimitation','2008-02-19');
    INSERT INTO place (id, kind, canonical_name) VALUES ('in','nation','India');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('ka','state','Karnataka','in');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('ka.ac.001','ac','SEAT A','ka');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('ka.ac.002','ac','SEAT B','ka');
    INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, reservation)
      VALUES (1,'ka.ac.001','ka','ac','e1',1,'SEAT A','general');
    INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, reservation)
      VALUES (2,'ka.ac.002','ka','ac','e1',2,'SEAT B','general');
    INSERT INTO party (id, name, short_name) VALUES ('AAA','A Party','AAA');
    INSERT INTO party (id, name, short_name) VALUES ('BBB','B Party','BBB');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (1,'AAA','1990-01-01','A Party');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (2,'BBB','1990-01-01','B Party');
    INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, occurrence)
      VALUES ('ka-assembly-2018','assembly','state','ka','e1','KA 2018','declared','ac',2018,1);
    INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES ('c1','ka-assembly-2018',1,'declared');
    INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES ('c2','ka-assembly-2018',2,'declared');
    INSERT INTO turnout (contest_id, scope, voters, electors, source_id) VALUES ('c1','contest',1000,2000,'s1');
    INSERT INTO turnout (contest_id, scope, voters, electors, source_id) VALUES ('c2','contest',1000,2000,'s1');
  `);
  const person = d.prepare(`INSERT INTO person (id, canonical_name, created_at) VALUES (?, ?, '2026-08-12')`);
  const candidacy = d.prepare(
    `INSERT INTO candidacy (id, contest_id, person_id, party_version_id, status, party_raw) VALUES (?, ?, ?, ?, ?, NULL)`,
  );
  const stand = (cid: string, n: string, pv: number, win: boolean): void => {
    person.run(`p-${n}`, `Person ${n}`);
    candidacy.run(`d-${n}`, cid, `p-${n}`, pv, win ? "elected" : "defeated");
  };
  stand("c1", "a", 1, true);
  stand("c1", "b", 2, false);
  stand("c1", "c", 2, false);
  stand("c2", "x", 1, true);
  stand("c2", "y", 2, false);
  put(d, "c1", "a", 0, 600, 1, 1, 200);
  put(d, "c1", "b", 0, 400, 2, 0, null);
  put(d, "c1", "c", 0, 20, 3, 0, null);
  put(d, "c2", "x", 0, 700, 1, 1, 300);
  put(d, "c2", "y", 0, 400, 2, 0, null);
  return d;
}

function put(
  d: DatabaseSync,
  contest: string,
  who: string,
  revision: number,
  votes: number,
  rank: number,
  win: 0 | 1,
  margin: number | null,
): void {
  d.prepare(
    `INSERT INTO result (contest_id, candidacy_id, revision, votes, "rank", is_winner, margin, source_id, ingested_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 's1', '2026-08-12')`,
  ).run(contest, `d-${who}`, revision, votes, rank, win, margin);
}

/** A correction as wb-static writes it: the WHOLE field of the contest, at the next revision. */
function correctSeatA(d: DatabaseSync, field: "all three" | "without c"): void {
  put(d, "c1", "a", 1, 590, 1, 1, 150);
  put(d, "c1", "b", 1, 440, 2, 0, null);
  if (field === "all three") put(d, "c1", "c", 1, 20, 3, 0, null);
}

const seatA = (d: DatabaseSync) => readSeats(d, { elections: ["ka-assembly-2018"] }).find((s) => s.placeId === "ka.ac.001");
const seatB = (d: DatabaseSync) => readSeats(d, { elections: ["ka-assembly-2018"] }).find((s) => s.placeId === "ka.ac.002");

test("current_result: on a registry where every row is revision 0 it is the table, row for row", () => {
  const d = fixture();
  try {
    const cols = `contest_id, candidacy_id, revision, votes, "rank", is_winner, margin`;
    const table = all(d, `SELECT ${cols} FROM result ORDER BY contest_id, candidacy_id`);
    const view = all(d, `SELECT ${cols} FROM current_result ORDER BY contest_id, candidacy_id`);
    assert.equal(table.length, 5);
    assert.deepEqual(view, table);
  } finally {
    d.close();
  }
});

test("current_result: a correction is the result, and the row it replaced stays in the table", () => {
  const d = fixture();
  try {
    correctSeatA(d, "all three");
    const now = all<{ candidacy_id: string; revision: number }>(
      d,
      `SELECT candidacy_id, revision FROM current_result WHERE contest_id = 'c1' ORDER BY candidacy_id`,
    );
    assert.deepEqual(
      now.map((r) => [r.candidacy_id, r.revision]),
      [["d-a", 1], ["d-b", 1], ["d-c", 1]],
      "the whole field is read at revision 1",
    );
    const kept = all<{ n: number }>(d, `SELECT COUNT(*) AS n FROM result WHERE contest_id = 'c1' AND revision = 0`);
    assert.equal(kept[0]?.n, 3, "revision 0 is the record of what was said before, and nothing updated it in place");
  } finally {
    d.close();
  }
});

test("current_result: a contest is corrected on its own, and another contest stays where it was", () => {
  const d = fixture();
  try {
    correctSeatA(d, "all three");
    const other = all<{ revision: number }>(d, `SELECT DISTINCT revision FROM current_result WHERE contest_id = 'c2'`);
    assert.deepEqual(other.map((r) => r.revision), [0]);
  } finally {
    d.close();
  }
});

test("current_result: a candidate a correction leaves out has no current result, though the row at revision 0 remains", () => {
  const d = fixture();
  try {
    correctSeatA(d, "without c");
    const c = all(d, `SELECT * FROM current_result WHERE candidacy_id = 'd-c'`);
    assert.equal(c.length, 0, "reading the highest revision per CANDIDACY would have kept showing c's 20 votes");
    const old = all(d, `SELECT * FROM result WHERE candidacy_id = 'd-c' AND revision = 0`);
    assert.equal(old.length, 1);
  } finally {
    d.close();
  }
});

test("readSeats: the seat is read from the corrected revision, and the seat that was not corrected is unchanged", () => {
  const d = fixture();
  try {
    const before = seatA(d);
    assert.equal(before?.winner?.votes, 600);
    assert.equal(before?.margin?.votes, 200);

    correctSeatA(d, "all three");
    const after = seatA(d);
    assert.equal(after?.winner?.name, "Person a", "the same candidate won");
    assert.equal(after?.winner?.votes, 590, "with the corrected count");
    assert.equal(after?.margin?.votes, 150, "and the corrected margin");
    assert.equal(after?.runnerUp?.votes, 440);

    assert.equal(seatB(d)?.winner?.votes, 700, "seat B was not corrected");
  } finally {
    d.close();
  }
});

test("readSeats: a correction can change who won, and then the earlier winner is not read as the winner", () => {
  const d = fixture();
  try {
    put(d, "c1", "a", 1, 450, 2, 0, null);
    put(d, "c1", "b", 1, 470, 1, 1, 20);
    put(d, "c1", "c", 1, 20, 3, 0, null);
    const s = seatA(d);
    assert.equal(s?.winner?.name, "Person b");
    assert.equal(s?.margin?.votes, 20);
    assert.equal(s?.runnerUp?.name, "Person a");
  } finally {
    d.close();
  }
});

test("getPersonBrief: a candidate the correction left out has no result on their page, and the others show the corrected one", () => {
  const d = fixture();
  try {
    correctSeatA(d, "without c");
    const c = getPersonBrief(d, "p-c")?.candidacies[0];
    assert.equal(c?.votes, null, "no current result: the 20 at revision 0 is not shown as if it still stood");
    assert.equal(c?.rank, null);
    const a = getPersonBrief(d, "p-a")?.candidacies[0];
    assert.equal(a?.votes, 590);
    assert.equal(a?.margin, 150);
  } finally {
    d.close();
  }
});

/* ───────────────────────────────── the guards ───────────────────────────────── */

const SRC = new URL("../../../../", import.meta.url); // the repository root

/** Every non-test .ts/.tsx source under the given directories of the repository, as [path from the root, lines]. */
function sources(dirs: readonly string[]): [string, string[]][] {
  const out: [string, string[]][] = [];
  const walk = (rel: string): void => {
    for (const e of readdirSync(new URL(rel, SRC), { withFileTypes: true })) {
      const path = `${rel}${e.name}`;
      if (e.isDirectory()) walk(`${path}/`);
      else if (/\.tsx?$/.test(e.name) && !e.name.endsWith(".test.ts")) out.push([path, readFileSync(new URL(path, SRC), "utf8").split("\n")]);
    }
  };
  for (const d of dirs) walk(d);
  return out;
}
const isComment = (line: string): boolean => /^\s*(\/\/|\*|\/\*)/.test(line);

/**
 * Which revision is current is said once, in the view. A reader that spells `revision = 0` or takes its own
 * MAX(revision) is the same bug as the twenty-odd that did, and it agrees with the others only until the first
 * correction is ingested. Writers (ingest/sources) name revisions because they allocate them; a reader never does.
 * The allow-list is empty and must stay empty.
 */
test("no reader spells a revision: the repo layer, the validators, the report, the export and the coverage probes read current_result", () => {
  const spelled = /\.?\brevision\s*=\s*\d|MAX\(\s*\w*\.?revision\s*\)|CURRENT_REVISION/;
  const found: string[] = [];
  for (const [path, lines] of sources([
    "packages/mandate/src/repo/",
    "packages/mandate/src/ingest/elections/",
    "packages/mandate/src/ingest/geography/",
    "packages/mandate/src/ingest/release/",
    "src/",
  ])) {
    lines.forEach((line, i) => {
      if (!isComment(line) && spelled.test(line)) found.push(`${path}:${i + 1}  ${line.trim().slice(0, 100)}`);
    });
  }
  for (const file of ["export.ts", "field-coverage.ts"]) {
    const path = `packages/mandate/src/ingest/${file}`;
    readFileSync(new URL(path, SRC), "utf8").split("\n").forEach((line, i) => {
      if (!isComment(line) && spelled.test(line)) found.push(`${path}:${i + 1}  ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(found, []);
});

/**
 * THE DIRECT READERS OF `result`. A superseded row stays in the table (D4, D30), so a query over `result` sees the
 * placeholder and the correction beside each other, counts both winners, and shows a dropped candidate a result. Code
 * that wants THE results joins `current_result`; this lists, with the reason, the only files that read the table
 * itself, because they mean every row that was ever written. A new file on this list is a decision, made here.
 */
test("the only code that reads `result` itself is on the list, and each says why every row is meant", () => {
  const allowed: Record<string, string> = {
    "packages/mandate/bin/mandate.ts": "stats: how many rows the table holds",
    "packages/mandate/src/ingest/elections/identity.ts": "the repair tool moves and deletes every row of an election it splits",
    "packages/mandate/src/ingest/geography/validate.ts": "every row cites a source, superseded or not",
    "packages/mandate/src/ingest/release/report.ts": "rows in the table and rows that cite a source, superseded or not",
    "packages/mandate/src/ingest/resolve/index.ts": "invariants hold per revision: each revision is internally consistent, not only the current one",
    "packages/mandate/src/ingest/sources/eci/import.ts": "reads what other sources left, at every revision, to choose its own",
    "packages/mandate/src/ingest/sources/lokdhaba.ts": "a contest another source reported at any revision is not this import's to restate",
    "packages/mandate/src/ingest/sources/wb-static.ts": "allocates revisions, so reads all of them; checks every row's source",
  };
  const reads = /\b(?:FROM|JOIN)\s+result\b/i;
  const found = new Set<string>();
  for (const [path, lines] of sources(["packages/mandate/src/", "packages/mandate/bin/", "src/"])) {
    if (lines.some((l) => !isComment(l) && reads.test(l))) found.add(path);
  }
  assert.deepEqual([...found].sort(), Object.keys(allowed).sort());
});
