/**
 * election-analysis.ts — Pure functions for post-election deep insights.
 *
 * No React, no I/O, no date-of-day dependencies. Every function takes its data
 * explicitly and returns a plain array so callers can render empty states.
 *
 * Consumed by src/components/home/PostElectionHub.tsx and its sub-panels.
 */

import type { ACLiveResult } from '@/lib/live-store';
import type { HistoricalACResult, Constituency, Candidate, ACDemographics } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SeatFlip {
  acId: string;
  /** 2021 holder */
  from: { partyId: string; name: string };
  /** 2026 winner */
  to:   { partyId: string; name: string };
  marginVotes: number;
  /** true if from.partyId === to.partyId (held, not flipped) — callers filter */
  sameParty: boolean;
}

export interface PartyScorecard {
  partyId: string;
  seats2021: number;
  seats2026: number;
  delta: number;
  contested2026: number;
  /** wins / contests as a ratio 0..1 */
  strikeRate: number;
  /** mean winner voteShare across wins (0..100), 0 if no wins */
  avgVoteShare: number;
}

export type NotableWinKind = 'biggest_margin' | 'tightest_margin' | 'incumbent_loss' | 'first_time_winner';

export interface NotableWin {
  kind: NotableWinKind;
  acId: string;
  candidateName: string;
  partyId: string;
  marginVotes: number;
  /** free-form sub-title, e.g. "defeated three-term MLA" */
  note?: string;
}

export type DemographicDimension = 'district' | 'reservation' | 'literacy' | 'urban' | 'scShare';

export interface DemographicSlice {
  dimension: DemographicDimension;
  bucket: string;
  totalACs: number;
  seatsByParty: Record<string, number>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getWinner2021(historical: HistoricalACResult[], acId: string): HistoricalACResult | undefined {
  return historical.find(r => r.constituencyId === acId && r.year === 2021);
}

function getLeader(data: ACLiveResult): ACLiveResult['candidates'][number] | undefined {
  if (!data.candidates || data.candidates.length === 0) return undefined;
  // candidates are sorted descending in live-store, but re-sort defensively.
  return [...data.candidates].sort((a, b) => b.votes - a.votes)[0];
}

// ── computeSeatFlips ──────────────────────────────────────────────────────────

export function computeSeatFlips(
  historical: HistoricalACResult[],
  final2026: ACLiveResult[] & { acId?: string }[],
  acIdByIndex?: Map<number, string>,
): SeatFlip[] {
  if (!historical?.length || !final2026?.length) return [];

  const flips: SeatFlip[] = [];
  for (let i = 0; i < final2026.length; i++) {
    const entry = final2026[i];
    // final2026 items may carry their AC id on the object, or be looked up via the optional map
    const acId = (entry as { acId?: string }).acId ?? acIdByIndex?.get(i);
    if (!acId) continue;
    const leader = getLeader(entry);
    if (!leader) continue;
    const winner2021 = getWinner2021(historical, acId);
    if (!winner2021) continue;

    flips.push({
      acId,
      from: { partyId: winner2021.winner.partyId, name: winner2021.winner.name },
      to:   { partyId: leader.partyId,            name: leader.name },
      marginVotes: entry.marginVotes,
      sameParty: winner2021.winner.partyId === leader.partyId,
    });
  }
  return flips;
}

// ── computePartyScorecard ─────────────────────────────────────────────────────

export function computePartyScorecard(
  historical: HistoricalACResult[],
  final2026: (ACLiveResult & { acId?: string })[],
): PartyScorecard[] {
  if (!final2026?.length) return [];

  const seats2021ByParty: Record<string, number> = {};
  for (const r of historical) {
    if (r.year !== 2021) continue;
    seats2021ByParty[r.winner.partyId] = (seats2021ByParty[r.winner.partyId] ?? 0) + 1;
  }

  const seats2026ByParty: Record<string, number> = {};
  const contested2026ByParty: Record<string, number> = {};
  const voteShareSum: Record<string, number> = {};

  for (const entry of final2026) {
    // Track contested
    for (const c of entry.candidates ?? []) {
      contested2026ByParty[c.partyId] = (contested2026ByParty[c.partyId] ?? 0) + 1;
    }
    const leader = getLeader(entry);
    if (!leader) continue;
    seats2026ByParty[leader.partyId] = (seats2026ByParty[leader.partyId] ?? 0) + 1;
    voteShareSum[leader.partyId] = (voteShareSum[leader.partyId] ?? 0) + (leader.voteShare ?? 0);
  }

  const partyIds = new Set([
    ...Object.keys(seats2021ByParty),
    ...Object.keys(seats2026ByParty),
    ...Object.keys(contested2026ByParty),
  ]);

  const scorecards: PartyScorecard[] = [];
  partyIds.forEach((partyId) => {
    const seats2021 = seats2021ByParty[partyId] ?? 0;
    const seats2026 = seats2026ByParty[partyId] ?? 0;
    const contested2026 = contested2026ByParty[partyId] ?? 0;
    const strikeRate = contested2026 > 0 ? seats2026 / contested2026 : 0;
    const avgVoteShare = seats2026 > 0 ? (voteShareSum[partyId] ?? 0) / seats2026 : 0;
    scorecards.push({
      partyId,
      seats2021,
      seats2026,
      delta: seats2026 - seats2021,
      contested2026,
      strikeRate,
      avgVoteShare,
    });
  });

  // Most seats first
  scorecards.sort((a, b) => b.seats2026 - a.seats2026 || b.seats2021 - a.seats2021);
  return scorecards;
}

// ── computeNotableWins ────────────────────────────────────────────────────────

export function computeNotableWins(
  candidates: Candidate[],
  final2026: (ACLiveResult & { acId?: string })[],
  historical: HistoricalACResult[],
): NotableWin[] {
  if (!final2026?.length) return [];

  // Rank by margin
  const withLeader = final2026
    .map((e) => ({ entry: e, leader: getLeader(e) }))
    .filter((x): x is { entry: typeof x.entry & { acId?: string }; leader: NonNullable<ReturnType<typeof getLeader>> } => Boolean(x.leader));

  if (withLeader.length === 0) return [];

  const byMarginDesc = [...withLeader].sort((a, b) => b.entry.marginVotes - a.entry.marginVotes);
  const byMarginAsc  = [...withLeader].sort((a, b) => a.entry.marginVotes - b.entry.marginVotes);

  const wins: NotableWin[] = [];

  const biggest = byMarginDesc[0];
  const biggestAcId = biggest.entry.acId;
  if (biggest && biggestAcId) {
    wins.push({
      kind: 'biggest_margin',
      acId: biggestAcId,
      candidateName: biggest.leader.name,
      partyId: biggest.leader.partyId,
      marginVotes: biggest.entry.marginVotes,
    });
  }

  const tightest = byMarginAsc[0];
  const tightestAcId = tightest.entry.acId;
  if (tightest && tightestAcId && (biggest.entry.acId ?? '') !== (tightest.entry.acId ?? '')) {
    wins.push({
      kind: 'tightest_margin',
      acId: tightestAcId,
      candidateName: tightest.leader.name,
      partyId: tightest.leader.partyId,
      marginVotes: tightest.entry.marginVotes,
    });
  }

  // Incumbent losses: 2021 MLA is not the 2026 winner (either defeated or didn't re-contest)
  // We only flag cases where the 2021 MLA's NAME appears among the 2026 candidates
  // but isn't the leader. Otherwise it may just be a retirement.
  for (const { entry, leader } of withLeader) {
    const acId = entry.acId;
    if (!acId) continue;
    const w21 = getWinner2021(historical, acId);
    if (!w21) continue;
    const mla2021Name = w21.winner.name.toLowerCase();
    const stillContesting = (entry.candidates ?? []).some(c => c.name.toLowerCase() === mla2021Name);
    if (stillContesting && leader.name.toLowerCase() !== mla2021Name) {
      wins.push({
        kind: 'incumbent_loss',
        acId,
        candidateName: leader.name,
        partyId: leader.partyId,
        marginVotes: entry.marginVotes,
        note: `defeated incumbent ${w21.winner.name} (${w21.winner.partyAbbr})`,
      });
      if (wins.filter(w => w.kind === 'incumbent_loss').length >= 3) break;
    }
  }

  // First-time winners: 2026 winner is a candidate whose name didn't appear in 2021's
  // top contestants anywhere. Light heuristic — not foolproof but defensive.
  if (candidates?.length) {
    const knownNames2021 = new Set(
      historical
        .filter(r => r.year === 2021)
        .flatMap(r => [r.winner?.name, r.runnerUp?.name, ...(r.topContestants ?? []).map(c => c.name)])
        .filter(Boolean)
        .map(n => (n as string).toLowerCase()),
    );
    for (const { entry, leader } of withLeader) {
      if (wins.filter(w => w.kind === 'first_time_winner').length >= 3) break;
      if (!entry.acId) continue;
      if (!knownNames2021.has(leader.name.toLowerCase())) {
        wins.push({
          kind: 'first_time_winner',
          acId: entry.acId,
          candidateName: leader.name,
          partyId: leader.partyId,
          marginVotes: entry.marginVotes,
        });
      }
    }
  }

  return wins;
}

// ── computeDemographicSlices ──────────────────────────────────────────────────

function quartileBucket(value: number, sortedValues: number[]): string {
  if (sortedValues.length === 0) return 'unknown';
  const q1 = sortedValues[Math.floor(sortedValues.length * 0.25)];
  const q2 = sortedValues[Math.floor(sortedValues.length * 0.50)];
  const q3 = sortedValues[Math.floor(sortedValues.length * 0.75)];
  if (value <= q1) return 'Q1 (lowest)';
  if (value <= q2) return 'Q2';
  if (value <= q3) return 'Q3';
  return 'Q4 (highest)';
}

export function computeDemographicSlices(
  demographics: ACDemographics[],
  final2026: (ACLiveResult & { acId?: string })[],
  constituencies: Constituency[],
): DemographicSlice[] {
  if (!final2026?.length) return [];

  const constById = new Map(constituencies.map(c => [c.id, c]));
  const demoById  = new Map(demographics.map(d => [d.constituencyId, d]));

  // Compute quartile breakpoints for numeric demographic dimensions
  const literacyVals = demographics
    .map(d => d.literacyRate)
    .filter((v): v is number => typeof v === 'number')
    .sort((a, b) => a - b);
  const urbanVals = demographics
    .map(d => d.urbanPct)
    .filter((v): v is number => typeof v === 'number')
    .sort((a, b) => a - b);
  const scVals = demographics
    .map(d => d.scPct)
    .filter((v): v is number => typeof v === 'number')
    .sort((a, b) => a - b);

  const slices = new Map<string, DemographicSlice>();
  function bump(dim: DemographicDimension, bucket: string, partyId: string) {
    const key = `${dim}|${bucket}`;
    if (!slices.has(key)) {
      slices.set(key, { dimension: dim, bucket, totalACs: 0, seatsByParty: {} });
    }
    const s = slices.get(key)!;
    s.totalACs += 1;
    s.seatsByParty[partyId] = (s.seatsByParty[partyId] ?? 0) + 1;
  }

  for (const entry of final2026) {
    const acId = entry.acId;
    if (!acId) continue;
    const leader = getLeader(entry);
    if (!leader) continue;
    const c = constById.get(acId);
    if (!c) continue;
    const d = demoById.get(acId);

    // district
    bump('district', c.district, leader.partyId);
    // reservation
    bump('reservation', c.reservation ?? 'General', leader.partyId);
    // literacy / urban / sc quartiles (only if data present)
    if (d?.literacyRate != null) bump('literacy', quartileBucket(d.literacyRate, literacyVals), leader.partyId);
    if (d?.urbanPct    != null) bump('urban',    quartileBucket(d.urbanPct,    urbanVals),    leader.partyId);
    if (d?.scPct       != null) bump('scShare',  quartileBucket(d.scPct,       scVals),       leader.partyId);
  }

  return Array.from(slices.values()).sort((a, b) => {
    if (a.dimension !== b.dimension) return a.dimension.localeCompare(b.dimension);
    return a.bucket.localeCompare(b.bucket);
  });
}
