import { NextResponse } from 'next/server';
import { writeACResult, writeStateSummary, writeMeta, readMeta } from '@/lib/live-store';
import { getServerElectionPhase } from '@/lib/election-phase';
import { constituencies } from '@/data/constituencies';
import type { ACLiveResult, StateLiveSummary } from '@/lib/live-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ECI_BASE can be swapped to a Cloudflare Worker proxy (workers/eci-proxy) when
// Akamai blocks Vercel's egress. Set ECI_BASE + ECI_PROXY_SECRET in Vercel env.
const ECI_BASE = process.env.ECI_BASE ?? 'https://results.eci.gov.in/ResultAcGenMay2026';
const ECI_PROXY_SECRET = process.env.ECI_PROXY_SECRET;
const STATE_CODE = 'S25'; // West Bengal in ECI's state code scheme
const CRON_SECRET = process.env.CRON_SECRET;

// Realistic browser headers — the ECI site is fronted by Akamai and rejects
// non-browser UAs. Verified 2026-05-04: UA below + Sec-Fetch-* returns 200 on
// the root; the placeholder UA returned 403.
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

// Regex markers that tell us the page isn't real results yet. If any match, we
// treat the page as unusable and leave any existing live-store entry alone,
// rather than blanking it out.
const PLACEHOLDER_MARKERS = [
  /Access Denied/i,
  /trends will start from/i,
  /No Record Found/i,
];

interface FetchAttempt { url: string; html: string | null; status: number }

/** Try a few plausible URL forms so we survive ECI tweaking their path scheme. */
function candidateUrls(assemblyNumber: number): string[] {
  const n = assemblyNumber;
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

async function fetchHtml(url: string): Promise<FetchAttempt> {
  try {
    const headers: Record<string, string> = { ...BROWSER_HEADERS };
    if (ECI_PROXY_SECRET) headers['X-Proxy-Secret'] = ECI_PROXY_SECRET;
    const res = await fetch(url, { headers, cache: 'no-store' });
    if (!res.ok) return { url, html: null, status: res.status };
    const html = await res.text();
    return { url, html, status: res.status };
  } catch {
    return { url, html: null, status: 0 };
  }
}

function looksLikePlaceholder(html: string): boolean {
  return PLACEHOLDER_MARKERS.some((re) => re.test(html));
}

/**
 * Defensive parse of an ECI AC-results page.
 * ECI's DOM has historically been a results table inside a div.ECI-results /
 * table.table-striped. We scan all <table>s and accept the first one whose
 * rows look like [name, party, votes, (voteShare?)]. Designed to be tolerant
 * of ECI reshuffling table order or nesting.
 */
function parseEciAcPage(html: string): ACLiveResult | null {
  if (looksLikePlaceholder(html)) return null;

  // Scan every <table> and pick the one whose rows parse as candidate rows.
  const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch: RegExpExecArray | null;
  let bestCandidates: ACLiveResult['candidates'] | null = null;

  while ((tableMatch = tableRe.exec(html)) !== null) {
    const rows = extractCandidateRows(tableMatch[1]);
    if (rows.length >= 2 && (!bestCandidates || rows.length > bestCandidates.length)) {
      bestCandidates = rows;
    }
  }

  if (!bestCandidates || bestCandidates.length === 0) return null;

  bestCandidates.sort((a, b) => b.votes - a.votes);
  const totalCounted = bestCandidates.reduce((s, c) => s + c.votes, 0);
  bestCandidates.forEach((c) => {
    if (!c.voteShare) c.voteShare = totalCounted > 0 ? (c.votes / totalCounted) * 100 : 0;
  });

  const leader = bestCandidates[0];
  const runnerUp = bestCandidates[1];
  const declared = /\b(DECLARED|WINNER)\b/.test(html);

  return {
    candidates: bestCandidates,
    leaderId: leader.candidateId,
    leaderPartyId: leader.partyId,
    marginVotes: runnerUp ? leader.votes - runnerUp.votes : leader.votes,
    totalCounted,
    declared,
    lastUpdated: new Date().toISOString(),
  };
}

function extractCandidateRows(tableInner: string): ACLiveResult['candidates'] {
  const rows: ACLiveResult['candidates'] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rm: RegExpExecArray | null;
  let idx = 0;

  while ((rm = rowRe.exec(tableInner)) !== null) {
    const cells: string[] = [];
    const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(rm[1])) !== null) {
      cells.push(cm[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim());
    }
    if (cells.length < 3) continue;

    // Heuristic: find a cell that parses to a vote count ≥ 50. The first such
    // cell gets treated as the votes column; name is the first non-numeric cell,
    // party is the cell right before votes (or the cell after name).
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

    // Optional vote share column (cell after votes, with % or small decimal)
    let voteShare = 0;
    const afterVotes = cells[numericIdx + 1];
    if (afterVotes) {
      const pct = parseFloat(afterVotes.replace(/[^\d.]/g, ''));
      if (Number.isFinite(pct) && pct >= 0 && pct <= 100) voteShare = pct;
    }

    rows.push({
      candidateId: `${name}:${party}:${idx}`,
      name,
      partyId: party,
      votes,
      voteShare,
    });
    idx++;
  }

  return rows;
}

async function fetchOneAc(
  acId: string,
  assemblyNumber: number,
): Promise<{
  data: ACLiveResult | null;
  sourceUrl: string | null;
  httpStatus: number | null;
  attempts: { url: string; status: number }[];
}> {
  const attempts: { url: string; status: number }[] = [];
  for (const url of candidateUrls(assemblyNumber)) {
    const attempt = await fetchHtml(url);
    attempts.push({ url, status: attempt.status });
    if (!attempt.html) continue;
    const data = parseEciAcPage(attempt.html);
    if (data) {
      // Stamp AC id into candidateIds so downstream components can dedupe.
      data.candidates = data.candidates.map((c) => ({ ...c, candidateId: `${acId}:${c.candidateId}` }));
      if (data.leaderId) data.leaderId = `${acId}:${data.leaderId}`;
      return { data, sourceUrl: url, httpStatus: attempt.status, attempts };
    }
    // If HTML loaded but parsed to null (placeholder / no table), return the
    // status so the caller can distinguish "no data yet" from "fetch failed".
    return { data: null, sourceUrl: url, httpStatus: attempt.status, attempts };
  }
  return { data: null, sourceUrl: null, httpStatus: null, attempts };
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function next() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await worker(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next));
  return results;
}

function buildStateSummary(
  results: { acId: string; data: ACLiveResult }[],
  totalACs: number,
): StateLiveSummary {
  const leadingByParty: Record<string, number> = {};
  const leaderByAc: Record<string, string | null> = {};
  let declared = 0;
  const margins: StateLiveSummary['tightestMargins'] = [];

  for (const { acId, data } of results) {
    leaderByAc[acId] = data.leaderPartyId;
    if (data.leaderPartyId) {
      leadingByParty[data.leaderPartyId] = (leadingByParty[data.leaderPartyId] ?? 0) + 1;
    }
    if (data.declared) declared++;
    margins.push({ acId, marginVotes: data.marginVotes, leaderPartyId: data.leaderPartyId });
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

  // Optional ?dry=1 — fetches one AC and returns parsed output without writing.
  // Useful for smoke-testing the parser on counting day. ?dry=N fetches AC index N (0-based).
  const url = new URL(req.url);
  const dry = url.searchParams.get('dry');
  if (dry !== null) {
    const idx = Number.isFinite(parseInt(dry, 10)) ? parseInt(dry, 10) : 0;
    const target = constituencies[Math.max(0, Math.min(idx, constituencies.length - 1))];
    const { data, sourceUrl, httpStatus, attempts } = await fetchOneAc(target.id, target.assemblyNumber);
    return NextResponse.json({ status: 'dry', target: target.id, assemblyNumber: target.assemblyNumber, httpStatus, sourceUrl, attempts, data });
  }

  const results: { acId: string; data: ACLiveResult }[] = [];
  const failures: { acId: string; reason: string; attempts: { url: string; status: number }[] }[] = [];

  await runWithConcurrency(constituencies, 8, async (c) => {
    const { data, sourceUrl, httpStatus, attempts } = await fetchOneAc(c.id, c.assemblyNumber);
    if (data) {
      await writeACResult(c.id, data);
      results.push({ acId: c.id, data });
    } else {
      failures.push({
        acId: c.id,
        reason: httpStatus === null ? 'no-url-worked' : `http-${httpStatus}-or-placeholder (${sourceUrl ?? '-'})`,
        attempts,
      });
    }
  });

  let summaryWritten = false;
  if (results.length > 0) {
    const summary = buildStateSummary(results, constituencies.length);
    await writeStateSummary(summary);
    summaryWritten = true;
  }

  // Aggregate status histogram across all attempts — at a glance tells us
  // whether ECI is 403-ing us, 404-ing us, or returning 200s we can't parse.
  const statusHistogram: Record<string, number> = {};
  for (const f of failures) {
    for (const a of f.attempts) {
      const key = a.status === 0 ? 'network-error' : String(a.status);
      statusHistogram[key] = (statusHistogram[key] ?? 0) + 1;
    }
  }

  const prev = await readMeta();
  const allFailed = results.length === 0;
  await writeMeta({
    lastRun: new Date().toISOString(),
    lastStatus: allFailed ? 'error' : failures.length > 0 ? 'partial' : 'ok',
    lastError: failures.length > 0 ? `${failures.length} AC(s) failed; statuses: ${JSON.stringify(statusHistogram)}` : undefined,
    sourceUrl: ECI_BASE,
    acsParsed: results.length,
    ...(allFailed && prev ? { lastRun: prev.lastRun, acsParsed: prev.acsParsed } : {}),
  });

  return NextResponse.json({
    status: allFailed ? 'error' : 'ok',
    parsed: results.length,
    errors: failures.length,
    summaryWritten,
    statusHistogram,
    sampleFailures: failures.slice(0, 3),
  });
}
