#!/usr/bin/env node
// The atomic seed writer, and nothing else.
//
// WHAT THIS FILE WAS. The shared reader/writer for seventeen `data:*` build scripts — `readSeed`,
// `writeSeed`, `seedPath` and the directory constants. Those scripts belonged to the application Phase 2.5
// deleted, and were themselves removed in Phase 3's hardening, so everything here except one function became
// unreachable.
//
// WHY THE REST IS DELETED RATHER THAN LEFT. `writeSeed` stamped `new Date()` into data/seed/provenance.json on
// every call, so running a build rewrote a TRACKED file with the run clock. Measured: `node
// scripts/build-data.js` moved two sources' retrieval dates from 2026-04-25 to today, silently, and the diff
// looked like new data. A retrieval date is a claim about when bytes were fetched; a build clock is not that
// claim. Deleting the function removes the non-determinism at its root instead of patching the timestamp —
// and leaving it here reachable by hand would have left a command that falsifies provenance in the tree with
// no caller left to justify it.
//
// WHAT REMAINS, AND WHY IT IS LOAD-BEARING. `writeAtomic` is the only writer in this repository that replaces
// a file by rename(2). A bare writeFileSync of a 1.3 MB payload is observably truncated for the length of the
// write — a reader inside that window gets "Unterminated string in JSON" — so a producer killed at the wrong
// moment used to leave half a JSON file that `npm run build` then failed to parse on import.
// packages/mandate/src/ingest/seed-writer.test.ts asserts exactly that property.

const fs = require('fs');
const path = require('path');

/** Write-then-rename. `.tmp` lands in the same directory so the rename is always within one filesystem. */
function writeAtomic(file, text) {
  const tmp = `${file}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

module.exports = { writeAtomic };
