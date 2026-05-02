/**
 * Dev-only seed route — synthesizes plausible 2026-counting data for all 294
 * ACs and writes it to the live-store so you can see the LiveHomeDashboard in
 * its fully-populated state without waiting for real ECI data.
 *
 * GET /api/live/_dev-seed   → seeds (200)
 * In production, returns 404 — do NOT expose this on a live deployment.
 *
 * Source: 2021 historical candidates as baseline; random swing applied so the
 * tally looks alive (TMC loses ~10-20 seats, BJP picks them up; ~85% declared).
 */
import { NextResponse } from 'next/server';
import { writeACResult, writeStateSummary, writeMeta } from '@/lib/live-store';
import type { ACLiveResult, StateLiveSummary } from '@/lib/live-store';
import { constituencies } from '@/data/constituencies';
import { historicalResults } from '@/data/historical-results';

export const runtime  = 'nodejs';
export const dynamic  = 'force-dynamic';

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  // Deterministic-ish RNG (session-stable) so reloading gives the same tally.
  let seed = 42;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const now = new Date().toISOString();
  const leaderByAc: Record<string, string | null> = {};
  const leadingByParty: Record<string, number> = {};
  const allResults: { acId: string; data: ACLiveResult }[] = [];
  const margins: StateLiveSummary['tightestMargins'] = [];
  let declared = 0;

  // Swing knobs — synthetic 2026 narrative: TMC still the biggest, BJP gains,
  // AISF holds Bhangar, CPI(M) still thin.
  const SWING: Record<string, number> = {
    AITC:    -0.04, // -4% share on average
    BJP:     +0.05,
    INC:     -0.01,
    'CPI(M)':+0.00,
    'ALL INDIA SECULAR FRONT': +0.01,
  };

  for (const c of constituencies) {
    const h = historicalResults.find(r => r.constituencyId === c.id && r.year === 2021);
    if (!h) continue;

    // 85% declared — the rest appear as undeclared to exercise that path.
    const isDeclared = rand() > 0.15;

    // Clone candidates from 2021 with swings applied.
    const source = (h.topContestants && h.topContestants.length > 0 ? h.topContestants : [h.winner, h.runnerUp].filter(Boolean) as typeof h.topContestants extends Array<infer T> ? T[] : never[]);
    const swung = source.map(cd => {
      const baseShare = cd.voteShare / 100; // 0..1
      const swing = (SWING[cd.partyId] ?? 0) + (rand() - 0.5) * 0.03;
      const newShare = Math.max(0.005, baseShare + swing);
      return { ...cd, adjShare: newShare };
    });

    // Normalise so shares sum to 1.
    const sumShare = swung.reduce((s, x) => s + x.adjShare, 0) || 1;
    const normalised = swung.map(x => ({ ...x, adjShare: x.adjShare / sumShare }));

    // Total votes: random between 180k and 240k
    const totalCounted = Math.round(180000 + rand() * 60000);
    const candidates: ACLiveResult['candidates'] = normalised.map(x => {
      const votes = Math.round(x.adjShare * totalCounted);
      return {
        candidateId: `${c.id}:${x.name}`,
        name:        x.name,
        partyId:     x.partyId,
        votes,
        voteShare:   +(x.adjShare * 100).toFixed(2),
      };
    }).sort((a, b) => b.votes - a.votes);

    const leader   = candidates[0];
    const runnerUp = candidates[1];
    const marginVotes = runnerUp ? leader.votes - runnerUp.votes : leader.votes;

    const acLive: ACLiveResult = {
      candidates,
      leaderId:      leader.candidateId,
      leaderPartyId: leader.partyId,
      marginVotes,
      totalCounted,
      totalElectors: h.totalElectors,
      declared:      isDeclared,
      lastUpdated:   now,
    };

    await writeACResult(c.id, acLive);
    allResults.push({ acId: c.id, data: acLive });

    leaderByAc[c.id] = leader.partyId;
    leadingByParty[leader.partyId] = (leadingByParty[leader.partyId] ?? 0) + 1;
    if (isDeclared) declared++;
    margins.push({ acId: c.id, marginVotes, leaderPartyId: leader.partyId });
  }

  margins.sort((a, b) => a.marginVotes - b.marginVotes);

  const summary: StateLiveSummary = {
    totalACs: constituencies.length,
    declared,
    leadingByParty,
    leaderByAc,
    tightestMargins: margins.slice(0, 10),
    lastUpdated: now,
  };
  await writeStateSummary(summary);

  await writeMeta({
    lastRun:    now,
    lastStatus: 'ok',
    sourceUrl:  '/api/live/_dev-seed',
    acsParsed:  allResults.length,
  });

  return NextResponse.json({
    ok: true,
    seeded: allResults.length,
    declared,
    leadingByParty,
    note: 'Dev-only synthetic data. Reload / to see the dashboard.',
  });
}
