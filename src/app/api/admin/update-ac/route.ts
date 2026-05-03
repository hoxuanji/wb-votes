import { NextResponse } from 'next/server';
import { writeACResult, writeStateSummary, readACResult } from '@/lib/live-store';
import { constituencies } from '@/data/constituencies';
import type { ACLiveResult, StateLiveSummary } from '@/lib/live-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET;
const CONSTITUENCY_IDS = new Set(constituencies.map((c) => c.id));

interface IncomingCandidate {
  name: string;
  partyId: string;
  votes: number;
  voteShare?: number;
}

interface IncomingAC {
  acId: string;
  candidates: IncomingCandidate[];
  declared?: boolean;
}

/**
 * Manual fallback endpoint for counting day.
 *
 * Usage:
 *   curl -X POST https://wbvotes.in/api/admin/update-ac \
 *     -H "Authorization: Bearer $CRON_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"updates":[{"acId":"dum-dum","candidates":[{"name":"X","partyId":"TMC","votes":12345}]}]}'
 *
 * Accepts a batch of AC updates. For each, recomputes leader/margin/vote-share
 * and writes to the live store. Also rebuilds the state summary by reading
 * every AC currently in the store — so a single partial POST still produces
 * a coherent state tally.
 */
export async function POST(req: Request) {
  const auth = req.headers.get('authorization');
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { updates?: IncomingAC[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 });
  }

  if (!body.updates || !Array.isArray(body.updates)) {
    return NextResponse.json({ error: 'missing-updates-array' }, { status: 400 });
  }

  const written: string[] = [];
  const rejected: { acId: string; reason: string }[] = [];

  for (const u of body.updates) {
    if (!u.acId || !CONSTITUENCY_IDS.has(u.acId)) {
      rejected.push({ acId: u.acId ?? '(missing)', reason: 'unknown-ac-id' });
      continue;
    }
    if (!Array.isArray(u.candidates) || u.candidates.length === 0) {
      rejected.push({ acId: u.acId, reason: 'no-candidates' });
      continue;
    }

    const sorted = [...u.candidates]
      .filter((c) => c && c.name && c.partyId && Number.isFinite(c.votes) && c.votes >= 0)
      .sort((a, b) => b.votes - a.votes);

    if (sorted.length === 0) {
      rejected.push({ acId: u.acId, reason: 'all-candidates-invalid' });
      continue;
    }

    const totalCounted = sorted.reduce((s, c) => s + c.votes, 0);
    const candidates: ACLiveResult['candidates'] = sorted.map((c, i) => ({
      candidateId: `${u.acId}:${c.name}:${c.partyId}:${i}`,
      name: c.name,
      partyId: c.partyId,
      votes: c.votes,
      voteShare:
        typeof c.voteShare === 'number'
          ? c.voteShare
          : totalCounted > 0
          ? (c.votes / totalCounted) * 100
          : 0,
    }));

    const leader = candidates[0];
    const runnerUp = candidates[1];

    const result: ACLiveResult = {
      candidates,
      leaderId: leader.candidateId,
      leaderPartyId: leader.partyId,
      marginVotes: runnerUp ? leader.votes - runnerUp.votes : leader.votes,
      totalCounted,
      declared: u.declared === true,
      lastUpdated: new Date().toISOString(),
    };

    await writeACResult(u.acId, result);
    written.push(u.acId);
  }

  // Rebuild state summary from whatever is currently in the store.
  const all = await Promise.all(
    constituencies.map(async (c) => ({ acId: c.id, data: await readACResult(c.id) })),
  );
  const withData = all.filter((x): x is { acId: string; data: ACLiveResult } => x.data !== null);

  const leadingByParty: Record<string, number> = {};
  const leaderByAc: Record<string, string | null> = {};
  let declared = 0;
  const margins: StateLiveSummary['tightestMargins'] = [];
  for (const { acId, data } of withData) {
    leaderByAc[acId] = data.leaderPartyId;
    if (data.leaderPartyId) {
      leadingByParty[data.leaderPartyId] = (leadingByParty[data.leaderPartyId] ?? 0) + 1;
    }
    if (data.declared) declared++;
    margins.push({ acId, marginVotes: data.marginVotes, leaderPartyId: data.leaderPartyId });
  }
  margins.sort((a, b) => a.marginVotes - b.marginVotes);

  await writeStateSummary({
    totalACs: constituencies.length,
    declared,
    leadingByParty,
    leaderByAc,
    tightestMargins: margins.slice(0, 10),
    lastUpdated: new Date().toISOString(),
  });

  return NextResponse.json({
    status: 'ok',
    written: written.length,
    rejected,
    summaryAcsInStore: withData.length,
  });
}
