#!/usr/bin/env node
/**
 * build-wbmps.js — Builds src/data/wbmps.ts (WB MPs) and
 *                   src/data/ac-ls-map.ts (AC→Lok Sabha constituency mapping).
 *
 * Inputs:
 *   scripts/data/wbmps-2024.json        — hand-curated from 2024 LS election results
 *   AC_LS_RAW (hardcoded below)          — Wikipedia "List of WB constituencies" AC→LS map
 *
 * Outputs:
 *   src/data/wbmps.ts
 *   src/data/ac-ls-map.ts
 */

const fs   = require('fs');
const path = require('path');

const ROOT         = path.resolve(__dirname, '..');
const CONSTITS_TS  = path.join(ROOT, 'src/data/constituencies.ts');
const INPUT_MPS    = path.join(__dirname, 'data/wbmps-2024.json');
const OUTPUT_MPS   = path.join(ROOT, 'src/data/wbmps.ts');
const OUTPUT_MAP   = path.join(ROOT, 'src/data/ac-ls-map.ts');

// ─── AC → LS RAW DATA (Wikipedia, all 294 entries) ──────────────────────────
// Format: [ [acName, lsName], ... ] in ECI assembly-number order (1→294).
// Normalization handles minor spelling variants.
const AC_LS_RAW = [
  ['Mekliganj','Jalpaiguri'],['Mathabhanga','Cooch Behar'],['Cooch Behar Uttar','Cooch Behar'],
  ['Cooch Behar Dakshin','Cooch Behar'],['Sitalkuchi','Cooch Behar'],['Sitai','Cooch Behar'],
  ['Dinhata','Cooch Behar'],['Natabari','Cooch Behar'],['Tufanganj','Alipurduars'],
  ['Kumargram','Alipurduars'],['Kalchini','Alipurduars'],['Alipurduars','Alipurduars'],
  ['Falakata','Alipurduars'],['Madarihat','Alipurduars'],['Dhupguri','Jalpaiguri'],
  ['Maynaguri','Jalpaiguri'],['Jalpaiguri','Jalpaiguri'],['Rajganj','Jalpaiguri'],
  ['Dabgram-Fulbari','Jalpaiguri'],['Mal','Jalpaiguri'],['Nagrakata','Alipurduars'],
  ['Kalimpong','Darjeeling'],['Darjeeling','Darjeeling'],['Kurseong','Darjeeling'],
  ['Matigara-Naxalbari','Darjeeling'],['Siliguri','Darjeeling'],['Phansidewa','Darjeeling'],
  ['Chopra','Raiganj'],['Islampur','Raiganj'],['Goalpokhar','Raiganj'],
  ['Chakulia','Raiganj'],['Karandighi','Raiganj'],['Hemtabad','Raiganj'],
  ['Kaliaganj','Raiganj'],['Raiganj','Raiganj'],['Itahar','Balurghat'],
  ['Kushmandi','Balurghat'],['Kumarganj','Balurghat'],['Balurghat','Balurghat'],
  ['Tapan','Balurghat'],['Gangarampur','Balurghat'],['Harirampur','Maldaha Uttar'],
  ['Habibpur','Maldaha Uttar'],['Gazole','Maldaha Uttar'],['Chanchal','Maldaha Uttar'],
  ['Harishchandrapur','Maldaha Uttar'],['Malatipur','Maldaha Uttar'],['Ratua','Maldaha Uttar'],
  ['Manikchak','Maldaha Dakshin'],['Maldaha','Maldaha Uttar'],['English Bazar','Maldaha Dakshin'],
  ['Mothabari','Maldaha Dakshin'],['Sujapur','Maldaha Dakshin'],['Baisnabnagar','Maldaha Dakshin'],
  ['Farakka','Jangipur'],['Samserganj','Jangipur'],['Suti','Jangipur'],
  ['Jangipur','Jangipur'],['Raghunathganj','Jangipur'],['Sagardighi','Jangipur'],
  ['Lalgola','Jangipur'],['Bhagabangola','Murshidabad'],['Raninagar','Murshidabad'],
  ['Murshidabad','Murshidabad'],['Nabagram','Jangipur'],['Khargram','Jangipur'],
  ['Burwan','Baharampur'],['Kandi','Baharampur'],['Bharatpur','Baharampur'],
  ['Rejinagar','Baharampur'],['Beldanga','Baharampur'],['Baharampur','Baharampur'],
  ['Hariharpara','Murshidabad'],['Naoda','Baharampur'],['Domkal','Murshidabad'],
  ['Jalangi','Murshidabad'],['Karimpur','Krishnanagar'],['Tehatta','Krishnanagar'],
  ['Palashipara','Krishnanagar'],['Kaliganj','Krishnanagar'],['Nakashipara','Krishnanagar'],
  ['Chapra','Krishnanagar'],['Krishnanagar Uttar','Krishnanagar'],['Nabadwip','Ranaghat'],
  ['Krishnanagar Dakshin','Krishnanagar'],['Santipur','Ranaghat'],['Ranaghat Uttar Paschim','Ranaghat'],
  ['Krishnaganj','Ranaghat'],['Ranaghat Uttar Purba','Ranaghat'],['Ranaghat Dakshin','Ranaghat'],
  ['Chakdaha','Ranaghat'],['Kalyani','Bangaon'],['Haringhata','Bangaon'],
  ['Bagda','Bangaon'],['Bangaon Uttar','Bangaon'],['Bangaon Dakshin','Bangaon'],
  ['Gaighata','Bangaon'],['Swarupnagar','Bangaon'],['Baduria','Basirhat'],
  ['Habra','Barasat'],['Ashoknagar','Barasat'],['Amdanga','Barrackpore'],
  ['Bijpur','Barrackpore'],['Naihati','Barrackpore'],['Bhatpara','Barrackpore'],
  ['Jagatdal','Barrackpore'],['Noapara','Barrackpore'],['Barrackpur','Barrackpore'],
  ['Khardaha','Dum Dum'],['Dum Dum Uttar','Dum Dum'],['Panihati','Dum Dum'],
  ['Kamarhati','Dum Dum'],['Baranagar','Dum Dum'],['Dum Dum','Dum Dum'],
  ['Rajarhat New Town','Barasat'],['Bidhannagar','Dum Dum'],['Rajarhat Gopalpur','Dum Dum'],
  ['Madhyamgram','Barasat'],['Barasat','Barasat'],['Deganga','Barasat'],
  ['Haroa','Basirhat'],['Minakhan','Basirhat'],['Sandeshkhali','Basirhat'],
  ['Basirhat Dakshin','Basirhat'],['Basirhat Uttar','Basirhat'],['Hingalganj','Basirhat'],
  ['Gosaba','Jaynagar'],['Basanti','Jaynagar'],['Kultali','Jaynagar'],
  ['Patharpratima','Mathurapur'],['Kakdwip','Mathurapur'],['Sagar','Jaynagar'],
  ['Kulpi','Mathurapur'],['Raidighi','Mathurapur'],['Mandirbazar','Jaynagar'],
  ['Jaynagar','Jaynagar'],['Baruipur Purba','Jadavpur'],['Canning Paschim','Jaynagar'],
  ['Canning Purba','Jaynagar'],['Baruipur Paschim','Jadavpur'],['Magrahat Purba','Jaynagar'],
  ['Magrahat Paschim','Mathurapur'],['Diamond Harbour','Diamond Harbour'],['Falta','Diamond Harbour'],
  ['Satgachhia','Diamond Harbour'],['Bishnupur','Diamond Harbour'],['Sonarpur Dakshin','Jadavpur'],
  ['Bhangar','Diamond Harbour'],['Kasba','Kolkata Dakshin'],['Jadavpur','Jadavpur'],
  ['Sonarpur Uttar','Jadavpur'],['Tollygunge','Kolkata Dakshin'],['Behala Purba','Kolkata Dakshin'],
  ['Behala Paschim','Kolkata Dakshin'],['Maheshtala','Diamond Harbour'],['Budge Budge','Kolkata Dakshin'],
  ['Metiaburuz','Kolkata Dakshin'],['Kolkata Port','Kolkata Dakshin'],['Bhabanipur','Kolkata Dakshin'],
  ['Rashbehari','Kolkata Dakshin'],['Ballygunge','Kolkata Dakshin'],['Chowranghee','Kolkata Uttar'],
  ['Entally','Kolkata Uttar'],['Beleghata','Kolkata Uttar'],['Jorasanko','Kolkata Uttar'],
  ['Shyampukur','Kolkata Uttar'],['Maniktala','Kolkata Uttar'],['Kashipur Belgachhia','Kolkata Uttar'],
  ['Bally','Howrah'],['Howrah Uttar','Howrah'],['Howrah Madhya','Howrah'],
  ['Shibpur','Howrah'],['Howrah Dakshin','Howrah'],['Sankrail','Howrah'],
  ['Panchla','Howrah'],['Uluberia Purba','Uluberia'],['Uluberia Uttar','Uluberia'],
  ['Uluberia Dakshin','Uluberia'],['Shyampur','Uluberia'],['Bagnan','Uluberia'],
  ['Amta','Uluberia'],['Udaynarayanpur','Sreerampur'],['Jagatballavpur','Sreerampur'],
  ['Domjur','Sreerampur'],['Uttarpara','Sreerampur'],['Sreerampur','Sreerampur'],
  ['Champdani','Sreerampur'],['Singur','Hooghly'],['Chandannagar','Hooghly'],
  ['Chunchura','Hooghly'],['Balagarh','Hooghly'],['Pandua','Hooghly'],
  ['Saptagram','Hooghly'],['Chanditala','Sreerampur'],['Jangipara','Sreerampur'],
  ['Haripal','Arambagh'],['Dhanekhali','Hooghly'],['Tarakeswar','Arambagh'],
  ['Pursurah','Arambagh'],['Arambag','Arambagh'],['Goghat','Arambagh'],
  ['Khanakul','Arambagh'],['Tamluk','Tamluk'],['Panskura Purba','Tamluk'],
  ['Panskura Paschim','Ghatal'],['Moyna','Tamluk'],['Nandakumar','Tamluk'],
  ['Mahishadal','Tamluk'],['Haldia','Tamluk'],['Nandigram','Tamluk'],
  ['Chandipur','Kanthi'],['Patashpur','Kanthi'],['Kanthi Uttar','Kanthi'],
  ['Bhagabanpur','Kanthi'],['Khejuri','Kanthi'],['Kanthi Dakshin','Kanthi'],
  ['Ramnagar','Kanthi'],['Egra','Medinipur'],['Dantan','Medinipur'],
  ['Nayagram','Jhargram'],['Gopiballavpur','Jhargram'],['Jhargram','Jhargram'],
  ['Keshiary','Medinipur'],['Kharagpur Sadar','Medinipur'],['Narayangarh','Medinipur'],
  ['Sabang','Ghatal'],['Pingla','Ghatal'],['Kharagpur','Medinipur'],
  ['Debra','Ghatal'],['Daspur','Ghatal'],['Ghatal','Ghatal'],
  ['Chandrakona','Arambagh'],['Garbeta','Jhargram'],['Salboni','Jhargram'],
  ['Keshpur','Ghatal'],['Medinipur','Medinipur'],['Binpur','Jhargram'],
  ['Bandwan','Purulia'],['Balarampur','Purulia'],['Baghmundi','Purulia'],
  ['Joypur','Purulia'],['Purulia','Purulia'],['Manbazar','Purulia'],
  ['Kashipur','Purulia'],['Para','Purulia'],['Raghunathpur','Bankura'],
  ['Saltora','Bankura'],['Chhatna','Bankura'],['Ranibandh','Bankura'],
  ['Raipur','Bankura'],['Taldangra','Bankura'],['Bankura','Bankura'],
  ['Barjora','Bishnupur'],['Onda','Bishnupur'],['Bishnupur','Bishnupur'],
  ['Katulpur','Bishnupur'],['Indas','Bishnupur'],['Sonamukhi','Bishnupur'],
  ['Khandaghosh','Bardhaman Purba'],['Bardhaman Dakshin','Bardhaman-Durgapur'],['Raina','Bardhaman Purba'],
  ['Jamalpur','Bardhaman Purba'],['Manteswar','Bardhaman-Durgapur'],['Kalna','Bardhaman Purba'],
  ['Memari','Bardhaman Purba'],['Bardhaman Uttar','Bardhaman-Durgapur'],['Bhatar','Bardhaman Purba'],
  ['Purbasthali Dakshin','Bardhaman Purba'],['Purbasthali Uttar','Bardhaman Purba'],['Katwa','Bardhaman Purba'],
  ['Ketugram','Bolpur'],['Mongalkote','Bolpur'],['Ausgram','Bardhaman-Durgapur'],
  ['Galsi','Bardhaman-Durgapur'],['Pandaveswar','Asansol'],['Durgapur Purba','Bardhaman-Durgapur'],
  ['Durgapur Paschim','Bardhaman-Durgapur'],['Raniganj','Asansol'],['Jamuria','Asansol'],
  ['Asansol Dakshin','Asansol'],['Asansol Uttar','Asansol'],['Kulti','Asansol'],
  ['Barabani','Asansol'],['Dubrajpur','Birbhum'],['Suri','Birbhum'],
  ['Bolpur','Bolpur'],['Nanoor','Birbhum'],['Labhpur','Bolpur'],
  ['Sainthia','Birbhum'],['Mayureswar','Bolpur'],['Rampurhat','Birbhum'],
  ['Hansan','Birbhum'],['Nalhati','Birbhum'],['Murarai','Birbhum'],
];

// ─── helpers ─────────────────────────────────────────────────────────────────

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

function normName(s) {
  return (s || '').toLowerCase().replace(/[^a-z]/g, '');
}

// Known name aliases: our canonical name → Wikipedia/other-source variants
const ALIASES = {
  'mongalkote':      ['mangalkote'],
  'metiaburuz':      ['metiaburz'],
  'labhpur':         ['labpur'],
  'mahishadal':      ['mahisadal'],
  'harischandrapur': ['harishchandrapur'],
  'joynagar':        ['jaynagar'],
  'tollyganj':       ['tollygunge', 'tollygunj'],
  'chowrangee':      ['chowranghee', 'chowringhee'],
  'indus':           ['indas'],
  'monteswar':       ['manteswar'],
  'pandabeswar':     ['pandaveswar'],
  'englishbazar':    ['english bazar'],
};

function buildAliasIndex(constits) {
  // For names that appear in multiple constituencies (e.g. "Bishnupur"),
  // store an array so we can disambiguate by LS constituency later.
  const byNorm = new Map();
  for (const c of constits) {
    const k = normName(c.name);
    const existing = byNorm.get(k);
    if (!existing) byNorm.set(k, c);
    else if (Array.isArray(existing)) existing.push(c);
    else byNorm.set(k, [existing, c]);
  }
  // Add alias reverse-lookups (point to same value as canonical)
  for (const [canonical, variants] of Object.entries(ALIASES)) {
    const c = byNorm.get(normName(canonical));
    if (c) for (const v of variants) byNorm.set(normName(v), c);
  }
  return byNorm;
}

// Normalize district names for comparison
function normDistrict(s) { return (s || '').toLowerCase().replace(/[^a-z]/g, ''); }

// LS constituency → district hint (for ambiguous AC names like "Bishnupur")
// If the LS constituency name matches the AC name, it's the same-name LS seat
// and we pick the one whose district matches the LS's state region.
const LS_DISTRICT_HINT = {
  'bishnupur': 'bankura',           // Bishnupur LS is in Bankura
  'diamond harbour': 'south24parganas', // the other Bishnupur is in S24P → Diamond Harbour
};

// ─── build MP file ───────────────────────────────────────────────────────────

function buildMPs() {
  const mps = JSON.parse(fs.readFileSync(INPUT_MPS, 'utf8'));
  const today = new Date().toISOString().slice(0, 10);
  const content = `// AUTO-GENERATED — West Bengal Lok Sabha MPs (2024 general election) — ${today}
// Built by: node scripts/build-wbmps.js
// Source: scripts/data/wbmps-2024.json
import type { WBMP } from '@/types';

export const wbMPs: WBMP[] = ${JSON.stringify(mps, null, 2)};

export function getMPByLSConstituency(lsConstituency: string): WBMP | undefined {
  return wbMPs.find((m) => m.lsConstituency.toLowerCase() === lsConstituency.toLowerCase());
}

export function getMPById(id: string): WBMP | undefined {
  return wbMPs.find((m) => m.id === id);
}
`;
  fs.writeFileSync(OUTPUT_MPS, content, 'utf8');
  console.log(`  MPs      : ${mps.length} → ${path.relative(ROOT, OUTPUT_MPS)}`);
  return mps;
}

// ─── build AC→LS map ─────────────────────────────────────────────────────────

function buildACLSMap(constits) {
  const byNorm = buildAliasIndex(constits);
  const map = {};
  const unmatched = [];

  for (const [acName, lsName] of AC_LS_RAW) {
    const key = normName(acName);
    let hit = byNorm.get(key);
    if (!hit) { unmatched.push(acName); continue; }

    // Disambiguate multi-AC names using LS district hint
    if (Array.isArray(hit)) {
      const lsKey = normName(lsName);
      const hint = LS_DISTRICT_HINT[lsKey];
      if (hint) {
        hit = hit.find(c => normDistrict(c.district).includes(hint)) ?? hit[0];
      } else {
        hit = hit[0];
      }
    }

    map[hit.id] = lsName;
  }

  if (unmatched.length) {
    console.warn(`  AC→LS: ${unmatched.length} unmatched: ${unmatched.join(', ')}`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const content = `// AUTO-GENERATED — Assembly Constituency → Lok Sabha constituency mapping — ${today}
// Built by: node scripts/build-wbmps.js
// Source: Wikipedia "List of constituencies of the West Bengal Legislative Assembly"
// Coverage: ${Object.keys(map).length} / ${constits.length} ACs

export const acLsMap: Record<string, string> = ${JSON.stringify(map, null, 2)};

export function getLSConstituencyForAC(acId: string): string | undefined {
  return acLsMap[acId];
}
`;
  fs.writeFileSync(OUTPUT_MAP, content, 'utf8');
  console.log(`  AC→LS   : ${Object.keys(map).length} ACs mapped → ${path.relative(ROOT, OUTPUT_MAP)}`);
}

// ─── main ────────────────────────────────────────────────────────────────────

function main() {
  console.log('Building MP data + AC→LS map...\n');
  const constits = extractArrayFromTs(CONSTITS_TS, 'constituencies');
  buildMPs();
  buildACLSMap(constits);
  console.log('\n✅  Done');
}

if (require.main === module) {
  try { main(); } catch (e) { console.error('Fatal:', e.message); process.exit(1); }
}
module.exports = { main };
