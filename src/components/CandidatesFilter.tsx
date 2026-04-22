'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Search, Filter, ChevronLeft, ChevronRight, AlertTriangle, TrendingUp } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { Candidate, Party } from '@/types';

interface Props {
  candidates: Candidate[];
  parties: Party[];
  districts: string[];
  partyMap: Record<string, Party>;
  constNames: Record<string, string>;
}

const PAGE_SIZE = 30;

const SORT_OPTIONS = [
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'assets_desc', label: 'Highest Assets' },
  { value: 'cases_desc', label: 'Most Criminal Cases' },
  { value: 'age_asc', label: 'Youngest First' },
  { value: 'age_desc', label: 'Oldest First' },
];

export function CandidatesFilter({ candidates, parties, districts, partyMap, constNames }: Props) {
  const [query, setQuery] = useState('');
  const [partyFilter, setPartyFilter] = useState('');
  const [districtFilter, setDistrictFilter] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [casesOnly, setCasesOnly] = useState(false);
  const [page, setPage] = useState(1);

  const constMap2 = useMemo(() => {
    const m: Record<string, string> = {};
    Object.entries(constNames).forEach(([k, v]) => { m[k] = v; });
    return m;
  }, [constNames]);

  // Build district→constituency mapping
  const constDistricts = useMemo(() => {
    const m: Record<string, string> = {};
    candidates.forEach(c => {
      // constNames has constituencyId → "Name|District"
      const raw = constNames[c.constituencyId] ?? '';
      const [, dist] = raw.split('|');
      if (dist) m[c.constituencyId] = dist;
    });
    return m;
  }, [candidates, constNames]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let result = candidates;

    if (q.length >= 2) {
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (constNames[c.constituencyId]?.toLowerCase() ?? '').includes(q)
      );
    }
    if (partyFilter) result = result.filter(c => c.partyId === partyFilter);
    if (districtFilter) {
      result = result.filter(c => constDistricts[c.constituencyId] === districtFilter);
    }
    if (casesOnly) result = result.filter(c => c.criminalCases > 0);

    switch (sortBy) {
      case 'assets_desc': result = [...result].sort((a, b) => b.totalAssets - a.totalAssets); break;
      case 'cases_desc': result = [...result].sort((a, b) => b.criminalCases - a.criminalCases); break;
      case 'age_asc': result = [...result].sort((a, b) => a.age - b.age); break;
      case 'age_desc': result = [...result].sort((a, b) => b.age - a.age); break;
      default: result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    }

    return result;
  }, [query, partyFilter, districtFilter, casesOnly, sortBy, candidates, constNames, constDistricts]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function resetPage() { setPage(1); }

  const majorParties = parties.filter(p => ['AITC', 'BJP', 'CPI(M)', 'INC', 'SUCI', 'IND'].includes(p.id));

  return (
    <div>
      {/* Filter bar */}
      <div className="sticky top-[57px] z-30 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur-sm shadow-sm">
        <div className="mx-auto max-w-5xl flex flex-wrap gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={e => { setQuery(e.target.value); setPage(1); }}
              placeholder="Search by name or constituency…"
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none"
            />
          </div>

          {/* Party filter */}
          <select
            value={partyFilter}
            onChange={e => { setPartyFilter(e.target.value); resetPage(); }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-400 focus:outline-none"
          >
            <option value="">All Parties</option>
            {majorParties.map(p => (
              <option key={p.id} value={p.id}>{p.abbreviation}</option>
            ))}
          </select>

          {/* District filter */}
          <select
            value={districtFilter}
            onChange={e => { setDistrictFilter(e.target.value); resetPage(); }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-400 focus:outline-none"
          >
            <option value="">All Districts</option>
            {districts.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={e => { setSortBy(e.target.value); setPage(1); }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-400 focus:outline-none"
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {/* Criminal cases toggle */}
          <button
            onClick={() => { setCasesOnly(!casesOnly); resetPage(); }}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              casesOnly
                ? 'border-red-300 bg-red-50 text-red-700'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            With Cases
          </button>
        </div>
      </div>

      {/* Results count */}
      <div className="mx-auto max-w-5xl px-4 py-3">
        <p className="text-sm text-gray-500">
          Showing <span className="font-semibold text-gray-900">{filtered.length.toLocaleString()}</span> candidates
          {partyFilter || districtFilter || casesOnly || query ? ' (filtered)' : ''}
        </p>
      </div>

      {/* Grid */}
      <div className="mx-auto max-w-5xl px-4 pb-6">
        {paginated.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center text-gray-400">
            No candidates match your filters
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {paginated.map(c => {
              const party = partyMap[c.partyId];
              const constRaw = constNames[c.constituencyId] ?? '';
              const [constName] = constRaw.split('|');

              return (
                <Link
                  key={c.id}
                  href={`/candidate/${c.id}`}
                  className="group flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-3 transition-all hover:border-blue-200 hover:shadow-sm"
                >
                  {/* Photo */}
                  <div
                    className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border-2"
                    style={{ borderColor: (party?.color ?? '#64748b') + '66' }}
                  >
                    {c.photoUrl ? (
                      <Image src={c.photoUrl} alt={c.name} fill className="object-cover" sizes="44px" />
                    ) : (
                      <div
                        className="flex h-full w-full items-center justify-center text-sm font-bold text-white"
                        style={{ backgroundColor: party?.color ?? '#64748b' }}
                      >
                        {c.name.charAt(0)}
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900 group-hover:text-blue-700">
                      {c.name}
                    </p>
                    <p className="truncate text-xs text-gray-400">{constName}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white"
                        style={{ backgroundColor: party?.color ?? '#64748b' }}
                      >
                        {party?.abbreviation ?? c.partyId}
                      </span>
                      {c.criminalCases > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] text-red-600">
                          <AlertTriangle className="h-2.5 w-2.5" /> {c.criminalCases}
                        </span>
                      )}
                      {c.totalAssets > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                          <TrendingUp className="h-2.5 w-2.5" /> {formatCurrency(c.totalAssets)}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm text-gray-600">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
