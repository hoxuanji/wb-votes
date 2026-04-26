'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, MapPin, User, Clock, TrendingUp, X } from 'lucide-react';
import { candidates } from '@/data/candidates';
import { constituencies } from '@/data/constituencies';
import { parties } from '@/data/parties';
import { useRecentSearch } from '@/hooks/useRecentSearch';

const partyMap = Object.fromEntries(parties.map(p => [p.id, p]));
const constMap = Object.fromEntries(constituencies.map(c => [c.id, c]));

// Candidate count per constituency
const candidateCountByConst: Record<string, number> = {};
candidates.forEach(c => {
  candidateCountByConst[c.constituencyId] = (candidateCountByConst[c.constituencyId] || 0) + 1;
});

// Popular constituencies: top 6 by candidate count
const popularConstituencies = [...constituencies]
  .sort((a, b) => (candidateCountByConst[b.id] ?? 0) - (candidateCountByConst[a.id] ?? 0))
  .slice(0, 6);

// --- Fuzzy/phonetic scoring -------------------------------------------------

function phoneticNormalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/sh/g, 's')
    .replace(/ph/g, 'f')
    .replace(/ch/g, 'c')
    .replace(/kh/g, 'k')
    .replace(/gh/g, 'g')
    .replace(/th/g, 't')
    .replace(/ee|ie|ey/g, 'i')
    .replace(/oo|ou/g, 'u')
    .replace(/ai|ay/g, 'a')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/(.)\1+/g, '$1'); // collapse doubled chars
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function scoreString(text: string, query: string): number {
  const t = text.toLowerCase();
  const q = query.toLowerCase();

  if (t === q) return 100;
  if (t.startsWith(q)) return 90;
  const words = t.split(/\s+/);
  if (words.some(w => w.startsWith(q))) return 82;
  if (t.includes(q)) return 75;
  if (words.some(w => w.includes(q))) return 65;

  // Phonetic match
  const pt = phoneticNormalize(t);
  const pq = phoneticNormalize(q);
  if (pt.includes(pq)) return 60;
  if (pt.split(' ').some(w => w.startsWith(pq))) return 55;

  // Levenshtein on individual words (handles typos like "jadapur" → "jadavpur")
  if (q.length >= 3) {
    const maxDist = Math.floor(q.length * 0.35);
    for (const word of words) {
      if (Math.abs(word.length - q.length) <= maxDist + 1) {
        if (levenshtein(q, word) <= maxDist) return 45;
      }
    }
    // Phonetic Levenshtein
    for (const word of pt.split(' ')) {
      if (Math.abs(word.length - pq.length) <= maxDist + 1) {
        if (levenshtein(pq, word) <= maxDist) return 40;
      }
    }
  }

  return 0;
}

function searchConstituencies(q: string) {
  return constituencies
    .map(c => {
      const score = Math.max(
        scoreString(c.name, q),
        scoreString(c.district, q) * 0.85,
        c.nameBn ? scoreString(c.nameBn, q) * 0.8 : 0,
      );
      return { c, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ c }) => ({
      type: 'constituency' as const,
      id: c.id,
      name: c.name,
      sub: `${c.district} · ${candidateCountByConst[c.id] ?? 0} candidates`,
      color: '#2563eb',
    }));
}

function searchCandidates(q: string) {
  return candidates
    .map(c => {
      const score = Math.max(
        scoreString(c.name, q),
        c.nameBn ? scoreString(c.nameBn, q) * 0.8 : 0,
        scoreString(constMap[c.constituencyId]?.name ?? '', q) * 0.5,
      );
      return { c, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ c }) => ({
      type: 'candidate' as const,
      id: c.id,
      name: c.name,
      sub: `${partyMap[c.partyId]?.abbreviation ?? c.partyId} · ${constMap[c.constituencyId]?.name ?? ''}`,
      color: partyMap[c.partyId]?.color ?? '#64748b',
    }));
}

// ---------------------------------------------------------------------------

export function HeroSearchBar() {
  const router = useRouter();
  const { recent, addRecent } = useRecentSearch();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ⌘K / Ctrl+K focuses the search bar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const results = useMemo(() => {
    const q = query.trim();
    if (q.length < 1) return [];
    return [...searchConstituencies(q), ...searchCandidates(q)];
  }, [query]);

  // Show popular when idle and dropdown is open but no query
  const showIdle = open && query.trim().length === 0;
  const showResults = open && results.length > 0;
  const showEmpty = open && query.trim().length >= 2 && results.length === 0;

  useEffect(() => {
    setSelectedIdx(0);
  }, [results]);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  function handleSelect(item: { type: 'candidate' | 'constituency'; id: string; name: string; sub?: string }) {
    if (item.type === 'constituency') {
      const constituency = constMap[item.id];
      if (constituency) {
        addRecent({ id: constituency.id, name: constituency.name, district: constituency.district });
      }
      router.push(`/constituency/${item.id}`);
    } else {
      router.push(`/candidate/${item.id}`);
    }
    setQuery('');
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && results[selectedIdx]) handleSelect(results[selectedIdx]);
    if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
  }

  const dropdownVisible = showIdle || showResults || showEmpty;

  return (
    <div ref={containerRef} className="relative mx-auto w-full max-w-3xl" style={{ zIndex: 60 }}>
      <div className="flex items-center gap-3 rounded-2xl border border-white/30 bg-white/15 px-5 py-4 backdrop-blur-sm outline-none focus-within:outline-none focus-within:ring-0">
        <Search className="h-5 w-5 shrink-0 text-white/70" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(true)}
          placeholder="Search constituencies, candidates, or districts…"
          className="flex-1 bg-transparent text-sm text-white outline-none focus:outline-none focus:ring-0 border-0 focus:border-0 placeholder:text-white/50"
          autoComplete="off"
          aria-label="Search constituencies or candidates"
        />
        {query ? (
          <button
            onClick={() => { setQuery(''); inputRef.current?.focus(); }}
            className="text-white/60 hover:text-white transition-colors"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <kbd className="hidden sm:inline-flex items-center gap-1 rounded border border-white/20 px-1.5 py-0.5 text-[11px] font-medium text-white/35 select-none">
            ⌘K
          </kbd>
        )}
      </div>

      {dropdownVisible && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-white/15 bg-slate-900 shadow-2xl">

          {/* Idle state: recently searched + popular */}
          {showIdle && (
            <div className="p-3 space-y-3">
              {recent.length > 0 && (
                <div>
                  <p className="mb-2 flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    <Clock className="h-3 w-3" /> Recently searched
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {recent.map(r => (
                      <button
                        key={r.id}
                        onMouseDown={() => handleSelect({ type: 'constituency', id: r.id, name: r.name })}
                        className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-gray-300 hover:border-blue-500/40 hover:bg-blue-500/10 hover:text-blue-300 transition-colors"
                      >
                        <MapPin className="h-3 w-3 text-gray-500" />
                        {r.name}
                        <span className="text-gray-500">{r.district}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="mb-2 flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  <TrendingUp className="h-3 w-3" /> Most contested constituencies
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {popularConstituencies.map(c => (
                    <button
                      key={c.id}
                      onMouseDown={() => handleSelect({ type: 'constituency', id: c.id, name: c.name })}
                      className="inline-flex items-center gap-1 rounded-full border border-blue-500/25 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-300 hover:bg-blue-500/20 transition-colors"
                    >
                      {c.name}
                      <span className="text-blue-500">·</span>
                      <span className="text-blue-400 text-[10px]">{candidateCountByConst[c.id]}c</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Active search results */}
          {showResults && (
            <ul className="max-h-72 overflow-y-auto py-1">
              {results.map((r, i) => (
                <li key={`${r.type}-${r.id}`}>
                  <button
                    onMouseDown={() => handleSelect(r)}
                    onMouseEnter={() => setSelectedIdx(i)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      i === selectedIdx ? 'bg-blue-500/15' : 'hover:bg-white/5'
                    }`}
                  >
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white"
                      style={{ backgroundColor: r.color }}
                    >
                      {r.type === 'constituency'
                        ? <MapPin className="h-4 w-4" />
                        : <User className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-100">{r.name}</p>
                      <p className="text-xs text-gray-400">{r.sub}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      r.type === 'constituency' ? 'bg-blue-500/15 text-blue-300' : 'bg-white/10 text-gray-400'
                    }`}>
                      {r.type === 'constituency' ? 'Area' : 'Candidate'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Empty state */}
          {showEmpty && (
            <div className="px-4 py-8 text-center">
              <Search className="mx-auto mb-2 h-8 w-8 text-gray-600" />
              <p className="text-sm font-medium text-gray-400">No results for &ldquo;{query}&rdquo;</p>
              <p className="mt-1 text-xs text-gray-500">Try searching your area, candidate name, or district</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
