#!/usr/bin/env node
/**
 * scripts/scraper/prs-wb-mla.js
 *
 * Scrapes PRS India for West Bengal MLA performance data.
 * Run this FROM YOUR LOCAL MACHINE (not from the server) since PRS India
 * blocks server IP ranges.
 *
 * Usage:
 *   node scripts/scraper/prs-wb-mla.js
 *   # or: node scripts/scraper/prs-wb-mla.js --term 2026-2031
 *
 * Output:
 *   Merges results into scripts/data/mla-records.json
 *   Then run: npm run data:mla
 *
 * What it scrapes:
 *   https://prsindia.org/legislatures/states/west-bengal/members-performance
 *   - Attendance %
 *   - Questions asked
 *   - Bills introduced
 *   - Debates / discussions participated
 *
 * The script matches PRS members by name against current-mla.json and
 * constituencies.ts. Unmatched members are logged separately so you can
 * review and fix manually.
 */

const fs   = require('fs');
const path = require('path');

const ROOT           = path.resolve(__dirname, '../..');
const OUTPUT_RECORDS = path.join(ROOT, 'scripts/data/mla-records.json');
const CURRENT_MLA    = path.join(ROOT, 'scripts/data/current-mla.json');

const TERM = process.argv.includes('--term')
  ? process.argv[process.argv.indexOf('--term') + 1]
  : '2026-2031';

const PRS_BASE = 'https://prsindia.org';
const PRS_WB   = `${PRS_BASE}/legislatures/states/west-bengal/members-performance`;

// ── helpers ──────────────────────────────────────────────────────────────────

function normName(s) {
  return (s || '').toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
}

function parsePercent(s) {
  const m = String(s || '').match(/[\d.]+/);
  return m ? parseFloat(m[0]) : null;
}

function parseInt2(s) {
  const n = parseInt(String(s || '').replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

// ── name → constituency matcher ───────────────────────────────────────────────

function buildMatcher() {
  if (!fs.existsSync(CURRENT_MLA)) {
    console.warn('current-mla.json not found — run npm run data:sync-current-mla first');
    return {};
  }
  const currentMLAs = JSON.parse(fs.readFileSync(CURRENT_MLA, 'utf8'));
  return Object.fromEntries(
    currentMLAs.map(m => [normName(m.name), m])
  );
}

// ── scrape & parse ────────────────────────────────────────────────────────────

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': PRS_BASE,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function parseTable(html) {
  const rows = [];
  // Match table rows
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr;
  while ((tr = trRe.exec(html)) !== null) {
    const tdRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    const cells = [];
    let td;
    while ((td = tdRe.exec(tr[1])) !== null) {
      cells.push(td[1].replace(/<[^>]+>/g, '').trim());
    }
    if (cells.length >= 4) rows.push(cells);
  }
  return rows;
}

async function scrape() {
  console.log(`\nFetching PRS WB member performance...\n  ${PRS_WB}\n`);
  const html = await fetchPage(PRS_WB);

  if (html.includes('403') || html.length < 1000) {
    console.error('PRS India returned a block or empty page.');
    console.error('Try running from a different network or use a VPN.');
    process.exit(1);
  }

  const rows = parseTable(html);
  console.log(`  Parsed ${rows.length} table rows`);

  // Auto-detect header row
  const headerIdx = rows.findIndex(r =>
    r.some(c => /attendance|questions|debates/i.test(c))
  );
  if (headerIdx === -1) {
    console.error('Could not find header row — page structure may have changed.');
    console.error('Columns found:', rows[0]);
    process.exit(1);
  }

  const header = rows[headerIdx].map(c => c.toLowerCase());
  const dataRows = rows.slice(headerIdx + 1);

  const nameCol        = header.findIndex(c => /name|member/i.test(c));
  const attendanceCol  = header.findIndex(c => /attendance/i.test(c));
  const questionsCol   = header.findIndex(c => /question/i.test(c));
  const billsCol       = header.findIndex(c => /bill/i.test(c));
  const debatesCol     = header.findIndex(c => /debate|discussion/i.test(c));

  console.log('  Columns detected:');
  console.log(`    name: ${nameCol} · attendance: ${attendanceCol} · questions: ${questionsCol} · bills: ${billsCol} · debates: ${debatesCol}`);

  const matcher = buildMatcher();
  const records = [];
  const unmatched = [];

  for (const row of dataRows) {
    if (!row[nameCol]) continue;
    const rawName = row[nameCol];
    const norm    = normName(rawName);
    const mla     = matcher[norm];

    if (!mla) {
      // Try partial match
      const partialKey = Object.keys(matcher).find(k =>
        k.includes(norm.split(' ')[0]) || norm.includes(k.split(' ')[0])
      );
      if (!partialKey) { unmatched.push(rawName); continue; }
    }

    const matched = mla ?? matcher[
      Object.keys(matcher).find(k => k.includes(norm.split(' ')[0]) || norm.includes(k.split(' ')[0]))
    ];
    if (!matched) { unmatched.push(rawName); continue; }

    records.push({
      candidateId:          matched.candidateId ?? null,
      constituencyId:       matched.constituencyId,
      term:                 TERM,
      attendancePct:        parsePercent(row[attendanceCol]),
      questionsAsked:       parseInt2(row[questionsCol]),
      billsIntroduced:      parseInt2(row[billsCol]),
      debatesParticipated:  parseInt2(row[debatesCol]),
      lastUpdated:          new Date().toISOString().slice(0, 10),
      sourceUrl:            PRS_WB,
    });
  }

  console.log(`\n  Matched  : ${records.length}`);
  console.log(`  Unmatched: ${unmatched.length}`);
  if (unmatched.length) {
    console.log('  Unmatched names:');
    unmatched.slice(0, 20).forEach(n => console.log(`    · ${n}`));
    if (unmatched.length > 20) console.log(`    · ...and ${unmatched.length - 20} more`);
  }

  // Merge with existing records (keep others, replace matched ones)
  const existing = fs.existsSync(OUTPUT_RECORDS)
    ? JSON.parse(fs.readFileSync(OUTPUT_RECORDS, 'utf8'))
    : [];
  const existingByKey = Object.fromEntries(
    existing.map(r => [`${r.constituencyId}:${r.term}`, r])
  );
  for (const r of records) {
    existingByKey[`${r.constituencyId}:${r.term}`] = r;
  }
  const merged = Object.values(existingByKey);

  fs.writeFileSync(OUTPUT_RECORDS, JSON.stringify(merged, null, 2) + '\n', 'utf8');
  console.log(`\n✅  Done — ${merged.length} total records in mla-records.json`);
  console.log(`   → Now run: npm run data:mla`);

  return records.length;
}

scrape().catch(e => {
  console.error('\nFatal:', e.message);
  process.exit(1);
});
