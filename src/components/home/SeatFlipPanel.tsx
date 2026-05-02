'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, MapIcon, TableIcon } from 'lucide-react';
import { parties } from '@/data/parties';
import { constituencies } from '@/data/constituencies';
import type { SeatFlip } from '@/lib/election-analysis';

const partyById = Object.fromEntries(parties.map(p => [p.id, p]));
const constById = Object.fromEntries(constituencies.map(c => [c.id, c]));

// Lucide doesn't ship `TableIcon` in all versions — shadow a local name so we
// don't explode on version drift. Keeping the import above for ICON intent.
const Table = TableIcon;
const Map   = MapIcon;

interface Props { flips: SeatFlip[]; }

export function SeatFlipPanel({ flips }: Props) {
  const [view, setView] = useState<'table' | 'map'>('table');
  const actualFlips = useMemo(() => flips.filter(f => !f.sameParty), [flips]);
  const topByMargin = useMemo(() => [...actualFlips].sort((a, b) => b.marginVotes - a.marginVotes).slice(0, 25), [actualFlips]);

  if (actualFlips.length === 0) {
    return (
      <section className="border-t border-white/10 px-4 py-10">
        <div className="mx-auto max-w-6xl rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-center">
          <p className="text-sm text-gray-400">No seat flips detected — results may still be aggregating.</p>
        </div>
      </section>
    );
  }

  return (
    <section id="flips" className="border-t border-white/10 px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">Seat flips · 2021 → 2026</h2>
            <p className="text-xs text-gray-500">{actualFlips.length} constituencies changed hands</p>
          </div>
          <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-0.5 text-xs">
            <button
              onClick={() => setView('table')}
              className={`flex items-center gap-1 rounded-md px-3 py-1.5 font-semibold transition ${view === 'table' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              <Table className="h-3.5 w-3.5" />
              Table
            </button>
            <button
              onClick={() => setView('map')}
              className={`flex items-center gap-1 rounded-md px-3 py-1.5 font-semibold transition ${view === 'map' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              <Map className="h-3.5 w-3.5" />
              Map
            </button>
          </div>
        </div>

        {view === 'table' ? (
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-[11px] uppercase tracking-wider text-gray-400">
                <tr>
                  <th className="px-4 py-2 text-left">Constituency</th>
                  <th className="px-4 py-2 text-left">From</th>
                  <th className="px-4 py-2 text-left">To</th>
                  <th className="px-4 py-2 text-right">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {topByMargin.map(f => {
                  const c = constById[f.acId];
                  const fromParty = partyById[f.from.partyId];
                  const toParty = partyById[f.to.partyId];
                  return (
                    <tr key={f.acId} className="hover:bg-white/5">
                      <td className="px-4 py-2">
                        <Link href={`/constituency/${f.acId}`} className="font-semibold text-white hover:underline">
                          {c?.name ?? f.acId}
                        </Link>
                        <span className="ml-2 text-[11px] text-gray-500">{c?.district ?? ''}</span>
                      </td>
                      <td className="px-4 py-2">
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: fromParty?.color ?? '#64748b' }}>
                          {fromParty?.abbreviation ?? f.from.partyId}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: toParty?.color ?? '#64748b' }}>
                          {toParty?.abbreviation ?? f.to.partyId}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-gray-300">
                        {f.marginVotes.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-gray-400">
            Flipped-seat map view — embed the live-leader map here with the flipped ACs highlighted.
            <Link href="/#map" className="ml-2 inline-flex items-center gap-1 text-blue-400 hover:underline">
              Open the map <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
