import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

/** Dev database, relative to the repo root (npm scripts run there). Gitignored. */
export const DEV_DB_PATH = ".data/registry.db";

/**
 * Open the registry. Pass ":memory:" for tests.
 * foreign_keys=ON is not optional: the DDL's FKs are inert without it.
 */
export function open(path: string = DEV_DB_PATH): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL"); // no-op on :memory:, which stays in "memory" mode
  return db;
}
