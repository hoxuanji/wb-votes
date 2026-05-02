#!/usr/bin/env node
/**
 * extract-eci-pdfs.js — One-off: turns ECI "DETAILED RESULTS" PDFs (converted
 * to plain text with `pdftotext -layout`) into Lokdhaba-shaped CSVs.
 *
 * Inputs:
 *   src/data/raw/historical/{2011,2016,2021}.txt   (produced by `pdftotext -layout`)
 *
 * Outputs:
 *   src/data/raw/historical/lokdhaba-wb-ac-{year}.csv
 *
 * CSV columns (stable — consumed by scripts/build-historical.js):
 *   year, ac_number, constituency_name, position, candidate,
 *   sex, age, category, party,
 *   votes_general, votes_postal, votes, vote_share_pct,
 *   total_electors, turnout_pct, margin
 *
 * Parsing strategy: line-by-line state machine.
 *   - Constituency header resets the current AC.
 *   - Candidate row matched by trailing 4 numbers (gen, postal, total, %).
 *   - Continuation lines (name wraps onto next line) are stitched onto the
 *     previous candidate's name.
 *   - TURNOUT row carries AC-level turnout_pct.
 *   - Margin = winner.votes - runnerUp.votes (computed after block closes).
 */

const fs   = require('fs');
const path = require('path');

const RAW_DIR = path.resolve(__dirname, '../src/data/raw/historical');
const YEARS   = [2011, 2016, 2021];

// Trailing numbers: general postal total pct
//   - general/postal/total are integers (can be 0)
//   - pct is either "12.34" or "0" etc — allow optional decimal
const CANDIDATE_TAIL = /\s(\d+)\s+(\d+)\s+(\d+)\s+(\d+(?:\.\d+)?)\s*$/;

// Candidate row starts with leading space(s) + position number + space + something.
// We don't try to greedy-match party/sex here — we pull those out after trimming.
const CANDIDATE_LEAD = /^\s+(\d+)\s+(.+)$/;

// Constituency header: `Constituency  12. Name (SC)  TOTAL ELECTORS: 123456`
const AC_HEADER = /^\s*Constituency\s+(\d+)\s*\.\s*(.+?)\s+TOTAL\s+ELECTORS\s*:?\s*(\d+)\s*$/i;

// Sometimes AC header breaks across lines; catch the orphan form
//   "     92 . Kalyani    TOTAL ELECTORS  257683"
const AC_HEADER_ORPHAN = /^\s+(\d{1,3})\s*\.\s*(.+?)\s+TOTAL\s+ELECTORS\s*:?\s*(\d+)\s*$/i;

// Turnout row: `TURN OUT  TOTAL:  gen  postal  total  pct`
const TURNOUT = /TURN\s*OUT.+?TOTAL:\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+(?:\.\d+)?)/i;

// Page-furniture lines we ignore entirely
const NOISE = [
  /Election Commission of India/i,
  /DETAILED RESULTS/i,
  /CANDIDATE NAME/i,
  /VALID VOTES POLLED/i,
  /%\s*VOTES/i,
  /VOTES\s*POLLED/i,
  /^\s*Page\s+\d+/i,
  /^\s*ST\d+/i,
  /STATISTICAL REPORT/i,
  /^\s*GENERAL ELECTION/i,
  /^\s*LEGISLATIVE ASSEMBLY/i,
  /^\s*WEST BENGAL\s*$/i,
  /^\s*NEW DELHI/i,
];

// Known party tokens. Used to carve the party out of the middle chunk.
// Order matters for alternation: longer/more-specific first.
// Trailing `(?=\s|$)` instead of `\b` because `\b` doesn't fire after `)`.
const PARTY_TOKEN = /(?:^|\s)(CPI\(M\)|SUCI\(C\)|JD\(S\)|JD\(U\)|SP\(I\)|DSP\(P\)|RSSCMJP|JSTDVPMTP|GOJAM|AITC|BJP|CPM|CPI|INC|BSP|AIFB|AIMIM|NCP|SUCI|RSP|SP|RLSP|AIMF|WPOI|KPPU|AMB|IUML|JMM|BLSP|BMF|ABHM|SHS|RJD|PDCI|RPI|PDS|AAP|HUMP|ISF|GJM|IND|NOTA)(?=\s|$)/;

// Sex tokens — either word or initial
const SEX_TOKEN = /\b(MALE|FEMALE|M|F)\b/;

// Category tokens
const CAT_TOKEN = /\b(GENERAL|GEN|SC|ST|NOTA)\b/;

function isNoise(line) {
  return NOISE.some(r => r.test(line));
}

/**
 * The 2021 PDF wraps wide candidate rows across two lines:
 *   line A: "    <pos> <NAME>                        <symbol-frag>"
 *   line B: "                  MALE <age> <cat> <party> <sym-frag2>  gen postal total pct"
 * A has a leading position but no trailing 4-number tail; B has a tail but no
 * leading position. Here we detect (A, B) pairs and fuse them into a single
 * synthetic line so the downstream parser sees a conventional row.
 */
function mergeOrphanPct(lines) {
  const out = [];
  let i = 0;
  const THREE_NUM_TAIL = /\s\d+\s+\d+\s+\d+\s*$/;
  const ONLY_PCT = /^\s*\d+(?:\.\d+)?\s*$/;
  while (i < lines.length) {
    const cur = lines[i];
    if (THREE_NUM_TAIL.test(cur) && !CANDIDATE_TAIL.test(cur)) {
      // Look ahead up to 3 lines (blanks + noise allowed) for a pct-only line.
      let found = -1;
      for (let step = 1; step <= 3; step++) {
        const next = lines[i + step];
        if (next == null) break;
        if (!next.trim()) continue;
        if (isNoise(next)) continue;
        if (ONLY_PCT.test(next)) { found = step; break; }
        break; // first non-blank non-noise is not a pct → give up
      }
      if (found !== -1) {
        const pct = lines[i + found].trim();
        out.push(cur.replace(/\s*$/, '') + '  ' + pct);
        i = i + found + 1;
        continue;
      }
    }
    out.push(cur);
    i++;
  }
  return out;
}

function mergeWrappedCandidateLines(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const cur = lines[i];
    const curHead = cur.match(CANDIDATE_LEAD);
    const curTail = CANDIDATE_TAIL.test(cur);

    if (curHead && !curTail && cur.trim() && !isNoise(cur)) {
      // Look ahead up to 2 lines for a tail-only partner.
      let fused = null;
      let consumed = 0;
      for (let step = 1; step <= 2; step++) {
        const partner = lines[i + step];
        if (partner == null) break;
        if (!partner.trim()) continue;
        if (isNoise(partner)) continue;
        const partnerHead = partner.match(CANDIDATE_LEAD);
        const partnerTail = CANDIDATE_TAIL.test(partner);
        // Partner must have a tail AND must not itself start with a fresh
        // "<num> <CAPNAME>" candidate opener.
        const partnerIsFresh = partnerHead && /^\s+\d+\s+[A-Z]/.test(partner);
        if (partnerTail && !partnerIsFresh) {
          fused = cur.replace(/\s+$/, '') + '  ' + partner.replace(/^\s+/, '');
          consumed = step;
          break;
        }
        // First non-empty lookahead was a fresh candidate — don't fuse.
        if (partnerIsFresh) break;
      }
      if (fused) {
        out.push(fused);
        i += consumed + 1;
        continue;
      }
    }

    out.push(cur);
    i++;
  }
  return out;
}

/**
 * Given the middle chunk of a candidate row (everything between position and
 * the trailing 4 numbers), pull out name / sex / age / category / party.
 */
function dissectMiddle(mid) {
  // NOTA rows have shape: "NOTA                       NOTA    NOTA"
  // We detect and early-return.
  if (/^\s*NOTA\b/i.test(mid.trim()) || /\bNOTA\s+NOTA\s+NOTA\b/i.test(mid)) {
    return { candidate: 'NOTA', sex: '', age: '', category: 'NOTA', party: 'NOTA' };
  }

  // Find party — last occurrence of a known party token
  let party = '';
  {
    let m;
    let last = null;
    const re = new RegExp(PARTY_TOKEN.source, 'g');
    while ((m = re.exec(mid)) !== null) last = m;
    if (last) {
      party = last[1];
      // Strip the party token and anything after (symbol column) from the middle.
      mid = mid.slice(0, last.index);
    }
  }

  // Find category — last occurrence before the party strip
  let category = '';
  {
    let m, last = null;
    const re = new RegExp(CAT_TOKEN.source, 'g');
    while ((m = re.exec(mid)) !== null) last = m;
    if (last) {
      category = last[1];
      mid = mid.slice(0, last.index);
    }
  }

  // Find age — last integer 2-3 digits long before the category strip
  let age = '';
  {
    const m = mid.match(/\s(\d{2,3})\s*$/);
    if (m) {
      age = m[1];
      mid = mid.slice(0, m.index);
    }
  }

  // Find sex — last MALE/FEMALE/M/F before the age strip
  let sex = '';
  {
    let m, last = null;
    const re = new RegExp(SEX_TOKEN.source, 'g');
    while ((m = re.exec(mid)) !== null) last = m;
    if (last) {
      sex = last[1];
      mid = mid.slice(0, last.index);
    }
  }

  // The "middle" left at this point is usually just the candidate name, but
  // in 2021 fused rows it can also carry the symbol column ("Flowers and").
  // The symbol column is separated from the name by a wide run of spaces —
  // split on 8+ consecutive spaces and keep the first chunk.
  const splitOnGap = mid.split(/\s{8,}/);
  const namePart = splitOnGap[0];

  const candidate = namePart.trim().replace(/\s+/g, ' ');
  return { candidate, sex, age, category, party };
}

function parseYear(year) {
  const src = path.join(RAW_DIR, `${year}.txt`);
  let lines = fs.readFileSync(src, 'utf8').split('\n');

  // Pre-pass: strip "Page NN" / "Page NN of MM" that sometimes appears MID-row
  // in 2021 (e.g. between total votes and %), which also breaks the trailing-
  // 4-number match. Strip trailing-line and mid-line occurrences.
  lines = lines.map(l => l.replace(/\s+Page\s+\d+(\s+of\s+\d+)?(\s|$)/gi, ' '));

  // Pre-pass: occasionally the trailing pct (4th number) lands on its own line
  // (after Page-strip it becomes e.g. "..109250 477 109727" and next line
  // "54.85"). Fuse the orphan pct back.
  lines = mergeOrphanPct(lines);

  // Pre-pass: in 2021 layout some rows wrap across lines:
  //   "    1 ADHIKARY PARESH                     Flowers and"    (position + name, no numbers)
  //   "                      MALE 68 SC AITC    98790 548 ..."   (no position, has tail)
  //   "    CHANDRA                                  Grass"       (name continuation)
  // We detect "position-only" lines and merge with the next tail-carrying line.
  lines = mergeWrappedCandidateLines(lines);

  const acs = new Map(); // ac_number -> { name, electors, candidates[], turnout_pct }
  let current = null;   // current AC block
  let lastCand = null;  // pointer to last pushed candidate (for continuation)
  let lastCandIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (!line.trim()) continue;
    if (isNoise(line)) continue;

    // Strip trailing "Page NN" suffix that pdftotext sometimes appends on the
    // same line as the AC header (e.g. "TOTAL ELECTORS 267096   Page 12").
    const pageStrip = line.replace(/\s+Page\s+\d+(\s+of\s+\d+)?\s*$/i, '');
    const testLine = pageStrip;

    // Constituency header (full form)
    let m = testLine.match(AC_HEADER);
    if (m) {
      const acNum = Number(m[1]);
      let name = m[2].trim().replace(/\s*\(\s*(SC|ST|GEN|GENERAL)\s*\)\s*$/i, '').trim();
      current = { acNum, name, electors: Number(m[3]), turnout: null, cands: [] };
      acs.set(acNum, current);
      lastCand = null;
      continue;
    }

    // Orphan header (PDF layout dropped "Constituency" token)
    if (/TOTAL\s+ELECTORS/i.test(testLine)) {
      const mo = testLine.match(AC_HEADER_ORPHAN);
      if (mo) {
        const acNum = Number(mo[1]);
        const name = mo[2].trim().replace(/\s*\(\s*(SC|ST|GEN|GENERAL)\s*\)\s*$/i, '').trim();
        if (acNum >= 1 && acNum <= 294 && !acs.has(acNum)) {
          current = { acNum, name, electors: Number(mo[3]), turnout: null, cands: [] };
          acs.set(acNum, current);
          lastCand = null;
          continue;
        }
      }
    }

    // Turnout row
    const mt = line.match(TURNOUT);
    if (mt && current) {
      current.turnout = Number(mt[4]);
      lastCand = null;
      continue;
    }

    if (!current) continue; // waiting for first AC header

    // Candidate row: trailing 4 numbers + leading position + name
    const tail = line.match(CANDIDATE_TAIL);
    const head = line.match(CANDIDATE_LEAD);
    if (tail && head) {
      const position = Number(head[1]);
      // Middle chunk = head[2] up to where the tail starts
      const tailStartInFull = line.length - tail[0].length;
      // Rebuild the middle slice relative to the full line, then trim leading position/space
      const mid = line.slice(0, tailStartInFull).replace(/^\s+\d+\s+/, '');
      const { candidate, sex, age, category, party } = dissectMiddle(mid);

      lastCand = {
        position,
        candidate,
        sex,
        age,
        category,
        party,
        votes_general: Number(tail[1]),
        votes_postal: Number(tail[2]),
        votes: Number(tail[3]),
        vote_share_pct: Number(tail[4]),
      };
      current.cands.push(lastCand);
      lastCandIndent = line.match(/^(\s*)/)[1].length;
      continue;
    }

    // Continuation line — append to previous candidate's name
    //  - No trailing numbers
    //  - Leading whitespace close to prior candidate's indent (not the symbol column)
    //  - Pure name fragment (all-caps word, apostrophes ok, no digits)
    if (lastCand && !tail) {
      const indent = line.match(/^(\s*)/)[1].length;
      const t = line.trim();
      // Reject if indent is way greater than the prior candidate row —
      // that's the symbol column, not a name continuation.
      const indentBudget = (lastCandIndent || 0) + 8;
      if (indent <= indentBudget &&
          /^[A-Za-z][A-Za-z .'()\-]{1,40}$/.test(t) &&
          !/^PAGE\b/i.test(t)) {
        lastCand.candidate = (lastCand.candidate + ' ' + t).replace(/\s+/g, ' ').trim();
      }
    }
  }

  return acs;
}

function writeCsv(year, acs) {
  const HEADERS = [
    'year', 'ac_number', 'constituency_name', 'position', 'candidate',
    'sex', 'age', 'category', 'party',
    'votes_general', 'votes_postal', 'votes', 'vote_share_pct',
    'total_electors', 'turnout_pct', 'margin',
  ];

  const rows = [HEADERS.join(',')];
  const sortedAcNums = [...acs.keys()].sort((a, b) => a - b);

  let totalCands = 0;
  for (const ac of sortedAcNums) {
    const block = acs.get(ac);
    const sorted = [...block.cands].sort((a, b) => a.position - b.position);
    const winner    = sorted.find(c => c.candidate !== 'NOTA');
    const runnerUp  = sorted.filter(c => c.candidate !== 'NOTA')[1];
    const margin    = (winner && runnerUp) ? (winner.votes - runnerUp.votes) : '';

    for (const c of sorted) {
      totalCands++;
      const csvRow = [
        year,
        ac,
        csvEscape(block.name),
        c.position,
        csvEscape(c.candidate),
        c.sex,
        c.age,
        c.category,
        c.party,
        c.votes_general,
        c.votes_postal,
        c.votes,
        c.vote_share_pct,
        block.electors,
        block.turnout ?? '',
        margin,
      ];
      rows.push(csvRow.join(','));
    }
  }

  const out = path.join(RAW_DIR, `lokdhaba-wb-ac-${year}.csv`);
  fs.writeFileSync(out, rows.join('\n') + '\n');
  return { file: out, acCount: sortedAcNums.length, candCount: totalCands };
}

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// ──────────────────────────────────────────────────────────────────────────────
const missing = YEARS.filter(y => !fs.existsSync(path.join(RAW_DIR, `${y}.txt`)));
if (missing.length) {
  console.error(`[extract-eci-pdfs] missing: ${missing.map(y => y + '.txt').join(', ')}`);
  console.error(`  run: pdftotext -layout ${RAW_DIR}/YYYY.pdf ${RAW_DIR}/YYYY.txt`);
  process.exit(1);
}

for (const year of YEARS) {
  const acs = parseYear(year);
  const stats = writeCsv(year, acs);
  const foundSet = new Set(acs.keys());
  const missingAcs = [];
  for (let n = 1; n <= 294; n++) if (!foundSet.has(n)) missingAcs.push(n);
  console.log(`[${year}] ACs: ${stats.acCount}/294  candidates: ${stats.candCount}  missing: ${missingAcs.length ? missingAcs.join(',') : 'none'}`);
  console.log(`         → ${path.relative(process.cwd(), stats.file)}`);
}
