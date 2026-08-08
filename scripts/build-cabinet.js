#!/usr/bin/env node
/**
 * build-cabinet.js — Builds data/seed/cabinet.json from a hand-curated JSON seed.
 *
 * Input:
 *   scripts/data/cabinet.json   (array of CabinetMember; hand-curated)
 *
 * Output:
 *   data/seed/cabinet.json  (+ its date in data/seed/provenance.json)
 *
 * Cabinet membership comes from wb.gov.in / news coverage of swearing-in
 * ceremonies and reshuffles. We DO NOT scrape here — keep the JSON updated
 * by hand. This script is the validate-and-emit stage only.
 *
 * On reshuffle: edit the JSON, set the prior portfolio's `to` date, append
 * a new portfolio entry with the new `from` date, and rebuild.
 */

const fs   = require('fs');
const path = require('path');

const ROOT   = path.resolve(__dirname, '..');
const INPUT  = path.join(__dirname, 'data/cabinet.json');
const { writeSeed, seedPath } = require('./build-seed');
const OUTPUT = seedPath('cabinet');

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

  writeSeed('cabinet', records);

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
