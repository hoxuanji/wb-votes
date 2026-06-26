#!/usr/bin/env node
/**
 * build-current-mla.js — Builds src/data/current-mla.ts from a JSON seed.
 *
 * Input:
 *   scripts/data/current-mla.json   (array of CurrentMLA; partial; expand as data lands)
 *
 * Output:
 *   src/data/current-mla.ts
 *
 * The 2026 winner data wasn't backfilled into historical-results.ts (only the
 * KV live store held it during counting day, and that is now disabled). Until
 * a per-AC scrape or Lokdhaba CSV lands, this file is the authoritative source
 * for "who is the current MLA of constituency X".
 *
 * Lookup helpers gracefully return undefined when an AC isn't seeded.
 */

const fs   = require('fs');
const path = require('path');

const ROOT   = path.resolve(__dirname, '..');
const INPUT  = path.join(__dirname, 'data/current-mla.json');
const OUTPUT = path.join(ROOT, 'src/data/current-mla.ts');

const FOOTER = `
export function getCurrentMLAForAC(constituencyId: string): CurrentMLA | undefined {
  return currentMLAs.find((m) => m.constituencyId === constituencyId);
}

export function hasCurrentMLAData(constituencyId: string): boolean {
  return currentMLAs.some((m) => m.constituencyId === constituencyId);
}
`;

function validate(record, idx) {
  const required = ['constituencyId', 'name', 'partyId', 'term', 'sourceUrl'];
  for (const key of required) {
    if (record[key] === undefined || record[key] === null || record[key] === '') {
      throw new Error(`current-mla[${idx}] (${record.constituencyId || '?'}): missing required field "${key}"`);
    }
  }
  if (!['2021-2026', '2026-2031'].includes(record.term)) {
    throw new Error(`current-mla[${idx}] (${record.constituencyId}): invalid term "${record.term}"`);
  }
  // Allow null for marginVotes / voteShare / candidateId (data not yet linked).
  if (record.marginVotes !== null && typeof record.marginVotes !== 'number') {
    throw new Error(`current-mla[${idx}] (${record.constituencyId}): marginVotes must be number or null`);
  }
}

function main() {
  console.log('Building current-MLA records...\n');

  if (!fs.existsSync(INPUT)) {
    console.log(`  ${path.relative(ROOT, INPUT)} not found — emitting empty list`);
  }
  const records = fs.existsSync(INPUT) ? JSON.parse(fs.readFileSync(INPUT, 'utf8')) : [];
  if (!Array.isArray(records)) throw new Error(`${INPUT} must be an array`);

  records.forEach(validate);

  // Detect duplicates by constituencyId — would silently mask the wrong winner.
  const seen = new Set();
  for (const r of records) {
    if (seen.has(r.constituencyId)) {
      throw new Error(`Duplicate constituencyId in current-mla.json: ${r.constituencyId}`);
    }
    seen.add(r.constituencyId);
  }

  const today = new Date().toISOString().slice(0, 10);
  const content = `// AUTO-GENERATED — Sitting MLAs for current WB Assembly term — ${today}
// Built by: node scripts/build-current-mla.js
// Source: scripts/data/current-mla.json — hand-curated from authoritative sources.
// Coverage gap: as of last build, ${records.length}/294 ACs are populated.
import type { CurrentMLA } from '@/types';

export const currentMLAs: CurrentMLA[] = ${JSON.stringify(records, null, 2)};
${FOOTER}`;
  fs.writeFileSync(OUTPUT, content, 'utf8');

  const byTerm = records.reduce((acc, r) => { acc[r.term] = (acc[r.term] || 0) + 1; return acc; }, {});
  const byParty = records.reduce((acc, r) => { acc[r.partyId] = (acc[r.partyId] || 0) + 1; return acc; }, {});

  console.log(`✅  Done`);
  console.log(`   Records  : ${records.length} / 294`);
  Object.entries(byTerm).forEach(([t, n]) => console.log(`   ${t.padEnd(10)}: ${n}`));
  console.log(`   Parties  : ${Object.entries(byParty).map(([p, n]) => `${p}=${n}`).join(', ')}`);
  console.log(`   → ${path.relative(ROOT, OUTPUT)}`);
}

if (require.main === module) {
  try { main(); } catch (e) { console.error('Fatal:', e.message); process.exit(1); }
}

module.exports = { main };
