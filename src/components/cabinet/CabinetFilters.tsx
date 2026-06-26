'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import type { MinistryRank } from '@/types';

const RANK_OPTIONS: Array<{ value: MinistryRank | 'all'; label: string }> = [
  { value: 'all',             label: 'All ranks' },
  { value: 'Cabinet',         label: 'Cabinet' },
  { value: 'MoS-Independent', label: 'MoS (Indep.)' },
  { value: 'MoS',             label: 'MoS' },
];

interface CabinetFiltersProps {
  parties: Array<{ id: string; abbreviation: string; color: string }>;
}

/**
 * Client filters that drive `/cabinet` server-side filtering via search params.
 * Keeps the page bookmarkable and SEO-friendly.
 */
export function CabinetFilters({ parties }: CabinetFiltersProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const [query, setQuery] = useState(params.get('q') ?? '');

  // Debounce text input → URL
  useEffect(() => {
    const id = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (query) next.set('q', query);
      else next.delete('q');
      startTransition(() => {
        router.replace(`/cabinet?${next.toString()}`, { scroll: false });
      });
    }, 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value && value !== 'all') next.set(key, value);
    else next.delete(key);
    startTransition(() => {
      router.replace(`/cabinet?${next.toString()}`, { scroll: false });
    });
  }

  const rank  = params.get('rank') ?? 'all';
  const party = params.get('party') ?? 'all';

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      {/* Search */}
      <label className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or ministry…"
          className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 pl-9 pr-9 text-sm text-white placeholder:text-gray-500 outline-none focus:outline-none focus:ring-0 transition-colors hover:bg-white/[0.07] min-h-[44px]"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 hover:bg-white/10 hover:text-gray-200"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </label>

      {/* Rank */}
      <select
        value={rank}
        onChange={(e) => setParam('rank', e.target.value)}
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:outline-none focus:ring-0 hover:bg-white/[0.07] min-h-[44px]"
        aria-label="Filter by rank"
      >
        {RANK_OPTIONS.map((o) => (
          <option key={o.value} value={o.value} className="bg-slate-900">{o.label}</option>
        ))}
      </select>

      {/* Party */}
      <select
        value={party}
        onChange={(e) => setParam('party', e.target.value)}
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:outline-none focus:ring-0 hover:bg-white/[0.07] min-h-[44px]"
        aria-label="Filter by party"
      >
        <option value="all" className="bg-slate-900">All parties</option>
        {parties.map((p) => (
          <option key={p.id} value={p.id} className="bg-slate-900">{p.abbreviation}</option>
        ))}
      </select>
    </div>
  );
}
