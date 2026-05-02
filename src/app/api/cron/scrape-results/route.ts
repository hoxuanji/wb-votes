import { NextResponse } from 'next/server';
import { writeACResult, writeStateSummary, writeMeta, readMeta } from '@/lib/live-store';
import { getServerElectionPhase } from '@/lib/election-phase';
import { constituencies } from '@/data/constituencies';
import type { ACLiveResult, StateLiveSummary } from '@/lib/live-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ECI_BASE = 'https://results.eci.gov.in/AcResultGenMay2026';
const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Defensive parse of an ECI AC-results page.
 * The exact DOM will not be known until ECI publishes the 2026 pages.
 * When this runs for real, replace `parseEciAcPage` body with the actual
 * parser — the rest of the flow (store writes, meta logging, error handling)
 * does not need to change.
 */
async function parseEciAcPage(acId: string, html: string): Promise<ACLiveResult | null> {
  // TODO: replace with real ECI 2026 selectors once the page format is known.
  // Placeholder: extract table rows <tr> <td>name</td><td>party</td><td>votes</td></tr>
  const candidates: ACLiveResult['candidates'] = [];

  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(html)) !== null) {
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
    const cells: string[] = [];
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(rm[1])) !== null) {
      cells.push(cm[1].replace(/<[^>]+>/g, '').trim());
    }
    if (cells.length < 3) continue;
    const name  = cells[0];
    const party = cells[1];
    const votes = parseInt(cells[2].replace(/[^\d]/g, ''), 10);
    if (!name || !Number.isFinite(votes)) continue;
    candidates.push({
      candidateId: `${acId}:${name}`,
      name,
      partyId: party,
      votes,
      voteShare: 0,
    });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.votes - a.votes);
  const totalCounted = candidates.reduce((s, c) => s + c.votes, 0);
  candidates.forEach((c) => { c.voteShare = totalCounted > 0 ? (c.votes / totalCounted) * 100 : 0; });

  const leader   = candidates[0];
  const runnerUp = candidates[1];

  return {
    candidates,
    leaderId:      leader.candidateId,
    leaderPartyId: leader.partyId,
    marginVotes:   runnerUp ? leader.votes - runnerUp.votes : leader.votes,
    totalCounted,
    declared:      false, // ECI page flags this — update when selector is known
    lastUpdated:   new Date().toISOString(),
  };
}

async function fetchOneAc(acId: string, assemblyNumber: number): Promise<ACLiveResult | null> {
  const url = `${ECI_BASE}/AcConstituency-${assemblyNumber}.htm`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WBVotes/1.0)' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const html = await res.text();
    return await parseEciAcPage(acId, html);
  } catch {
    return null;
  }
}

function buildStateSummary(results: { acId: string; data: ACLiveResult }[], totalACs: number): StateLiveSummary {
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
  // Auth: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`
  if (CRON_SECRET) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  // Skip outside the live window — saves cron minutes and avoids stale writes
  const phase = getServerElectionPhase();
  if (phase !== 'live') {
    return NextResponse.json({ status: 'skipped', phase });
  }

  const results: { acId: string; data: ACLiveResult }[] = [];
  let errors = 0;

  for (const c of constituencies) {
    const data = await fetchOneAc(c.id, c.assemblyNumber);
    if (!data) { errors++; continue; }
    await writeACResult(c.id, data);
    results.push({ acId: c.id, data });
  }

  let summaryWritten = false;
  if (results.length > 0) {
    const summary = buildStateSummary(results, constituencies.length);
    await writeStateSummary(summary);
    summaryWritten = true;
  }

  const prev = await readMeta();
  await writeMeta({
    lastRun:    new Date().toISOString(),
    lastStatus: errors === constituencies.length ? 'error' : errors > 0 ? 'partial' : 'ok',
    lastError:  errors > 0 ? `${errors} AC(s) failed to parse` : undefined,
    sourceUrl:  ECI_BASE,
    acsParsed:  results.length,
    // keep earlier good run if this one is total fail
    ...(errors === constituencies.length && prev ? { lastRun: prev.lastRun, acsParsed: prev.acsParsed } : {}),
  });

  return NextResponse.json({
    status: 'ok',
    parsed: results.length,
    errors,
    summaryWritten,
  });
}
