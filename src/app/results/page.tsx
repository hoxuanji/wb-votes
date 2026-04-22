'use client';

import { useSearchParams } from 'next/navigation';
import { useMemo, Suspense } from 'react';
import { BarChart2, AlertCircle, MapPin } from 'lucide-react';
import Link from 'next/link';
import { ResultsChart } from '@/components/ResultsChart';
import { CandidateManifestoCard } from '@/components/CandidateManifestoCard';
import { FunFactsPanel } from '@/components/FunFactsPanel';
import { candidates } from '@/data/candidates';
import { constituencies } from '@/data/constituencies';
import { parties } from '@/data/parties';
import { computeCandidateScore, getScoreBreakdown } from '@/lib/candidate-scoring';
import type { PartyAlignmentResult } from '@/types';

const partyMap = Object.fromEntries(parties.map(p => [p.id, p]));
const constMap = Object.fromEntries(constituencies.map(c => [c.id, c]));

const DEFAULT_PARTY = { id: 'IND', name: 'Independent', nameBn: 'নির্দল', abbreviation: 'IND', color: '#546E7A', isNational: false };

function ConstituencyCandidates({
  constituencyId,
  results,
}: {
  constituencyId: string;
  results: PartyAlignmentResult[];
}) {
  const constituency = constMap[constituencyId];
  if (!constituency) return null;

  const scoreByParty = Object.fromEntries(results.map(r => [r.partyId, r.score]));

  const rankedCandidates = candidates
    .filter(c => c.constituencyId === constituencyId)
    .map(c => {
      const partyScore = scoreByParty[c.partyId] ?? 0;
      const breakdown = getScoreBreakdown(c, partyScore);
      return { candidate: c, breakdown };
    })
    .sort((a, b) => b.breakdown.finalScore - a.breakdown.finalScore);

  if (rankedCandidates.length === 0) {
    return (
      <div className="mt-8 rounded-xl border border-dashed border-gray-200 p-8 text-center">
        <MapPin className="mx-auto mb-3 h-8 w-8 text-gray-300" />
        <p className="text-sm font-medium text-gray-500">{constituency.name}</p>
        <p className="mt-1 text-xs text-gray-400">Candidate data not yet available for this constituency.</p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <div className="mb-4 flex items-center gap-2">
        <MapPin className="h-5 w-5 text-blue-600" />
        <h2 className="text-base font-bold text-gray-900">
          Candidates in {constituency.name}
          <span className="ml-1.5 text-sm font-normal text-gray-500">{constituency.district}</span>
        </h2>
      </div>

      {/* Methodology note */}
      <div className="mb-4 rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-blue-800">
        <strong>How scores are calculated:</strong> Final score = party policy alignment (60%) + candidate profile (40%).
        Profile score is based on criminal record, education level, and data completeness.
      </div>

      {/* Fun Facts */}
      <FunFactsPanel
        candidates={rankedCandidates.map(r => r.candidate)}
        className="mb-5"
      />

      <p className="mb-3 text-xs text-gray-500">
        Ranked by combined score — candidates from the same party may differ based on their individual profiles.
      </p>

      <div className="space-y-3">
        {rankedCandidates.map(({ candidate, breakdown }, i) => {
          const party = partyMap[candidate.partyId] ?? DEFAULT_PARTY;
          return (
            <CandidateManifestoCard
              key={candidate.id}
              candidate={candidate}
              party={party}
              breakdown={breakdown}
              rank={i + 1}
            />
          );
        })}
      </div>

      <p className="mt-3 text-center text-xs text-gray-400">
        Party alignment is based on stated positions — not individual candidates&apos; views.
        Profile score reflects self-declared ECI affidavit data.
      </p>
    </div>
  );
}

function ResultsInner() {
  const searchParams = useSearchParams();

  const results: PartyAlignmentResult[] | null = useMemo(() => {
    const raw = searchParams.get('data');
    if (!raw) return null;
    try {
      return JSON.parse(decodeURIComponent(raw)) as PartyAlignmentResult[];
    } catch {
      return null;
    }
  }, [searchParams]);

  const constituencyId = searchParams.get('constituency');

  if (!results || results.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <AlertCircle className="mx-auto mb-3 h-10 w-10 text-gray-300" />
        <h1 className="text-lg font-bold text-gray-700">No results found</h1>
        <p className="mt-1 text-sm text-gray-500">Please take the quiz first to see your results.</p>
        <Link
          href="/quiz"
          className="mt-4 inline-block rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Take the Quiz
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
          <BarChart2 className="h-6 w-6 text-blue-600" />
        </div>
        <h1 className="text-2xl font-extrabold text-gray-900">Your Policy Alignment</h1>
        <p className="mt-1 text-sm text-gray-500">
          Based on your quiz answers. Scores reflect alignment with publicly stated party positions.
        </p>
      </div>

      <ResultsChart results={results} />

      {constituencyId && (
        <ConstituencyCandidates constituencyId={constituencyId} results={results} />
      )}

      <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-xs text-amber-800">
        <strong>Important:</strong> These results show policy preference alignment only — they are not a voting recommendation.
        Alignment scores are approximations based on publicly stated party positions, not actual governance records.
        Please research thoroughly before voting.
      </div>
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-gray-500">Loading results…</div>}>
      <ResultsInner />
    </Suspense>
  );
}
