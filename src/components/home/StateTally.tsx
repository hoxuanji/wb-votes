'use client';

import type { StateLiveSummary } from '@/lib/live-store';
import { parties } from '@/data/parties';

const partyById = Object.fromEntries(parties.map(p => [p.id, p]));

const MAJORITY = 148;

interface StateTallyProps {
  summary: StateLiveSummary;
}

/**
 * Horizontally stacked seat bar. Each party gets a segment proportional to its
 * current seat count (leading + won). A pulsing line marks the majority mark.
 */
export function StateTally({ summary }: StateTallyProps) {
  const entries = Object.entries(summary.leadingByParty).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0) || summary.totalACs;
  const leading = entries[0];

  return (
    <section className="border-b border-white/10 px-4 py-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">State tally</p>
            {leading && (
              <h2 className="text-2xl font-extrabold text-white sm:text-3xl">
                <span style={{ color: partyById[leading[0]]?.color ?? '#fff' }}>{partyById[leading[0]]?.abbreviation ?? leading[0]}</span>
                {' '}leads with <span>{leading[1]}</span> seats
              </h2>
            )}
            <p className="mt-0.5 text-xs text-gray-500">
              {summary.declared} of {summary.totalACs} declared · majority = {MAJORITY}
            </p>
          </div>
        </div>

        <div className="relative">
          <div className="flex h-10 w-full overflow-hidden rounded-full bg-white/5">
            {entries.map(([partyId, count]) => {
              const pct = (count / summary.totalACs) * 100;
              const party = partyById[partyId];
              return (
                <div
                  key={partyId}
                  className="flex items-center justify-center text-[10px] font-bold text-white"
                  style={{ width: `${pct}%`, backgroundColor: party?.color ?? '#64748b' }}
                  title={`${party?.abbreviation ?? partyId}: ${count}`}
                >
                  {pct > 6 ? `${party?.abbreviation ?? partyId} ${count}` : ''}
                </div>
              );
            })}
            {/* Undeclared remainder */}
            {total < summary.totalACs && (
              <div
                className="bg-white/5"
                style={{ width: `${((summary.totalACs - total) / summary.totalACs) * 100}%` }}
                title={`Undeclared: ${summary.totalACs - total}`}
              />
            )}
          </div>
          {/* Majority line at 148/294 ≈ 50.3% */}
          <div
            className="pointer-events-none absolute top-0 h-10 w-[2px] bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.7)]"
            style={{ left: `${(MAJORITY / summary.totalACs) * 100}%` }}
            aria-hidden
          />
          <span className="pointer-events-none absolute -top-5 -translate-x-1/2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-300" style={{ left: `${(MAJORITY / summary.totalACs) * 100}%` }}>
            {MAJORITY}
          </span>
        </div>
      </div>
    </section>
  );
}
