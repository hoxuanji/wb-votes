import type { DatabaseSync } from "node:sqlite";

export { DEV_DB_PATH, open, openRead } from "./open.ts";
// migrate/MIGRATIONS_DIR are deliberately NOT re-exported here. `migrate` reads ops/migrations/ from
// disk at call time, and webpack cannot resolve a directory read, so every module that reached the
// registry through this barrel dragged an unresolvable import into the app build:
//   Module not found: Can't resolve '../../../../ops/migrations/'
// Migrating is a CLI and test concern; import it from "./migrate.ts" directly where it is needed.

/** What node:sqlite will bind. Booleans are not on the list — pass 0/1 for INTEGER flags. */
export type Param = null | number | bigint | string | Uint8Array;

/** One row, or undefined. The caller names the row shape; SQLite cannot check it. */
export function get<T>(db: DatabaseSync, sql: string, ...params: Param[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

export function all<T>(db: DatabaseSync, sql: string, ...params: Param[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}

/**
 * One prepared statement, one transaction, N rows. 2920 candidacies row-by-row in autocommit is
 * ~40s (one fsync per row); inside a transaction it is ~200ms. Returns rows written.
 */
export function insertMany(db: DatabaseSync, sql: string, rows: readonly Param[][]): number {
  const stmt = db.prepare(sql);
  db.exec("BEGIN");
  try {
    for (const row of rows) stmt.run(...row);
    db.exec("COMMIT");
  } catch (cause) {
    db.exec("ROLLBACK");
    throw cause;
  }
  return rows.length;
}
