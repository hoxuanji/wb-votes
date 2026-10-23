// Writing rows into the registry: the upsert statement, an atomic block, and a batch writer that checks its rows
// against the table catalog before it writes any of them.
//
// Not exported through db/index.ts, which the Next bundle imports and the app never writes through.

import type { DatabaseSync } from "node:sqlite";
import { checkWrite, describeTable } from "./catalog.ts";
import { insertMany } from "./index.ts";
import type { Param } from "./index.ts";

/** `INSERT ... ON CONFLICT (key) DO UPDATE SET <every non-key column>`. One generator instead of
 *  twenty hand-written statements that drift from the DDL. */
export function upsertSql(table: string, cols: readonly string[], key: readonly string[]): string {
  const set = cols.filter((c) => !key.includes(c)).map((c) => `${c}=excluded.${c}`);
  return (
    `INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})` +
    ` ON CONFLICT (${key.join(",")}) DO ${set.length ? `UPDATE SET ${set.join(",")}` : "NOTHING"}`
  );
}

/**
 * Runs `body` as one unit: everything it wrote is kept if it returns and none of it if it throws. A SAVEPOINT
 * rather than BEGIN, for the reason `insertMany` is one: it commits when it is the outermost, and nested inside
 * a caller's it undoes only its own writes. The error that stopped `body` is the one rethrown.
 */
export function atomically<T>(db: DatabaseSync, name: string, body: () => T): T {
  db.exec(`SAVEPOINT ${name}`);
  try {
    const out = body();
    db.exec(`RELEASE ${name}`);
    return out;
  } catch (cause) {
    db.exec(`ROLLBACK TO ${name}`);
    db.exec(`RELEASE ${name}`);
    throw cause;
  }
}

/**
 * `upsertSql` for every row of one table, after checking that the columns, the key and each row's length fit
 * the table as the DDL declares it. All of that is checked before any SQL that writes runs, so a bad batch
 * leaves the registry as it was. Returns rows written.
 */
export function putRows(
  db: DatabaseSync,
  table: string,
  cols: readonly string[],
  key: readonly string[],
  rows: Iterable<Param[]>,
): number {
  const list = [...rows];
  const t = describeTable(db, table);
  if (t === undefined) throw new Error(`${table}: no such table`);
  checkWrite(t, cols, key, list);
  return list.length === 0 ? 0 : insertMany(db, upsertSql(table, cols, key), list);
}
