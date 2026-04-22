#!/usr/bin/env node
/**
 * myneta-direct.js — WB 2026 full scraper using direct HTTPS (no local proxy)
 * Fetches all 294 constituencies from myneta.info
 */

const { exec } = require('child_process');
const fs    = require('fs');
const path  = require('path');

const DELAY_MS   = 400;
const CONCURRENCY = 4;
const OUT_DIR    = path.resolve(__dirname, '../../src/data');

function get(urlPath, retries = 3) {
  const fullUrl = urlPath.startsWith('http') ? urlPath : `https://myneta.info${urlPath}`;
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      exec(
        `curl -s -L --max-time 20 -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" "${fullUrl}"`,
        { maxBuffer: 10 * 1024 * 1024 },
        (err, stdout) => {
          if (err) {
            if (n < retries) setTimeout(() => attempt(n + 1), 800);
            else reject(err);
          } else {
            resolve(stdout);
          }
        }
      );
    };
    attempt(0);
  });
}

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
    'IND': 'IND', 'INDEPENDENT': 'IND',
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

function extractPhotoFromDetail(html) {
  const m = html.match(/https?:\/\/myneta\.info\/images_candidate\/WestBengal2026\/[a-f0-9]+\.jpg/i);
  return m ? m[0] : null;
}

function parseDetailPage(html) {
  const photo = extractPhotoFromDetail(html);

  let gender = 'Male';
  const genderM = html.match(/Gender[^<]*<[^>]+>\s*(Male|Female)/i);
  if (genderM) gender = genderM[1];

  let occupation = null;
  const occM = html.match(/Profession\s*[^<]*<[^>]+>\s*([^<]{2,80})</i)
    || html.match(/Occupation\s*[^<]*<[^>]+>\s*([^<]{2,80})</i);
  if (occM) {
    const raw = occM[1].replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    if (raw && raw !== 'NIL' && raw !== '-') occupation = raw;
  }

  return { photo, gender, occupation };
}

function parsePage(html, cId) {
  const candidates = [];
  const rowRe = /<tr[^>]*>\s*<td[^>]*>\s*\d+\s*<\/td>\s*<td[^>]*>\s*<a\s+href=["']?candidate\.php\?candidate_id=(\d+)["']?>([^<]+)<\/a>/gi;
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
      photoUrl: null,
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

async function getConstituencyMap() {
  console.log('Fetching constituency index from myneta.info...');
  const html = await get('/WestBengal2026/');
  const map = new Map();
  const districtMap = new Map();

  const linkRe = /constituency_id=(\d+)[^>]*title='[^']*'>([^<]+)<\/a>/g;
  let m;
  while ((m = linkRe.exec(html)) !== null) map.set(m[1], m[2].trim());

  const lines = html.split('\n');
  let lastDistrict = '';
  for (const line of lines) {
    // Myneta uses mixed-case district names inside dropdown buttons
    // Match both ALL CAPS and Title Case formats, with or without extra attributes
    const distMatch = line.match(/dropbtn[^>]*>\s*([A-Za-z][A-Za-z\s\-']+?)\s*<span/i);
    if (distMatch) {
      const candidate = distMatch[1].trim();
      // Only accept if it looks like a district name (2+ words or known single-word districts)
      if (candidate.length > 3 && !/^\d+$/.test(candidate)) {
        lastDistrict = toTitleCase(candidate);
      }
    }
    const cMatch = line.match(/constituency_id=(\d+)/);
    if (cMatch && lastDistrict) districtMap.set(cMatch[1], lastDistrict);
  }

  console.log(`  Found ${map.size} constituencies\n`);
  return { map, districtMap };
}

async function fetchPhotos(candidates, label) {
  let done = 0;
  const tasks = candidates.map(cand => async () => {
    await sleep(DELAY_MS);
    try {
      const html = await get(`/WestBengal2026/candidate.php?candidate_id=${cand._myneta_id}`);
      const { photo, gender, occupation } = parseDetailPage(html);
      cand.photoUrl   = photo;
      cand.gender     = gender;
      if (occupation) cand.occupation = occupation;
    } catch {
      cand.photoUrl = null;
    }
    done++;
    if (done % 20 === 0 || done === candidates.length) {
      process.stdout.write(`\r  Photos: ${done}/${candidates.length} ${label}    `);
    }
  });
  await pool(tasks, CONCURRENCY);
  console.log('');
}

function dicebearUrl(name, partyColor) {
  const color = (partyColor || '64748b').replace('#', '');
  return `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(name.slice(0, 6))}&backgroundColor=${color}&fontColor=ffffff`;
}

const PARTY_COLORS = {
  'AITC': '1B5E20', 'BJP': 'E65100', 'INC': '1565C0', 'BSP': '1A237E',
  'CPI(M)': 'B71C1C', 'SUCI': '880E4F', 'RSP': 'C62828', 'IND': '546E7A',
};

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

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

    process.stdout.write(`  [${String(i + 1).padStart(3)}/${ids.length}] ${toTitleCase(cleanName).padEnd(30)} `);

    try {
      await sleep(DELAY_MS);
      const html = await get(`/WestBengal2026/index.php?action=show_candidates&constituency_id=${id}`);
      const cands = parsePage(html, cId);
      console.log(`${String(cands.length).padStart(3)} candidates`);
      allCandidates.push(...cands);
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      failed.push({ id, name: cleanName });
    }
  }

  console.log(`\nFetching photos for ${allCandidates.length} candidates (this takes a while)...`);
  await fetchPhotos(allCandidates, '');

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
  console.log(`  Real photos: ${withPhoto}, fallback avatars: ${withFallback}`);

  const today = new Date().toISOString().slice(0, 10);

  const constTs = `// AUTO-GENERATED — myneta.info/WestBengal2026 — ${today}
// 294 constituencies for West Bengal 2026 Assembly Election
// Re-run: node scripts/scraper/myneta-direct.js to refresh
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
// Re-run: node scripts/scraper/myneta-direct.js to refresh
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

  console.log('\n✅  Complete');
  console.log(`   Constituencies : ${allConstituencies.length}`);
  console.log(`   Candidates     : ${allCandidates.length}`);
  console.log(`   Real photos    : ${withPhoto}`);
  if (failed.length) {
    console.log(`   ⚠  Failed (${failed.length}): ${failed.map(f => f.name).join(', ')}`);
  }
  console.log('\n   → src/data/constituencies.ts');
  console.log('   → src/data/candidates.ts');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
