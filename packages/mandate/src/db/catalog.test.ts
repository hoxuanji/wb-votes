// The table catalog, read from a registry built through the real migrations.
//
// The catalog is only worth having if it says what SQLite itself would do, so the key sets are checked against
// SQLite's own refusal of an ON CONFLICT target that is not a key, not against a second copy of the answer.

import assert from "node:assert/strict";
import test from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { catalog, checkWrite, checkedValues, describeTable } from "./catalog.ts";
import { all, open } from "./index.ts";
import { migrate } from "./migrate.ts";

const NOW = "2026-08-12T00:00:00.000Z";

const db: DatabaseSync = open(":memory:");
migrate(db, NOW);

const tableNames = all<{ name: string }>(
  db,
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
).map((r) => r.name);

test("the catalog has every table the migrations created, in the DDL's column order, and no view", () => {
  const cat = catalog(db);
  assert.deepEqual([...cat.keys()], tableNames);
  for (const t of ["source", "place_version", "candidacy", "result", "claim", "schema_migration"]) assert.ok(cat.has(t), t);
  for (const name of tableNames) {
    const want = all<{ name: string }>(db, `PRAGMA table_info(${name})`).map((c) => c.name);
    assert.deepEqual(cat.get(name)?.columns.map((c) => c.name), want, name);
  }
  assert.equal(cat.has("voting_epoch"), false, "voting_epoch is a view, and nothing writes to a view");
  assert.equal(describeTable(db, "voting_epoch"), undefined);
  assert.equal(describeTable(db, "no_such_table"), undefined);
});

test("a column is required when it is NOT NULL with no default; a rowid alias and a nullable column are not", () => {
  const candidacy = describeTable(db, "candidacy");
  const required = (t: typeof candidacy): string[] =>
    (t?.columns ?? []).filter((c) => c.notnull && !c.hasDefault).map((c) => c.name);
  assert.deepEqual(required(candidacy), ["id", "contest_id", "person_id", "status"]);
  const placeVersion = describeTable(db, "place_version");
  // name_conflict and name_variants are NOT NULL DEFAULT: the DDL supplies them.
  assert.equal(placeVersion?.columns.find((c) => c.name === "name_conflict")?.notnull, true);
  assert.equal(placeVersion?.columns.find((c) => c.name === "name_conflict")?.hasDefault, true);
  assert.ok(!required(placeVersion).includes("name_conflict"));
  // An INTEGER PRIMARY KEY is filled by SQLite, so a write may leave it out.
  assert.equal(placeVersion?.columns.find((c) => c.name === "id")?.notnull, false);
});

test("the keys are the primary key and each full UNIQUE constraint, as the tables declare them", () => {
  const keys = (t: string): string[] => (describeTable(db, t)?.keys ?? []).map((k) => k.join(",")).sort();
  assert.deepEqual(keys("source"), ["id"]);
  assert.deepEqual(keys("person_identifier"), ["scheme,value"]);
  assert.deepEqual(keys("result"), ["contest_id,candidacy_id,revision"]);
  // candidacy: PRIMARY KEY (id) and UNIQUE (contest_id, person_id), the ER hard negative.
  assert.deepEqual(keys("candidacy"), ["contest_id,person_id", "id"]);
  assert.ok(keys("claim").includes("content_key"));
  assert.ok(keys("party_version").includes("party_id,valid_from"));
});

test("every key the catalog reports is an ON CONFLICT target SQLite accepts, and every column set it does not is refused", () => {
  const target = (table: string, key: readonly string[], first: string): void => {
    db.prepare(`INSERT INTO ${table} (${first}) VALUES (NULL) ON CONFLICT (${key.join(",")}) DO NOTHING`);
  };
  let accepted = 0;
  let refused = 0;
  for (const [name, t] of catalog(db)) {
    const cols = t.columns.map((c) => c.name);
    const first = cols[0] as string;
    const isKey = (set: readonly string[]): boolean => t.keys.some((k) => k.length === set.length && k.every((c) => set.includes(c)));
    for (const k of t.keys) {
      target(name, k, first);
      accepted += 1;
    }
    // Every single column and every pair: if SQLite takes one the catalog calls a non-key, the catalog is short.
    const sets = cols.flatMap((a, i) => [[a], ...cols.slice(i + 1).map((b) => [a, b])]);
    for (const set of sets) {
      let sqliteAccepts = true;
      try {
        target(name, set, first);
      } catch {
        sqliteAccepts = false;
      }
      assert.equal(isKey(set), sqliteAccepts, `${name} (${set.join(", ")}): catalog says key=${isKey(set)}, SQLite says ${sqliteAccepts}`);
      if (!sqliteAccepts) refused += 1;
    }
  }
  assert.ok(accepted >= tableNames.length, `${accepted} keys checked for ${tableNames.length} tables`);
  assert.ok(refused > 500, `${refused} refusals checked`);
});

test("an index that cannot be a conflict target is not a key: partial, on an expression, or not unique", () => {
  const scratch = open(":memory:");
  scratch.exec(
    `CREATE TABLE t (id INTEGER PRIMARY KEY, a TEXT, b TEXT, c TEXT, d TEXT, e TEXT, UNIQUE (a, b));
     CREATE UNIQUE INDEX t_c ON t (c) WHERE c IS NOT NULL;
     CREATE UNIQUE INDEX t_d ON t (lower(d));
     CREATE INDEX t_e ON t (e);`,
  );
  assert.deepEqual(describeTable(scratch, "t")?.keys, [["id"], ["a", "b"]]);
  // SQLite agrees: it takes none of the three as a target by its columns.
  for (const c of ["c", "d", "e"]) {
    assert.throws(() => scratch.prepare(`INSERT INTO t (id) VALUES (1) ON CONFLICT (${c}) DO NOTHING`), /does not match any PRIMARY KEY or UNIQUE/, c);
  }
  scratch.close();
});

test("CHECK vocabularies are read from the CREATE TABLE text, comments removed", () => {
  assert.deepEqual(checkedValues(describeTable(db, "person")?.sql ?? "", "sex"), ["m", "f", "o"]);
  assert.deepEqual(checkedValues(describeTable(db, "person")?.sql ?? "", "canonical_name"), []);
  // The `--` comments of 001 contain apostrophes; left in, they would be read as literals.
  assert.ok(!(describeTable(db, "source")?.sql ?? "").includes("--"));
});

test("checkWrite names the table, and the column, key or row that does not fit", () => {
  const person = describeTable(db, "person");
  assert.ok(person !== undefined);
  const cols = ["id", "canonical_name", "names", "review_state", "created_at"];
  const row = ["p1", "A", "{}", "auto", NOW];
  checkWrite(person, cols, ["id"], [row]);
  checkWrite(person, cols, ["id"], []);
  assert.throws(() => checkWrite(person, [...cols, "nme"], ["id"], []), /person: no column 'nme'/);
  assert.throws(() => checkWrite(person, [...cols, "id"], ["id"], []), /person: column 'id' is named twice/);
  assert.throws(() => checkWrite(person, cols.slice(0, 4), ["id"], []), /leave out created_at/);
  assert.throws(() => checkWrite(person, cols, [], []), /names no column/);
  assert.throws(() => checkWrite(person, cols, ["canonical_name"], []), /not the primary key or a UNIQUE constraint/);
  assert.throws(() => checkWrite(person, cols, ["id", "names"], []), /not the primary key or a UNIQUE constraint/);
  assert.throws(() => checkWrite(person, cols, ["sex"], []), /key column 'sex' is not among the columns written/);
  assert.throws(() => checkWrite(person, cols, ["id"], [row, row.slice(0, 4)]), /rows\[1\] has 4 values for the 5 columns/);
  assert.throws(() => checkWrite(person, cols, ["id"], [[...row, null]]), /rows\[0\] has 6 values for the 5 columns/);
});

test("checkWrite lets a NOT NULL column with a default, and a rowid alias, be left out", () => {
  const placeVersion = describeTable(db, "place_version");
  assert.ok(placeVersion !== undefined);
  const required = placeVersion.columns.filter((c) => c.notnull && !c.hasDefault).map((c) => c.name);
  assert.ok(!required.includes("name_conflict") && !required.includes("name_variants"), "both are NOT NULL DEFAULT");
  assert.ok(placeVersion.columns.some((c) => c.name === "name_conflict" && c.notnull && c.hasDefault));
  // `id` is an INTEGER PRIMARY KEY, so it is not among the required columns but is the key written.
  checkWrite(placeVersion, ["id", ...required], ["id"], []);
});

test("a quoted column name is the column it quotes", () => {
  const result = describeTable(db, "result");
  assert.ok(result !== undefined);
  const cols = ["contest_id", "candidacy_id", "revision", '"rank"', "is_winner", "source_id", "ingested_at"];
  checkWrite(result, cols, ["contest_id", "candidacy_id", "revision"], [["c", "a", 0, 1, 1, "s", NOW]]);
  assert.throws(() => checkWrite(result, ['"rnk"', ...cols.slice(0, 3)], ["contest_id"], []), /no column 'rnk'/);
});
