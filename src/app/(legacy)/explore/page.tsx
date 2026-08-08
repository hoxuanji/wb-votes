import type { Metadata } from 'next';
import { CandidateExplorerPanel } from '@/components/home/CandidateExplorerPanel';
import { getServerElectionPhase } from '@/lib/election-phase';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Explore Candidates — WB Votes',
  description: 'Deep candidate data for West Bengal 2026: key faces, hard-fought seats, money in politics, party strength, and funding.',
};

export default function ExplorePage() {
  const phase = getServerElectionPhase();
  const mapDefault = phase === 'pre' ? undefined : 'liveLeader';
  return (
    <div className="bg-slate-950">
      <section className="relative overflow-hidden border-b border-white/10 bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 px-4 py-10">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-indigo-500/15 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-6xl text-center">
          <span className="mb-3 inline-block rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-wider text-blue-300">
            Explore
          </span>
          <h1 className="text-2xl font-extrabold text-white sm:text-3xl">
            Candidate data across{' '}
            <span className="bg-gradient-to-r from-blue-300 to-indigo-300 bg-clip-text text-transparent">
              294 constituencies
            </span>
          </h1>
          <p className="mt-2 text-sm text-gray-400">
            Key faces, hard-fought seats, declared wealth, party strength, and funding transparency.
          </p>
        </div>
      </section>

      <CandidateExplorerPanel mapDefaultMode={mapDefault} showCountdown={phase === 'pre'} />
    </div>
  );
}
