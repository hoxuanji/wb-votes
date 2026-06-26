#!/usr/bin/env node
/**
 * build-wbmps-performance.js — Builds src/data/wbmps-performance.ts from
 * the JSON output of scripts/scraper/prs-wb-mp.js.
 *
 * Input:  scripts/data/wbmps-performance.json
 * Output: src/data/wbmps-performance.ts
 */

const fs   = require('fs');
const path = require('path');

const ROOT   = path.resolve(__dirname, '..');
const INPUT  = path.join(__dirname, 'data/wbmps-performance.json');
const OUTPUT = path.join(ROOT, 'src/data/wbmps-performance.ts');

const FOOTER = `
export function getMPRecord(mpId: string): WBMPRecord | undefined {
  return wbmpRecords.find((r) => r.mpId === mpId);
}
`;

function main() {
  console.log('Building WB MP performance records...\n');
  const records = fs.existsSync(INPUT) ? JSON.parse(fs.readFileSync(INPUT, 'utf8')) : [];
  if (!Array.isArray(records)) throw new Error(`${INPUT} must be an array`);

  const today = new Date().toISOString().slice(0, 10);
  const content = `// AUTO-GENERATED — WB Lok Sabha MP performance (PRS India) — ${today}
// Built by: node scripts/build-wbmps-performance.js
// Source: scripts/data/wbmps-performance.json (run npm run scrape:prs-mp first)
import type { WBMPRecord } from '@/types';

export const wbmpRecords: WBMPRecord[] = ${JSON.stringify(records, null, 2)};
${FOOTER}`;

  fs.writeFileSync(OUTPUT, content, 'utf8');
  console.log(`✅  Done`);
  console.log(`   Records : ${records.length} / 42`);
  console.log(`   → ${path.relative(ROOT, OUTPUT)}`);
}

if (require.main === module) {
  try { main(); } catch (e) { console.error('Fatal:', e.message); process.exit(1); }
}
module.exports = { main };
