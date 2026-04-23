#!/usr/bin/env node
/**
 * fetch-missing.js — Finds and inserts candidates missing from candidates.ts
 * Works by fetching individual detail pages for gap IDs, checking if WB 2026,
 * and inserting any new candidates found.
 */

const { exec } = require('child_process');
const fs   = require('fs');
const path = require('path');

const DELAY_MS    = 1000;
const CONCURRENCY = 1;
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

function stripHtml(s) {
  return (s || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&#?[a-z0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

function parseRupees(s) {
  if (!s) return 0;
  const clean = s.replace(/Rs\.?|&nbsp;|,|\s/gi, '').trim();
  if (!clean || /^nil$/i.test(clean)) return 0;
  return parseInt(clean, 10) || 0;
}

function mapPartyId(raw) {
  const p = (raw || '').trim().toUpperCase();
  const MAP = {
    'AITC': 'AITC', 'AITC(IA)': 'AITC', 'TRINAMOOL CONGRESS': 'AITC',
    'BJP': 'BJP', 'BJP(R)': 'BJP',
    'INC': 'INC', 'INC(T)': 'INC', 'INDIAN NATIONAL CONGRESS': 'INC',
    'CPI(M)': 'CPI(M)', 'CPIM': 'CPI(M)', 'CPI': 'CPI(M)',
    'RSP': 'RSP', 'SUCI(C)': 'SUCI', 'SUCI': 'SUCI',
    'BSP': 'BSP', 'NCP': 'NCP', 'IND': 'IND', 'INDEPENDENT': 'IND',
  };
  return MAP[p] || p || 'IND';
}

// Map constituency name to our constituency ID
const CONSTITUENCY_NAME_MAP = (() => {
  try {
    const src = fs.readFileSync(path.resolve(__dirname, '../src/data/constituencies.ts'), 'utf8');
    const m = src.match(/export const constituencies[^=]*=\s*(\[[\s\S]*?\]);/);
    if (!m) return new Map();
    const arr = JSON.parse(m[1]);
    const map = new Map();
    arr.forEach(c => map.set(c.name.toLowerCase().replace(/\s+/g,''), c.id));
    return map;
  } catch { return new Map(); }
})();

function parseDetailPage(html, candidateId) {
  // Must be a WB 2026 page
  if (!html.includes('WestBengal2026') && !html.includes('West Bengal 2026')) return null;

  // Title format: "Name (Party):Constituency- PLACE - Affidavit Information of Candidate:"
  const titleM = html.match(/<title>\s*([^:(]+?)\s*\([^)]*\)\s*\([^)]*\)\s*:/i)
    || html.match(/<title>\s*([^:(]+?)\s*\([^)]*\)\s*:/i)
    || html.match(/<title>\s*([^:(<]+?)\s*(?::|–|-)/i);
  // Fallback: extract from breadcrumb bold tag
  const breadcrumbM = html.match(/<b>([^<(]+?)(?:\s*\([^)]*\))*\s*<\/b>\s*\(Criminal/i);

  const rawName = breadcrumbM ? breadcrumbM[1].trim()
    : titleM ? titleM[1].trim()
    : null;
  if (!rawName || rawName.length < 2) return null;
  const name = rawName.replace(/\s+/g, ' ').trim();

  // Party
  let partyRaw = '';
  const partyM = html.match(/Party\s*[^<]*<[^>]+>\s*([^<]{2,60})</i)
    || html.match(/<td[^>]*>\s*Party\s*<\/td>\s*<td[^>]*>\s*([^<]+)/i);
  if (partyM) partyRaw = partyM[1].replace(/&nbsp;/g,' ').trim();

  // Constituency — most reliable source is the breadcrumb link
  let constituencyId = 'c0001';
  const breadConstM = html.match(/action=show_candidates&constituency_id=(\d+)/);
  if (breadConstM) {
    constituencyId = `c${String(parseInt(breadConstM[1])).padStart(4,'0')}`;
  }

  // Age
  let age = 0;
  const ageM = html.match(/Age\s*[^<]*<[^>]+>\s*(\d+)/i);
  if (ageM) age = parseInt(ageM[1]);

  // Education
  let education = 'Not declared';
  const eduM = html.match(/Education\s*[^<]*<[^>]+>\s*([^<]{2,80})</i);
  if (eduM) education = stripHtml(eduM[1]) || 'Not declared';

  // Criminal cases
  let criminalCases = 0;
  const crimM = html.match(/Total Criminal Cases\s*[^<]*<[^>]+>\s*(\d+)/i)
    || html.match(/criminal_cases[^>]*>\s*(\d+)/i);
  if (crimM) criminalCases = parseInt(crimM[1]);

  // Assets & liabilities from quick summary
  let totalAssets = 0, totalLiabilities = 0;
  const taM = html.match(/Assets:\s*<\/td>\s*<td[^>]*>\s*<b>Rs[&nbsp;\s]*([\d,]+)<\/b>/i);
  if (taM) totalAssets = parseRupees(taM[1]);
  const tlM = html.match(/Liabilities:\s*<\/td>\s*<td[^>]*>\s*<b>Rs[&nbsp;\s]*([\d,]+)<\/b>/i);
  if (tlM) totalLiabilities = parseRupees(tlM[1]);

  // Photo
  const photoM = html.match(/https?:\/\/myneta\.info\/images_candidate\/WestBengal2026\/[a-f0-9]+\.jpg/i);
  const photoUrl = photoM ? photoM[0] : null;

  // Occupation
  let occupation = null;
  const occM = html.match(/Profession\s*[^<]*<[^>]+>\s*([^<]{2,80})</i)
    || html.match(/Occupation[^<]*<[^>]+>\s*([^<]{2,80})</i);
  if (occM) {
    const raw = occM[1].replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
    if (raw && raw !== 'NIL' && raw !== '-') occupation = raw;
  }

  if (!photoUrl && !partyRaw) return null; // likely not a real candidate page

  const cand = {
    id: `wb26_${candidateId}`,
    name,
    partyId: mapPartyId(partyRaw),
    constituencyId,
    photoUrl: photoUrl || `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(name.slice(0,6))}&backgroundColor=546e7a&fontColor=ffffff`,
    age,
    education,
    criminalCases,
    totalAssets,
    totalLiabilities,
    isIncumbent: false,
    affidavitUrl: `https://myneta.info/WestBengal2026/candidate.php?candidate_id=${candidateId}`,
  };
  if (occupation) cand.occupation = occupation;
  return cand;
}

async function main() {
  const src = fs.readFileSync(CANDIDATES_FILE, 'utf8');
  const arrMatch = src.match(/export const candidates: Candidate\[\] = (\[[\s\S]*?\]);[\s\n]*\n/);
  if (!arrMatch) { console.error('Cannot parse candidates array'); process.exit(1); }

  const candidates = JSON.parse(arrMatch[1]);
  const existingIds = new Set(candidates.map(c => parseInt(c.id.replace('wb26_',''))));

  // Build gap list: IDs 1 to max+50 that we don't have
  const maxId = Math.max(...existingIds);
  const gaps = [];
  for (let i = 1; i <= maxId + 50; i++) {
    if (!existingIds.has(i)) gaps.push(i);
  }

  console.log(`Existing candidates: ${candidates.length} (IDs 1–${maxId})`);
  console.log(`Gap IDs to check: ${gaps.length}`);
  console.log(`Fetching (${CONCURRENCY} concurrent, ${DELAY_MS}ms delay)...\n`);

  let found = 0, skipped = 0, failed = 0, done = 0;
  const newCandidates = [];

  const tasks = gaps.map(id => async () => {
    await sleep(DELAY_MS);
    try {
      const html = await get(`https://myneta.info/WestBengal2026/candidate.php?candidate_id=${id}`);
      const cand = parseDetailPage(html, id);
      if (cand) {
        newCandidates.push(cand);
        found++;
      } else {
        skipped++;
      }
    } catch {
      failed++;
    }
    done++;
    if (done % 20 === 0 || done === gaps.length) {
      process.stdout.write(`\r  ${done}/${gaps.length} | found: ${found} | not WB2026: ${skipped} | failed: ${failed}    `);
    }
  });

  await pool(tasks, CONCURRENCY);
  console.log('\n');

  if (newCandidates.length === 0) {
    console.log('No new candidates found.');
    return;
  }

  // Insert new candidates sorted by constituencyId then id
  const merged = [...candidates, ...newCandidates].sort((a, b) => {
    if (a.constituencyId !== b.constituencyId) return a.constituencyId.localeCompare(b.constituencyId);
    return parseInt(a.id.replace('wb26_','')) - parseInt(b.id.replace('wb26_',''));
  });

  const today = new Date().toISOString().slice(0, 10);
  const updatedSrc = src
    .replace(/\/\/ AUTO-GENERATED[^\n]*/, `// AUTO-GENERATED — myneta.info/WestBengal2026 — ${today}`)
    .replace(
      /export const candidates: Candidate\[\] = \[[\s\S]*?\];([\s\n]*\n)/,
      `export const candidates: Candidate[] = ${JSON.stringify(merged, null, 2)};$1`
    );

  fs.writeFileSync(CANDIDATES_FILE, updatedSrc, 'utf8');

  console.log(`✅ Done`);
  console.log(`   New candidates added : ${newCandidates.length}`);
  console.log(`   Total candidates now : ${merged.length}`);
  console.log(`   Not WB 2026 / empty  : ${skipped}`);
  console.log(`   Failed               : ${failed}`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
