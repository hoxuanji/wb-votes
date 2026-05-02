'use client';

import type { StateLiveSummary } from '@/lib/live-store';
import { parties } from '@/data/parties';
import { historicalResults } from '@/data/historical-results';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';

const partyById = Object.fromEntries(parties.map(p => [p.id, p]));

function seatsBy2021(partyId: string): number {
  return historicalResults.filter(r => r.year === 2021 && r.winner.partyId === partyId).length;
}

interface Props { summary: StateLiveSummary; }

export function PartyScoreboard({ summary }: Props) {
  const rows = Object.entries(summary.leadingByParty).sort((a, b) => b[1] - a[1]);
  if (rows.length === 0) return null;

  return (
    <section className="border-b border-white/10 px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-gray-400">Party performance</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map(([partyId, count]) => {
            const party = partyById[partyId];
            const color = party?.color ?? '#64748b';
            const baseline = seatsBy2021(partyId);
            const delta = count - baseline;
            return (
              <div
                key={partyId}
                className="rounded-2xl border border-white/10 bg-white/5 p-3 transition hover:bg-white/10"
                style={{ borderLeft: `4px solid ${color}` }}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-bold text-white">{party?.abbreviation ?? partyId}</span>
                  <span className="text-2xl font-extrabold text-white">{count}</span>
                </div>
                <p className="mt-0.5 text-[10px] text-gray-500 truncate">{party?.name ?? partyId}</p>
                <div className="mt-1.5 flex items-center gap-1 text-[10px]">
                  {delta > 0 ? (
                    <>
                      <ArrowUp className="h-3 w-3 text-emerald-400" />
                      <span className="font-bold text-emerald-400">+{delta}</span>
                    </>
                  ) : delta < 0 ? (
                    <>
                      <ArrowDown className="h-3 w-3 text-red-400" />
                      <span className="font-bold text-red-400">{delta}</span>
                    </>
                  ) : (
                    <>
                      <Minus className="h-3 w-3 text-gray-400" />
                      <span className="font-bold text-gray-400">±0</span>
                    </>
                  )}
                  <span className="text-gray-500">vs 2021 ({baseline})</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
