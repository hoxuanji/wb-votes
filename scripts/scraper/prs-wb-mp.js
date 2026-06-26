#!/usr/bin/env node
/**
 * scripts/scraper/prs-wb-mp.js
 *
 * Scrapes PRS India mptrack for West Bengal Lok Sabha MP performance.
 * Run FROM YOUR LOCAL MACHINE — PRS blocks server IP ranges.
 *
 * Usage:
 *   node scripts/scraper/prs-wb-mp.js
 *
 * Output:
 *   scripts/data/wbmps-performance.json
 *   Then run: npm run data:wbmps-performance
 *
 * Tracks per-MP Lok Sabha performance:
 *   - Attendance % (sessions present / total)
 *   - Questions asked (starred + unstarred)
 *   - Debates / discussions participated
 *   - Private member bills introduced
 */

const fs   = require('fs');
const path = require('path');

const ROOT       = path.resolve(__dirname, '../..');
const OUTPUT     = path.join(ROOT, 'scripts/data/wbmps-performance.json');
const WB_MPS     = path.join(ROOT, 'scripts/data/wbmps-2024.json');

const PRS_URL = 'https://prsindia.org/mptrack';

// ── helpers ──────────────────────────────────────────────────────────────────

function normName(s) {
  return (s || '').toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
}

function parsePercent(s) {
  const m = String(s || '').match(/[\d.]+/);
  return m ? parseFloat(m[0]) : null;
}

function parseNum(s) {
  const n = parseInt(String(s || '').replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

async function fetchPage(url, params) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  const res = await fetch(url + qs, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-IN,en;q=0.9',
      'Referer': 'https://prsindia.org/',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url + qs}`);
  return res.text();
}

function parseTable(html) {
  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr;
  while ((tr = trRe.exec(html)) !== null) {
    const tdRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    const cells = [];
    let td;
    while ((td = tdRe.exec(tr[1])) !== null) {
      cells.push(td[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    }
    if (cells.length >= 3) rows.push(cells);
  }
  return rows;
}

// ── main ─────────────────────────────────────────────────────────────────────

async function scrape() {
  console.log('\nFetching PRS MP tracker for West Bengal...\n');

  // Try with a West Bengal filter param (PRS may or may not support it)
  let html;
  try {
    html = await fetchPage(PRS_URL, { state: 'West Bengal' });
  } catch {
    html = await fetchPage(PRS_URL);
  }

  if (!html || html.length < 1000) {
    console.error('Empty response — PRS may be blocking this network.');
    console.error('Make sure you are running this from your local machine.');
    process.exit(1);
  }

  console.log(`  Page size: ${(html.length / 1024).toFixed(0)} KB`);

  const rows = parseTable(html);
  console.log(`  Table rows: ${rows.length}`);

  // Detect header
  const headerIdx = rows.findIndex(r =>
    r.some(c => /attendance|questions|debates|bills/i.test(c))
  );

  if (headerIdx === -1) {
    console.log('\nCould not auto-detect table. Dumping first 5 rows for debugging:');
    rows.slice(0, 5).forEach((r, i) => console.log(`  Row ${i}:`, r));
    console.error('\nPage structure may have changed or data is loaded via JavaScript.');
    console.error('Try opening ' + PRS_URL + ' in your browser and saving the HTML,');
    console.error('then run: node scripts/scraper/prs-wb-mp.js --file /path/to/saved.html');
    process.exit(1);
  }

  const header  = rows[headerIdx].map(c => c.toLowerCase());
  const dataRows = rows.slice(headerIdx + 1);

  const nameCol       = header.findIndex(c => /name|member/i.test(c));
  const stateCol      = header.findIndex(c => /state|constituency/i.test(c));
  const attendanceCol = header.findIndex(c => /attendance/i.test(c));
  const questionsCol  = header.findIndex(c => /question/i.test(c));
  const debatesCol    = header.findIndex(c => /debate|discussion/i.test(c));
  const billsCol      = header.findIndex(c => /bill/i.test(c));

  console.log('\n  Header columns detected:');
  console.log(`    name: ${nameCol}  state: ${stateCol}  attendance: ${attendanceCol}  questions: ${questionsCol}  debates: ${debatesCol}  bills: ${billsCol}`);

  // Load WB MPs for name matching
  const wbMPs = JSON.parse(fs.readFileSync(WB_MPS, 'utf8'));
  const matcher = Object.fromEntries(wbMPs.map(m => [normName(m.name), m.id]));

  const results = [];
  const unmatched = [];

  for (const row of dataRows) {
    if (!row[nameCol]) continue;

    // If we can filter by state column, skip non-WB rows
    if (stateCol >= 0 && row[stateCol] && !/west bengal/i.test(row[stateCol])) continue;

    const rawName = row[nameCol];
    const norm    = normName(rawName);
    let mpId = matcher[norm];

    // Partial match fallback
    if (!mpId) {
      const nameTokens = norm.split(' ').filter(t => t.length > 3);
      const partialKey = Object.keys(matcher).find(k =>
        nameTokens.some(t => k.includes(t)) || k.split(' ').some(t => norm.includes(t) && t.length > 3)
      );
      if (partialKey) mpId = matcher[partialKey];
    }

    if (!mpId) {
      unmatched.push(rawName);
      continue;
    }

    results.push({
      mpId,
      term:                 '2024-2029',
      attendancePct:        parsePercent(row[attendanceCol]),
      questionsAsked:       parseNum(row[questionsCol]),
      debatesParticipated:  parseNum(row[debatesCol]),
      billsIntroduced:      parseNum(row[billsCol]),
      lastUpdated:          new Date().toISOString().slice(0, 10),
      sourceUrl:            PRS_URL,
    });
  }

  console.log(`\n  WB MPs matched   : ${results.length} / ${wbMPs.length}`);
  if (unmatched.length) {
    console.log(`  Unmatched        : ${unmatched.length}`);
    unmatched.slice(0, 10).forEach(n => console.log(`    · ${n}`));
  }

  // Merge with existing
  const existing = fs.existsSync(OUTPUT) ? JSON.parse(fs.readFileSync(OUTPUT, 'utf8')) : [];
  const byKey = Object.fromEntries(existing.map(r => [`${r.mpId}:${r.term}`, r]));
  for (const r of results) byKey[`${r.mpId}:${r.term}`] = r;
  const merged = Object.values(byKey);

  fs.writeFileSync(OUTPUT, JSON.stringify(merged, null, 2) + '\n', 'utf8');
  console.log(`\n✅  Done — ${merged.length} records written`);
  console.log(`   → scripts/data/wbmps-performance.json`);
  console.log(`   → Run: npm run data:wbmps-performance`);
}

// Allow --file flag to parse a saved HTML file instead of fetching live
const fileArg = process.argv.indexOf('--file');
if (fileArg >= 0 && process.argv[fileArg + 1]) {
  const htmlPath = path.resolve(process.argv[fileArg + 1]);
  console.log(`\nReading from local file: ${htmlPath}`);
  const html = fs.readFileSync(htmlPath, 'utf8');
  // Monkey-patch fetch to return the local file
  global.fetch = async () => ({ ok: true, status: 200, text: async () => html });
}

scrape().catch(e => {
  console.error('\nFatal:', e.message);
  process.exit(1);
});
