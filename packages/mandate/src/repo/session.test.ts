// The registry session: what it calls an outage, what it refuses to call one, and that the handle is shut on
// every way out. Everything runs against files made here, in a temp directory, so it runs without a registry.

import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { open } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";
import { RegistryUnavailableError, getPersonBrief } from "./index.ts";
import { readRegistry } from "./session.ts";

const NOW = "2026-08-12T00:00:00.000Z";

/** @types/node 20 predates DatabaseSync.isOpen; the runtime has it (Node 22.15 and later). */
const isOpen = (db: DatabaseSync | undefined): boolean | undefined =>
  (db as unknown as { isOpen?: boolean } | undefined)?.isOpen;

function dir(): string {
  return mkdtempSync(join(tmpdir(), "mandate-session-"));
}

/** A migrated, empty registry: opens and reads cleanly. */
function migrated(): string {
  const path = join(dir(), "registry.db");
  const d = open(path);
  migrate(d, NOW);
  d.close();
  return path;
}

test("a registry that is not there is an outage, and a read creates no file", () => {
  const path = join(dir(), "registry.db");
  const r = readRegistry(() => assert.fail("fn must not run when the file is absent"), { path });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.detail, /npm run registry:migrate/);
  assert.ok(r.cause instanceof RegistryUnavailableError);
  assert.equal(existsSync(path), false, "a GET must not write to disk");
});

test("a database that was never migrated is an outage, through the repo and through raw SQL", () => {
  const path = join(dir(), "registry.db");
  open(path).close(); // the file exists and is a database; it has no schema
  const viaRepo = readRegistry((db) => getPersonBrief(db, "x"), { path });
  assert.equal(viaRepo.ok, false);
  const viaSql = readRegistry((db) => db.prepare("SELECT 1 FROM person").get(), { path });
  assert.equal(viaSql.ok, false);
});

test("a migrated registry returns what fn returned, and the handle is closed", () => {
  const path = migrated();
  let seen: DatabaseSync | undefined;
  const r = readRegistry(
    (db) => {
      seen = db;
      assert.equal(isOpen(db), true);
      return db.prepare("SELECT COUNT(*) AS n FROM person").get()?.["n"];
    },
    { path },
  );
  assert.deepEqual(r, { ok: true, value: 0 });
  assert.equal(isOpen(seen), false);
});

test("the path defaults to MANDATE_DB_PATH, which is where the deployment keeps the registry", () => {
  const path = migrated();
  const prev = process.env["MANDATE_DB_PATH"];
  process.env["MANDATE_DB_PATH"] = path;
  try {
    assert.deepEqual(readRegistry(() => 7), { ok: true, value: 7 });
  } finally {
    if (prev === undefined) delete process.env["MANDATE_DB_PATH"];
    else process.env["MANDATE_DB_PATH"] = prev;
  }
});

test("every way the registry can be unreadable is an outage, and the handle is closed after each", () => {
  // The messages read() translates (index.test.ts), now thrown from inside a session that really opened.
  const messages = [
    "no such table: candidacy",
    // deliberate: a registry one migration behind is unreadable to the code that expects the column
    "no such column: votes",
    "file is not a database",
    "database disk image is malformed",
    "malformed database schema (foo)",
    "unable to open database file",
    "database is locked",
    "database table is locked",
    "EACCES: permission denied, mkdir '.data'",
    "EROFS: read-only file system, mkdir '.data'",
    "ENOENT: no such file or directory, mkdir '.data'",
  ];
  const path = migrated();
  for (const message of messages) {
    let seen: DatabaseSync | undefined;
    const r = readRegistry(
      (db) => {
        seen = db;
        throw new Error(message);
      },
      { path },
    );
    assert.equal(r.ok, false, message);
    assert.equal(isOpen(seen), false, `${message}: handle left open`);
  }
});

test("damaged, truncated and busy registries are outages when really opened", () => {
  // SQLITE_NOTADB: a file that is not SQLite at all.
  const garbage = join(dir(), "registry.db");
  writeFileSync(garbage, "not a sqlite database ".repeat(300));
  assert.equal(readRegistry((db) => db.prepare("SELECT 1 FROM person").get(), { path: garbage }).ok, false);

  // SQLITE_CORRUPT: a SQLite file cut short, which is what an interrupted upload leaves behind.
  const cut = join(dir(), "registry.db");
  const w = open(cut);
  w.exec("CREATE TABLE person (id TEXT, pad TEXT)");
  for (let i = 0; i < 20; i++) w.exec(`INSERT INTO person VALUES ('p${i}', '${"x".repeat(2000)}')`);
  w.close();
  truncateSync(cut, 8192);
  assert.equal(readRegistry((db) => db.prepare("SELECT COUNT(*) FROM person").get(), { path: cut }).ok, false);

  // SQLITE_BUSY: a writer holds the file. A rollback-journal database, because a WAL reader never waits.
  const busy = join(dir(), "registry.db");
  const holder = new DatabaseSync(busy);
  holder.exec("CREATE TABLE person (id TEXT)");
  holder.exec("BEGIN EXCLUSIVE");
  try {
    const r = readRegistry(
      (db) => {
        db.exec("PRAGMA busy_timeout = 0"); // openRead waits 5 s for a writer; do not make the suite wait
        return db.prepare("SELECT COUNT(*) FROM person").get();
      },
      { path: busy },
    );
    assert.equal(r.ok, false);
  } finally {
    holder.exec("ROLLBACK");
    holder.close();
  }
});

test("a defect is rethrown, not reported as an outage, and the handle is still closed", () => {
  const path = migrated();
  const defects: [() => never, RegExp][] = [
    [() => { throw new TypeError("cannot read properties of undefined"); }, /cannot read properties/],
    [() => { throw new Error("no such function: jaro_winkler"); }, /no such function/],
  ];
  for (const [fail, pattern] of defects) {
    let seen: DatabaseSync | undefined;
    assert.throws(
      () => readRegistry((db) => { seen = db; return fail(); }, { path }),
      pattern,
    );
    assert.equal(isOpen(seen), false, `${pattern}: handle left open`);
  }
  // and a real SQL defect, from a real statement
  assert.throws(() => readRegistry((db) => db.prepare("SELEC 1").get(), { path }), /syntax error/);
});

test("an outage is recognised by name, so a second copy of the package still counts", () => {
  // A webpack bundle and a native Node import of repo/index.ts each define their own error class, and an error
  // thrown by one is not an `instanceof` the other. The name is what survives.
  class OtherCopy extends Error {
    constructor() {
      super("thrown by another copy of the package");
      this.name = "RegistryUnavailableError";
    }
  }
  assert.ok(!(new OtherCopy() instanceof RegistryUnavailableError), "the premise: instanceof cannot see it");
  const r = readRegistry(
    () => {
      throw new OtherCopy();
    },
    { path: migrated() },
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.detail, "thrown by another copy of the package");
});
