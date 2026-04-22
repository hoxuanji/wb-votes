#!/usr/bin/env node
/**
 * myneta-2026.js  — WB 2026 full data scraper with real candidate photos
 * Fetches all 294 constituencies via local proxy (localhost:4646)
 * For each candidate found, also fetches their detail page to get real photo URL
 *
 * Usage: node scripts/scraper/myneta-2026.js
 * Usage: node scripts/scraper/myneta-2026.js --photos-only  (re-fetch photos for existing candidates)
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PROXY_HOST    = 'localhost';
const PROXY_PORT    = 4646;
const TARGET        = 'myneta.info';
const DELAY_MS      = 300;
const CONCURRENCY   = 5;   // parallel detail-page fetches
const OUT_DIR       = path.resolve(__dirname, '../../src/data');
const PHOTOS_ONLY   = process.argv.includes('--photos-only');

// ── HTTP helpers ──────────────────────────────────────────────
function get(urlPath, retries = 2) {
  return new Promise((resolve, reject) => {
    const options = {
      host: PROXY_HOST,
      port: PROXY_PORT,
      path: urlPath.startsWith('http') ? urlPath : `http://${TARGET}${urlPath}`,
      method: 'GET',
      headers: {
        Host: TARGET,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        Connection: 'keep-alive',
      },
    };
    const req = http.request(options, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => resolve(data));
    });
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', async (err) => {
      if (retries > 0) {
        await sleep(500);
        get(urlPath, retries - 1).then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });
    req.end();
  });
}

// Run tasks with concurrency limit
async function pool(tasks, concurrency) {
  const results = new Array(tasks.length);
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      try { results[i] = await tasks[i](); }
      catch (e) { results[i] = null; }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function stripHtml(s) {
  return s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&#?[a-z0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

function parseRupees(raw) {
  if (!raw) return 0;
  const s = raw.replace(/Rs\.?\s*|,|\s|&nbsp;/gi, '').trim();
  if (!s || s === '0') return 0;
  return parseInt(s, 10) || 0;
}

function mapPartyId(raw) {
  const p = (raw || '').trim().toUpperCase();
  const MAP = {
    'AITC': 'AITC', 'AITC(IA)': 'AITC', 'AITCIND': 'AITC', 'TRINAMOOL CONGRESS': 'AITC',
    'BJP': 'BJP', 'BJP(R)': 'BJP',
    'INC': 'INC', 'INC(T)': 'INC', 'INDIAN NATIONAL CONGRESS': 'INC',
    'CPI(M)': 'CPI(M)', 'CPIM': 'CPI(M)', 'CPI(ML)(L)': 'CPI(M)', 'CPI': 'CPI(M)',
    'RSP': 'RSP', 'REVOLUTIONARY SOCIALIST PARTY': 'RSP',
    'SUCI(C)': 'SUCI', 'SUCI': 'SUCI',
    'BSP': 'BSP', 'BAHUJAN SAMAJ PARTY': 'BSP',
    'NCP': 'NCP',
    'AIMIM': 'ALL INDIA MAJLIS-E-ITTEHADUL MUSLIMEEN',
    'IND': 'IND', 'INDEPENDENT': 'IND',
    'NOTA': 'NOTA',
  };
  return MAP[p] || p || 'IND';
}

function parseReservation(name) {
  if (/\(SC\)/i.test(name)) return 'SC';
  if (/\(ST\)/i.test(name)) return 'ST';
  return 'General';
}

function toTitleCase(s) {
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// ── Extract photo URL from candidate detail page ──────────────
function extractPhotoFromDetail(html) {
  const m = html.match(/https?:\/\/myneta\.info\/images_candidate\/WestBengal2026\/[a-f0-9]+\.jpg/i);
  return m ? m[0] : null;
}

// Extract additional info from detail page
function parseDetailPage(html) {
  const photo = extractPhotoFromDetail(html);

  // Gender from affidavit table
  let gender = 'Male';
  const genderM = html.match(/Gender[^<]*<[^>]+>\s*(Male|Female)/i);
  if (genderM) gender = genderM[1];
  // Also check "Spouse" or "Husband/Wife" section
  if (/wife|husband/i.test(html.substring(0, 200))) gender = 'Female';

  return { photo, gender };
}

// ── Parse constituency candidate list page ────────────────────
function parsePage(html, cId) {
  const candidates = [];
  const rowRe = /<tr>\s*<td>\s*\d+\s*<\/td>\s*<td><a href=candidate\.php\?candidate_id=(\d+)>([^<]+)<\/a>/gi;
  let m;

  while ((m = rowRe.exec(html)) !== null) {
    const candidateId = m[1];
    const name = m[2].trim();
    const rowStart = m.index;
    const rowEndIdx = html.indexOf('</tr>', rowStart + 10);
    const rowHtml = rowEndIdx > rowStart ? html.slice(rowStart, rowEndIdx + 5) : html.slice(rowStart, rowStart + 1000);

    let criminalCases = 0;
    const badgeM = rowHtml.match(/<b>\s*(\d+)\s*<\/b>/);
    if (badgeM) criminalCases = parseInt(badgeM[1], 10);
    else {
      const plainM = rowHtml.match(/align=center[^>]*>\s*(\d+)\s*<\/td>/);
      if (plainM) criminalCases = parseInt(plainM[1], 10);
    }

    const cells = [];
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cm;
    while ((cm = cellRe.exec(rowHtml)) !== null) cells.push(stripHtml(cm[1]));

    const rawParty  = cells[2] ?? 'IND';
    const education = cells[4] ?? '';
    const age       = parseInt(cells[5], 10) || 0;
    const assetsRaw = cells[6] ?? '';
    const liabRaw   = cells[7] ?? '';
    const assetM    = assetsRaw.match(/Rs\s*([\d,]+)/i);
    const liabM     = liabRaw.match(/Rs\s*([\d,]+)/i);

    candidates.push({
      _myneta_id: candidateId,
      id: `wb26_${candidateId}`,
      name,
      partyId: mapPartyId(rawParty),
      constituencyId: cId,
      photoUrl: null,  // filled in by detail fetch
      age,
      gender: 'Male',
      education: education || 'Not declared',
      criminalCases,
      totalAssets:      assetM ? parseRupees(assetM[1]) : 0,
      totalLiabilities: liabM  ? parseRupees(liabM[1])  : 0,
      isIncumbent: false,
      affidavitUrl: `https://myneta.info/WestBengal2026/candidate.php?candidate_id=${candidateId}`,
    });
  }
  return candidates;
}

// ── Constituency index ────────────────────────────────────────
async function getConstituencyMap() {
  console.log('Fetching constituency index...');
  const html = await get('/WestBengal2026/');
  const map = new Map();
  const districtMap = new Map();

  const linkRe = /constituency_id=(\d+)[^>]*title='[^']*'>([^<]+)<\/a>/g;
  let m;
  while ((m = linkRe.exec(html)) !== null) map.set(m[1], m[2].trim());

  const lines = html.split('\n');
  let lastDistrict = '';
  for (const line of lines) {
    const distMatch = line.match(/dropbtnJS[^>]*>\s+([A-Z][A-Z\s]+[A-Z])\s*<span/);
    if (distMatch) lastDistrict = toTitleCase(distMatch[1].trim());
    const cMatch = line.match(/constituency_id=(\d+)/);
    if (cMatch && lastDistrict) districtMap.set(cMatch[1], lastDistrict);
  }

  console.log(`  Found ${map.size} constituencies\n`);
  return { map, districtMap };
}

// ── Fetch photos for a batch of candidates ────────────────────
async function fetchPhotos(candidates, label) {
  let done = 0;
  const tasks = candidates.map(cand => async () => {
    await sleep(DELAY_MS);
    try {
      const html = await get(`/WestBengal2026/candidate.php?candidate_id=${cand._myneta_id}`);
      const { photo, gender } = parseDetailPage(html);
      cand.photoUrl = photo;
      cand.gender   = gender;
    } catch {
      cand.photoUrl = null;
    }
    done++;
    if (done % 10 === 0 || done === candidates.length) {
      process.stdout.write(`\r  Photos: ${done}/${candidates.length} ${label}    `);
    }
  });

  await pool(tasks, CONCURRENCY);
  console.log('');
}

// ── Fallback DiceBear avatar with party colour ────────────────
function dicebearUrl(name, partyColor) {
  const color = (partyColor || '64748b').replace('#', '');
  return `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(name.slice(0, 6))}&backgroundColor=${color}&fontColor=ffffff`;
}

// ── Party colour map for fallback avatars ─────────────────────
const PARTY_COLORS = {
  'AITC': '1B5E20', 'BJP': 'E65100', 'INC': '1565C0', 'BSP': '1A237E',
  'CPI(M)': 'B71C1C', 'SUCI': '880E4F', 'RSP': 'C62828', 'IND': '546E7A',
};

// ── main ──────────────────────────────────────────────────────
async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  if (PHOTOS_ONLY) {
    await runPhotosOnly();
    return;
  }

  const { map: nameMap, districtMap } = await getConstituencyMap();
  const allConstituencies = [];
  const allCandidates     = [];
  const failed            = [];

  const ids = [...nameMap.keys()].sort((a, b) => parseInt(a) - parseInt(b));
  console.log(`Scraping ${ids.length} constituencies...\n`);

  for (let i = 0; i < ids.length; i++) {
    const id       = ids[i];
    const rawName  = nameMap.get(id);
    const district = districtMap.get(id) ?? 'West Bengal';
    const res      = parseReservation(rawName);
    const cleanName = rawName.replace(/\s*\(SC\)|\s*\(ST\)/g, '').trim();
    const cId       = `c${id.padStart(4, '0')}`;

    allConstituencies.push({
      id: cId,
      assemblyNumber: parseInt(id),
      name: toTitleCase(cleanName),
      nameBn: toTitleCase(cleanName),
      district: toTitleCase(district),
      districtBn: toTitleCase(district),
      reservation: res,
    });

    process.stdout.write(`  [${String(i + 1).padStart(3)}/${ids.length}] ${toTitleCase(cleanName).padEnd(28)} `);

    try {
      const html = await get(`/WestBengal2026/index.php?action=show_candidates&constituency_id=${id}`);
      const cands = parsePage(html, cId);
      console.log(`${String(cands.length).padStart(3)} candidates`);
      allCandidates.push(...cands);
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      failed.push({ id, name: cleanName });
    }

    if (i < ids.length - 1) await sleep(DELAY_MS);
  }

  console.log(`\nFetching real photos for ${allCandidates.length} candidates...`);
  await fetchPhotos(allCandidates, '');

  // Apply fallback avatars where photo not found
  let withPhoto = 0, withFallback = 0;
  for (const c of allCandidates) {
    if (c.photoUrl) {
      withPhoto++;
    } else {
      const color = PARTY_COLORS[c.partyId] ?? '64748b';
      c.photoUrl = dicebearUrl(c.name, color);
      withFallback++;
    }
    delete c._myneta_id;
  }
  console.log(`  With real photo: ${withPhoto}, with fallback: ${withFallback}`);

  await writeOutputFiles(allConstituencies, allCandidates, failed);
}

async function runPhotosOnly() {
  console.log('--photos-only mode: updating photos for existing candidates...\n');

  // Read existing candidates.ts
  const candFile = path.join(OUT_DIR, 'candidates.ts');
  if (!fs.existsSync(candFile)) {
    console.error('candidates.ts not found, run full scrape first');
    process.exit(1);
  }

  const text = fs.readFileSync(candFile, 'utf8');
  // Find the opening [ of the array (after '= ')
  const start = text.indexOf('= [') + 2;
  // Find the closing ]; which marks end of array
  const end = text.indexOf('];\n\nexport function', start) + 1;
  const existing = JSON.parse(text.slice(start, end));
  console.log(`Found ${existing.length} existing candidates`);

  // Extract myneta IDs from affidavitUrl
  const withIds = existing.map(c => {
    const m = (c.affidavitUrl || '').match(/candidate_id=(\d+)/);
    return { ...c, _myneta_id: m ? m[1] : null };
  }).filter(c => c._myneta_id);

  console.log(`Fetching photos for ${withIds.length} candidates...`);
  await fetchPhotos(withIds, '(photos-only)');

  let updated = 0, unchanged = 0;
  for (const c of withIds) {
    if (c.photoUrl && c.photoUrl.includes('myneta.info/images_candidate')) {
      updated++;
    } else {
      const color = PARTY_COLORS[c.partyId] ?? '64748b';
      if (!c.photoUrl || c.photoUrl.includes('dicebear')) {
        c.photoUrl = dicebearUrl(c.name, color);
      }
      unchanged++;
    }
    delete c._myneta_id;
  }
  console.log(`  Updated: ${updated} real photos, ${unchanged} using fallback`);

  // Read existing constituencies.ts
  const constFile = path.join(OUT_DIR, 'constituencies.ts');
  const constText = fs.readFileSync(constFile, 'utf8');
  const constStart = constText.indexOf('= [') + 2;
  const constEnd = constText.indexOf('];\n\nexport function', constStart) + 1;
  const existingConst = JSON.parse(constText.slice(constStart, constEnd));

  await writeOutputFiles(existingConst, withIds, []);
}

async function writeOutputFiles(allConstituencies, allCandidates, failed) {
  const today = new Date().toISOString().slice(0, 10);

  const constTs = `// AUTO-GENERATED — myneta.info/WestBengal2026 — ${today}
// 294 constituencies for West Bengal 2026 Assembly Election
// Re-run: node scripts/scraper/myneta-2026.js to refresh
import type { Constituency } from '@/types';

export const constituencies: Constituency[] = ${JSON.stringify(allConstituencies, null, 2)};

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

  const candTs = `// AUTO-GENERATED — myneta.info/WestBengal2026 — ${today}
// Source: Association for Democratic Reforms (ADR) / ECI affidavits
// Re-run: node scripts/scraper/myneta-2026.js to refresh
import type { Candidate } from '@/types';

export const candidates: Candidate[] = ${JSON.stringify(allCandidates, null, 2)};

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

  fs.writeFileSync(path.join(OUT_DIR, 'constituencies.ts'), constTs, 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'candidates.ts'), candTs, 'utf8');

  const totalCriminal = allCandidates.filter(c => c.criminalCases > 0).length;
  const totalPhotos   = allCandidates.filter(c => c.photoUrl && c.photoUrl.includes('myneta.info')).length;

  console.log('\n✅  Complete');
  console.log(`   Constituencies : ${allConstituencies.length}`);
  console.log(`   Candidates     : ${allCandidates.length}`);
  console.log(`   Real photos    : ${totalPhotos}`);
  console.log(`   Criminal cases : ${totalCriminal}`);
  if (failed.length) {
    console.log(`   ⚠  Failed (${failed.length}): ${failed.map(f => f.name).join(', ')}`);
  }
  console.log('\n   → src/data/constituencies.ts');
  console.log('   → src/data/candidates.ts');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
