#!/usr/bin/env node
/**
 * enrich-assets.js — Fetches asset/liability data for candidates with missing financials
 * Targets candidates where totalAssets=0 AND totalLiabilities=0 by fetching their
 * individual detail pages from myneta.info, which have the full financial summary.
 */

const { exec } = require('child_process');
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const DELAY_MS    = 800;
const CONCURRENCY = 2;
const CANDIDATES_FILE = path.resolve(__dirname, '../src/data/candidates.ts');

function get(url, retries = 3) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      exec(
        `curl -s -L --compressed --max-time 20 \
          -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" \
          -H "Accept-Language: en-US,en;q=0.5" \
          -H "Accept-Encoding: gzip, deflate" \
          -H "Referer: https://myneta.info/WestBengal2026/" \
          -H "Cookie: visited=1" \
          -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
          "${url}"`,
        { maxBuffer: 5 * 1024 * 1024 },
        (err, stdout) => {
          if (err) {
            if (n < retries) setTimeout(() => attempt(n + 1), 1000);
            else reject(err);
          } else resolve(stdout);
        }
      );
    };
    attempt(0);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function pool(tasks, concurrency) {
  const results = new Array(tasks.length);
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      try { results[i] = await tasks[i](); } catch (e) { results[i] = null; }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

/**
 * Decode any eval(function(h,u,n,t,e,r){...}) challenge scripts in the page.
 * myneta.info uses this packer to hide financial data from non-JS scrapers.
 */
function decodeChallenges(html) {
  let extra = '';
  let idx = 0;
  while (true) {
    const start = html.indexOf('<script>', idx);
    if (start === -1) break;
    const end = html.indexOf('</script>', start);
    if (end === -1) break;
    const content = html.slice(start + 8, end);
    if (content.includes('eval(function(h,u,n,t,e,r)')) {
      let written = '';
      const ctx = {
        document: { write: (s) => { written += s; } },
        window: {}, location: { href: '' },
        decodeURIComponent, escape, unescape,
        String, Math, RegExp, parseInt,
      };
      try { vm.runInNewContext(content, ctx); } catch (_) {}
      if (written.length > 0) extra += written + '\n';
    }
    idx = end + 9;
  }
  return extra;
}

function parseRupees(s) {
  if (!s) return 0;
  const clean = s.replace(/Rs\.?|&nbsp;|,|\s/gi, '').trim();
  if (!clean || clean === '0' || /^nil$/i.test(clean)) return 0;
  return parseInt(clean, 10) || 0;
}

/**
 * Parse financial summary from candidate detail page.
 * Myneta detail pages have a quick summary near the top:
 *   <tr><td> Assets: </td><td> <b>Rs&nbsp;3,07,500</b>...</td></tr>
 *   <tr><td> Liabilities: </td><td> <b>Nil</b> </td></tr>
 * Movable/Immovable totals are the last purple-colored cell in each detail table.
 */
function parseFinancials(html) {
  // Decode bot-protection challenge scripts — financial data is hidden in them
  const decoded = decodeChallenges(html);
  const full = html + '\n' + decoded;

  const result = { totalAssets: 0, totalLiabilities: 0, movableAssets: 0, immovableAssets: 0 };

  // Total assets from quick summary (may be in decoded challenge content)
  const taM = full.match(/Assets:\s*<\/td>\s*<td[^>]*>\s*<b>Rs[&nbsp;\s]*([\d,]+)<\/b>/i);
  if (taM) result.totalAssets = parseRupees(taM[1]);

  // Total liabilities from quick summary
  const tlM = full.match(/Liabilities:\s*<\/td>\s*<td[^>]*>\s*<b>Rs[&nbsp;\s]*([\d,]+)<\/b>/i);
  if (tlM) result.totalLiabilities = parseRupees(tlM[1]);

  // Movable assets — last purple total in #movable_assets table
  // Bound the section at the start of #immovable_assets to avoid cross-table bleed
  const movIdx  = full.indexOf('id=movable_assets');
  const imovIdx = full.indexOf('id=immovable_assets');
  if (movIdx !== -1) {
    const movEnd     = imovIdx !== -1 ? imovIdx : movIdx + 15000;
    const movSection = full.slice(movIdx, Math.min(movEnd, movIdx + 15000));
    const purpleMatches = [...movSection.matchAll(/color:purple[^>]*><b>\s*Rs[&nbsp;\s]*([\d,]+)\s*<\/b>/gi)];
    if (purpleMatches.length > 0) {
      result.movableAssets = parseRupees(purpleMatches[purpleMatches.length - 1][1]);
    }
  }

  // Immovable assets — last purple total in #immovable_assets table
  // Bound the section at the start of #liabilities to avoid cross-table bleed
  const liabIdx = full.indexOf('id=liabilities');
  if (imovIdx !== -1) {
    const imovEnd     = liabIdx !== -1 ? liabIdx : imovIdx + 15000;
    const imovSection = full.slice(imovIdx, Math.min(imovEnd, imovIdx + 15000));
    const purpleMatches = [...imovSection.matchAll(/color:purple[^>]*><b>\s*Rs[&nbsp;\s]*([\d,]+)\s*<\/b>/gi)];
    if (purpleMatches.length > 0) {
      result.immovableAssets = parseRupees(purpleMatches[purpleMatches.length - 1][1]);
    }
  }

  return result;
}

function getCandidateId(affidavitUrl) {
  if (!affidavitUrl) return null;
  const m = affidavitUrl.match(/candidate_id=(\d+)/);
  return m ? m[1] : null;
}

async function main() {
  const src = fs.readFileSync(CANDIDATES_FILE, 'utf8');
  const arrMatch = src.match(/export const candidates: Candidate\[\] = (\[[\s\S]*?\]);[\s\n]*\n/);
  if (!arrMatch) { console.error('Cannot parse candidates array'); process.exit(1); }

  const candidates = JSON.parse(arrMatch[1]);

  // Find candidates with zero assets AND zero liabilities
  const targets = candidates.filter(c => c.totalAssets === 0 && c.totalLiabilities === 0 && c.affidavitUrl);
  console.log(`Found ${targets.length} candidates with zero assets & liabilities`);
  console.log(`Fetching detail pages (${CONCURRENCY} concurrent, ${DELAY_MS}ms delay)...\n`);

  let enriched = 0, genuineZero = 0, failed = 0, done = 0;

  const tasks = targets.map(cand => async () => {
    await sleep(DELAY_MS);
    const id = getCandidateId(cand.affidavitUrl);
    if (!id) { done++; failed++; return; }

    try {
      const html = await get(`https://myneta.info/WestBengal2026/candidate.php?candidate_id=${id}`);
      const fin = parseFinancials(html);

      if (fin.totalAssets > 0 || fin.totalLiabilities > 0) {
        cand.totalAssets      = fin.totalAssets;
        cand.totalLiabilities = fin.totalLiabilities;
        if (fin.movableAssets > 0)   cand.movableAssets   = fin.movableAssets;
        if (fin.immovableAssets > 0) cand.immovableAssets = fin.immovableAssets;
        enriched++;
      } else {
        genuineZero++;
      }
    } catch {
      failed++;
    }

    done++;
    if (done % 25 === 0 || done === targets.length) {
      process.stdout.write(`\r  Progress: ${done}/${targets.length} | enriched: ${enriched} | genuine zero: ${genuineZero} | failed: ${failed}    `);
    }
  });

  await pool(tasks, CONCURRENCY);
  console.log('\n');

  // Rebuild the candidates.ts file
  const today = new Date().toISOString().slice(0, 10);
  const updatedSrc = src.replace(
    /\/\/ AUTO-GENERATED[^\n]*/,
    `// AUTO-GENERATED — myneta.info/WestBengal2026 — ${today}`
  ).replace(
    /export const candidates: Candidate\[\] = \[[\s\S]*?\];([\s\n]*\n)/,
    `export const candidates: Candidate[] = ${JSON.stringify(candidates, null, 2)};$1`
  );

  fs.writeFileSync(CANDIDATES_FILE, updatedSrc, 'utf8');

  console.log(`✅ Done`);
  console.log(`   Enriched   : ${enriched} candidates now have asset data`);
  console.log(`   Genuine 0  : ${genuineZero} candidates truly declared zero assets`);
  console.log(`   Failed     : ${failed} could not be fetched`);
  console.log(`   Total      : ${targets.length} processed`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
