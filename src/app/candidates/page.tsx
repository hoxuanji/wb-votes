import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { candidates } from '@/data/candidates';
import { constituencies } from '@/data/constituencies';
import { parties } from '@/data/parties';
import { CandidatesFilter } from '@/components/CandidatesFilter';

export const metadata: Metadata = {
  title: 'All Candidates — WB Votes',
  description: `Browse all ${candidates.length}+ candidates contesting the West Bengal 2026 Assembly Election.`,
};

export default function CandidatesPage() {
  const partyMap = Object.fromEntries(parties.map(p => [p.id, p]));

  // constNames: id → "Name|District" for client-side district filter
  const constNames: Record<string, string> = {};
  constituencies.forEach(c => {
    constNames[c.id] = `${c.name}|${c.district}`;
  });

  const districts = Array.from(new Set(constituencies.map(c => c.district))).sort();

  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-4 py-4">
        <div className="mx-auto max-w-5xl">
          <Link href="/" className="mb-2 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
          <h1 className="text-2xl font-extrabold text-gray-900">
            All Candidates
            <span className="ml-2 text-base font-normal text-gray-400">{candidates.length.toLocaleString()} from Phase 1</span>
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Filter by party, district, or sort by assets and criminal cases
          </p>
        </div>
      </div>

      <CandidatesFilter
        candidates={candidates}
        parties={parties}
        districts={districts}
        partyMap={partyMap}
        constNames={constNames}
      />
    </div>
  );
}
