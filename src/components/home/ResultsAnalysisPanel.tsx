'use client';

import { useMemo } from 'react';
import { historicalResults } from '@/data/historical-results';
import { candidates as allCandidates } from '@/data/candidates';
import { constituencies } from '@/data/constituencies';
import { demographics } from '@/data/demographics';
import type { ACLiveResult } from '@/lib/live-store';
import type { HistoricalACResult } from '@/types';
import {
  computeSeatFlips,
  computePartyScorecard,
  computeNotableWins,
  computeDemographicSlices,
} from '@/lib/election-analysis';
import { PartyPerformanceScorecard } from '@/components/home/PartyPerformanceScorecard';
import { SeatFlipPanel } from '@/components/home/SeatFlipPanel';
import { NotableWinsUpsetsPanel } from '@/components/home/NotableWinsUpsetsPanel';
import { DemographicSlicesPanel } from '@/components/home/DemographicSlicesPanel';

const SECTION_LINKS = [
  { href: '#scorecard',    label: 'Scorecard'    },
  { href: '#flips',        label: 'Flips'        },
  { href: '#upsets',       label: 'Upsets'       },
  { href: '#demographics', label: 'Demographics' },
];

/**
 * Treat a HistoricalACResult like an ACLiveResult so the analysis engine can
 * consume archived 2026 data without a separate codepath.
 */
function historicalToLiveShape(r: HistoricalACResult): ACLiveResult & { acId: string } {
  const picks = [
    r.winner,
    ...(r.runnerUp ? [r.runnerUp] : []),
    ...((r.topContestants ?? []).filter(c => c.name !== r.winner.name && c.name !== r.runnerUp?.name)),
  ];
  const candidates = picks.map(c => ({
    candidateId: `${r.constituencyId}:${c.name}`,
    name:        c.name,
    partyId:     c.partyId,
    votes:       c.votes,
    voteShare:   c.voteShare,
  }));
  return {
    acId:          r.constituencyId,
    candidates,
    leaderId:      candidates[0]?.candidateId ?? null,
    leaderPartyId: r.winner.partyId,
    marginVotes:   r.marginVotes,
    totalCounted:  r.totalVotes,
    totalElectors: r.totalElectors,
    declared:      true,
    lastUpdated:   '',
  };
}

/**
 * ResultsAnalysisPanel — the "Results Analysis" tab body on `/` when phase=post.
 * Own banner, own map, and footer CTA all removed (handled by HomeHero + the
 * Explore tab + tab nav respectively).
 */
export function ResultsAnalysisPanel() {
  const final2026 = useMemo(
    () => historicalResults.filter(r => r.year === (2026 as typeof r.year)).map(historicalToLiveShape),
    []
  );
  const hasArchive = final2026.length > 0;

  const scorecards   = useMemo(() => hasArchive ? computePartyScorecard(historicalResults, final2026) : [], [hasArchive, final2026]);
  const flips        = useMemo(() => hasArchive ? computeSeatFlips(historicalResults, final2026) : [], [hasArchive, final2026]);
  const notableWins  = useMemo(() => hasArchive ? computeNotableWins(allCandidates, final2026, historicalResults) : [], [hasArchive, final2026]);
  const slices       = useMemo(() => hasArchive ? computeDemographicSlices(demographics, final2026, constituencies) : [], [hasArchive, final2026]);

  if (!hasArchive) {
    return (
      <div className="px-4 py-14">
        <div className="mx-auto max-w-2xl rounded-2xl border border-dashed border-white/15 bg-white/5 p-8 text-center">
          <h3 className="text-lg font-bold text-white">2026 archive not imported yet</h3>
          <p className="mt-1 text-sm text-gray-400">
            Panels populate automatically once 2026 rows land in historical-results.ts (via the Lokdhaba pipeline or a manual import).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="text-white">
      <nav className="sticky top-14 z-30 border-b border-white/10 bg-slate-950/95 px-4 py-2 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl gap-3 overflow-x-auto text-xs">
          {SECTION_LINKS.map(s => (
            <a
              key={s.href}
              href={s.href}
              className="shrink-0 rounded-full bg-white/5 px-3 py-1 font-semibold text-gray-300 hover:bg-white/10 hover:text-white"
            >
              {s.label}
            </a>
          ))}
        </div>
      </nav>

      <PartyPerformanceScorecard scorecards={scorecards} />
      <SeatFlipPanel flips={flips} />
      <NotableWinsUpsetsPanel wins={notableWins} />
      <DemographicSlicesPanel slices={slices} />
    </div>
  );
}
