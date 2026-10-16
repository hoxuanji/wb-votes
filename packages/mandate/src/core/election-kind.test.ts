import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { FULL_HOUSE, facetOf, majorityOf, typeOf } from "./election-kind.ts";

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
