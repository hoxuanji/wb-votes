import { NextResponse } from 'next/server';
import { writeACResult, writeStateSummary, writeMeta, readMeta, deleteACResult, readStateSummary } from '@/lib/live-store';
import { getServerElectionPhase } from '@/lib/election-phase';
import { constituencies } from '@/data/constituencies';
import { parties } from '@/data/parties';
import type { ACLiveResult, StateLiveSummary } from '@/lib/live-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ECI_BASE can be swapped to a Cloudflare Worker proxy (workers/eci-proxy) when
// Akamai blocks Vercel's egress. Set ECI_BASE + ECI_PROXY_SECRET in Vercel env.
const ECI_BASE = process.env.ECI_BASE ?? 'https://results.eci.gov.in/ResultAcGenMay2026';
const ECI_PROXY_SECRET = process.env.ECI_PROXY_SECRET;
// ECI paginates the statewise trends at 20 rows/page. For WB (294 ACs) that's
// 15 pages: statewiseS251.htm .. statewiseS2515.htm. Pattern: statewiseS25{page}.htm
const STATEWISE_URL = (page: number) => `${ECI_BASE}/statewiseS25${page}.htm`;
const STATEWISE_MAX_PAGES = 20; // hard cap; we stop early on first 404
// Party-wise lead result pages carry vote counts for leading candidates —
// statewise pages only have margin, not raw totals. We discover active party
// ids from the party index, then fetch each party's lead page.
const PARTY_INDEX_URL = `${ECI_BASE}/partywiseresult-S25.htm`;
const PARTY_LEAD_URL = (partyNumericId: string) => `${ECI_BASE}/partywiseleadresult-${partyNumericId}S25.htm`;
// Per-AC detail pages — have the FULL candidate list with real vote counts.
// Pattern: candidateswise-S25{acNumber}.htm. Format is card-based, not a table.
const CANDIDATESWISE_URL = (acNumber: number) => `${ECI_BASE}/candidateswise-S25${acNumber}.htm`;
const CANDIDATESWISE_BATCH_SIZE = 30;
const CRON_SECRET = process.env.CRON_SECRET;

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 ' +
    '(KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

async function fetchHtml(url: string): Promise<{ html: string | null; status: number }> {
  try {
    const headers: Record<string, string> = { ...BROWSER_HEADERS };
    if (ECI_PROXY_SECRET) headers['X-Proxy-Secret'] = ECI_PROXY_SECRET;
    const res = await fetch(url, { headers, cache: 'no-store' });
    if (!res.ok) return { html: null, status: res.status };
    return { html: await res.text(), status: res.status };
  } catch {
    return { html: null, status: 0 };
  }
}

// Party name → partyId lookup. ECI prints full party names verbatim; our party
// ids are either abbreviations (AITC, BJP, INC) or the uppercased name.
const partyIdByName = new Map<string, string>();
for (const p of parties) partyIdByName.set(p.name.toLowerCase(), p.id);

function resolvePartyId(name: string): string {
  const key = name.trim().toLowerCase();
  if (!key) return '';
  return partyIdByName.get(key) ?? name.trim().toUpperCase();
}

// AC number → AC id lookup (fallback only — see acIdByName below).
const acIdByNumber = new Map<number, string>();
for (const c of constituencies) acIdByNumber.set(c.assemblyNumber, c.id);

// Our local `constituencies.ts` assemblyNumbers do not always align with ECI's
// 2026 numbering (e.g. Bhabanipur is #166 locally but #159 on ECI). Name-based
// matching is the authoritative join key; number is a fallback for rare cases
// where ECI spells a name differently.
const acIdByName = new Map<string, string>();
function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}
for (const c of constituencies) acIdByName.set(normalizeName(c.name), c.id);

// Spelling variants — ECI's normalized name → our normalized name.
const ECI_NAME_ALIASES: Record<string, string> = {
  bhagawangola: 'bhagabangola',
  jaynagar: 'joynagar',
  labpur: 'labhpur',
  mahisadal: 'mahishadal',
  mangalkot: 'mongalkote',
  nowda: 'naoda',
};

function lookupAcId(acName: string, acNumber: number): string | null {
  const key = normalizeName(acName);
  const direct = acIdByName.get(key);
  if (direct) return direct;
  const aliased = ECI_NAME_ALIASES[key];
  if (aliased) {
    const hit = acIdByName.get(aliased);
    if (hit) return hit;
  }
  return acIdByNumber.get(acNumber) ?? null;
}

/**
 * The statewise page embeds a tooltip <div> inside each party cell, and also
 * wraps each party cell's visible content in a nested <table>. To parse the
 * outer 9-column row reliably we:
 *   1. strip tooltip divs (they contain nested <tr>s that break row splitting),
 *   2. replace each <td>...<table>...</table>...</td> with <td>FirstCellText</td>
 *      so the outer row becomes a flat 9-cell <tr>.
 */
function flattenRowCells(html: string): string {
  let out = html.replace(/<div class=['"]tooltip['"][^>]*>[\s\S]*?<\/div>/g, '');
  // Repeat until stable in case of deeper nesting surprise.
  let prev = '';
  while (prev !== out) {
    prev = out;
    out = out.replace(
      /(<td[^>]*>)\s*<table[^>]*>([\s\S]*?)<\/table>\s*(<\/td>)/g,
      (_, open: string, inner: string, close: string) => {
        const firstCell = inner.match(/<td[^>]*>([\s\S]*?)<\/td>/);
        const text = firstCell ? firstCell[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
        return `${open}${text}${close}`;
      },
    );
  }
  return out;
}

interface StatewiseRow {
  acNumber: number;
  acName: string;
  leadName: string;
  leadPartyName: string;
  trailName: string;
  trailPartyName: string;
  marginVotes: number;
  roundCurrent: number | null;
  roundTotal: number | null;
  status: string;
  declared: boolean;
}

function parseStatewisePage(html: string): StatewiseRow[] {
  const flat = flattenRowCells(html);
  const rows: StatewiseRow[] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(flat)) !== null) {
    const cells: string[] = [];
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(rm[1])) !== null) {
      cells.push(cm[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim());
    }
    if (cells.length < 9) continue;
    const acNumber = parseInt(cells[1], 10);
    if (!Number.isFinite(acNumber) || acNumber < 1 || acNumber > 400) continue;
    if (!cells[0] || cells[0].length > 80) continue;

    const marginRaw = cells[6].replace(/[^\d-]/g, '');
    const marginVotes = parseInt(marginRaw, 10);
    const [curr, total] = cells[7].split('/').map((s) => parseInt(s.trim(), 10));
    const status = cells[8];

    rows.push({
      acNumber,
      acName: cells[0],
      leadName: cells[2],
      leadPartyName: cells[3],
      trailName: cells[4],
      trailPartyName: cells[5],
      marginVotes: Number.isFinite(marginVotes) ? marginVotes : 0,
      roundCurrent: Number.isFinite(curr) ? curr : null,
      roundTotal: Number.isFinite(total) ? total : null,
      status,
      declared: /result declared|winner|decl\.?\b/i.test(status),
    });
  }
  return rows;
}

function buildACLiveResult(
  row: StatewiseRow,
  enrich: PartywiseEnrichment | undefined,
  detail: CandidateswiseData | undefined,
): ACLiveResult | null {
  const acId = lookupAcId(row.acName, row.acNumber);
  if (!acId) return null;
  // Skip rows with no data yet (no leading candidate means counting hasn't
  // reported anything for this AC). Leave any prior KV entry in place.
  if (!row.leadName && !row.trailName && row.marginVotes === 0) return null;

  // Preferred path — candidateswise detail page has every candidate with real
  // vote counts and a status flag. Use it when available.
  if (detail && detail.candidates.length > 0) {
    const candidates: ACLiveResult['candidates'] = detail.candidates
      .map((c, i) => ({
        candidateId: `${acId}:${c.name}:${resolvePartyId(c.partyName)}:${i}`,
        name: c.name,
        partyId: resolvePartyId(c.partyName),
        votes: c.votes,
        voteShare: 0,
      }))
      .sort((a, b) => b.votes - a.votes);
    const totalCounted = candidates.reduce((s, c) => s + c.votes, 0);
    if (totalCounted > 0) {
      candidates.forEach((c) => { c.voteShare = (c.votes / totalCounted) * 100; });
    }
    const leader = candidates[0];
    const runnerUp = candidates[1];
    const computedMargin = leader && runnerUp ? leader.votes - runnerUp.votes : 0;
    return {
      candidates,
      leaderId: leader?.candidateId ?? null,
      leaderPartyId: leader?.partyId ?? null,
      marginVotes: computedMargin > 0 ? computedMargin : row.marginVotes,
      totalCounted,
      declared: detail.declared || row.declared,
      lastUpdated: new Date().toISOString(),
    };
  }

  // Fallback path (detail page not yet published for this AC): build a
  // leader+trailer skeleton from statewise. Votes come from partywise if the
  // name lines up, else remain 0.
  const leaderPartyId = row.leadPartyName ? resolvePartyId(row.leadPartyName) : null;
  const trailPartyId = row.trailPartyName ? resolvePartyId(row.trailPartyName) : null;
  const leaderCandidateId = row.leadName ? `${acId}:${row.leadName}:${leaderPartyId ?? ''}` : null;

  const leaderVotes = enrich && sameName(enrich.leadName, row.leadName) ? enrich.leadVotes : 0;
  const trailerVotes = leaderVotes > 0 && row.marginVotes > 0
    ? Math.max(0, leaderVotes - row.marginVotes)
    : 0;
  const totalCounted = leaderVotes + trailerVotes;

  const candidates: ACLiveResult['candidates'] = [];
  if (row.leadName) {
    candidates.push({
      candidateId: `${acId}:${row.leadName}:${leaderPartyId ?? ''}`,
      name: row.leadName,
      partyId: leaderPartyId ?? 'IND',
      votes: leaderVotes,
      voteShare: totalCounted > 0 ? (leaderVotes / totalCounted) * 100 : 0,
    });
  }
  if (row.trailName) {
    candidates.push({
      candidateId: `${acId}:${row.trailName}:${trailPartyId ?? ''}`,
      name: row.trailName,
      partyId: trailPartyId ?? 'IND',
      votes: trailerVotes,
      voteShare: totalCounted > 0 ? (trailerVotes / totalCounted) * 100 : 0,
    });
  }

  return {
    candidates,
    leaderId: leaderCandidateId,
    leaderPartyId,
    marginVotes: row.marginVotes,
    totalCounted,
    declared: row.declared,
    lastUpdated: new Date().toISOString(),
  };
}

function sameName(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
  return !!a && !!b && norm(a) === norm(b);
}

interface CandidateswiseData {
  candidates: { name: string; partyName: string; status: string; votes: number }[];
  declared: boolean;
}

/**
 * Parse an ECI per-AC detail page (candidateswise-S25{n}.htm).
 * Each candidate sits in a <div class='cand-box'> with a .status badge
 * (won/leading/trailing) containing the vote count, plus .nme-prty > h5 (name) + h6 (party).
 * Split-on-opener approach sidesteps the nested-div closer ambiguity.
 */
function parseCandidateswisePage(html: string): CandidateswiseData {
  const candidates: CandidateswiseData['candidates'] = [];
  const parts = html.split(/<div class=['"]cand-box[^'"]*['"][^>]*>/);
  // parts[0] is the prefix before the first card; each later part starts inside a card
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i];
    const nameMatch = chunk.match(/<h5[^>]*>([\s\S]*?)<\/h5>/);
    const partyMatch = chunk.match(/<h6[^>]*>([\s\S]*?)<\/h6>/);
    const statusMatch = chunk.match(/class=['"]status\s+(\w+)['"][^>]*>\s*<div[^>]*>[\s\S]*?<\/div>\s*<div[^>]*>\s*([\d,\s]+)/);
    if (!nameMatch) continue;
    const name = nameMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const partyName = partyMatch ? partyMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
    const status = statusMatch ? statusMatch[1].trim().toLowerCase() : '';
    const votes = statusMatch ? parseInt(statusMatch[2].replace(/[^\d]/g, ''), 10) || 0 : 0;
    if (!name || name.toUpperCase() === 'NOTA') continue; // NOTA shows at the end with no vote cell
    candidates.push({ name, partyName, status, votes });
  }
  const declared = candidates.some((c) => c.status === 'won');
  return { candidates, declared };
}

/** Fetch candidateswise pages for the given AC numbers in batches to avoid a thundering herd. */
async function fetchCandidateswiseData(acNumbers: number[]): Promise<Map<number, CandidateswiseData>> {
  const byAc = new Map<number, CandidateswiseData>();
  for (let i = 0; i < acNumbers.length; i += CANDIDATESWISE_BATCH_SIZE) {
    const chunk = acNumbers.slice(i, i + CANDIDATESWISE_BATCH_SIZE);
    const results = await Promise.all(chunk.map(async (n) => {
      const { html } = await fetchHtml(CANDIDATESWISE_URL(n));
      if (!html) return { n, data: null as CandidateswiseData | null };
      const data = parseCandidateswisePage(html);
      return { n, data: data.candidates.length > 0 ? data : null };
    }));
    for (const r of results) {
      if (r.data) byAc.set(r.n, r.data);
    }
  }
  return byAc;
}

interface PartywiseEnrichment {
  acNumber: number;
  leadName: string;
  leadVotes: number;
}

/** Discover party numeric ids (e.g. 140, 3373, 369) from the party index. */
function extractPartyIds(indexHtml: string): string[] {
  const ids = new Set<string>();
  const re = /partywiseleadresult-(\d+)S25\.htm/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(indexHtml)) !== null) ids.add(m[1]);
  return Array.from(ids);
}

/**
 * Parse a party-wise lead page. Columns:
 *   S.No | Constituency(#acNum) | Leading Candidate | Total Votes | Margin | Status
 */
function parsePartywiseLeadPage(html: string): PartywiseEnrichment[] {
  const rows: PartywiseEnrichment[] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(html)) !== null) {
    const cells: string[] = [];
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(rm[1])) !== null) {
      cells.push(cm[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim());
    }
    if (cells.length < 6) continue;
    if (!/^\d+$/.test(cells[0])) continue;
    const acMatch = cells[1].match(/\((\d+)\)\s*$/);
    if (!acMatch) continue;
    const acNumber = parseInt(acMatch[1], 10);
    const leadVotes = parseInt(cells[3].replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(acNumber) || !Number.isFinite(leadVotes)) continue;
    rows.push({ acNumber, leadName: cells[2], leadVotes });
  }
  return rows;
}

/** Fetch the party index + each party's lead page; returns a map keyed by AC number. */
async function fetchPartywiseEnrichments(): Promise<{
  byAc: Map<number, PartywiseEnrichment>;
  partyIds: string[];
  partyPageStatuses: { partyId: string; url: string; status: number; rows: number }[];
}> {
  const byAc = new Map<number, PartywiseEnrichment>();

  const { html: indexHtml } = await fetchHtml(PARTY_INDEX_URL);
  if (!indexHtml) return { byAc, partyIds: [], partyPageStatuses: [] };

  const partyIds = extractPartyIds(indexHtml);
  const results = await Promise.all(partyIds.map(async (partyId) => {
    const url = PARTY_LEAD_URL(partyId);
    const { html, status } = await fetchHtml(url);
    const rows = html ? parsePartywiseLeadPage(html) : [];
    return { partyId, url, status, rows };
  }));

  const partyPageStatuses = results.map((r) => ({ partyId: r.partyId, url: r.url, status: r.status, rows: r.rows.length }));
  for (const r of results) {
    for (const row of r.rows) {
      byAc.set(row.acNumber, row);
    }
  }
  return { byAc, partyIds, partyPageStatuses };
}

function buildStateSummary(
  entries: { acId: string; data: ACLiveResult }[],
  totalACs: number,
  prevDeclaredAt: Map<string, string>,
): StateLiveSummary {
  const leadingByParty: Record<string, number> = {};
  const votesByParty: Record<string, number> = {};
  const leaderByAc: Record<string, string | null> = {};
  const leaderNameByAc: Record<string, string> = {};
  const marginByAc: Record<string, number> = {};
  const declaredWinners: StateLiveSummary['declaredWinners'] = [];
  let declared = 0;
  const margins: StateLiveSummary['tightestMargins'] = [];
  const nowIso = new Date().toISOString();

  for (const { acId, data } of entries) {
    leaderByAc[acId] = data.leaderPartyId;
    if (data.candidates[0]) {
      leaderNameByAc[acId] = data.candidates[0].name;
    }
    if (data.marginVotes > 0) {
      marginByAc[acId] = data.marginVotes;
    }
    if (data.leaderPartyId) {
      leadingByParty[data.leaderPartyId] = (leadingByParty[data.leaderPartyId] ?? 0) + 1;
    }
    for (const c of data.candidates) {
      if (c.votes > 0) {
        votesByParty[c.partyId] = (votesByParty[c.partyId] ?? 0) + c.votes;
      }
    }
    if (data.declared) {
      declared++;
      const winner = data.candidates[0];
      if (winner) {
        declaredWinners.push({
          acId,
          candidateName: winner.name,
          partyId: winner.partyId,
          marginVotes: data.marginVotes,
          // Preserve first-seen timestamp across runs so UI can sort by
          // declaration time; stamp 'now' only for freshly-declared ACs.
          declaredAt: prevDeclaredAt.get(acId) ?? nowIso,
        });
      }
    }
    if (data.marginVotes > 0) {
      margins.push({ acId, marginVotes: data.marginVotes, leaderPartyId: data.leaderPartyId });
    }
  }

  margins.sort((a, b) => a.marginVotes - b.marginVotes);
  // Most recently declared first — that's what viewers want top-of-page.
  declaredWinners.sort((a, b) => (b.declaredAt ?? '').localeCompare(a.declaredAt ?? ''));

  return {
    totalACs,
    declared,
    leadingByParty,
    votesByParty,
    leaderByAc,
    leaderNameByAc,
    marginByAc,
    declaredWinners,
    tightestMargins: margins.slice(0, 10),
    lastUpdated: nowIso,
  };
}

export async function GET(req: Request) {
  if (CRON_SECRET) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const phase = getServerElectionPhase();
  if (phase !== 'live') {
    return NextResponse.json({ status: 'skipped', phase });
  }

  const url = new URL(req.url);
  const dry = url.searchParams.get('dry');
  const reset = url.searchParams.get('reset') === '1';

  // One-shot cleanup: blank every AC's KV entry before the scrape. Use this
  // after a fix that re-wires how rows map to constituencies, so stale
  // incorrectly-attributed data doesn't linger on ACs that haven't yet
  // re-reported on ECI. Hit ?reset=1 once manually.
  let resetCount = 0;
  if (reset) {
    await Promise.all(constituencies.map((c) => deleteACResult(c.id)));
    resetCount = constituencies.length;
  }

  // Fetch statewise pages in parallel (cap at STATEWISE_MAX_PAGES). 404 on a
  // page just means we've gone past the last real one; filter those out.
  const pageNums = Array.from({ length: STATEWISE_MAX_PAGES }, (_, i) => i + 1);
  const pageResults = await Promise.all(pageNums.map(async (p) => {
    const pageUrl = STATEWISE_URL(p);
    const { html, status } = await fetchHtml(pageUrl);
    const pageRows = html ? parseStatewisePage(html) : [];
    return { page: p, url: pageUrl, status, rows: pageRows };
  }));
  const pageStatuses: { page: number; url: string; status: number; rows: number }[] = [];
  const rows: StatewiseRow[] = [];
  for (const r of pageResults) {
    pageStatuses.push({ page: r.page, url: r.url, status: r.status, rows: r.rows.length });
    if (r.status !== 200) continue;
    rows.push(...r.rows);
  }

  if (rows.length === 0) {
    return NextResponse.json({
      status: 'error',
      pageStatuses,
      parsed: 0,
    }, { status: 200 });
  }

  const { byAc: partywiseByAc, partyIds, partyPageStatuses } = await fetchPartywiseEnrichments();

  // Fetch per-AC detail pages for every AC that has reported a leader. This
  // gives us real vote counts for every candidate instead of the synthetic
  // leader+trailer skeleton we fall back to.
  const acNumbersWithData = rows.filter((r) => r.leadName || r.trailName).map((r) => r.acNumber);
  const candidateswiseByAc = await fetchCandidateswiseData(acNumbersWithData);

  if (dry !== null) {
    const withData = rows.filter((r) => r.leadName || r.trailName || r.marginVotes);
    const sample = withData.slice(0, 5).map((r) => ({
      ...r,
      enrichment: partywiseByAc.get(r.acNumber) ?? null,
      detail: candidateswiseByAc.get(r.acNumber) ?? null,
    }));
    return NextResponse.json({
      status: 'dry',
      pageStatuses,
      partyIds,
      partyPageStatuses,
      totalRows: rows.length,
      rowsWithData: withData.length,
      rowsEnriched: Array.from(partywiseByAc.keys()).length,
      rowsWithDetail: candidateswiseByAc.size,
      sample,
    });
  }

  const writes: { acId: string; data: ACLiveResult }[] = [];
  let skipped = 0;
  let unmatched = 0;
  const toWrite: { acId: string; data: ACLiveResult }[] = [];
  for (const row of rows) {
    const acId = lookupAcId(row.acName, row.acNumber);
    if (!acId) { unmatched++; continue; }
    const data = buildACLiveResult(row, partywiseByAc.get(row.acNumber), candidateswiseByAc.get(row.acNumber));
    if (!data) { skipped++; continue; }
    toWrite.push({ acId, data });
  }
  await Promise.all(toWrite.map((w) => writeACResult(w.acId, w.data)));
  writes.push(...toWrite);

  let summaryWritten = false;
  if (writes.length > 0) {
    const prevSummary = await readStateSummary();
    const prevDeclaredAt = new Map<string, string>();
    for (const w of prevSummary?.declaredWinners ?? []) {
      if (w.declaredAt) prevDeclaredAt.set(w.acId, w.declaredAt);
    }
    await writeStateSummary(buildStateSummary(writes, constituencies.length, prevDeclaredAt));
    summaryWritten = true;
  }

  const prev = await readMeta();
  // "partial" should mean real failures, not "some ACs haven't reported yet".
  // Empty statewise rows are the default pre-counting state and get `skipped`;
  // only unmatched names (or zero writes) flag a genuine error.
  const lastStatus: 'ok' | 'error' | 'partial' =
    writes.length === 0 ? 'error' : unmatched > 0 ? 'partial' : 'ok';
  await writeMeta({
    lastRun: new Date().toISOString(),
    lastStatus,
    lastError:
      writes.length === 0
        ? `parsed ${rows.length} rows, none written`
        : unmatched > 0
          ? `${unmatched} AC(s) could not be matched to local data`
          : undefined,
    sourceUrl: STATEWISE_URL(1),
    acsParsed: writes.length,
    ...(writes.length === 0 && prev ? { lastRun: prev.lastRun, acsParsed: prev.acsParsed } : {}),
  });

  return NextResponse.json({
    status: writes.length > 0 ? 'ok' : 'error',
    pageStatuses,
    partyIds,
    partyPageStatuses,
    totalRows: rows.length,
    written: writes.length,
    enriched: Array.from(partywiseByAc.keys()).length,
    withDetail: candidateswiseByAc.size,
    unmatched,
    skippedEmpty: skipped,
    summaryWritten,
    resetCount,
  });
}
