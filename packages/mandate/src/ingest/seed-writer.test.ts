// scripts/build-seed.js is CommonJS and lives outside packages/mandate, but the project has one test
// glob (packages/mandate/src/**/*.test.ts) and the writer is now load-bearing for the registry: it
// produces the RAW tier both the app and the ingest read. So its one property is asserted here.
//
// The property: the seed file is replaced by rename(2), never rewritten in place. A bare
// writeFileSync of a 1.3 MB payload is observably truncated for the length of the write — a reader
// during the window sees "Unterminated string in JSON" — so a scraper killed at the wrong moment
// left half a JSON file that `npm run build` then failed to parse on import. Before cycle 4 the same
// interruption produced a broken .ts file that tsc rejected loudly.

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const require_ = createRequire(import.meta.url);
const { writeAtomic } = require_("../../../../scripts/build-seed.js") as {
  writeAtomic: (file: string, text: string) => void;
};

test("a seed file is replaced by rename, so an interrupted write cannot truncate it", () => {
  const dir = mkdtempSync(join(tmpdir(), "seed-write-"));
  const file = join(dir, "candidates.json");
  writeFileSync(file, JSON.stringify([{ id: "old" }]));
  const before = statSync(file).ino;

  writeAtomic(file, JSON.stringify([{ id: "new" }, { id: "second" }]));

  // A rename brings the temporary file's inode with it. An in-place truncate-and-write — the failure
  // mode this replaced — keeps the original inode, so this is the assertion that tells them apart.
  assert.notEqual(statSync(file).ino, before, "the target was rewritten in place, not renamed onto");
  assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), [{ id: "new" }, { id: "second" }]);
  // And the temporary file does not survive to be committed or read as a seed module.
  assert.equal(existsSync(`${file}.tmp`), false);
});
