#!/usr/bin/env node
/**
 * build-cabinet.js — Builds src/data/cabinet.ts from a JSON seed.
 *
 * Input:
 *   scripts/data/cabinet.json   (array of CabinetMember; hand-curated)
 *
 * Output:
 *   src/data/cabinet.ts
 *
 * Cabinet membership comes from wb.gov.in / news coverage of swearing-in
 * ceremonies and reshuffles. We DO NOT scrape here — keep the JSON updated
 * by hand. This script is the "read JSON → emit TS" stage only.
 *
 * On reshuffle: edit the JSON, set the prior portfolio's `to` date, append
 * a new portfolio entry with the new `from` date, and rebuild.
 */

const fs   = require('fs');
const path = require('path');

const ROOT   = path.resolve(__dirname, '..');
const INPUT  = path.join(__dirname, 'data/cabinet.json');
const OUTPUT = path.join(ROOT, 'src/data/cabinet.ts');

const FOOTER = `
export function getCabinetMemberById(id: string): CabinetMember | undefined {
  return wbCabinet2026.find((m) => m.id === id);
}

export function getCabinetMemberByConstituency(
  constituencyId: string,
): CabinetMember | undefined {
  return wbCabinet2026.find((m) => m.constituencyId === constituencyId);
}

export function getChiefMinister(): CabinetMember | undefined {
  return wbCabinet2026.find((m) =>
    m.portfolios.some((p) => p.rank === 'CM' && !p.to),
  );
}

export function getCurrentPortfolios(member: CabinetMember) {
  return member.portfolios.filter((p) => !p.to);
}
`;

function validate(member, idx) {
  const required = ['id', 'name', 'partyId', 'inducted', 'sourceUrl', 'portfolios'];
  for (const key of required) {
    if (member[key] === undefined || member[key] === null || member[key] === '') {
      throw new Error(`cabinet[${idx}] (${member.id || '?'}): missing required field "${key}"`);
    }
  }
  if (!Array.isArray(member.portfolios) || member.portfolios.length === 0) {
    throw new Error(`cabinet[${idx}] (${member.id}): portfolios must be a non-empty array`);
  }
  for (const p of member.portfolios) {
    if (!p.ministry || !p.rank || !p.from) {
      throw new Error(`cabinet[${idx}] (${member.id}): portfolio missing ministry/rank/from`);
    }
    if (!['CM', 'Cabinet', 'MoS-Independent', 'MoS'].includes(p.rank)) {
      throw new Error(`cabinet[${idx}] (${member.id}): invalid rank "${p.rank}"`);
    }
  }
}

function main() {
  console.log('Building cabinet records...\n');

  if (!fs.existsSync(INPUT)) {
    console.log(`  ${path.relative(ROOT, INPUT)} not found — emitting empty list`);
  }
  const records = fs.existsSync(INPUT) ? JSON.parse(fs.readFileSync(INPUT, 'utf8')) : [];
  if (!Array.isArray(records)) throw new Error(`${INPUT} must be an array`);

  records.forEach(validate);

  const today = new Date().toISOString().slice(0, 10);
  const content = `// AUTO-GENERATED — WB Cabinet (2026 term) — ${today}
// Built by: node scripts/build-cabinet.js
// Source: scripts/data/cabinet.json — keep in sync with wb.gov.in cabinet listings.
import type { CabinetMember } from '@/types';

export const wbCabinet2026: CabinetMember[] = ${JSON.stringify(records, null, 2)};
${FOOTER}`;
  fs.writeFileSync(OUTPUT, content, 'utf8');

  const ranks = records.reduce((acc, m) => {
    const top = m.portfolios.find((p) => !p.to)?.rank ?? 'unknown';
    acc[top] = (acc[top] || 0) + 1;
    return acc;
  }, {});

  console.log(`✅  Done`);
  console.log(`   Members  : ${records.length}`);
  Object.entries(ranks).forEach(([r, n]) => console.log(`   ${r.padEnd(18)}: ${n}`));
  console.log(`   → ${path.relative(ROOT, OUTPUT)}`);
}

if (require.main === module) {
  try { main(); } catch (e) { console.error('Fatal:', e.message); process.exit(1); }
}

module.exports = { main };
