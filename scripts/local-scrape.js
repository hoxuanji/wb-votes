#!/usr/bin/env node
/**
 * local-scrape.js — Fallback scraper run from a workstation (not Vercel).
 *
 * Use this at 08:00 IST on counting day if the Vercel-hosted cron is still
 * getting 403s from ECI's Akamai WAF. From a laptop, ECI serves normally
 * with browser headers — so this script fetches all 294 ACs locally, parses
 * them with the same heuristics as the cron, then POSTs batches to
 * /api/admin/update-ac on the production site.
 *
 * Usage:
 *   export CRON_SECRET='<same value as Vercel + GitHub>'
 *   export BASE='https://wb-votes.vercel.app'
 *   node scripts/local-scrape.js           # one run
 *   node scripts/local-scrape.js --loop    # runs every 5 min
 *   node scripts/local-scrape.js --dry     # fetch + parse only, do not POST
 *
 * Exits 0 on full success, 1 on total failure, 2 on partial (some ACs parsed).
 * Safe to run concurrently with the Vercel cron — last-write-wins in KV.
 */

const fs = require('fs');
const path = require('path');

const CRON_SECRET = process.env.CRON_SECRET;
const BASE = process.env.BASE || 'https://wb-votes.vercel.app';
const ECI_BASE = 'https://results.eci.gov.in/AcResultGenMay2026';
const STATE_CODE = 'S25';

const argv = process.argv.slice(2);
const LOOP = argv.includes('--loop');
const DRY = argv.includes('--dry');
const LOOP_INTERVAL_MS = 5 * 60 * 1000;

if (!CRON_SECRET && !DRY) {
  console.error('CRON_SECRET env var required (unless --dry).');
  process.exit(1);
}

// Load constituencies by regexing the generated TS file — cheaper than a TS
// loader and the shape is stable (see src/data/constituencies.ts).
function loadConstituencies() {
  const tsPath = path.join(__dirname, '..', 'src', 'data', 'constituencies.ts');
  const src = fs.readFileSync(tsPath, 'utf8');
  const out = [];
  const re = /"id":\s*"([^"]+)",\s*"assemblyNumber":\s*(\d+),\s*"name":\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(src)) !== null) out.push({ id: m[1], assemblyNumber: parseInt(m[2], 10), name: m[3] });
  return out;
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

const PLACEHOLDER_MARKERS = [/Access Denied/i, /trends will start from/i, /No Record Found/i];

function candidateUrls(n) {
  const pad2 = String(n).padStart(2, '0');
  const pad3 = String(n).padStart(3, '0');
  return [
    `${ECI_BASE}/AcConstituency-${n}.htm`,
    `${ECI_BASE}/ConstituencywiseS25${pad2}.htm`,
    `${ECI_BASE}/ConstituencywiseS25${pad3}.htm`,
    `${ECI_BASE}/AcConstituency${STATE_CODE}-${n}.htm`,
    `${ECI_BASE}/Constituencywise-S25-${n}.htm`,
  ];
}

async function fetchHtml(url) {
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS });
    if (!res.ok) return { status: res.status, html: null };
    return { status: res.status, html: await res.text() };
  } catch (e) {
    return { status: 0, html: null, err: e.message };
  }
}

function looksLikePlaceholder(html) {
  return PLACEHOLDER_MARKERS.some((re) => re.test(html));
}

function extractCandidateRows(tableInner) {
  const rows = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rm;
  let idx = 0;
  while ((rm = rowRe.exec(tableInner)) !== null) {
    const cells = [];
    const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cm;
    while ((cm = cellRe.exec(rm[1])) !== null) {
      cells.push(cm[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim());
    }
    if (cells.length < 3) continue;

    const numericIdx = cells.findIndex((c) => {
      const n = parseInt(c.replace(/[^\d]/g, ''), 10);
      return Number.isFinite(n) && n >= 50 && /^[\d, ]+$/.test(c.trim());
    });
    if (numericIdx < 1) continue;

    const name = cells[0];
    const party = cells[Math.max(1, numericIdx - 1)] || cells[1];
    const votes = parseInt(cells[numericIdx].replace(/[^\d]/g, ''), 10);
    if (!name || name.length > 100) continue;
    if (!Number.isFinite(votes) || votes < 0) continue;

    let voteShare = 0;
    const after = cells[numericIdx + 1];
    if (after) {
      const pct = parseFloat(after.replace(/[^\d.]/g, ''));
      if (Number.isFinite(pct) && pct >= 0 && pct <= 100) voteShare = pct;
    }

    rows.push({ name, partyId: party, votes, voteShare });
    idx++;
  }
  return rows;
}

function parseEciAcPage(html) {
  if (looksLikePlaceholder(html)) return null;
  const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let m;
  let best = null;
  while ((m = tableRe.exec(html)) !== null) {
    const rows = extractCandidateRows(m[1]);
    if (rows.length >= 2 && (!best || rows.length > best.length)) best = rows;
  }
  if (!best || best.length === 0) return null;
  best.sort((a, b) => b.votes - a.votes);
  const total = best.reduce((s, c) => s + c.votes, 0);
  best.forEach((c) => { if (!c.voteShare) c.voteShare = total > 0 ? (c.votes / total) * 100 : 0; });
  const declared = /\b(DECLARED|WINNER)\b/.test(html);
  return { candidates: best, declared };
}

async function fetchOneAc(ac) {
  const attempts = [];
  for (const url of candidateUrls(ac.assemblyNumber)) {
    const { html, status } = await fetchHtml(url);
    attempts.push({ url, status });
    if (!html) continue;
    const parsed = parseEciAcPage(html);
    if (parsed) return { ac, sourceUrl: url, status, attempts, ...parsed };
    return { ac, sourceUrl: url, status, attempts, candidates: null };
  }
  return { ac, sourceUrl: null, status: null, attempts, candidates: null };
}

async function runConcurrent(items, limit, worker) {
  const out = new Array(items.length);
  let i = 0;
  async function loop() {
    while (i < items.length) {
      const j = i++;
      out[j] = await worker(items[j]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, loop));
  return out;
}

async function postBatch(updates) {
  if (updates.length === 0) return { skipped: true };
  const res = await fetch(`${BASE}/api/admin/update-ac`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CRON_SECRET}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ updates }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function runOnce() {
  const acs = loadConstituencies();
  console.log(`[${new Date().toISOString()}] scraping ${acs.length} ACs from ${ECI_BASE}`);

  const results = await runConcurrent(acs, 8, fetchOneAc);

  const statusHist = {};
  const parsed = [];
  const nothing = [];
  for (const r of results) {
    for (const a of r.attempts) {
      const key = a.status === 0 ? 'network-error' : String(a.status);
      statusHist[key] = (statusHist[key] ?? 0) + 1;
    }
    if (r.candidates) {
      parsed.push({
        acId: r.ac.id,
        candidates: r.candidates.map((c) => ({
          name: c.name,
          partyId: c.partyId,
          votes: c.votes,
          voteShare: c.voteShare,
        })),
        declared: r.declared,
      });
    } else {
      nothing.push(r);
    }
  }

  console.log(`  status histogram: ${JSON.stringify(statusHist)}`);
  console.log(`  parsed: ${parsed.length}  no-data: ${nothing.length}`);
  if (parsed[0]) {
    console.log(`  sample (${parsed[0].acId}): ${parsed[0].candidates.slice(0, 3).map((c) => `${c.name}/${c.partyId}=${c.votes}`).join(', ')}`);
  }

  if (DRY) return parsed.length;

  // Chunk POSTs to avoid huge payloads — 50 ACs per batch is safe.
  const CHUNK = 50;
  let written = 0;
  for (let k = 0; k < parsed.length; k += CHUNK) {
    const chunk = parsed.slice(k, k + CHUNK);
    const { status, body } = await postBatch(chunk);
    if (status === 200) {
      written += body.written ?? 0;
    } else {
      console.error(`  POST chunk ${k}-${k + chunk.length}: HTTP ${status} ${JSON.stringify(body)}`);
    }
  }
  console.log(`  POSTed: ${written} / ${parsed.length}`);
  return parsed.length;
}

async function main() {
  if (!LOOP) {
    const n = await runOnce();
    process.exit(n === 0 ? 1 : n === 294 ? 0 : 2);
  }
  console.log(`looping every ${LOOP_INTERVAL_MS / 1000}s — Ctrl-C to stop`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try { await runOnce(); } catch (e) { console.error('run failed:', e.message); }
    await new Promise((r) => setTimeout(r, LOOP_INTERVAL_MS));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
