// The shared read seam: what read() translates, and what the two open() flavours guarantee.
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { open, openRead } from "../db/index.ts";
import { RegistryUnavailableError, read } from "./index.ts";

test("read() translates every way the registry can be unreadable, and nothing else", () => {
  const cases = [
    "no such table: candidacy",
    "no such column: votes",
    "file is not a database",
    "unable to open database file",
    // SQLITE_BUSY: a request during ingest, or two node:test workers. This used to be rethrown, so
    // a concurrent open answered an HTML 500 instead of a 503 and made the suite flake.
    "database is locked",
    "database table is locked",
    // a read-only container or an unwritable cwd
    "EACCES: permission denied, mkdir '.data'",
    "EROFS: read-only file system, mkdir '.data'",
    "ENOENT: no such file or directory, mkdir '.data'",
  ];
  for (const m of cases) {
    assert.throws(
      () =>
        read(() => {
          throw new Error(m);
        }),
      RegistryUnavailableError,
      m,
    );
  }
  // A real bug is still a real bug.
  assert.throws(
    () =>
      read(() => {
        throw new Error("cannot read properties of undefined");
      }),
    /cannot read properties/,
  );
});

test("both open flavours set busy_timeout, so a concurrent open waits instead of failing", () => {
  const path = join(mkdtempSync(join(tmpdir(), "mandate-open-")), "registry.db");
  const w = open(path);
  assert.equal(w.prepare("PRAGMA busy_timeout").get()?.["timeout"], 5000);
  assert.equal(w.prepare("PRAGMA journal_mode").get()?.["journal_mode"], "wal");
  const r = openRead(path);
  assert.equal(r.prepare("PRAGMA busy_timeout").get()?.["timeout"], 5000);
  r.close();
  w.close();
});

test("openRead never creates a database: a GET must not write to disk", () => {
  const path = join(mkdtempSync(join(tmpdir(), "mandate-read-")), "registry.db");
  assert.throws(() => openRead(path), /unable to open database file/);
  assert.equal(existsSync(path), false, "a read created no file");
  assert.throws(() => read(() => openRead(path)), RegistryUnavailableError);
});
