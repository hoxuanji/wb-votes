import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  CHRONO_ASC,
  CHRONO_DESC,
  FULL_HOUSE,
  bodyIs,
  bodyWord,
  byElection,
  chipOf,
  chronoAsc,
  chronoDesc,
  currentIds,
  facetOf,
  fullHouse,
  majorityOf,
  typeOf,
} from "./election-kind.ts";

// The four (house, kind) combinations the registry holds — the same four election-context.test.ts pins against
// the live registry. These are the words a reader sees, so the table is the contract.
const REAL: [house: string, kind: string, body: string, fill: string, type: string][] = [
  ["ac", "assembly", "assembly", "general", "Assembly Election"],
  ["pc", "general", "lok-sabha", "general", "Lok Sabha Election"],
  ["ac", "bypoll", "assembly", "bypoll", "Assembly By-election"],
  ["pc", "bypoll", "lok-sabha", "bypoll", "Lok Sabha By-election"],
];

test("facetOf: the four real house/kind combinations decode to body, fill and type", () => {
  for (const [house, kind, body, fill, type] of REAL) {
    assert.deepEqual(facetOf(house, kind), { body, fill, type }, `${house}/${kind}`);
  }
});

test("facetOf: a pair the product does not label throws, naming the pair", () => {
  // The schema allows house 'none' and seven kinds; only four combinations are labelled.
  assert.throws(() => facetOf("none", "municipal"), /house 'none' with kind 'municipal'/);
  assert.throws(() => facetOf("none", "bypoll"), /house 'none' with kind 'bypoll'/);
  assert.throws(() => facetOf("ac", "municipal"), /house 'ac' with kind 'municipal'/);
  // 'general' is a parliamentary kind and 'assembly' an assembly one; crossed, they have no name either.
  assert.throws(() => facetOf("ac", "general"), /house 'ac' with kind 'general'/);
  assert.throws(() => facetOf("pc", "assembly"), /house 'pc' with kind 'assembly'/);
});

test("typeOf: the type label is body plus fill, in a reader's words", () => {
  assert.equal(typeOf("assembly", "general"), "Assembly Election");
  assert.equal(typeOf("lok-sabha", "bypoll"), "Lok Sabha By-election");
  for (const [house, kind, body, fill, type] of REAL) {
    assert.equal(typeOf(body as "assembly" | "lok-sabha", fill as "general" | "bypoll"), type, `${house}/${kind}`);
  }
});

test("bodyWord: the body in a reader's word", () => {
  assert.equal(bodyWord("assembly"), "Assembly");
  assert.equal(bodyWord("lok-sabha"), "Lok Sabha");
});

test("chipOf: a year picker label — only a Lok Sabha year names its body, only a by-election says by-poll", () => {
  assert.equal(chipOf("assembly", "general", 2021), "2021");
  assert.equal(chipOf("assembly", "bypoll", 2021), "2021 by-poll");
  assert.equal(chipOf("lok-sabha", "general", 2019), "LS 2019");
  assert.equal(chipOf("lok-sabha", "bypoll", 2019), "LS 2019 by-poll");
});

test("majorityOf: more than half the seats contested for a full house", () => {
  assert.equal(majorityOf(224, "general"), 113);
  assert.equal(majorityOf(543, "general"), 272);
  assert.equal(majorityOf(294, "general"), 148);
  // The house that voted, not today's strength: 252 members returned is a majority of 127.
  assert.equal(majorityOf(252, "general"), 127);
  assert.equal(majorityOf(1, "general"), 1);
  // No seats contested is not guarded: it is 1, as the arithmetic has always had it.
  assert.equal(majorityOf(0, "general"), 1);
});

test("majorityOf: a by-election has no majority, however many seats were contested", () => {
  for (const n of [0, 1, 4, 5, 224]) assert.equal(majorityOf(n, "bypoll"), null, `${n} seats`);
});

test("FULL_HOUSE: keeps every election but a by-election, with the election table aliased e", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE election (id TEXT PRIMARY KEY, kind TEXT NOT NULL)`);
  const ins = db.prepare(`INSERT INTO election (id, kind) VALUES (?, ?)`);
  for (const [id, kind] of [["a", "assembly"], ["b", "general"], ["c", "bypoll"]] as const) ins.run(id, kind);
  const ids = db.prepare(`SELECT e.id AS id FROM election e WHERE ${FULL_HOUSE} ORDER BY e.id`).all();
  assert.deepEqual(ids.map((r) => r["id"]), ["a", "b"]);
  db.close();
});

// Both fragments are exercised against every kind the schema allows, so "not a by-election" and "a by-election"
// are shown to partition the table rather than merely to be spelled differently.
const KINDS = ["general", "assembly", "biennial_rs", "municipal", "panchayat", "bypoll", "presidential"];

// `alias` is the election table's alias, or "election" for a query that gives it none.
function kindsWhere(alias: string, where: string): string[] {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE election (id TEXT PRIMARY KEY, kind TEXT NOT NULL)`);
  const ins = db.prepare(`INSERT INTO election (id, kind) VALUES (?, ?)`);
  for (const kind of KINDS) ins.run(kind, kind);
  const from = alias === "election" ? "election" : `election ${alias}`;
  const rows = db.prepare(`SELECT ${alias}.id AS id FROM ${from} WHERE ${where} ORDER BY ${alias}.id`).all();
  db.close();
  return rows.map((r) => String(r["id"]));
}

test("fullHouse and byElection take the election table's alias, and partition every kind between them", () => {
  const allKinds = [...KINDS].sort();
  const notBypoll = allKinds.filter((k) => k !== "bypoll");
  assert.deepEqual(kindsWhere("x", fullHouse("x")), notBypoll);
  assert.deepEqual(kindsWhere("x", byElection("x")), ["bypoll"]);
  // The default alias is e, and FULL_HOUSE is exactly it.
  assert.deepEqual(kindsWhere("e", fullHouse()), notBypoll);
  assert.deepEqual(kindsWhere("e", byElection()), ["bypoll"]);
  assert.equal(FULL_HOUSE, fullHouse("e"));
  assert.doesNotMatch(fullHouse("x"), /\be\./, "an aliased fragment still names e");
  assert.doesNotMatch(byElection("x"), /\be\./, "an aliased fragment still names e");
});

test("fullHouse and byElection accept the table's own name where the query gives it no alias", () => {
  // `FROM election WHERE election.kind = 'bypoll'` — how the unaliased count queries qualify the column.
  assert.deepEqual(kindsWhere("election", byElection("election")), ["bypoll"]);
  assert.deepEqual(
    kindsWhere("election", fullHouse("election")),
    [...KINDS].sort().filter((k) => k !== "bypoll"),
  );
});

// Chronology is (year, polling_month, occurrence); the id string is only the last tie-break. Every id below is
// chosen so that sorting by id would get the answer wrong.
const ELECTIONS: [id: string, year: number, month: number | null, occurrence: number][] = [
  // Bihar 2005 held two assembly elections, in February and in October.
  ["br-assembly-2005-02", 2005, 2, 1],
  ["br-assembly-2005-10", 2005, 10, 2],
  // Nobody sourced the month: it ranks as the earliest of its year, whatever its id says.
  ["ka-assembly-2018", 2018, 3, 1],
  ["ka-bypoll-ae-2018", 2018, null, 1],
  // By id the election after `wb-bypoll-ae-2021` is `wb-bypoll-ge-2016`, five years EARLIER.
  ["wb-bypoll-ae-2021", 2021, null, 1],
  ["wb-bypoll-ge-2016", 2016, 5, 1],
  // Same year, both months unknown: the occurrence says which came first, though the ids say the opposite.
  ["xx-b", 2010, null, 1],
  ["xx-a", 2010, null, 2],
  // The very same chronology key: the id decides, so the order is total.
  ["yy-1", 2000, 1, 1],
  ["yy-2", 2000, 1, 1],
];

// Newest first.
const NEWEST_FIRST = [
  "wb-bypoll-ae-2021",
  "ka-assembly-2018",
  "ka-bypoll-ae-2018",
  "wb-bypoll-ge-2016",
  "xx-a",
  "xx-b",
  "br-assembly-2005-10",
  "br-assembly-2005-02",
  "yy-2",
  "yy-1",
];

function electionIds(orderBy: string, alias = "e"): string[] {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE election (id TEXT PRIMARY KEY, year INTEGER NOT NULL, polling_month INTEGER,
                                  occurrence INTEGER NOT NULL)`);
  const ins = db.prepare(`INSERT INTO election (id, year, polling_month, occurrence) VALUES (?, ?, ?, ?)`);
  for (const [id, year, month, occurrence] of ELECTIONS) ins.run(id, year, month, occurrence);
  const rows = db.prepare(`SELECT ${alias}.id AS id FROM election ${alias} ORDER BY ${orderBy}`).all();
  db.close();
  return rows.map((r) => String(r["id"]));
}

test("chronoDesc: newest first by year, month, occurrence — never by the id string", () => {
  assert.deepEqual(electionIds(chronoDesc()), NEWEST_FIRST);
  // The fixture would be pointless if the id order happened to agree.
  assert.notDeepEqual(electionIds("e.id DESC"), NEWEST_FIRST);
});

test("chronoAsc: oldest first, the exact reverse of chronoDesc", () => {
  assert.deepEqual(electionIds(chronoAsc()), [...NEWEST_FIRST].reverse());
});

test("chronoDesc and chronoAsc coalesce a missing polling month, the spelling both dialects agree on", () => {
  // SQLite sorts NULL smallest and Postgres largest, so a bare `polling_month` ranks the same elections
  // differently in dev and prod (ADR 0001). SQLite cannot show that, so pin the spelling.
  assert.equal(chronoDesc(), "e.year DESC, COALESCE(e.polling_month, 0) DESC, e.occurrence DESC, e.id DESC");
  assert.equal(chronoAsc(), "e.year ASC, COALESCE(e.polling_month, 0) ASC, e.occurrence ASC, e.id ASC");
});

test("chronoDesc and chronoAsc take the election table's alias, and the constants are the alias e", () => {
  assert.deepEqual(electionIds(chronoDesc("x"), "x"), NEWEST_FIRST);
  assert.deepEqual(electionIds(chronoAsc("e2"), "e2"), [...NEWEST_FIRST].reverse());
  assert.doesNotMatch(chronoDesc("e2"), /\be\./, "an aliased fragment still names e");
  assert.equal(CHRONO_DESC, chronoDesc("e"));
  assert.equal(CHRONO_ASC, chronoAsc("e"));
});

// An election table in miniature: the columns `bodyIs` and `currentIds` filter and rank on, and nothing else.
type Row = [id: string, house: string, kind: string, j: string, year: number, month: number | null, occ: number];

function electionsWhere(where: string, rows: Row[]): string[] {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE election (id TEXT PRIMARY KEY, house TEXT NOT NULL, kind TEXT NOT NULL,
                                  jurisdiction_place_id TEXT NOT NULL, year INTEGER NOT NULL,
                                  polling_month INTEGER, occurrence INTEGER NOT NULL)`);
  const ins = db.prepare(`INSERT INTO election VALUES (?, ?, ?, ?, ?, ?, ?)`);
  for (const r of rows) ins.run(...r);
  const found = db.prepare(`SELECT e.id AS id FROM election e WHERE ${where} ORDER BY e.id`).all();
  db.close();
  return found.map((r) => String(r["id"]));
}

test("bodyIs: the assembly and the Lok Sabha partition the elections, and an unlabelled house is neither", () => {
  const rows: Row[] = [
    ["a", "ac", "assembly", "ka", 2023, 5, 1],
    ["p", "pc", "general", "in", 2024, 4, 1],
    ["n", "none", "municipal", "ka", 2022, null, 1],
  ];
  assert.deepEqual(electionsWhere(bodyIs("assembly"), rows), ["a"]);
  assert.deepEqual(electionsWhere(bodyIs("lok-sabha"), rows), ["p"]);
});

// Every row is placed so that ranking by id, or by the newest row of any kind, would name the wrong election.
const CURRENT: Row[] = [
  // Bihar 2005 held two assembly elections. The October one is current although its id sorts first.
  ["br-assembly-2005-a", "ac", "assembly", "br", 2005, 10, 2],
  ["br-assembly-2005-z", "ac", "assembly", "br", 2005, 2, 1],
  // A by-election newer than the house's election does not replace it.
  ["ka-assembly-2013", "ac", "assembly", "ka", 2013, 5, 1],
  ["ka-assembly-2018", "ac", "assembly", "ka", 2018, 5, 1],
  ["ka-bypoll-ae-2021", "ac", "bypoll", "ka", 2021, null, 1],
  // Jammu & Kashmir's newest row is a single-seat by-election.
  ["jk-assembly-2014", "ac", "assembly", "jk", 2014, 12, 1],
  ["jk-bypoll-ae-2017", "ac", "bypoll", "jk", 2017, null, 1],
  // A jurisdiction with by-elections only has no current assembly election.
  ["wb-bypoll-ae-2021", "ac", "bypoll", "wb", 2021, null, 1],
  // An unsourced month ranks as the earliest of its year, so the dated election is the later one.
  ["tn-assembly-2021-a", "ac", "assembly", "tn", 2021, 4, 1],
  ["tn-assembly-2021-z", "ac", "assembly", "tn", 2021, null, 1],
  // The Lok Sabha is one row for the union, and a parliamentary by-election in a state is not it.
  ["ls-2019", "pc", "general", "in", 2019, 4, 1],
  ["ls-2024", "pc", "general", "in", 2024, 4, 1],
  ["ka-bypoll-ge-2025", "pc", "bypoll", "ka", 2025, null, 1],
];

test("currentIds: each jurisdiction's newest full-house election of the body, by chronology", () => {
  const assembly = electionsWhere(`e.id IN (${currentIds("assembly")})`, CURRENT);
  assert.deepEqual(assembly, ["br-assembly-2005-a", "jk-assembly-2014", "ka-assembly-2018", "tn-assembly-2021-a"]);
  assert.deepEqual(electionsWhere(`e.id IN (${currentIds("lok-sabha")})`, CURRENT), ["ls-2024"]);
});

test("currentIds binds nothing, so it composes with the caller's own predicates", () => {
  assert.doesNotMatch(currentIds("assembly"), /\?/);
  // The fragment's inner `e` is its own: the outer query's `e` narrows the result without changing the rule.
  const found = electionsWhere(`e.id IN (${currentIds("assembly")}) AND e.jurisdiction_place_id = 'ka'`, CURRENT);
  assert.deepEqual(found, ["ka-assembly-2018"]);
});
