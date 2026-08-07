import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DatabaseSync } from "node:sqlite";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../../../../ops/migrations/", import.meta.url));

/**
 * Forward-only migrations (§29): apply every *.sql not yet recorded, in lexical order, each in its
 * own transaction. Idempotent — a second call applies nothing and returns []. No down migrations.
 * `nowIso` is an argument so a migration run is reproducible in a test.
 */
export function migrate(db: DatabaseSync, nowIso: string, dir: string = MIGRATIONS_DIR): string[] {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migration (filename TEXT PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL)",
  );
  const applied = new Set(
    db.prepare("SELECT filename FROM schema_migration").all().map((r) => String(r.filename)),
  );
  const pending = readdirSync(dir)
    .filter((f) => f.endsWith(".sql") && !applied.has(f))
    .sort();

  const record = db.prepare("INSERT INTO schema_migration (filename, applied_at) VALUES (?, ?)");
  for (const filename of pending) {
    db.exec("BEGIN");
    try {
      db.exec(readFileSync(join(dir, filename), "utf8"));
      record.run(filename, nowIso);
      db.exec("COMMIT");
    } catch (cause) {
      db.exec("ROLLBACK");
      throw new Error(`migration ${filename} failed: ${(cause as Error).message}`, { cause });
    }
  }
  return pending;
}
