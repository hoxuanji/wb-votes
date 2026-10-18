// The registry session: one scoped open, read, close. A caller hands over a function of the database and gets
// back the value it returned, or the news that the registry cannot be read right now. The handle never leaves
// the call, so there is nothing to forget to close and nothing for a React child to read after the page
// function has returned.
//
// WHAT COUNTS AS AN OUTAGE is exactly what read() already translates: no file, a file that was never
// migrated, a damaged file, a database busy with a writer (see UNAVAILABLE in ./index.ts). Those are states of
// the deployment, and a page answers them with the command that fixes them. Everything else is a DEFECT in this
// process and is rethrown, so it fails loudly instead of rendering as "registry not built".
//
// ponytail: synchronous only. node:sqlite is synchronous, and a function that returned a promise would be
// closed under before it settled. Add an async flavour the day a caller has something to await inside a read.

import type { DatabaseSync } from "node:sqlite";
import { openRead } from "../db/index.ts";
import { read } from "./index.ts";

/** What a session produced. `detail` is the sentence to show a reader; `cause` is for the log. */
export type Read<T> = { ok: true; value: T } | { ok: false; detail: string; cause: unknown };

/**
 * Classified by NAME, not `instanceof`. A webpack copy and a native Node copy of repo/index.ts can be live in
 * one process, each with its own RegistryUnavailableError class, and an error thrown by one is not an
 * `instanceof` the other. The name survives the crossing.
 */
function isOutage(e: unknown): e is Error {
  return e instanceof Error && e.name === "RegistryUnavailableError";
}

/**
 * Open the registry read-only, run `fn` on it, close it — on the way out of a throw too.
 *
 * `path` is for a test that points at a fixture; everything else reads MANDATE_DB_PATH or .data/registry.db,
 * which is what openRead() does with no argument. Both the open and `fn` run under read(), so a raw sqlite
 * error from either — a missing file, a locked database, a table that is not there — is classified the way a
 * repo function's own would be, whether or not the query that raised it was wrapped.
 *
 * Callers that a test must be able to point elsewhere take `read = readRegistry` as a trailing parameter, so a
 * test passes `(fn) => readRegistry(fn, { path })` instead of changing the process's environment or cwd.
 */
export function readRegistry<T>(fn: (db: DatabaseSync) => T, o: { path?: string } = {}): Read<T> {
  let db: DatabaseSync | undefined;
  try {
    const open = (db = read(() => openRead(o.path)));
    return { ok: true, value: read(() => fn(open)) };
  } catch (cause) {
    if (!isOutage(cause)) throw cause;
    return { ok: false, detail: cause.message, cause };
  } finally {
    db?.close();
  }
}
