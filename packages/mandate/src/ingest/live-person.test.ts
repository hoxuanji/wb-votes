// mergeRoutes: who an id stands for once `mandate resolve` has merged people.

import assert from "node:assert/strict";
import test from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { open } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";
import { mergeRoutes } from "./live-person.ts";

const NOW = "2026-08-12T00:00:00.000Z";

/** Ledger rows only: person_merge's `merged_id` has no foreign key by design, and its survivors are people. */
function registry(persons: string[], merges: [id: number, merged: string, surviving: string, reverted?: string][]): DatabaseSync {
  const d = open(":memory:");
  migrate(d, NOW);
  for (const p of persons) {
    d.prepare("INSERT INTO person (id, canonical_name, canonical_name_script, created_at) VALUES (?, ?, 'latn', ?)").run(p, p, NOW);
  }
  for (const [id, merged, surviving, reverted] of merges) {
    d.prepare(
      "INSERT INTO person_merge (id, surviving_id, merged_id, score, decided_by, decided_at, evidence, reverted_at) VALUES (?,?,?,1,'auto:v1',?,'{}',?)",
    ).run(id, surviving, merged, NOW, reverted ?? null);
  }
  return d;
}

test("an id nothing has absorbed is its own live person, and an empty ledger has no routes", () => {
  const d = registry(["a", "b"], []);
  const { size, livePerson } = mergeRoutes(d);
  assert.equal(size, 0);
  assert.equal(livePerson("a"), "a");
  assert.equal(livePerson("never-heard-of"), "never-heard-of");
  d.close();
});

test("an absorbed id is routed to its survivor, through a chain of merges", () => {
  // c was absorbed into b, and b later into a
  const d = registry(["a", "b"], [[1, "c", "b"], [2, "b", "a"]]);
  const { size, livePerson } = mergeRoutes(d);
  assert.equal(size, 2);
  assert.equal(livePerson("c"), "a");
  assert.equal(livePerson("b"), "a");
  assert.equal(livePerson("a"), "a");
  d.close();
});

test("a merge that has been reverted routes nothing", () => {
  const d = registry(["a"], [[1, "b", "a", NOW]]);
  const { size, livePerson } = mergeRoutes(d);
  assert.equal(size, 0);
  assert.equal(livePerson("b"), "b");
  d.close();
});

test("a ledger that loops is cut off, not followed for ever", () => {
  const d = registry(["a", "b"], [[1, "a", "b"], [2, "b", "a"]]);
  const { livePerson } = mergeRoutes(d);
  assert.ok(["a", "b"].includes(livePerson("a")));
  d.close();
});
