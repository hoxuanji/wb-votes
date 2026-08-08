#!/usr/bin/env node
// The RAW tier's reader/writer. Every build-*.js and scraper/*.js goes through here so there is
// exactly one place that decides how data/seed/*.json is spelled on disk.
//
// COMPACT, AND KEY ORDER IS THE PRODUCER'S ORDER — not sorted. Compact + stable order means a
// rebuild that changes no data produces a byte-identical file and git shows no diff. Sorting keys
// would be equally stable but it is observable: /api/candidates spreads a candidate row straight
// into its response and /api/constituencies returns rows verbatim, so reordering an object's keys
// changes those response bytes. Producers already emit a fixed field order.
//
// Retrieval dates used to live in each generated module's line-1 header comment, which the registry
// ingest parsed. JSON has no comments, so they live in data/seed/provenance.json instead — a flat
// `<file>.json -> YYYY-MM-DD` map that the ingest reads. A file with no entry has no date, and the
// ingest raises `no_header_date` for it exactly as it did for an undated header.

const fs = require('fs');
const path = require('path');

const DIR = path.resolve(__dirname, '../data/seed');
const PROV = path.join(DIR, 'provenance.json');

const seedPath = (name) => path.join(DIR, `${name}.json`);

/** Parsed rows of data/seed/<name>.json. Replaces the regex-scrape-the-TS-literal dance the
 *  builders used to do to read each other's output. */
function readSeed(name) {
  return JSON.parse(fs.readFileSync(seedPath(name), 'utf8'));
}

/** Write-then-rename, because the seed is now an INPUT the app imports: a bare writeFileSync of a
 *  1.3 MB payload is observably truncated for the length of the write, so a scraper killed at the
 *  wrong moment used to leave half a JSON file that `npm run build` then failed to parse. rename(2)
 *  is atomic within a filesystem, and .tmp lands in the same directory so it always is one. */
function writeAtomic(file, text) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

/** Writes data/seed/<name>.json and, unless `dated: false`, stamps today into provenance.json.
 *  `dated: false` is for the two files that never carried a retrieval date (parties, the SVG path
 *  sets) — an absent entry is a real statement, not a gap to fill in with the run clock. */
function writeSeed(name, rows, { dated = true } = {}) {
  fs.mkdirSync(DIR, { recursive: true });
  writeAtomic(seedPath(name), JSON.stringify(rows));
  if (!dated) return;
  const prov = fs.existsSync(PROV) ? JSON.parse(fs.readFileSync(PROV, 'utf8')) : {};
  prov[`${name}.json`] = new Date().toISOString().slice(0, 10);
  const sorted = Object.fromEntries(Object.keys(prov).sort().map((k) => [k, prov[k]]));
  // ponytail: read-modify-write, so two builders racing on provenance.json can still lose the
  // loser's stamp. Serialise the builders (or move the stamp into each seed file) if they ever run
  // concurrently — today every npm data:* script is one process at a time.
  writeAtomic(PROV, `${JSON.stringify(sorted, null, 2)}\n`);
}

module.exports = { DIR, PROV, seedPath, readSeed, writeSeed, writeAtomic };
