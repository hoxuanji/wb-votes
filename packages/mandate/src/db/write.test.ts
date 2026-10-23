// `upsertSql`, `atomically` and `putRows` on an in-memory registry built through the real migrations.

import assert from "node:assert/strict";
import test from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { all, get, insertMany, open } from "./index.ts";
import { migrate } from "./migrate.ts";
import { atomically, putRows, upsertSql } from "./write.ts";

const NOW = "2026-08-12T00:00:00.000Z";

function registry(): DatabaseSync {
  const d = open(":memory:");
  migrate(d, NOW);
  return d;
}

/** The same connection, recording every statement handed to prepare() or exec(). */
function spied(d: DatabaseSync): { db: DatabaseSync; sql: string[] } {
  const sql: string[] = [];
  const db = new Proxy(d, {
    get(target, prop) {
      const v = Reflect.get(target, prop) as unknown;
      if (typeof v !== "function") return v;
      if (prop === "prepare" || prop === "exec") {
        return (text: string, ...rest: unknown[]) => {
          sql.push(text);
          return (v as (...a: unknown[]) => unknown).call(target, text, ...rest);
        };
      }
      return (v as (...a: unknown[]) => unknown).bind(target);
    },
  });
  return { db, sql };
}
/** BEGIN fails inside a transaction, so this passes only when no savepoint is left open. */
const idle = (d: DatabaseSync): void => {
  d.exec("BEGIN");
  d.exec("ROLLBACK");
};
const writes = (sql: string[]): string[] => sql.filter((s) => /^\s*(INSERT|UPDATE|DELETE|SAVEPOINT|RELEASE|ROLLBACK|BEGIN)/i.test(s));

const SOURCE = ["id", "kind", "title", "retrieved_at", "doc_hash", "hash_kind", "retrieval_kind"];
const src = (id: string, title: string | null): (string | null)[] =>
  [id, "eci_declaration", title, NOW, "h", "document_bytes", "fetched"];
const titles = (d: DatabaseSync): Record<string, string | null> =>
  Object.fromEntries(all<{ id: string; title: string | null }>(d, "SELECT id, title FROM source ORDER BY id").map((r) => [r.id, r.title]));

test("upsertSql updates every non-key column on conflict, and does nothing when the key is every column", () => {
  assert.equal(
    upsertSql("person_identifier", ["person_id", "scheme", "value", "source_id"], ["scheme", "value"]),
    "INSERT INTO person_identifier (person_id,scheme,value,source_id) VALUES (?,?,?,?)" +
      " ON CONFLICT (scheme,value) DO UPDATE SET person_id=excluded.person_id,source_id=excluded.source_id",
  );
  assert.equal(
    upsertSql("alliance_member", ["a", "b"], ["a", "b"]),
    "INSERT INTO alliance_member (a,b) VALUES (?,?) ON CONFLICT (a,b) DO NOTHING",
  );
  assert.equal(
    upsertSql("result", ["contest_id", '"rank"', "votes"], ["contest_id"]),
    'INSERT INTO result (contest_id,"rank",votes) VALUES (?,?,?) ON CONFLICT (contest_id) DO UPDATE SET "rank"=excluded."rank",votes=excluded.votes',
  );
});

test("a good batch is written, and a second batch on the same key replaces the other columns", () => {
  const d = registry();
  assert.equal(putRows(d, "source", SOURCE, ["id"], [src("s1", "first"), src("s2", "second")]), 2);
  assert.deepEqual(titles(d), { s1: "first", s2: "second" });
  assert.equal(putRows(d, "source", SOURCE, ["id"], [src("s1", "changed"), src("s3", "third")]), 2);
  assert.deepEqual(titles(d), { s1: "changed", s2: "second", s3: "third" });
});

test("rows may be any iterable, and a batch of none writes nothing but is still checked", () => {
  const d = registry();
  assert.equal(putRows(d, "source", SOURCE, ["id"], new Map([["s1", src("s1", "x")]]).values()), 1);
  const { db, sql } = spied(d);
  assert.equal(putRows(db, "source", SOURCE, ["id"], []), 0);
  assert.deepEqual(writes(sql), []);
  assert.throws(() => putRows(d, "source", [...SOURCE, "oops"], ["id"], []), /source: no column 'oops'/);
});

test("a short row, a long row and an unknown column each throw before any SQL that writes", () => {
  const d = registry();
  const cases: [string, string[], string[], (string | null)[][], RegExp][] = [
    ["short", SOURCE, ["id"], [src("s1", "ok"), src("s2", "ok").slice(0, 6)], /source: rows\[1\] has 6 values for the 7 columns/],
    ["long", SOURCE, ["id"], [src("s1", "ok"), [...src("s2", "ok"), "extra"]], /source: rows\[1\] has 8 values for the 7 columns/],
    ["unknown column", [...SOURCE, "titel"], ["id"], [[...src("s1", "ok"), "x"]], /source: no column 'titel'/],
    ["a NOT NULL column left out", SOURCE.filter((c) => c !== "doc_hash"), ["id"], [], /leave out doc_hash/],
    ["a key that is not unique", SOURCE, ["title"], [src("s1", "ok")], /\(title\) is not the primary key or a UNIQUE constraint/],
    ["a key outside the columns", SOURCE.filter((c) => c !== "title"), ["title"], [], /key column 'title' is not among the columns written/],
  ];
  for (const [what, cols, key, rows, message] of cases) {
    const { db, sql } = spied(d);
    assert.throws(() => putRows(db, "source", cols, key, rows), message, what);
    assert.deepEqual(writes(sql), [], `${what}: SQL that writes ran`);
    assert.deepEqual(titles(d), {}, `${what}: a row was written`);
  }
  assert.throws(() => putRows(d, "no_such_table", ["id"], ["id"], []), /no_such_table: no such table/);
  assert.throws(() => putRows(d, "voting_epoch", ["id"], ["id"], []), /voting_epoch: no such table/);
});

test("the hazard putRows exists for: through upsertSql alone a short row blanks the stored value", () => {
  const d = registry();
  const wide = [...SOURCE, "publisher"];
  const publisher = (id: string): string | null | undefined =>
    get<{ publisher: string | null }>(d, "SELECT publisher FROM source WHERE id = ?", id)?.publisher;
  putRows(d, "source", wide, ["id"], [[...src("s1", "t"), "ECI"], [...src("s2", "t"), "ECI"]]);
  // One value short: SQLite binds NULL for the last column, and DO UPDATE writes it over "ECI".
  insertMany(d, upsertSql("source", wide, ["id"]), [src("s1", "t")]);
  assert.equal(publisher("s1"), null);
  // The same row through putRows is refused and the stored value stays.
  assert.throws(() => putRows(d, "source", wide, ["id"], [src("s2", "t")]), /rows\[0\] has 7 values for the 8 columns/);
  assert.equal(publisher("s2"), "ECI");
});

test("atomically keeps what the body wrote when it returns, and returns the body's value", () => {
  const d = registry();
  const out = atomically(d, "unit", () => {
    putRows(d, "source", SOURCE, ["id"], [src("s1", "a")]);
    return 7;
  });
  assert.equal(out, 7);
  assert.deepEqual(titles(d), { s1: "a" });
  idle(d); // the savepoint was released
});

test("atomically undoes everything the body wrote when it throws, and rethrows that error", () => {
  const d = registry();
  const boom = new Error("boom");
  assert.throws(
    () =>
      atomically(d, "unit", () => {
        putRows(d, "source", SOURCE, ["id"], [src("s1", "a")]);
        putRows(d, "source", SOURCE, ["id"], [src("s2", "b")]);
        throw boom;
      }),
    (e) => e === boom,
  );
  assert.deepEqual(titles(d), {});
  idle(d);
});

test("nested in a caller's savepoint, atomically undoes only its own writes", () => {
  const d = registry();
  atomically(d, "outer", () => {
    putRows(d, "source", SOURCE, ["id"], [src("kept", "outer")]);
    assert.throws(() =>
      atomically(d, "inner", () => {
        putRows(d, "source", SOURCE, ["id"], [src("lost", "inner")]);
        throw new Error("inner");
      }),
    );
  });
  assert.deepEqual(titles(d), { kept: "outer" });
});

test("a batch that fails in the middle leaves none of its rows, and an import around it leaves none of its tables", () => {
  const d = registry();
  // The second row breaks the CHECK on source.kind, after the first has been written.
  const bad = ["s2", "not_a_kind", "t", NOW, "h", "document_bytes", "fetched"];
  assert.throws(() => putRows(d, "source", SOURCE, ["id"], [src("s1", "a"), bad]), /constraint/i);
  assert.deepEqual(titles(d), {});
  assert.throws(() =>
    atomically(d, "import", () => {
      putRows(d, "source", SOURCE, ["id"], [src("s1", "a")]);
      putRows(d, "source", SOURCE, ["id"], [bad]);
    }),
  );
  assert.deepEqual(titles(d), {});
});
