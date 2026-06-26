#!/usr/bin/env node
/**
 * build-historical.js — Builds src/data/historical-results.ts from raw per-year inputs.
 *
 * Inputs (in order of priority — first match wins per year):
 *   1. src/data/raw/historical/lokdhaba-wb-ac-{year}.csv  (preferred — full field-level data)
 *   2. src/data/raw/historical/{year}.json                (legacy backfill shape)
 *   3. scripts/data/incumbents-2021.csv                   (2021-only last resort)
 *
 * Output:
 *   src/data/historical-results.ts
 *
 * Raw JSON shape per year:
 *   [ { constituencyId, year, winner: {name, partyId, partyAbbr, votes, voteShare},
 *       runnerUp?: {...}, topContestants?: [...], turnoutPct, marginVotes, marginPct,
 *       totalVotes, totalElectors? } ]
 *
 * CSV shape (from scripts/extract-eci-pdfs.js):
 *   year, ac_number, constituency_name, position, candidate,
 *   sex, age, category, party,
 *   votes_general, votes_postal, votes, vote_share_pct,
 *   total_electors, turnout_pct, margin
 *
 * If all three inputs for a year are missing, that year is silently skipped —
 * the output file always compiles.
 */

const fs   = require('fs');
const path = require('path');

const ROOT          = path.resolve(__dirname, '..');
const RAW_DIR       = path.join(ROOT, 'src/data/raw/historical');
const DATA_DIR      = path.join(ROOT, 'src/data');
const INCUMBENTS    = path.join(__dirname, 'data/incumbents-2021.csv');
const CONSTITS_TS   = path.join(DATA_DIR, 'constituencies.ts');
const OUTPUT        = path.join(DATA_DIR, 'historical-results.ts');

// ─── helpers ──────────────────────────────────────────────────────────────────

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

function normConst(s) {
  return (s || '').toLowerCase().replace(/[^a-z]/g, '');
}

const CONST_ALIASES = {
  'burdwan':   'bardhaman',
  'asnsol':    'asansol',
  'jaynagar':  'joynagar',
  'maniktola': 'maniktala',
};

function normConstCsv(s) {
  let n = (s || '')
    .replace(/\s*\((SC|ST|GEN)\)\s*/gi, '')
    .trim()
    .toLowerCase();
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
    header.forEach((h, i) => { row[h.trim()] = (cols[i] || '').replace(/"/g, '').trim(); });
    return row;
  });
}

// Map CSV party-name → party.id used in src/data/parties.ts.
// Falls back to IND for anything not in this table (honest data).
const PARTY_NAME_TO_ID = {
  'all india trinamool congress':              'AITC',
  'bharatiya janta party':                     'BJP',
  'bharatiya janata party':                    'BJP',
  'indian national congress':                  'INC',
  'communist party of india (marxist)':        'CPI(M)',
  'communist party of india  (marxist)':       'CPI(M)',
  'all india secular front':                   'ALL INDIA SECULAR FRONT',
  'revolutionary socialist party':             'RSP',
  'all india forward bloc':                    'ALL INDIA FORWARD BLOC',
  'socialist unity centre of india (communist)': 'SUCI',
  'independent':                               'IND',
};

const PARTY_ABBR = {
  'AITC':   'TMC',
  'BJP':    'BJP',
  'INC':    'INC',
  'CPI(M)': 'CPM',
  'ALL INDIA SECULAR FRONT': 'AISF',
  'RSP':    'RSP',
  'ALL INDIA FORWARD BLOC':  'AIFB',
  'SUCI':   'SUCI(C)',
  'IND':    'IND',
};

function resolveParty(name) {
  const key = (name || '').toLowerCase().trim();
  const id  = PARTY_NAME_TO_ID[key] || 'IND';
  return { id, abbr: PARTY_ABBR[id] || 'IND' };
}

function parsePercent(s) {
  if (!s) return 0;
  const m = String(s).match(/-?[\d.]+/);
  return m ? parseFloat(m[0]) : 0;
}

function parseNumber(s) {
  if (!s) return 0;
  const n = parseInt(String(s).replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

// ─── 2021 from incumbents CSV ─────────────────────────────────────────────────

function load2021FromCsv(constituencies) {
  if (!fs.existsSync(INCUMBENTS)) return [];
  const csv = parseSimpleCsv(fs.readFileSync(INCUMBENTS, 'utf8'));
  const byName = new Map(constituencies.map(c => [normConst(c.name), c.id]));

  const results = [];
  let unmatched = 0;

  for (const row of csv) {
    const acName = row['AC Name'];
    const winnerName = row['Winning Candidate'];
    if (!acName || !winnerName) continue;

    const constId = byName.get(normConstCsv(acName));
    if (!constId) { unmatched++; continue; }

    const party = resolveParty(row['Party']);
    const totalVotes    = parseNumber(row['Total Votes']);
    const totalElectors = parseNumber(row['Total Electors']);
    const marginVotes   = parseNumber(row['Margin']);
    const turnoutPct    = parsePercent(row['Poll%']);
    const marginPct     = parsePercent(row['Margin %']);

    results.push({
      constituencyId: constId,
      year: 2021,
      winner: {
        name:      winnerName,
        partyId:   party.id,
        partyAbbr: party.abbr,
        votes:     0,             // CSV doesn't carry winner's votes directly
        voteShare: 0,             // will be backfilled when per-year JSON arrives
      },
      turnoutPct,
      marginVotes,
      marginPct,
      totalVotes,
      totalElectors: totalElectors || undefined,
    });
  }

  if (unmatched) console.log(`  2021 CSV: ${unmatched} AC(s) not matched to constituency IDs`);
  return results;
}

// ─── per-year raw JSON backfill ───────────────────────────────────────────────

function loadRawYear(year) {
  const p = path.join(RAW_DIR, `${year}.json`);
  if (!fs.existsSync(p)) {
    return [];
  }
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!Array.isArray(data)) throw new Error(`${p} must be an array`);
  return data.map(r => ({ ...r, year }));
}

// ─── Lokdhaba-shaped CSV (preferred format) ───────────────────────────────────
//
// Map ECI abbreviation (from lokdhaba-wb-ac-*.csv `party` column) to the
// partyId values used in src/data/parties.ts. Unknown abbreviations fall back
// to 'IND' (the plan's honest-default rule).
const CSV_PARTY_TO_ID = {
  AITC:       'AITC',
  BJP:        'BJP',
  INC:        'INC',
  BSP:        'BSP',
  'CPI(M)':   'CPI(M)',
  CPM:        'CPI(M)',
  CPI:        'CPI',
  AIFB:       'ALL INDIA FORWARD BLOC',
  RSP:        'RSP',
  SUCI:       'SUCI',
  'SUCI(C)':  'SUCI',
  NCP:        'NCP',
  AIMIM:      'ALL INDIA MAJLIS-E-ITTEHADUL MUSLIMEEN',
  AMB:        'AMRA BANGALEE',
  KPPU:       'KAMATAPUR PEOPLES PARTY (UNITED)',
  GOJAM:      'BHARATIYA GORKHA PRAJATANTRIK MORCHA',
  GJM:        'BHARATIYA GORKHA PRAJATANTRIK MORCHA',
  RSSCMJP:    'ALL INDIA SECULAR FRONT', // ISF contested under RSMP banner in 2021
  ISF:        'ALL INDIA SECULAR FRONT',
  IND:        'IND',
  NOTA:       'NOTA',
};

// Party-id → abbreviation display form. Kept local so build-historical
// doesn't need to parse parties.ts (which has inline comments / non-JSON).
const PARTY_ID_TO_ABBR = {
  'AITC':                                  'TMC',
  'BJP':                                   'BJP',
  'INC':                                   'INC',
  'BSP':                                   'BSP',
  'CPI(M)':                                'CPM',
  'CPI':                                   'CPI',
  'SUCI':                                  'SUCI(C)',
  'RSP':                                   'RSP',
  'NCP':                                   'NCP',
  'ALL INDIA FORWARD BLOC':                'AIFB',
  'ALL INDIA SECULAR FRONT':               'ISF',
  'ALL INDIA MAJLIS-E-ITTEHADUL MUSLIMEEN':'AIMIM',
  'AMRA BANGALEE':                         'AB',
  'KAMATAPUR PEOPLES PARTY (UNITED)':      'KPP',
  'BHARATIYA GORKHA PRAJATANTRIK MORCHA':  'BGPM',
  'IND':                                   'IND',
  'NOTA':                                  'NOTA',
};

function resolveCsvParty(abbrFromCsv) {
  const abbr = (abbrFromCsv || '').trim();
  if (!abbr) return { id: 'IND', abbr: 'IND' };
  const id = CSV_PARTY_TO_ID[abbr] || 'IND';
  return { id, abbr: PARTY_ID_TO_ABBR[id] || abbr };
}

function parseCsvLine(line) {
  // Minimal CSV parser with quote handling (names like "Arup Roy, S/o Late").
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else {
      if (ch === '"') q = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function loadLokdhabaCsv(year, constituencies) {
  const p = path.join(RAW_DIR, `lokdhaba-wb-ac-${year}.csv`);
  if (!fs.existsSync(p)) return [];

  const text    = fs.readFileSync(p, 'utf8');
  const lines   = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const header  = parseCsvLine(lines[0]).map(h => h.trim());
  const idx     = Object.fromEntries(header.map((h, i) => [h, i]));

  // Index lookups. The ECI PDF AC-number doesn't always match
  // constituencies.ts assemblyNumber (reorg between election cycles), so we
  // match by normalised name first and fall back to AC number.
  const byAcNum = new Map(constituencies.map(c => [c.assemblyNumber, c]));
  const byName  = new Map(constituencies.map(c => [normConstCsv(c.name), c]));

  function findConstituency(acNum, name) {
    const byN = byName.get(normConstCsv(name));
    if (byN) return byN;
    return byAcNum.get(acNum) || null;
  }

  // Group rows by (acNum, name) — treat each AC block as one unit.
  const byAc = new Map();
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const acNum = Number(cols[idx.ac_number]);
    const acName = cols[idx.constituency_name];
    if (!acNum) continue;
    const key = `${acNum}|${acName}`;
    if (!byAc.has(key)) byAc.set(key, { acNum, acName, rows: [] });
    byAc.get(key).rows.push({
      position:       Number(cols[idx.position]),
      candidate:      cols[idx.candidate],
      partyAbbrRaw:   cols[idx.party],
      votes:          Number(cols[idx.votes]) || 0,
      voteShare:      Number(cols[idx.vote_share_pct]) || 0,
      totalElectors:  Number(cols[idx.total_electors]) || 0,
      turnoutPct:     Number(cols[idx.turnout_pct]) || 0,
    });
  }

  const results = [];
  const unmatched = [];

  for (const { acNum, acName, rows } of byAc.values()) {
    const constituency = findConstituency(acNum, acName);
    if (!constituency) { unmatched.push(`#${acNum} ${acName}`); continue; }

    const sorted = rows.sort((a, b) => a.position - b.position);
    const nonNota = sorted.filter(r => r.partyAbbrRaw !== 'NOTA' && r.candidate !== 'NOTA');

    const winner   = nonNota[0];
    const runnerUp = nonNota[1];
    if (!winner) continue;

    const toContestant = (r) => {
      const party = resolveCsvParty(r.partyAbbrRaw);
      return {
        name:      r.candidate,
        partyId:   party.id,
        partyAbbr: party.abbr,
        votes:     r.votes,
        voteShare: r.voteShare,
      };
    };

    const totalVotes = sorted.reduce((s, r) => s + r.votes, 0);
    const marginVotes = runnerUp ? (winner.votes - runnerUp.votes) : 0;
    const marginPct = totalVotes > 0 ? +(marginVotes / totalVotes * 100).toFixed(2) : 0;

    results.push({
      constituencyId: constituency.id,
      year,
      winner:   toContestant(winner),
      runnerUp: runnerUp ? toContestant(runnerUp) : undefined,
      topContestants: nonNota.slice(0, 5).map(toContestant),
      turnoutPct:    winner.turnoutPct,
      marginVotes,
      marginPct,
      totalVotes,
      totalElectors: winner.totalElectors || undefined,
    });
  }

  if (unmatched.length) {
    console.log(`  ${year} CSV: ${unmatched.length} AC(s) unmatched: ${unmatched.slice(0, 5).join(', ')}${unmatched.length > 5 ? '...' : ''}`);
  }
  return results;
}

// ─── IndiaVotes-shaped CSV (winner-only summary) ──────────────────────────────
//
// Used as a fallback when a Lokdhaba CSV isn't yet available for a year. Format:
//   "AC Name","AC No.","Type","District","Winning Candidate","Party",
//   "Total Electors","Total Votes","Poll%","Margin","Margin %"
//
// Single row per AC. Winner only — no runner-up, no per-candidate vote share.
// We populate winner.voteShare = 0 since this source doesn't carry it; sync
// scripts treat 0 as "missing" and write null downstream.
//
// AC matching: IndiaVotes AC numbers don't line up with our `assemblyNumber`
// (different sources use different numbering conventions), so we match on
// name only — with an alias map for known spelling variants and district
// disambiguation for names that exist twice (e.g. two Bishnupurs).

// IndiaVotes spelling → our canonical spelling (both normalised via normConstCsv).
const INDIAVOTES_NAME_ALIASES = {
  'haora':            'haroa',
  'mahisadal':        'mahishadal',
  'labpur':           'labhpur',
  'kanthidakshn':     'kanthidakshin',
  'dabgramphulbari':  'dabgramfulbari',
  'kushmundi':        'kushmandi',
  'mangalkote':       'mongalkote',
  'matiaburz':        'metiaburuz',
};

function normDistrict(s) {
  return (s || '').toLowerCase().replace(/[^a-z]/g, '');
}

function loadIndiaVotesCsv(year, constituencies) {
  const candidates = [
    path.join(RAW_DIR, `IndiaVotes_AC__West_Bengal_${year}.csv`),
    path.join(RAW_DIR, `indiavotes-wb-ac-${year}.csv`),
  ];
  const file = candidates.find(p => fs.existsSync(p));
  if (!file) return [];

  const text  = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]).map(h => h.trim());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const need = ['AC Name', 'AC No.', 'Winning Candidate', 'Party', 'Total Votes', 'Total Electors', 'Poll%', 'Margin', 'Margin %', 'District'];
  for (const k of need) {
    if (idx[k] === undefined) {
      console.log(`  ${year} IndiaVotes: missing column "${k}" — skipping file`);
      return [];
    }
  }

  // Build name → constituency lookups. For names that are unique we keep a
  // direct map; for duplicates (e.g. "Bishnupur") we keep an array and pick
  // by district at lookup time.
  const byName = new Map();
  for (const c of constituencies) {
    const k = normConstCsv(c.name);
    const existing = byName.get(k);
    if (!existing) byName.set(k, c);
    else if (Array.isArray(existing)) existing.push(c);
    else byName.set(k, [existing, c]);
  }

  function resolve(rawName, rawDistrict) {
    let key = normConstCsv(rawName);
    key = INDIAVOTES_NAME_ALIASES[key] || key;
    const hit = byName.get(key);
    if (!hit) return null;
    if (Array.isArray(hit)) {
      const wantDistrict = normDistrict(rawDistrict);
      const match = hit.find(c => normDistrict(c.district) === wantDistrict);
      return match ?? hit[0]; // fall back to first — better than nothing
    }
    return hit;
  }

  const results = [];
  const claimed = new Set();
  const unmatched = [];
  const collisions = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const acName = (cols[idx['AC Name']] || '').trim();
    if (!acName || acName === 'AC Name') continue; // skip duplicated header rows

    const district = (cols[idx['District']] || '').trim();
    const constituency = resolve(acName, district);
    if (!constituency) {
      unmatched.push(`${acName} (${district || 'no district'})`);
      continue;
    }
    if (claimed.has(constituency.id)) {
      collisions.push(`${acName} → already claimed ${constituency.id} (${constituency.name})`);
      continue;
    }
    claimed.add(constituency.id);

    const winnerName = (cols[idx['Winning Candidate']] || '').trim();
    if (!winnerName) continue;
    const party = resolveParty(cols[idx['Party']]);

    results.push({
      constituencyId: constituency.id,
      year,
      winner: {
        name:      winnerName,
        partyId:   party.id,
        partyAbbr: party.abbr,
        votes:     0,                    // not provided per-candidate in this format
        voteShare: 0,                    // not provided — sync scripts treat 0 as missing
      },
      turnoutPct:    parsePercent(cols[idx['Poll%']]),
      marginVotes:   parseNumber(cols[idx['Margin']]),
      marginPct:     parsePercent(cols[idx['Margin %']]),
      totalVotes:    parseNumber(cols[idx['Total Votes']]),
      totalElectors: parseNumber(cols[idx['Total Electors']]) || undefined,
    });
  }

  if (unmatched.length) {
    console.log(`  ${year} IndiaVotes: ${unmatched.length} AC(s) unmatched — add aliases?`);
    unmatched.slice(0, 10).forEach(s => console.log(`    · ${s}`));
    if (unmatched.length > 10) console.log(`    · …and ${unmatched.length - 10} more`);
  }
  if (collisions.length) {
    console.log(`  ${year} IndiaVotes: ${collisions.length} duplicate-claim collision(s)`);
    collisions.slice(0, 5).forEach(s => console.log(`    · ${s}`));
  }
  return results;
}

// ─── generate output ──────────────────────────────────────────────────────────

const FOOTER = `
export function getHistoricalResultsForAC(constituencyId: string): HistoricalACResult[] {
  return historicalResults
    .filter((r) => r.constituencyId === constituencyId)
    .sort((a, b) => a.year - b.year);
}

export function getHistoricalResultForACYear(
  constituencyId: string,
  year: number,
): HistoricalACResult | undefined {
  return historicalResults.find((r) => r.constituencyId === constituencyId && r.year === year);
}

export function getAvailableHistoricalYears(): number[] {
  return Array.from(new Set(historicalResults.map((r) => r.year))).sort();
}
`;

function writeOutput(byYear) {
  const today = new Date().toISOString().slice(0, 10);
  const years = Object.keys(byYear).map(Number).sort();

  // Emit one constant per year, then a flat union at the end. Without this
  // split the combined ~1175-row literal blew past TS's TS2590 "union too
  // complex to represent" threshold once we added the 2026 year.
  const perYearConsts = years.map(y => {
    return `const _r${y}: HistoricalACResult[] = ${JSON.stringify(byYear[y], null, 2)};`;
  }).join('\n\n');

  const concatExpr = years.map(y => `..._r${y}`).join(', ');

  const content = `// AUTO-GENERATED — WB historical Assembly results — ${today}
// Built by: node scripts/build-historical.js
// Sources: src/data/raw/historical/lokdhaba-wb-ac-{year}.csv (preferred)
//        + src/data/raw/historical/IndiaVotes_AC__West_Bengal_{year}.csv (winner-only fallback)
//        + src/data/raw/historical/{year}.json (legacy)
//        + scripts/data/incumbents-2021.csv (2021 last-resort)
import type { HistoricalACResult } from '@/types';

${perYearConsts}

export const historicalResults: HistoricalACResult[] = [${concatExpr}];
${FOOTER}`;
  fs.writeFileSync(OUTPUT, content, 'utf8');
}

// ─── main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log('Building historical results...\n');
  fs.mkdirSync(RAW_DIR, { recursive: true });

  const constituencies = extractArrayFromTs(CONSTITS_TS, 'constituencies');

  const YEARS = [2011, 2016, 2021, 2026];
  const byYear = Object.fromEntries(YEARS.map(y => [y, []]));

  for (const year of YEARS) {
    // Priority 1: Lokdhaba-shape CSV (full field-level data)
    const csvRows = loadLokdhabaCsv(year, constituencies);
    if (csvRows.length) {
      byYear[year] = csvRows;
      console.log(`  ${year}: ${csvRows.length} AC(s) from lokdhaba-wb-ac-${year}.csv`);
      continue;
    }
    // Priority 1.5: IndiaVotes-shape CSV (winner-only summary)
    const ivRows = loadIndiaVotesCsv(year, constituencies);
    if (ivRows.length) {
      byYear[year] = ivRows;
      console.log(`  ${year}: ${ivRows.length} AC(s) from IndiaVotes CSV`);
      continue;
    }
    // Priority 2: Raw per-year JSON (legacy)
    const jsonRows = loadRawYear(year);
    if (jsonRows.length) {
      byYear[year] = jsonRows;
      console.log(`  ${year}: ${jsonRows.length} AC(s) from ${year}.json`);
      continue;
    }
    // Priority 3: 2021-only incumbents CSV fallback
    if (year === 2021) {
      const fallback = load2021FromCsv(constituencies);
      if (fallback.length) {
        byYear[year] = fallback;
        console.log(`  2021: ${fallback.length} AC(s) from incumbents CSV (fallback)`);
        continue;
      }
    }
    console.log(`  ${year}: no input found — skipping`);
  }

  const all = YEARS.flatMap(y => byYear[y]);
  writeOutput(byYear);

  console.log('\n✅  Done');
  for (const year of YEARS) {
    console.log(`   ${year}: ${byYear[year].length} AC result(s)`);
  }
  console.log(`   total rows: ${all.length}`);
  console.log(`   → ${path.relative(ROOT, OUTPUT)}`);
}

if (require.main === module) {
  try { main(); } catch (e) { console.error('Fatal:', e); process.exit(1); }
}

module.exports = { main };
