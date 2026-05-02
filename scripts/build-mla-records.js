#!/usr/bin/env node
/**
 * build-mla-records.js — Builds src/data/mla-records.ts from a JSON seed.
 *
 * Input:
 *   scripts/data/mla-records.json   (array of MLARecord; empty by default)
 *
 * Output:
 *   src/data/mla-records.ts
 *
 * MLA performance data (attendance, questions, bills, etc.) comes from
 * wbassembly.gov.in and PRS India. We DO NOT scrape here — populate the JSON
 * seed by running a separate, hand-authored scraper (TODO) or by importing
 * from PRS CSVs. This build script is the "read JSON → emit TS" stage only.
 *
 * When mla-records.json is empty, the resulting TS file still compiles and the
 * UI gracefully shows "performance data unavailable".
 */

const fs   = require('fs');
const path = require('path');

const ROOT    = path.resolve(__dirname, '..');
const INPUT   = path.join(__dirname, 'data/mla-records.json');
const OUTPUT  = path.join(ROOT, 'src/data/mla-records.ts');

const FOOTER = `
export function getMLARecordForAC(
  constituencyId: string,
  term: '2021-2026' | '2026-2031' = '2021-2026',
): MLARecord | undefined {
  return mlaRecords.find(
    (r) => r.constituencyId === constituencyId && r.term === term,
  );
}
`;

function main() {
  console.log('Building MLA records...\n');

  if (!fs.existsSync(INPUT)) {
    console.log(`  ${path.relative(ROOT, INPUT)} not found — emitting empty list`);
  }
  const records = fs.existsSync(INPUT) ? JSON.parse(fs.readFileSync(INPUT, 'utf8')) : [];
  if (!Array.isArray(records)) throw new Error(`${INPUT} must be an array`);

  const today = new Date().toISOString().slice(0, 10);
  const content = `// AUTO-GENERATED — WB MLA performance records — ${today}
// Built by: node scripts/build-mla-records.js
// Source: scripts/data/mla-records.json (wbassembly.gov.in + PRS India)
import type { MLARecord } from '@/types';

export const mlaRecords: MLARecord[] = ${JSON.stringify(records, null, 2)};
${FOOTER}`;
  fs.writeFileSync(OUTPUT, content, 'utf8');

  console.log(`✅  Done`);
  console.log(`   Records  : ${records.length}`);
  console.log(`   → ${path.relative(ROOT, OUTPUT)}`);
}

if (require.main === module) {
  try { main(); } catch (e) { console.error('Fatal:', e); process.exit(1); }
}

module.exports = { main };
