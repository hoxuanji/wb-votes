'use client';

import Link from 'next/link';
import type { StateLiveSummary } from '@/lib/live-store';
import { parties } from '@/data/parties';
import { constituencies } from '@/data/constituencies';
import { isReElectionAc } from '@/lib/re-election';

const partyById = Object.fromEntries(parties.map(p => [p.id, p]));
const constById = Object.fromEntries(constituencies.map(c => [c.id, c]));

interface Props { summary: StateLiveSummary; }

/**
 * Vertically scrollable list of every reporting AC. Declared results bubble to
 * the top with a gold chip; the rest are sorted by tightest margin so the
 * most-contested races are visible next.
 */
export function ACResultsTicker({ summary }: Props) {
  const leaderByAc = summary.leaderByAc ?? {};
  const tightest = summary.tightestMargins ?? [];
  const marginByAc = new Map(tightest.map(t => [t.acId, t]));
  const declaredSet = new Set((summary.declaredWinners ?? []).map(w => w.acId));

  const ids = Object.keys(leaderByAc).filter((id) => !!leaderByAc[id] && !isReElectionAc(id));
  ids.sort((a, b) => {
    const da = declaredSet.has(a);
    const db = declaredSet.has(b);
    if (da !== db) return da ? -1 : 1; // declared first
    return (marginByAc.get(a)?.marginVotes ?? Number.POSITIVE_INFINITY)
      - (marginByAc.get(b)?.marginVotes ?? Number.POSITIVE_INFINITY);
  });

  if (ids.length === 0) {
    return null;
  }

  const declaredCount = ids.filter((id) => declaredSet.has(id)).length;

  return (
    <section className="border-b border-white/10 px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400">All reporting seats ({ids.length})</h2>
          <p className="text-[11px] text-gray-500">
            <span className="text-amber-300">{declaredCount} declared</span> · {ids.length - declaredCount} leading · tightest margins first
          </p>
        </div>
        <div className="max-h-[420px] overflow-y-auto rounded-2xl border border-white/10 bg-white/5">
          <ul className="divide-y divide-white/5">
            {ids.map(acId => {
              const partyId = leaderByAc[acId];
              const c = constById[acId];
              const party = partyId ? partyById[partyId] : null;
              const m = marginByAc.get(acId);
              const isDeclared = declaredSet.has(acId);
              return (
                <li key={acId}>
                  <Link
                    href={`/constituency/${acId}`}
                    className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-white/5"
                    style={{ borderLeft: `3px solid ${party?.color ?? '#64748b'}` }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{c?.name ?? acId}</p>
                      <p className="text-[11px] text-gray-500">{c?.district ?? ''}</p>
                    </div>
                    {isDeclared && (
                      <span className="shrink-0 rounded-full border border-amber-400/30 bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">
                        Declared
                      </span>
                    )}
                    <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: party?.color ?? '#64748b' }}>
                      {party?.abbreviation ?? partyId ?? '—'}
                    </span>
                    {m && (
                      <span className="shrink-0 text-[11px] font-bold text-amber-300">
                        +{m.marginVotes.toLocaleString()}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}

