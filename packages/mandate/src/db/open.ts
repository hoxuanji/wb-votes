import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

/** Dev database, relative to the repo root (npm scripts run there). Gitignored.
 *  MANDATE_DB_PATH overrides it — a test fixture, or a deployment that keeps the registry
 *  somewhere other than the cwd. */
export const DEV_DB_PATH = ".data/registry.db";

function dbPath(path: string | undefined): string {
  return path ?? process.env["MANDATE_DB_PATH"] ?? DEV_DB_PATH;
}

/**
 * busy_timeout is not optional: two processes (a request while ingest runs, node:test's parallel
 * workers) otherwise raise SQLITE_BUSY instantly instead of waiting out a writer.
 * foreign_keys=ON is not optional either: the DDL's FKs are inert without it.
 */
function conn(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

/** The write path (migrate / ingest / resolve). Creates the directory and the file. */
export function open(path?: string): DatabaseSync {
  const p = dbPath(path);
  if (p !== ":memory:") mkdirSync(dirname(p), { recursive: true });
  const db = conn(p);
  // Setting journal_mode takes a write lock, so only pay it when the mode is not already wal.
  const mode = db.prepare("PRAGMA journal_mode").get() as { journal_mode?: string } | undefined;
  if (mode?.journal_mode !== "wal") {
    db.exec("PRAGMA journal_mode = WAL"); // no-op on :memory:, which stays in "memory" mode
  }
  return db;
}

/**
 * The read path (API routes, pages, repo tests). Never creates the directory and never sets
 * journal_mode, so a GET cannot write to disk and cannot collide with a writer's lock. A missing
 * file raises "unable to open database file", which repo.read() turns into RegistryUnavailableError.
 */
export function openRead(path?: string): DatabaseSync {
  const p = dbPath(path);
  // node:sqlite creates an empty file for a missing path, and a read must never write. The message
  // is the one read() already translates, so a missing registry is a 503 and not a 500.
  if (p !== ":memory:" && !existsSync(p)) throw new Error(`unable to open database file: ${p}`);
  return conn(p);
}
