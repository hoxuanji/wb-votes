'use client';

import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { parties } from '@/data/parties';
import type { PartyScorecard } from '@/lib/election-analysis';

const partyById = Object.fromEntries(parties.map(p => [p.id, p]));

interface Props { scorecards: PartyScorecard[]; }

export function PartyPerformanceScorecard({ scorecards }: Props) {
  if (scorecards.length === 0) {
    return (
      <section className="border-t border-white/10 px-4 py-10">
        <div className="mx-auto max-w-6xl rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-center">
          <p className="text-sm text-gray-400">Party scorecards unavailable — post-election data hasn&apos;t been archived yet.</p>
        </div>
      </section>
    );
  }

  const top = scorecards.slice(0, 12);

  return (
    <section id="scorecard" className="border-t border-white/10 px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <h2 className="mb-4 text-lg font-bold text-white">Party performance</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {top.map(sc => {
            const p = partyById[sc.partyId];
            const color = p?.color ?? '#64748b';
            return (
              <div
                key={sc.partyId}
                className="rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10"
                style={{ borderLeft: `4px solid ${color}` }}
              >
                <div className="mb-2 flex items-baseline justify-between">
                  <div>
                    <p className="text-sm font-bold text-white">{p?.abbreviation ?? sc.partyId}</p>
                    <p className="truncate text-[11px] text-gray-500">{p?.name ?? sc.partyId}</p>
                  </div>
                  <p className="text-3xl font-extrabold text-white">{sc.seats2026}</p>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400">
                  <span className="inline-flex items-center gap-1">
                    {sc.delta > 0 ? (
                      <><ArrowUp className="h-3 w-3 text-emerald-400" /><span className="font-bold text-emerald-400">+{sc.delta}</span></>
                    ) : sc.delta < 0 ? (
                      <><ArrowDown className="h-3 w-3 text-red-400" /><span className="font-bold text-red-400">{sc.delta}</span></>
                    ) : (
                      <><Minus className="h-3 w-3 text-gray-400" /><span className="font-bold text-gray-400">±0</span></>
                    )}
                    vs 2021 ({sc.seats2021})
                  </span>
                  <span>Contested {sc.contested2026}</span>
                  <span>Strike rate {(sc.strikeRate * 100).toFixed(0)}%</span>
                  {sc.avgVoteShare > 0 && <span>Avg share {sc.avgVoteShare.toFixed(1)}%</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
