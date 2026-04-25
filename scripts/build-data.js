#!/usr/bin/env node
/**
 * build-data.js — Fast data builder (no network required)
 *
 * Reads cached raw JSON → applies enrichments → writes src/data/candidates.ts + constituencies.ts
 * Run after any change to overrides.json or incumbents CSV instead of re-scraping.
 *
 * Sources (in order of application):
 *   1. src/data/raw/candidates.json      (scraped cache; falls back to parsing candidates.ts on first run)
 *   2. src/data/raw/constituencies.json  (scraped cache; falls back to parsing constituencies.ts)
 *   3. scripts/scraper/overrides.json    (manual field patches)
 *   4. scripts/data/incumbents-2021.csv  (WB 2021 winners → isIncumbent + incumbentYears)
 */

const fs   = require('fs');
const path = require('path');

const ROOT         = path.resolve(__dirname, '..');
const RAW_DIR      = path.join(ROOT, 'src/data/raw');
const DATA_DIR     = path.join(ROOT, 'src/data');
const OVERRIDES    = path.join(__dirname, 'scraper/overrides.json');
const INCUMBENTS   = path.join(__dirname, 'data/incumbents-2021.csv');
const CANDS_TS     = path.join(DATA_DIR, 'candidates.ts');
const CONSTITS_TS  = path.join(DATA_DIR, 'constituencies.ts');
const CANDS_JSON   = path.join(RAW_DIR, 'candidates.json');
const CONSTITS_JSON = path.join(RAW_DIR, 'constituencies.json');

// ─── helpers ──────────────────────────────────────────────────────────────────

function loadJson(jsonPath) {
  return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
}

function extractArrayFromTs(tsPath, exportName) {
  const src = fs.readFileSync(tsPath, 'utf8');
  // Find the `= [` that follows the export declaration, skipping past the TS type annotation
  const declRe = new RegExp(`export const ${exportName}[^\\n]+=`);
  const declMatch = declRe.exec(src);
  if (!declMatch) throw new Error(`Cannot find export ${exportName} in ${tsPath}`);
  const afterEq = declMatch.index + declMatch[0].length;
  // Find the opening `[` of the array literal (right after `=`)
  const arrStart = src.indexOf('[', afterEq);
  if (arrStart === -1) throw new Error(`Cannot find array start for ${exportName} in ${tsPath}`);
  // Walk brackets, string-aware to skip `[`/`]` inside quoted values
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
  return (s || '').toUpperCase().replace(/[^A-Z ]/g, '').replace(/\s+/g, ' ').trim();
}

function normConst(s) {
  return (s || '').toLowerCase().replace(/[^a-z]/g, '');
}

// Normalize CSV constituency names: strip reservation markers, fix known aliases
const CONST_ALIASES = {
  'burdwan': 'bardhaman',   // Burdwan Dakshin/Uttar → Bardhaman Dakshin/Uttar
  'asnsol':  'asansol',     // typo in CSV
  'jaynagar': 'joynagar',   // transliteration difference
  'maniktola': 'maniktala', // transliteration difference
};

function normConstCsv(s) {
  let n = (s || '')
    .replace(/\s*\((SC|ST|GEN)\)\s*/gi, '')  // strip reservation markers
    .trim()
    .toLowerCase();
  // Apply word-level aliases
  for (const [from, to] of Object.entries(CONST_ALIASES)) {
    n = n.replace(new RegExp(`\\b${from}\\b`, 'g'), to);
  }
  return n.replace(/[^a-z]/g, '');
}

function parseSimpleCsv(text) {
  const lines = text.split('\n').filter(l => l.trim());
  const header = lines[0].replace(/"/g, '').split(',');
  return lines.slice(1).map(line => {
    const cols = line.split(',');
    const row = {};
    header.forEach((h, i) => { row[h.trim()] = (cols[i] || '').trim(); });
    return row;
  });
}

// ─── load raw data ─────────────────────────────────────────────────────────────

function loadCandidates() {
  if (fs.existsSync(CANDS_JSON)) {
    console.log('  Reading src/data/raw/candidates.json');
    return loadJson(CANDS_JSON);
  }
  console.log('  No raw cache found — bootstrapping from src/data/candidates.ts');
  return extractArrayFromTs(CANDS_TS, 'candidates');
}

function loadConstituencies() {
  if (fs.existsSync(CONSTITS_JSON)) {
    return loadJson(CONSTITS_JSON);
  }
  return extractArrayFromTs(CONSTITS_TS, 'constituencies');
}

// ─── apply overrides ───────────────────────────────────────────────────────────

function applyOverrides(candidates) {
  if (!fs.existsSync(OVERRIDES)) return 0;
  const overrides = loadJson(OVERRIDES);
  let count = 0;
  const map = new Map(candidates.map(c => [c.id, c]));
  for (const [id, patch] of Object.entries(overrides)) {
    if (id.startsWith('_')) continue;
    const cand = map.get(id);
    if (!cand) continue;
    for (const [k, v] of Object.entries(patch)) {
      if (!k.startsWith('_')) { cand[k] = v; count++; }
    }
  }
  return count;
}

// ─── apply incumbency ──────────────────────────────────────────────────────────

function applyIncumbents(candidates, constituencies) {
  if (!fs.existsSync(INCUMBENTS)) {
    console.log('  incumbents-2021.csv not found — skipping');
    return { matched: 0, unmatched: [] };
  }

  const csv = parseSimpleCsv(fs.readFileSync(INCUMBENTS, 'utf8'));

  // Build constituency name → id lookup
  const constByName = new Map();
  for (const c of constituencies) {
    constByName.set(normConst(c.name), c.id);
  }

  // Group candidates by constituency for fast lookup
  const byConstituency = new Map();
  for (const cand of candidates) {
    if (!byConstituency.has(cand.constituencyId)) byConstituency.set(cand.constituencyId, []);
    byConstituency.get(cand.constituencyId).push(cand);
  }

  let matched = 0;
  const unmatched = [];

  for (const row of csv) {
    const acName      = (row['AC Name'] || '').trim();
    const winnerName  = (row['Winning Candidate'] || '').trim();
    if (!acName || !winnerName) continue;

    const constId = constByName.get(normConstCsv(acName));
    if (!constId) {
      unmatched.push({ acName, winnerName, reason: 'constituency not found' });
      continue;
    }

    const pool = byConstituency.get(constId) || [];
    const normWinner = normName(winnerName);
    const winnerTokens = normWinner.split(' ').filter(Boolean);

    let found = null;

    // Pass 1: exact normalized match
    for (const cand of pool) {
      if (normName(cand.name) === normWinner) { found = cand; break; }
    }

    // Pass 2: token subset (all shorter-name tokens present in longer)
    if (!found) {
      for (const cand of pool) {
        const candTokens = normName(cand.name).split(' ').filter(Boolean);
        const shorter = winnerTokens.length <= candTokens.length ? winnerTokens : candTokens;
        const longer  = winnerTokens.length <= candTokens.length ? candTokens : winnerTokens;
        if (shorter.every(t => longer.includes(t))) { found = cand; break; }
      }
    }

    if (found) {
      found.isIncumbent = true;
      found.incumbentYears = 5;
      matched++;
    } else {
      unmatched.push({ acName, winnerName, reason: 'name not found in constituency' });
    }
  }

  return { matched, unmatched };
}

// ─── generate TypeScript files ────────────────────────────────────────────────

const CANDS_FOOTER = `
export function getCandidatesByConstituency(constituencyId: string): Candidate[] {
  return candidates.filter((c) => c.constituencyId === constituencyId);
}

export function getCandidateById(id: string): Candidate | undefined {
  return candidates.find((c) => c.id === id);
}

export function getCandidatesByIds(ids: string[]): Candidate[] {
  return ids.map((id) => candidates.find((c) => c.id === id)).filter(Boolean) as Candidate[];
}

export function formatAssets(amount: number): string {
  if (amount >= 10_000_000) return \`₹\${(amount / 10_000_000).toFixed(2)} Cr\`;
  if (amount >= 100_000)    return \`₹\${(amount / 100_000).toFixed(2)} L\`;
  if (amount >= 1_000)      return \`₹\${(amount / 1_000).toFixed(1)}K\`;
  return \`₹\${amount}\`;
}
`;

const CONSTITS_FOOTER = `
export function getConstituencyById(id: string): Constituency | undefined {
  return constituencies.find((c) => c.id === id);
}

export function getConstituenciesByDistrict(): Record<string, Constituency[]> {
  return constituencies.reduce<Record<string, Constituency[]>>((acc, c) => {
    if (!acc[c.district]) acc[c.district] = [];
    acc[c.district].push(c);
    return acc;
  }, {});
}
`;

function writeTs(filePath, importType, exportName, data, footer) {
  const today = new Date().toISOString().slice(0, 10);
  const content = `// AUTO-GENERATED — myneta.info/WestBengal2026 — ${today}
// Built by: node scripts/build-data.js
import type { ${importType} } from '@/types';

export const ${exportName}: ${importType}[] = ${JSON.stringify(data, null, 2)};
${footer}`;
  fs.writeFileSync(filePath, content, 'utf8');
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Building candidate data...\n');

  const candidates     = loadCandidates();
  const constituencies = loadConstituencies();

  // Apply enrichments
  const overrideCount = applyOverrides(candidates);
  if (overrideCount) console.log(`  Overrides applied    : ${overrideCount} field(s)`);

  const { matched, unmatched } = applyIncumbents(candidates, constituencies);
  console.log(`  Incumbents matched   : ${matched} / ${constituencies.length}`);

  if (unmatched.length) {
    console.log(`\n  Unmatched 2021 winners (${unmatched.length}) — add to overrides.json if running in 2026:`);
    for (const u of unmatched) {
      console.log(`    [${u.acName}] "${u.winnerName}" — ${u.reason}`);
    }
    console.log('');
  }

  // Write output TS files
  fs.mkdirSync(DATA_DIR, { recursive: true });
  writeTs(CANDS_TS, 'Candidate', 'candidates', candidates, CANDS_FOOTER);
  writeTs(CONSTITS_TS, 'Constituency', 'constituencies', constituencies, CONSTITS_FOOTER);

  const incumbentCount = candidates.filter(c => c.isIncumbent).length;
  console.log(`\n✅  Done`);
  console.log(`   Candidates   : ${candidates.length}`);
  console.log(`   Incumbents   : ${incumbentCount}`);
  console.log(`   → src/data/candidates.ts`);
  console.log(`   → src/data/constituencies.ts`);
}

if (require.main === module) {
  main().catch(e => { console.error('Fatal:', e); process.exit(1); });
}

module.exports = { main };
