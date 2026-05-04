import { NextResponse } from 'next/server';
import { writeACResult, writeStateSummary, writeMeta, readMeta } from '@/lib/live-store';
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

// AC number → AC id lookup.
const acIdByNumber = new Map<number, string>();
for (const c of constituencies) acIdByNumber.set(c.assemblyNumber, c.id);

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

function buildACLiveResult(row: StatewiseRow): ACLiveResult | null {
  const acId = acIdByNumber.get(row.acNumber);
  if (!acId) return null;
  // Skip rows with no data yet (no leading candidate means counting hasn't
  // reported anything for this AC). Leave any prior KV entry in place.
  if (!row.leadName && !row.trailName && row.marginVotes === 0) return null;

  const leaderPartyId = row.leadPartyName ? resolvePartyId(row.leadPartyName) : null;
  const trailPartyId = row.trailPartyName ? resolvePartyId(row.trailPartyName) : null;
  const leaderCandidateId = row.leadName ? `${acId}:${row.leadName}:${leaderPartyId ?? ''}` : null;

  const candidates: ACLiveResult['candidates'] = [];
  if (row.leadName) {
    candidates.push({
      candidateId: `${acId}:${row.leadName}:${leaderPartyId ?? ''}`,
      name: row.leadName,
      partyId: leaderPartyId ?? 'IND',
      votes: 0,
      voteShare: 0,
    });
  }
  if (row.trailName) {
    candidates.push({
      candidateId: `${acId}:${row.trailName}:${trailPartyId ?? ''}`,
      name: row.trailName,
      partyId: trailPartyId ?? 'IND',
      votes: 0,
      voteShare: 0,
    });
  }

  return {
    candidates,
    leaderId: leaderCandidateId,
    leaderPartyId,
    marginVotes: row.marginVotes,
    totalCounted: 0,
    declared: row.declared,
    lastUpdated: new Date().toISOString(),
  };
}

function buildStateSummary(
  entries: { acId: string; data: ACLiveResult }[],
  totalACs: number,
): StateLiveSummary {
  const leadingByParty: Record<string, number> = {};
  const leaderByAc: Record<string, string | null> = {};
  let declared = 0;
  const margins: StateLiveSummary['tightestMargins'] = [];

  for (const { acId, data } of entries) {
    leaderByAc[acId] = data.leaderPartyId;
    if (data.leaderPartyId) {
      leadingByParty[data.leaderPartyId] = (leadingByParty[data.leaderPartyId] ?? 0) + 1;
    }
    if (data.declared) declared++;
    if (data.marginVotes > 0) {
      margins.push({ acId, marginVotes: data.marginVotes, leaderPartyId: data.leaderPartyId });
    }
  }

  margins.sort((a, b) => a.marginVotes - b.marginVotes);

  return {
    totalACs,
    declared,
    leadingByParty,
    leaderByAc,
    tightestMargins: margins.slice(0, 10),
    lastUpdated: new Date().toISOString(),
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

  // Fetch paginated statewise pages until we hit a 404 (ECI stops at page 15
  // for WB today but we walk until empty to survive reshuffles).
  const pageStatuses: { page: number; url: string; status: number; rows: number }[] = [];
  const rows: StatewiseRow[] = [];
  for (let p = 1; p <= STATEWISE_MAX_PAGES; p++) {
    const pageUrl = STATEWISE_URL(p);
    const { html, status } = await fetchHtml(pageUrl);
    if (!html) {
      pageStatuses.push({ page: p, url: pageUrl, status, rows: 0 });
      if (status === 404) break;
      continue;
    }
    const pageRows = parseStatewisePage(html);
    pageStatuses.push({ page: p, url: pageUrl, status, rows: pageRows.length });
    rows.push(...pageRows);
    // Defensive: ECI pages occasionally return 200 with an empty table —
    // if we see zero rows on page 1 we bail so we don't blank out KV.
    if (p === 1 && pageRows.length === 0) break;
  }

  if (rows.length === 0) {
    return NextResponse.json({
      status: 'error',
      pageStatuses,
      parsed: 0,
    }, { status: 200 });
  }

  if (dry !== null) {
    const withData = rows.filter((r) => r.leadName || r.trailName || r.marginVotes);
    return NextResponse.json({
      status: 'dry',
      pageStatuses,
      totalRows: rows.length,
      rowsWithData: withData.length,
      sample: withData.slice(0, 5),
    });
  }

  const writes: { acId: string; data: ACLiveResult }[] = [];
  let skipped = 0;
  for (const row of rows) {
    const acId = acIdByNumber.get(row.acNumber);
    if (!acId) { skipped++; continue; }
    const data = buildACLiveResult(row);
    if (!data) { skipped++; continue; }
    await writeACResult(acId, data);
    writes.push({ acId, data });
  }

  let summaryWritten = false;
  if (writes.length > 0) {
    await writeStateSummary(buildStateSummary(writes, constituencies.length));
    summaryWritten = true;
  }

  const prev = await readMeta();
  await writeMeta({
    lastRun: new Date().toISOString(),
    lastStatus: writes.length === 0 ? 'error' : writes.length < rows.length ? 'partial' : 'ok',
    lastError: writes.length === 0 ? `parsed ${rows.length} rows, none written` : undefined,
    sourceUrl: STATEWISE_URL(1),
    acsParsed: writes.length,
    ...(writes.length === 0 && prev ? { lastRun: prev.lastRun, acsParsed: prev.acsParsed } : {}),
  });

  return NextResponse.json({
    status: writes.length > 0 ? 'ok' : 'error',
    pageStatuses,
    totalRows: rows.length,
    written: writes.length,
    skippedEmpty: skipped,
    summaryWritten,
  });
}
