#!/usr/bin/env node
/**
 * sync-current-mla.js — Generate scripts/data/current-mla.json from year=2026
 * entries in src/data/historical-results.ts.
 *
 * Workflow when the Lokdhaba 2026 CSV lands:
 *   1. Drop  lokdhaba-wb-ac-2026.csv  into  src/data/raw/historical/
 *   2. npm run data:historical        → populates 2026 in historical-results.ts
 *   3. npm run data:sync-current-mla  → this script writes current-mla.json
 *   4. npm run data:current-mla       → emits TS from the JSON
 *
 * The script overwrites scripts/data/current-mla.json. Hand-curated entries
 * from before the CSV landed (e.g. the cabinet ministers' Wikipedia-sourced
 * rows) are replaced with the more authoritative Lokdhaba-derived rows.
 *
 * For each 2026 winner the script tries to match a `candidateId` against
 * src/data/candidates.ts using (constituencyId + name token overlap), so the
 * "View profile" link on MLAScorecard works out of the box.
 *
 * Aborts cleanly if no 2026 entries exist yet — no destructive overwrite.
 */

const fs   = require('fs');
const path = require('path');

const ROOT          = path.resolve(__dirname, '..');
const HISTORICAL_TS = path.join(ROOT, 'src/data/historical-results.ts');
const CANDIDATES_TS = path.join(ROOT, 'src/data/candidates.ts');
const RAW_DIR       = path.join(ROOT, 'src/data/raw/historical');
const OUTPUT        = path.join(__dirname, 'data/current-mla.json');

const TARGET_YEAR = 2026;
const TERM        = '2026-2031';

// Source URL recorded on each row. We pick the one that matches the CSV that
// actually fed historical-results, so the citation on each MLAScorecard tracks
// the upstream truth rather than a hard-coded default.
function detectSourceUrl(year) {
  const checks = [
    { file: `lokdhaba-wb-ac-${year}.csv`,                url: 'https://lokdhaba.ashoka.edu.in/' },
    { file: `IndiaVotes_AC__West_Bengal_${year}.csv`,    url: 'https://www.indiavotes.com/' },
    { file: `indiavotes-wb-ac-${year}.csv`,              url: 'https://www.indiavotes.com/' },
  ];
  for (const c of checks) {
    if (fs.existsSync(path.join(RAW_DIR, c.file))) return c.url;
  }
  return 'https://eci.gov.in/';
}

// ─── helpers (mirror build-historical extractor) ─────────────────────────────

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

function tokens(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3);
}

function matchCandidate(winnerName, constituencyId, candidates) {
  const wantTokens = tokens(winnerName);
  if (!wantTokens.length) return null;

  const inAc = candidates.filter(c => c.constituencyId === constituencyId);
  // Score by token overlap. We prefer exact name matches, then incumbents,
  // then anyone with at least 2-token overlap.
  let best = null;
  let bestScore = 0;
  for (const c of inAc) {
    const haveTokens = new Set(tokens(c.name));
    const overlap = wantTokens.filter(t => haveTokens.has(t)).length;
    if (overlap === 0) continue;
    const score = overlap + (c.isIncumbent ? 0.5 : 0);
    if (score > bestScore) { best = c; bestScore = score; }
  }
  // Require at least 2-token overlap to call it a match (avoids matching
  // common single tokens like "Banerjee" against the wrong candidate).
  if (!best || bestScore < 2) return null;
  return best;
}

// ─── main ────────────────────────────────────────────────────────────────────

function main() {
  console.log(`Syncing current-mla.json from year=${TARGET_YEAR} historical results...\n`);

  if (!fs.existsSync(HISTORICAL_TS)) {
    throw new Error(`${path.relative(ROOT, HISTORICAL_TS)} not found — run \`npm run data:historical\` first.`);
  }

  const historical = extractArrayFromTs(HISTORICAL_TS, 'historicalResults');
  const yearRows   = historical.filter(r => r.year === TARGET_YEAR);

  if (yearRows.length === 0) {
    console.error(`✗ No year=${TARGET_YEAR} entries in historical-results.ts.\n`);
    console.error(`  Expected workflow:`);
    console.error(`    1. Drop  lokdhaba-wb-ac-${TARGET_YEAR}.csv  into src/data/raw/historical/`);
    console.error(`    2. Run   npm run data:historical`);
    console.error(`    3. Re-run this script.`);
    console.error(`\n  Aborting — current-mla.json left untouched.`);
    process.exit(2);
  }

  const candidates = extractArrayFromTs(CANDIDATES_TS, 'candidates');
  const sourceUrl  = detectSourceUrl(TARGET_YEAR);

  let matched = 0;
  const records = yearRows.map(row => {
    const profile = matchCandidate(row.winner.name, row.constituencyId, candidates);
    if (profile) matched++;
    // Some source CSVs (e.g. IndiaVotes summary exports) don't carry the
    // winner's vote share or per-candidate votes. We canonicalise those to
    // null in current-mla.json so downstream UI treats them as "unknown"
    // rather than "literally 0%".
    const margin    = typeof row.marginVotes === 'number' && row.marginVotes !== 0 ? row.marginVotes : null;
    const voteShare = typeof row.winner.voteShare === 'number' && row.winner.voteShare > 0 ? row.winner.voteShare : null;
    return {
      constituencyId: row.constituencyId,
      name:           row.winner.name,
      partyId:        row.winner.partyId,
      term:           TERM,
      marginVotes:    margin,
      voteShare:      voteShare,
      candidateId:    profile?.id ?? null,
      sourceUrl:      sourceUrl,
    };
  });

  // Stable sort by constituencyId for diff-friendly output.
  records.sort((a, b) => a.constituencyId.localeCompare(b.constituencyId));

  fs.writeFileSync(OUTPUT, JSON.stringify(records, null, 2) + '\n', 'utf8');

  const byParty = records.reduce((acc, r) => { acc[r.partyId] = (acc[r.partyId] || 0) + 1; return acc; }, {});

  console.log(`✅  Done`);
  console.log(`   Records  : ${records.length} / 294`);
  console.log(`   Matched  : ${matched} / ${records.length} candidate profiles linked`);
  console.log(`   Parties  : ${Object.entries(byParty).map(([p, n]) => `${p}=${n}`).join(', ')}`);
  console.log(`   → ${path.relative(ROOT, OUTPUT)}`);
  console.log(`\nNext: npm run data:current-mla`);
}

if (require.main === module) {
  try { main(); } catch (e) { console.error('Fatal:', e.message); process.exit(1); }
}

module.exports = { main };
