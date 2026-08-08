#!/usr/bin/env node
/**
 * build-data.js — Fast data builder (no network required)
 *
 * Reads cached raw JSON → applies enrichments → writes data/seed/{candidates,constituencies}.json
 * Run after any change to overrides.json or incumbents CSV instead of re-scraping.
 *
 * Sources (in order of application):
 *   1. src/data/raw/candidates.json      (scraped cache; falls back to data/seed/candidates.json)
 *   2. src/data/raw/constituencies.json  (scraped cache; falls back to data/seed/constituencies.json)
 *   3. scripts/scraper/overrides.json    (manual field patches)
 *   4. scripts/data/incumbents-2021.csv  (WB 2021 winners → isIncumbent + incumbentYears)
 */

const fs   = require('fs');
const path = require('path');
const { readSeed, writeSeed } = require('./build-seed');

const ROOT         = path.resolve(__dirname, '..');
const RAW_DIR      = path.join(ROOT, 'src/data/raw');
const DATA_DIR     = path.join(ROOT, 'src/data');
const OVERRIDES    = path.join(__dirname, 'scraper/overrides.json');
const INCUMBENTS   = path.join(__dirname, 'data/incumbents-2021.csv');
const CANDS_JSON   = path.join(RAW_DIR, 'candidates.json');
const CONSTITS_JSON = path.join(RAW_DIR, 'constituencies.json');

// ─── helpers ──────────────────────────────────────────────────────────────────

function loadJson(jsonPath) {
  return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
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
  console.log('  No raw cache found — bootstrapping from data/seed/candidates.json');
  return readSeed('candidates');
}

function loadConstituencies() {
  if (fs.existsSync(CONSTITS_JSON)) {
    return loadJson(CONSTITS_JSON);
  }
  return readSeed('constituencies');
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

  // Write the RAW tier. src/data/{candidates,constituencies}.ts are committed typed re-exports
  // of these two files and are never generated.
  writeSeed('candidates', candidates);
  writeSeed('constituencies', constituencies);

  const incumbentCount = candidates.filter(c => c.isIncumbent).length;
  console.log(`\n✅  Done`);
  console.log(`   Candidates   : ${candidates.length}`);
  console.log(`   Incumbents   : ${incumbentCount}`);
  console.log(`   → data/seed/candidates.json`);
  console.log(`   → data/seed/constituencies.json`);
}

if (require.main === module) {
  main().catch(e => { console.error('Fatal:', e); process.exit(1); });
}

module.exports = { main };
