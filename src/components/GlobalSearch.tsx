'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, MapPin, User } from 'lucide-react';
import { candidates } from '@/data/candidates';
import { constituencies } from '@/data/constituencies';
import { parties } from '@/data/parties';

type CandidateResult = {
  type: 'candidate';
  id: string;
  name: string;
  partyAbbr: string;
  partyColor: string;
  constituencyName: string;
  constituencyId: string;
};

type ConstituencyResult = {
  type: 'constituency';
  id: string;
  name: string;
  district: string;
  candidateCount: number;
};

type SearchResult = CandidateResult | ConstituencyResult;

const partyMap = Object.fromEntries(parties.map(p => [p.id, p]));
const constMap = Object.fromEntries(constituencies.map(c => [c.id, c]));
const candidateCountByConst: Record<string, number> = {};
candidates.forEach(c => {
  candidateCountByConst[c.constituencyId] = (candidateCountByConst[c.constituencyId] || 0) + 1;
});

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    const customHandler = () => setOpen(true);
    window.addEventListener('keydown', handler);
    window.addEventListener('open-global-search', customHandler);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('open-global-search', customHandler);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setSelectedIdx(0);
    }
  }, [open]);

  const results = useMemo((): SearchResult[] => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];

    const constResults: ConstituencyResult[] = constituencies
      .filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.district.toLowerCase().includes(q) ||
        c.nameBn.includes(query.trim())
      )
      .slice(0, 4)
      .map(c => ({
        type: 'constituency',
        id: c.id,
        name: c.name,
        district: c.district,
        candidateCount: candidateCountByConst[c.id] ?? 0,
      }));

    const candResults: CandidateResult[] = candidates
      .filter(c => c.name.toLowerCase().includes(q))
      .slice(0, 6)
      .map(c => ({
        type: 'candidate',
        id: c.id,
        name: c.name,
        partyAbbr: partyMap[c.partyId]?.abbreviation ?? c.partyId,
        partyColor: partyMap[c.partyId]?.color ?? '#64748b',
        constituencyName: constMap[c.constituencyId]?.name ?? c.constituencyId,
        constituencyId: c.constituencyId,
      }));

    return [...constResults, ...candResults];
  }, [query]);

  const handleSelect = (result: SearchResult) => {
    setOpen(false);
    if (result.type === 'candidate') router.push(`/candidate/${result.id}`);
    else router.push(`/constituency/${result.id}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && results[selectedIdx]) handleSelect(results[selectedIdx]);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-500 transition-colors hover:bg-white hover:border-gray-300 hover:shadow-sm"
        aria-label="Search candidates or constituencies"
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden sm:inline">Search…</span>
        <kbd className="hidden sm:inline rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium">⌘K</kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Input row */}
            <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
              <Search className="h-5 w-5 shrink-0 text-gray-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => { setQuery(e.target.value); setSelectedIdx(0); }}
                onKeyDown={handleKeyDown}
                placeholder="Search candidates or constituencies…"
                className="flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
              />
              <button onClick={() => setOpen(false)} className="rounded-lg p-1 transition-colors hover:bg-gray-100">
                <X className="h-4 w-4 text-gray-400" />
              </button>
            </div>

            {/* Results */}
            {results.length > 0 ? (
              <ul className="max-h-[380px] overflow-y-auto py-1">
                {results.map((result, i) => (
                  <li key={`${result.type}-${result.id}`}>
                    <button
                      onClick={() => handleSelect(result)}
                      onMouseEnter={() => setSelectedIdx(i)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        i === selectedIdx ? 'bg-blue-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      {result.type === 'constituency' ? (
                        <>
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100">
                            <MapPin className="h-4 w-4 text-blue-600" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-gray-900">{result.name}</p>
                            <p className="text-xs text-gray-500">
                              {result.district}
                              {result.candidateCount > 0 && ` · ${result.candidateCount} candidates`}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                            Constituency
                          </span>
                        </>
                      ) : (
                        <>
                          <div
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                            style={{ backgroundColor: result.partyColor }}
                          >
                            <User className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-gray-900">{result.name}</p>
                            <p className="text-xs text-gray-500">
                              {result.partyAbbr} · {result.constituencyName}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                            Candidate
                          </span>
                        </>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            ) : query.length >= 2 ? (
              <p className="px-4 py-10 text-center text-sm text-gray-500">
                No results for &ldquo;{query}&rdquo;
              </p>
            ) : (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-gray-400">Type to search candidates or constituencies</p>
                <p className="mt-1 text-xs text-gray-300">Search by name, party, or district</p>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center gap-4 border-t border-gray-100 px-4 py-2 text-[11px] text-gray-400">
              <span className="flex items-center gap-1">
                <kbd className="rounded bg-gray-100 px-1.5 py-0.5 font-mono">↑↓</kbd> navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded bg-gray-100 px-1.5 py-0.5 font-mono">↵</kbd> open
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded bg-gray-100 px-1.5 py-0.5 font-mono">esc</kbd> close
              </span>
              <span className="ml-auto">{results.length > 0 ? `${results.length} results` : ''}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
