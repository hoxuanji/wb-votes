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

// Static district map — overrides unreliable HTML dropdown parsing
const CORRECT_DISTRICTS = {
  'c0001':'Cooch Behar','c0002':'Cooch Behar','c0003':'Cooch Behar','c0004':'Cooch Behar','c0005':'Cooch Behar','c0006':'Cooch Behar','c0007':'Cooch Behar','c0008':'Cooch Behar','c0009':'Cooch Behar',
  'c0010':'Alipurduar','c0011':'Alipurduar','c0012':'Alipurduar','c0013':'Alipurduar','c0014':'Alipurduar',
  'c0015':'Jalpaiguri','c0016':'Jalpaiguri','c0017':'Jalpaiguri','c0018':'Jalpaiguri','c0019':'Jalpaiguri','c0020':'Jalpaiguri','c0021':'Jalpaiguri',
  'c0022':'Kalimpong',
  'c0023':'Darjeeling','c0024':'Darjeeling','c0025':'Darjeeling','c0026':'Darjeeling','c0027':'Darjeeling',
  'c0028':'Uttar Dinajpur','c0029':'Uttar Dinajpur','c0030':'Uttar Dinajpur','c0031':'Uttar Dinajpur','c0032':'Uttar Dinajpur','c0033':'Uttar Dinajpur','c0034':'Uttar Dinajpur','c0035':'Uttar Dinajpur','c0036':'Uttar Dinajpur',
  'c0037':'Dakshin Dinajpur','c0038':'Dakshin Dinajpur','c0039':'Dakshin Dinajpur','c0040':'Dakshin Dinajpur','c0041':'Dakshin Dinajpur','c0042':'Dakshin Dinajpur','c0043':'Dakshin Dinajpur',
  'c0044':'Malda','c0045':'Malda','c0046':'Malda','c0047':'Malda','c0048':'Malda','c0049':'Malda','c0050':'Malda','c0051':'Malda','c0052':'Malda','c0053':'Malda','c0054':'Malda',
  'c0055':'Murshidabad','c0056':'Murshidabad','c0057':'Murshidabad','c0058':'Murshidabad','c0059':'Murshidabad','c0060':'Murshidabad','c0061':'Murshidabad','c0062':'Murshidabad','c0063':'Murshidabad','c0064':'Murshidabad','c0065':'Murshidabad','c0066':'Murshidabad','c0067':'Murshidabad','c0068':'Murshidabad','c0069':'Murshidabad','c0070':'Murshidabad','c0071':'Murshidabad','c0072':'Murshidabad','c0073':'Murshidabad','c0074':'Murshidabad','c0075':'Murshidabad','c0076':'Murshidabad','c0077':'Murshidabad','c0078':'Murshidabad',
  'c0079':'Nadia','c0080':'Nadia','c0081':'Nadia','c0082':'Nadia','c0083':'Nadia','c0084':'Nadia','c0085':'Nadia','c0086':'Nadia','c0087':'Nadia','c0088':'Nadia','c0089':'Nadia','c0090':'Nadia','c0091':'Nadia','c0092':'Nadia','c0093':'Nadia','c0094':'Nadia','c0095':'Nadia','c0096':'Nadia',
  'c0097':'North 24 Parganas','c0098':'North 24 Parganas','c0099':'North 24 Parganas','c0100':'North 24 Parganas','c0101':'North 24 Parganas','c0102':'North 24 Parganas','c0103':'North 24 Parganas','c0104':'North 24 Parganas','c0105':'North 24 Parganas','c0106':'North 24 Parganas','c0107':'North 24 Parganas','c0108':'North 24 Parganas','c0109':'North 24 Parganas','c0110':'North 24 Parganas','c0111':'North 24 Parganas','c0112':'North 24 Parganas','c0113':'North 24 Parganas','c0114':'North 24 Parganas','c0115':'North 24 Parganas','c0116':'North 24 Parganas','c0117':'North 24 Parganas','c0118':'North 24 Parganas','c0119':'North 24 Parganas','c0120':'North 24 Parganas','c0121':'North 24 Parganas','c0122':'North 24 Parganas','c0123':'North 24 Parganas','c0124':'North 24 Parganas','c0125':'North 24 Parganas','c0126':'North 24 Parganas','c0127':'North 24 Parganas','c0128':'North 24 Parganas','c0129':'North 24 Parganas','c0130':'North 24 Parganas','c0131':'North 24 Parganas',
  'c0132':'South 24 Parganas','c0133':'South 24 Parganas','c0134':'South 24 Parganas','c0135':'South 24 Parganas','c0136':'South 24 Parganas','c0137':'South 24 Parganas','c0138':'South 24 Parganas','c0139':'South 24 Parganas','c0140':'South 24 Parganas','c0141':'South 24 Parganas','c0142':'South 24 Parganas','c0143':'South 24 Parganas','c0144':'South 24 Parganas','c0145':'South 24 Parganas','c0146':'South 24 Parganas','c0147':'South 24 Parganas','c0148':'South 24 Parganas','c0149':'South 24 Parganas','c0150':'South 24 Parganas','c0151':'South 24 Parganas','c0152':'South 24 Parganas','c0153':'South 24 Parganas','c0154':'South 24 Parganas','c0155':'South 24 Parganas','c0156':'South 24 Parganas','c0157':'South 24 Parganas','c0158':'South 24 Parganas','c0159':'Kolkata','c0160':'Kolkata',
  'c0161':'Kolkata','c0162':'Kolkata','c0163':'Kolkata','c0164':'Kolkata','c0165':'Kolkata','c0166':'Kolkata','c0167':'Kolkata','c0168':'Kolkata','c0169':'Kolkata','c0170':'Kolkata','c0171':'Kolkata','c0172':'Kolkata','c0173':'Kolkata','c0174':'Kolkata','c0175':'Kolkata',
  'c0176':'Howrah','c0177':'Howrah','c0178':'Howrah','c0179':'Howrah','c0180':'Howrah','c0181':'Howrah','c0182':'Howrah','c0183':'Howrah','c0184':'Howrah','c0185':'Howrah','c0186':'Howrah','c0187':'Howrah','c0188':'Howrah','c0189':'Howrah','c0190':'Howrah','c0191':'Howrah','c0192':'Howrah',
  'c0193':'Hooghly','c0194':'Hooghly','c0195':'Hooghly','c0196':'Hooghly','c0197':'Hooghly','c0198':'Hooghly','c0199':'Hooghly','c0200':'Hooghly','c0201':'Hooghly','c0202':'Hooghly','c0203':'Hooghly','c0204':'Hooghly','c0205':'Hooghly','c0206':'Hooghly','c0207':'Hooghly','c0208':'Hooghly','c0209':'Hooghly','c0210':'Hooghly','c0211':'Hooghly',
  'c0212':'Purba Medinipur','c0213':'Purba Medinipur','c0214':'Purba Medinipur','c0215':'Purba Medinipur','c0216':'Purba Medinipur','c0217':'Purba Medinipur','c0218':'Purba Medinipur','c0219':'Purba Medinipur','c0220':'Purba Medinipur','c0221':'Purba Medinipur','c0222':'Purba Medinipur','c0223':'Purba Medinipur','c0224':'Purba Medinipur','c0225':'Purba Medinipur','c0226':'Purba Medinipur','c0227':'Purba Medinipur','c0228':'Purba Medinipur',
  'c0229':'Paschim Medinipur','c0230':'Paschim Medinipur','c0231':'Paschim Medinipur','c0232':'Paschim Medinipur','c0233':'Paschim Medinipur','c0234':'Paschim Medinipur','c0235':'Paschim Medinipur','c0236':'Paschim Medinipur','c0237':'Paschim Medinipur','c0238':'Paschim Medinipur','c0239':'Paschim Medinipur','c0240':'Paschim Medinipur','c0241':'Paschim Medinipur','c0242':'Paschim Medinipur','c0243':'Paschim Medinipur','c0244':'Paschim Medinipur',
  'c0245':'Jhargram','c0246':'Jhargram','c0247':'Jhargram','c0248':'Jhargram',
  'c0249':'Purulia','c0250':'Purulia','c0251':'Purulia','c0252':'Purulia','c0253':'Purulia','c0254':'Purulia','c0255':'Purulia','c0256':'Purulia','c0257':'Purulia',
  'c0258':'Bankura','c0259':'Bankura','c0260':'Bankura','c0261':'Bankura','c0262':'Bankura','c0263':'Bankura','c0264':'Bankura','c0265':'Bankura','c0266':'Bankura','c0267':'Bankura','c0268':'Bankura','c0269':'Bankura',
  'c0270':'Purba Bardhaman','c0271':'Purba Bardhaman','c0272':'Purba Bardhaman','c0273':'Purba Bardhaman','c0274':'Purba Bardhaman','c0275':'Purba Bardhaman','c0276':'Purba Bardhaman','c0277':'Purba Bardhaman','c0278':'Purba Bardhaman','c0279':'Purba Bardhaman','c0280':'Purba Bardhaman','c0281':'Purba Bardhaman','c0282':'Purba Bardhaman','c0283':'Purba Bardhaman','c0284':'Purba Bardhaman','c0285':'Purba Bardhaman','c0286':'Purba Bardhaman','c0287':'Purba Bardhaman',
  'c0288':'Paschim Bardhaman','c0289':'Paschim Bardhaman','c0290':'Paschim Bardhaman','c0291':'Paschim Bardhaman','c0292':'Paschim Bardhaman','c0293':'Paschim Bardhaman','c0294':'Paschim Bardhaman','c0295':'Paschim Bardhaman','c0296':'Paschim Bardhaman',
  'c0297':'Birbhum','c0298':'Birbhum','c0299':'Birbhum','c0300':'Birbhum','c0301':'Birbhum','c0302':'Birbhum','c0303':'Birbhum','c0304':'Birbhum','c0305':'Birbhum','c0306':'Birbhum','c0307':'Birbhum',
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
    const district = CORRECT_DISTRICTS[`c${id.padStart(4, '0')}`] ?? districtMap.get(id) ?? 'West Bengal';
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
