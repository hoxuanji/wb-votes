import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DatabaseSync } from "node:sqlite";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../../../../ops/migrations/", import.meta.url));

/**
 * A migration that rebuilds a table WITH CHILDREN opts in by declaring this on any line:
 *
 *   -- migrate: foreign_keys=off
 *
 * SQLite's own recipe for changing a column constraint is create-copy-drop-rename, and it requires
 * foreign keys to be off: DROP TABLE is an implicit DELETE FROM of every parent row, so with enforcement
 * on it fails once per child row. `PRAGMA foreign_keys` is a no-op inside a transaction, and every
 * migration runs in one, which is why 009 could only widen a CHECK on a table nothing referenced and why
 * `source.kind` still has no 'research_dataset' value.
 *
 * The pragma is therefore set BEFORE the transaction opens and restored after it closes — the migration
 * is still atomic — and `PRAGMA foreign_key_check` runs afterwards, so a rebuild that orphans a child row
 * fails the run instead of leaving a registry that only looks intact. Enforcement off is the whole point
 * and also the whole risk; the check is what makes it acceptable.
 */
const FK_OFF = /^--\s*migrate:\s*foreign_keys=off\s*$/m;

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
    const sql = readFileSync(join(dir, filename), "utf8");
    const fkOff = FK_OFF.test(sql);
    if (fkOff) db.exec("PRAGMA foreign_keys = OFF");
    db.exec("BEGIN");
    try {
      db.exec(sql);
      record.run(filename, nowIso);
      db.exec("COMMIT");
    } catch (cause) {
      db.exec("ROLLBACK");
      if (fkOff) db.exec("PRAGMA foreign_keys = ON");
      throw new Error(`migration ${filename} failed: ${(cause as Error).message}`, { cause });
    }
    if (fkOff) {
      db.exec("PRAGMA foreign_keys = ON");
      const orphans = db.prepare("PRAGMA foreign_key_check").all() as { table?: unknown; rowid?: unknown }[];
      if (orphans.length > 0) {
        throw new Error(
          `migration ${filename} ran with foreign keys off and left ${orphans.length} orphaned row(s), ` +
            `first in table '${String(orphans[0]?.table)}' at rowid ${String(orphans[0]?.rowid)}`,
        );
      }
    }
  }
  return pending;
}
