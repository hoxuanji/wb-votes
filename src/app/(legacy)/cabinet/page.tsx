import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { wbCabinet2026, getChiefMinister } from '@/data/cabinet';
import { parties } from '@/data/parties';
import type { CabinetMember, MinistryRank } from '@/types';
import { MinisterCard } from '@/components/cabinet/MinisterCard';
import { CabinetFilters } from '@/components/cabinet/CabinetFilters';

export const metadata: Metadata = {
  title: 'WB Cabinet — West Bengal Council of Ministers',
  description: 'Directory of West Bengal cabinet ministers, 2026 term. Search by name, ministry, rank, or party.',
};

interface PageProps {
  searchParams?: { q?: string; rank?: string; party?: string };
}

const VALID_RANKS = new Set<MinistryRank>(['CM', 'Cabinet', 'MoS-Independent', 'MoS']);

function applyFilters(members: CabinetMember[], q?: string, rank?: string, partyId?: string): CabinetMember[] {
  const term = q?.trim().toLowerCase() ?? '';
  return members.filter((m) => {
    if (term) {
      const hay = [
        m.name.toLowerCase(),
        ...m.portfolios.map((p) => p.ministry.toLowerCase()),
      ].join(' ');
      if (!hay.includes(term)) return false;
    }
    if (rank && VALID_RANKS.has(rank as MinistryRank)) {
      const hasRank = m.portfolios.some((p) => !p.to && p.rank === rank);
      if (!hasRank) return false;
    }
    if (partyId && partyId !== 'all') {
      if (m.partyId !== partyId) return false;
    }
    return true;
  });
}

export default function CabinetPage({ searchParams }: PageProps) {
  const cm = getChiefMinister();

  // Sort: CM first, then Cabinet → MoS-Indep → MoS, then alphabetical within rank.
  const RANK_ORDER: Record<MinistryRank, number> = { 'CM': 0, 'Cabinet': 1, 'MoS-Independent': 2, 'MoS': 3 };
  const sorted = [...wbCabinet2026].sort((a, b) => {
    const ra = RANK_ORDER[a.portfolios.find((p) => !p.to)?.rank ?? 'MoS'];
    const rb = RANK_ORDER[b.portfolios.find((p) => !p.to)?.rank ?? 'MoS'];
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });

  const filtered = applyFilters(sorted, searchParams?.q, searchParams?.rank, searchParams?.party);
  // Drop the CM from the grid since the hero card already surfaces them.
  const grid = filtered.filter((m) => m.id !== cm?.id);

  // Only parties present in the cabinet appear in the filter dropdown.
  const presentPartyIds = new Set(wbCabinet2026.map((m) => m.partyId));
  const filterParties = parties.filter((p) => presentPartyIds.has(p.id));

  return (
    <main className="min-h-screen pb-20 md:pb-12">
      {/* Page hero */}
      <section className="border-b border-white/10 bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 px-4 py-10 text-white">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-blue-200">
            <Building2 className="h-4 w-4" />
            Council of Ministers · 2026 term
          </div>
          <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">West Bengal Cabinet</h1>
          <p className="mt-2 max-w-2xl text-base text-blue-100/80">
            {wbCabinet2026.length} ministers running the state. Search portfolios, sort by rank, or jump to a minister&apos;s
            constituency to see how they&apos;re performing.
          </p>
        </div>
      </section>

      {/* CM hero card */}
      {cm && (!searchParams?.q && (!searchParams?.rank || searchParams.rank === 'all' || searchParams.rank === 'CM') && (!searchParams?.party || searchParams.party === 'all' || searchParams.party === cm.partyId)) && (
        <section className="border-b border-white/10 bg-amber-400/5 px-4 py-6">
          <div className="mx-auto max-w-6xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-amber-300">Chief Minister</p>
            <MinisterCard member={cm} hero />
          </div>
        </section>
      )}

      {/* Filters + grid */}
      <section className="mx-auto max-w-6xl px-4 py-8">
        <CabinetFilters parties={filterParties} />

        <div className="mt-6">
          {grid.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <p className="mb-4 text-sm text-gray-400">
                Showing {grid.length} {grid.length === 1 ? 'minister' : 'ministers'}
                {searchParams?.q || searchParams?.rank || searchParams?.party ? ' (filtered)' : ''}
              </p>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {grid.map((m) => (
                  <li key={m.id} className="flex">
                    <MinisterCard member={m} className="flex-1" />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>

      {/* Source note */}
      <section className="mx-auto max-w-6xl px-4 pb-12 text-center text-xs text-gray-500">
        <p>
          Cabinet composition as of swearing-in. Sources are linked on each minister card.
          Spotted an error or reshuffle?{' '}
          <Link href="/methodology" className="text-blue-400 hover:underline">
            Tell us
          </Link>.
        </p>
      </section>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
      <p className="text-sm text-gray-400">No ministers match these filters.</p>
      <Link href="/cabinet" className="mt-3 inline-block text-sm text-blue-400 hover:underline">
        Reset filters
      </Link>
    </div>
  );
}
