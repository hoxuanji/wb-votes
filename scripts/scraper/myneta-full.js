#!/usr/bin/env node
/**
 * myneta-full.js — WB 2026 full scraper from candidate detail pages
 *
 * Strategy: iterate candidate IDs 1–SCAN_LIMIT, fetch each detail page directly.
 * Each detail page has: name, party, constituency ID, age, photo, profession,
 * criminal cases — all in plain HTML without JS rendering.
 *
 * Run: node scripts/scraper/myneta-full.js
 * Options:
 *   --enrich-only   Re-fetch detail pages for existing candidates.ts to add
 *                   occupation/photo without changing the candidate list.
 *   --scan          Full scan: iterate IDs 1-3000, discover all candidates.
 *
 * Assets/education/gender are obfuscated on detail pages via JS eval — these
 * fields are preserved from existing data when running --enrich-only.
 */

const { exec } = require('child_process');
const fs   = require('fs');
const path = require('path');

const OUT_DIR      = path.resolve(__dirname, '../../src/data');
const DELAY_MS     = 250;
const CONCURRENCY  = 6;
const SCAN_LIMIT   = 3200; // scan IDs 1–3200 to cover all ~2920 WB2026 candidates

const ENRICH_ONLY  = process.argv.includes('--enrich-only');
const FULL_SCAN    = process.argv.includes('--scan') || !ENRICH_ONLY;

// ── HTTP ──────────────────────────────────────────────────────
function get(url, retries = 3) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      exec(
        `curl -s -L --max-time 20 -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" "${url}"`,
        { maxBuffer: 5 * 1024 * 1024 },
        (err, stdout) => {
          if (err) {
            if (n < retries) setTimeout(() => attempt(n + 1), 600);
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
      try { results[i] = await tasks[i](); } catch { results[i] = null; }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function stripHtml(s) {
  return (s || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&#?[a-z0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

// ── Party ID normalisation ────────────────────────────────────
function mapPartyId(raw) {
  const p = (raw || '').trim().toUpperCase();
  const MAP = {
    'AITC': 'AITC', 'AITC(IA)': 'AITC', 'AITCIND': 'AITC',
    'ALL INDIA TRINAMOOL CONGRESS': 'AITC', 'TRINAMOOL CONGRESS': 'AITC',
    'BJP': 'BJP', 'BJP(R)': 'BJP', 'BHARATIYA JANATA PARTY': 'BJP',
    'INC': 'INC', 'INC(T)': 'INC', 'INDIAN NATIONAL CONGRESS': 'INC',
    'CPI(M)': 'CPI(M)', 'CPIM': 'CPI(M)', 'CPI(ML)(L)': 'CPI(M)', 'CPI': 'CPI(M)',
    'COMMUNIST PARTY OF INDIA (MARXIST)': 'CPI(M)',
    'RSP': 'RSP', 'REVOLUTIONARY SOCIALIST PARTY': 'RSP',
    'SUCI(C)': 'SUCI', 'SUCI': 'SUCI',
    'BSP': 'BSP', 'BAHUJAN SAMAJ PARTY': 'BSP',
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
  return (s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).trim();
}

function parseRupees(raw) {
  if (!raw) return 0;
  const s = raw.replace(/Rs\.?\s*|,|\s|&nbsp;/gi, '').trim();
  if (!s || s === '0') return 0;
  return parseInt(s, 10) || 0;
}

// ── Parse a candidate detail page ────────────────────────────
function parseDetailPage(html, candidateId) {
  if (!html || html.length < 500) return null;

  // Title: "NAME(Party Name(ABBR)):Constituency- CONST_NAME(DISTRICT)"
  const titleM = html.match(/<title>([^<]+)<\/title>/i);
  if (!titleM) return null;
  const titleRaw = titleM[1];

  // Extract name (before first '(')
  const nameM = titleRaw.match(/^([^(]+)\(/);
  if (!nameM) return null;
  const name = toTitleCase(nameM[1].trim());

  // Extract party abbreviation from title — last (...) before ':'
  // Format: "NAME(Full Party Name(ABBR)):Constituency-..."
  const partyAbbrM = titleRaw.match(/\(([A-Z()\s\-]+)\)\s*:/);
  const partyAbbr = partyAbbrM ? partyAbbrM[1].trim() : null;

  // Also get party from <div><b>Party:</b>ABBR</div>
  const partyTagM = html.match(/<b>Party:<\/b>\s*([^<\s][^<]*?)\s*<\/div>/i);
  const partyRaw = partyTagM ? partyTagM[1].trim()
                 : partyAbbr || 'IND';
  const partyId = mapPartyId(partyRaw);

  // Constituency ID from breadcrumb link
  const constIdM = html.match(/constituency_id=(\d+).*?>([^<]+)<\/a>\s*&rarr;\s*<b>/i);
  if (!constIdM) return null;
  const constituencyId = `c${String(parseInt(constIdM[1], 10)).padStart(4, '0')}`;

  // Age
  const ageM = html.match(/<b>Age:<\/b>\s*(\d+)/i);
  const age = ageM ? parseInt(ageM[1], 10) : 0;

  // Photo
  const photoM = html.match(/https?:\/\/myneta\.info\/images_candidate\/WestBengal2026\/[a-f0-9]+\.jpg/i);
  const photoUrl = photoM ? photoM[0] : null;

  // Self Profession / Occupation
  const profM = html.match(/<b>Self Profession:<\/b>\s*([^<\n\r]+)/i);
  const occupation = profM ? stripHtml(profM[1]).replace(/\s+/g, ' ').trim() : '';

  // Spouse Profession
  const spouseM = html.match(/<b>Spouse Profession:<\/b>\s*([^<\n\r]+)/i);
  const spouseProfession = spouseM ? stripHtml(spouseM[1]).trim() : '';

  // Criminal Cases
  const crimM = html.match(/Number of Criminal Cases:\s*<span[^>]*>(\d+)<\/span>/i);
  const criminalCases = crimM ? parseInt(crimM[1], 10) : 0;

  // Gender — try to infer from "S/o" (Son of → Male) vs "D/o" (Daughter of → Female) or "W/o" (Wife of → Female)
  const relationM = html.match(/<b>S\/o\|D\/o\|W\/o:<\/b>\s*([^<]+)/i);
  let gender = 'Male';
  if (relationM) {
    const rel = relationM[0];
    if (/D\/o|W\/o/i.test(html.slice(html.indexOf(rel) - 20, html.indexOf(rel) + rel.length))) {
      gender = 'Female';
    }
  }
  // Also check "Self Profession" context — if page lists gender explicitly
  const genderM = html.match(/Gender[^<]*>\s*(Male|Female)/i);
  if (genderM) gender = genderM[1];

  return {
    id: `wb26_${candidateId}`,
    name,
    partyId,
    constituencyId,
    photoUrl,
    age,
    gender,
    education: 'Not declared', // not available without JS rendering
    occupation,
    spouseProfession: spouseProfession || undefined,
    criminalCases,
    totalAssets: 0,       // obfuscated in JS on detail page
    totalLiabilities: 0,  // obfuscated in JS on detail page
    isIncumbent: false,
    affidavitUrl: `https://myneta.info/WestBengal2026/candidate.php?candidate_id=${candidateId}`,
  };
}

// ── Enrich existing candidates with occupation/photo ─────────
async function runEnrichOnly() {
  console.log('--enrich-only: Enriching existing candidates with occupation & photo...\n');

  const candFile = path.join(OUT_DIR, 'candidates.ts');
  if (!fs.existsSync(candFile)) {
    console.error('candidates.ts not found — run full scrape first');
    process.exit(1);
  }

  const text = fs.readFileSync(candFile, 'utf8');
  const arrStart = text.indexOf('= [') + 2;
  const arrEnd = text.indexOf('];\n\nexport function', arrStart) + 1;
  const existing = JSON.parse(text.slice(arrStart, arrEnd));
  console.log(`Found ${existing.length} existing candidates`);

  let enriched = 0, failed = 0;
  const tasks = existing.map(cand => async () => {
    await sleep(DELAY_MS);
    const idM = (cand.affidavitUrl || '').match(/candidate_id=(\d+)/);
    if (!idM) return;
    try {
      const html = await get(`https://myneta.info/WestBengal2026/candidate.php?candidate_id=${idM[1]}`);
      const parsed = parseDetailPage(html, idM[1]);
      if (parsed) {
        cand.occupation  = parsed.occupation || cand.occupation;
        cand.spouseProfession = parsed.spouseProfession || cand.spouseProfession;
        if (parsed.photoUrl) cand.photoUrl = parsed.photoUrl;
        if (parsed.gender !== 'Male' || !cand.gender) cand.gender = parsed.gender;
        enriched++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
    const done = enriched + failed;
    if (done % 20 === 0 || done === existing.length) {
      process.stdout.write(`\r  Enriched: ${enriched}/${existing.length}  `);
    }
  });

  await pool(tasks, CONCURRENCY);
  console.log(`\n  Enriched: ${enriched}, Failed: ${failed}`);

  const constFile = path.join(OUT_DIR, 'constituencies.ts');
  const constText = fs.readFileSync(constFile, 'utf8');
  const constStart = constText.indexOf('= [') + 2;
  const constEnd = constText.indexOf('];\n\nexport function', constStart) + 1;
  const existingConst = JSON.parse(constText.slice(constStart, constEnd));

  await writeOutputFiles(existingConst, existing, []);
}

// ── Full scan: iterate all IDs ────────────────────────────────
async function runFullScan() {
  console.log(`Full scan: fetching candidate IDs 1–${SCAN_LIMIT} from detail pages...\n`);

  // Build a constituency map from existing constituencies.ts
  const constFile = path.join(OUT_DIR, 'constituencies.ts');
  const constText = fs.readFileSync(constFile, 'utf8');
  const constStart = constText.indexOf('= [') + 2;
  const constEnd = constText.indexOf('];\n\nexport function', constStart) + 1;
  const allConstituencies = JSON.parse(constText.slice(constStart, constEnd));

  const allCandidates = [];
  let scanned = 0, found = 0, skipped = 0;

  const ids = Array.from({ length: SCAN_LIMIT }, (_, i) => i + 1);

  const tasks = ids.map(id => async () => {
    await sleep(DELAY_MS);
    try {
      const html = await get(`https://myneta.info/WestBengal2026/candidate.php?candidate_id=${id}`);
      const parsed = parseDetailPage(html, id);
      if (parsed) {
        allCandidates.push(parsed);
        found++;
      } else {
        skipped++;
      }
    } catch {
      skipped++;
    }
    scanned++;
    if (scanned % 50 === 0) {
      process.stdout.write(`\r  Scanned: ${scanned}/${SCAN_LIMIT}  Found: ${found}  `);
    }
  });

  await pool(tasks, CONCURRENCY);
  console.log(`\n\nScan complete: ${found} candidates found, ${skipped} skipped/invalid\n`);

  await writeOutputFiles(allConstituencies, allCandidates, []);
}

// ── Write output ──────────────────────────────────────────────
async function writeOutputFiles(allConstituencies, allCandidates, failed) {
  const today = new Date().toISOString().slice(0, 10);

  // Sort by constituency then name for consistent output
  allCandidates.sort((a, b) => {
    if (a.constituencyId < b.constituencyId) return -1;
    if (a.constituencyId > b.constituencyId) return 1;
    return a.name.localeCompare(b.name);
  });

  const constTs = `// AUTO-GENERATED — myneta.info/WestBengal2026 — ${today}
// 294 constituencies for West Bengal 2026 Assembly Election
// Re-run: node scripts/scraper/myneta-full.js to refresh
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
// Re-run: node scripts/scraper/myneta-full.js --enrich-only  (add occupation to existing)
// Re-run: node scripts/scraper/myneta-full.js --scan          (full re-scan all IDs)
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

  const withOccupation = allCandidates.filter(c => c.occupation && c.occupation !== '' && c.occupation !== 'Not declared').length;
  const withPhoto = allCandidates.filter(c => c.photoUrl && c.photoUrl.includes('myneta.info/images_candidate')).length;
  const withCriminal = allCandidates.filter(c => c.criminalCases > 0).length;
  const byCons = new Set(allCandidates.map(c => c.constituencyId)).size;

  console.log('✅  Complete');
  console.log(`   Constituencies with data : ${byCons}`);
  console.log(`   Total candidates         : ${allCandidates.length}`);
  console.log(`   With occupation          : ${withOccupation}`);
  console.log(`   With real photo          : ${withPhoto}`);
  console.log(`   With criminal cases      : ${withCriminal}`);
  if (failed.length) {
    console.log(`   ⚠  Failed (${failed.length})`);
  }
  console.log('\n   → src/data/constituencies.ts');
  console.log('   → src/data/candidates.ts');
  console.log('\nNote: totalAssets/education require proxy or Playwright — run myneta-2026.js with proxy for those fields.');
}

// ── main ──────────────────────────────────────────────────────
async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  if (ENRICH_ONLY) {
    await runEnrichOnly();
  } else {
    await runFullScan();
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
