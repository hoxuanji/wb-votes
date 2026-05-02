#!/usr/bin/env node
/**
 * build-demographics.js — Builds src/data/demographics.ts from district-level
 * Census data, keyed to each Assembly Constituency via its `district` field.
 *
 * Inputs:
 *   1. scripts/data/census-2011-wb-districts.json    (required — Census 2011)
 *   2. src/data/raw/demographics/ac-overrides.json   (optional — AC-level overrides)
 *
 * Output:
 *   src/data/demographics.ts
 *
 * Strategy:
 *   For each constituency, look up its district in the Census JSON.
 *   If an AC-level override exists, merge it over the district default.
 *   Districts created post-2011 (Alipurduar, Kalimpong, Jhargram, Paschim/Purba
 *   Bardhaman) use their parent district's values, flagged with sourceNote.
 */

const fs   = require('fs');
const path = require('path');

const ROOT        = path.resolve(__dirname, '..');
const DATA_DIR    = path.join(ROOT, 'src/data');
const CONSTITS_TS = path.join(DATA_DIR, 'constituencies.ts');
const CENSUS      = path.join(__dirname, 'data/census-2011-wb-districts.json');
const OVERRIDES   = path.join(ROOT, 'src/data/raw/demographics/ac-overrides.json');
const OUTPUT      = path.join(DATA_DIR, 'demographics.ts');

function extractArrayFromTs(tsPath, exportName) {
  const src = fs.readFileSync(tsPath, 'utf8');
  const declRe = new RegExp(`export const ${exportName}[^\\n]+=`);
  const declMatch = declRe.exec(src);
  if (!declMatch) throw new Error(`Cannot find export ${exportName} in ${tsPath}`);
  const afterEq = declMatch.index + declMatch[0].length;
  const arrStart = src.indexOf('[', afterEq);
  let depth = 0, i = arrStart, inStr = false, strCh = '';
  while (i < src.length) {
    const ch = src[i];
    if (inStr) {
      if (ch === '\\') { i += 2; continue; }
      if (ch === strCh) inStr = false;
    } else {
      if (ch === '"' || ch === "'") { inStr = true; strCh = ch; }
      else if (ch === '[') depth++;
      else if (ch === ']') { depth--; if (depth === 0) break; }
    }
    i++;
  }
  return JSON.parse(src.slice(arrStart, i + 1));
}

const FOOTER = `
export function getDemographicsForAC(constituencyId: string): ACDemographics | undefined {
  return demographics.find((d) => d.constituencyId === constituencyId);
}
`;

function main() {
  console.log('Building demographics...\n');

  const constituencies = extractArrayFromTs(CONSTITS_TS, 'constituencies');
  const census = JSON.parse(fs.readFileSync(CENSUS, 'utf8'));
  const overrides = fs.existsSync(OVERRIDES)
    ? JSON.parse(fs.readFileSync(OVERRIDES, 'utf8'))
    : {};

  const out = [];
  let proxied = 0, acOverridden = 0, unmapped = 0;

  for (const c of constituencies) {
    const d = census[c.district];
    if (!d) {
      unmapped++;
      out.push({ constituencyId: c.id, sourceYear: 2011, sourceNote: `No Census data for district "${c.district}"` });
      continue;
    }

    const entry = {
      constituencyId: c.id,
      population:     d.population,
      literacyRate:   d.literacyRate,
      sexRatio:       d.sexRatio,
      scPct:          d.scPct,
      stPct:          d.stPct,
      urbanPct:       d.urbanPct,
      sourceYear:     2011,
    };

    if (d._proxy) {
      proxied++;
      entry.sourceNote = `District-level proxy (${c.district} split from ${d._parent} post-2011)`;
    }

    if (overrides[c.id]) {
      acOverridden++;
      Object.assign(entry, overrides[c.id]);
    }

    out.push(entry);
  }

  const today = new Date().toISOString().slice(0, 10);
  const content = `// AUTO-GENERATED — WB constituency demographics — ${today}
// Built by: node scripts/build-demographics.js
// Source: Census of India 2011 (district-level) + optional AC overrides
import type { ACDemographics } from '@/types';

export const demographics: ACDemographics[] = ${JSON.stringify(out, null, 2)};
${FOOTER}`;
  fs.writeFileSync(OUTPUT, content, 'utf8');

  console.log(`✅  Done`);
  console.log(`   ACs covered          : ${out.length - unmapped} / ${constituencies.length}`);
  console.log(`   Using district proxy : ${proxied} (post-2011 district splits)`);
  console.log(`   AC-level overrides   : ${acOverridden}`);
  if (unmapped) console.log(`   ⚠  Unmapped          : ${unmapped}`);
  console.log(`   → ${path.relative(ROOT, OUTPUT)}`);
}

if (require.main === module) {
  try { main(); } catch (e) { console.error('Fatal:', e); process.exit(1); }
}

module.exports = { main };
