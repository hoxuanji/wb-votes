// What the schema says about a table, read from the schema.
//
// The DDL in ops/migrations/ is the one description of a table (ADR 0001), so this holds no second copy of it: the
// columns, their NOT NULLs, the primary key and the UNIQUE constraints come from SQLite's own catalog, and the
// CHECK vocabularies from the text of the CREATE TABLE. SQLite is the only adapter; reading Postgres'
// information_schema instead would be the second, behind the same two functions.
//
// Not exported through db/index.ts: the app has no use for it, and the barrel is in the Next bundle.

import type { DatabaseSync } from "node:sqlite";

export type Column = {
  name: string;
  /** NOT NULL was written. An INTEGER PRIMARY KEY is not NOT NULL unless it says so: SQLite fills it. */
  notnull: boolean;
  /** 1-based position in the primary key, 0 when the column is not part of it. */
  pk: number;
  hasDefault: boolean;
};

export type Table = {
  name: string;
  /** In DDL order. */
  columns: readonly Column[];
  /** Every column set `ON CONFLICT (...)` can name: the primary key and each full UNIQUE constraint. */
  keys: readonly (readonly string[])[];
  /** The CREATE TABLE text, `--` comments removed. They are kept verbatim in sqlite_master and contain
   *  apostrophes ("cycle 1's"), which would otherwise be read as CHECK literals. */
  sql: string;
};

/** `"rank"` is the one column the importers write quoted. */
const bare = (column: string): string => column.replace(/^"(.*)"$/, "$1");

type TableInfoRow = { name: string; notnull: number; dflt_value: string | null; pk: number };

export function describeTable(db: DatabaseSync, name: string): Table | undefined {
  // The name is looked up as data first, so only a table that exists is ever handed to a pragma.
  const found = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) as
    | { sql: string }
    | undefined;
  if (found === undefined) return undefined;

  const info = db.prepare("SELECT * FROM pragma_table_info(?)").all(name) as TableInfoRow[];
  const columns = info.map((c) => ({
    name: c.name,
    notnull: c.notnull === 1,
    pk: c.pk,
    hasDefault: c.dflt_value !== null,
  }));

  const keys: string[][] = [];
  const pk = info.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name);
  if (pk.length > 0) keys.push(pk);
  // A partial index cannot be a conflict target unless the statement repeats its WHERE, and an expression
  // index has no column to name; neither is a key here.
  const indexes = db.prepare("SELECT * FROM pragma_index_list(?)").all(name) as {
    name: string;
    unique: number;
    partial: number;
  }[];
  for (const ix of indexes) {
    if (ix.unique !== 1 || ix.partial !== 0) continue;
    const cols = db.prepare("SELECT name FROM pragma_index_info(?) ORDER BY seqno").all(ix.name) as {
      name: string | null;
    }[];
    if (cols.some((c) => c.name === null)) continue;
    keys.push(cols.map((c) => String(c.name)));
  }

  return {
    name,
    columns,
    keys: keys.filter((k, i) => keys.findIndex((o) => sameSet(o, k)) === i),
    sql: found.sql.replace(/--[^\n]*/g, ""),
  };
}

/** Every table the migrations created. Views are not here: nothing writes to one. */
export function catalog(db: DatabaseSync): Map<string, Table> {
  const names = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string }[];
  const out = new Map<string, Table>();
  for (const { name } of names) out.set(name, describeTable(db, name) as Table);
  return out;
}

/** The quoted literals of `CHECK (<column> IN (...))`, or [] when there is no such CHECK.
 *  ponytail: only quoted lists — result.is_winner's CHECK (is_winner IN (0,1)) has no strings to
 *  compare and is covered by typing isWinner as 0 | 1. */
export function checkedValues(sql: string, column: string): string[] {
  const body = new RegExp(`CHECK\\s*\\(\\s*${column}\\s+IN\\s*\\(([^)]*)\\)`).exec(sql)?.[1] ?? "";
  return [...body.matchAll(/'([^']*)'/g)].map((m) => String(m[1]));
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((x) => b.includes(x));

/**
 * Throws unless `cols`, `key` and every row fit `table`, so a write that cannot be right never reaches SQL.
 *
 * The arity check is the one SQLite will not make: a row with too few values binds NULL for the rest, and
 * `ON CONFLICT DO UPDATE` then writes that NULL over the stored value. Too many values SQLite does refuse,
 * but only when the statement runs, after earlier rows have been written.
 */
export function checkWrite(
  table: Table,
  cols: readonly string[],
  key: readonly string[],
  rows: readonly (readonly unknown[])[],
): void {
  const bad = (why: string): never => {
    throw new Error(`${table.name}: ${why}`);
  };
  const named = cols.map(bare);
  const known = new Set(table.columns.map((c) => c.name));
  for (const [i, c] of named.entries()) {
    if (!known.has(c)) bad(`no column '${c}' (the columns are ${[...known].join(", ")})`);
    if (named.indexOf(c) !== i) bad(`column '${c}' is named twice`);
  }
  const absent = table.columns.filter((c) => c.notnull && !c.hasDefault && !named.includes(c.name));
  if (absent.length > 0) bad(`the columns named leave out ${absent.map((c) => c.name).join(", ")}, which are NOT NULL with no default`);

  const k = key.map(bare);
  if (k.length === 0) bad("the conflict key names no column");
  const outside = k.find((c) => !named.includes(c));
  if (outside !== undefined) bad(`the key column '${outside}' is not among the columns written`);
  if (!table.keys.some((u) => sameSet(u, k))) {
    bad(
      `(${k.join(", ")}) is not the primary key or a UNIQUE constraint, so ON CONFLICT cannot match on it` +
        ` (those are ${table.keys.map((u) => `(${u.join(", ")})`).join(", ") || "none"})`,
    );
  }

  for (const [i, row] of rows.entries()) {
    if (row.length !== named.length) {
      bad(`rows[${i}] has ${row.length} values for the ${named.length} columns named`);
    }
  }
}
