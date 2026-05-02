import { TrendingUp, Users, Info } from 'lucide-react';
import { getHistoricalResultsForAC } from '@/data/historical-results';
import { getPartyById } from '@/data/parties';
import type { ElectionYear } from '@/types';

interface HistoricalResultsPanelProps {
  constituencyId: string;
  className?: string;
}

const TRACKED_YEARS: ElectionYear[] = [2011, 2016, 2021];

function formatVotes(n: number): string {
  if (!n) return '—';
  if (n >= 100_000) return `${(n / 100_000).toFixed(2)} L`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function HistoricalResultsPanel({ constituencyId, className = '' }: HistoricalResultsPanelProps) {
  const rows = getHistoricalResultsForAC(constituencyId);
  const byYear = new Map(rows.map((r) => [r.year, r]));

  const hasAny = rows.length > 0;

  return (
    <div className={`rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <TrendingUp className="h-4 w-4 text-blue-400" />
          Past Election Results
        </h3>
        <span className="text-xs text-gray-500">Assembly elections</span>
      </div>

      {!hasAny && (
        <div className="rounded-lg border border-dashed border-white/10 py-8 text-center">
          <Info className="mx-auto mb-2 h-6 w-6 text-gray-500" />
          <p className="text-sm text-gray-400">Historical data not yet available for this seat.</p>
        </div>
      )}

      {hasAny && (
        <div className="space-y-3">
          {TRACKED_YEARS.map((year) => {
            const r = byYear.get(year);
            if (!r) {
              return (
                <div
                  key={year}
                  className="flex items-center justify-between rounded-lg border border-dashed border-white/10 px-3 py-2.5"
                >
                  <span className="text-sm font-medium text-gray-500">{year}</span>
                  <span className="text-xs text-gray-500">Backfill pending</span>
                </div>
              );
            }

            const party = getPartyById(r.winner.partyId);
            const color = party?.color ?? '#546E7A';

            return (
              <div
                key={year}
                className="flex flex-col gap-2 rounded-lg border border-white/10 bg-black/20 p-3 sm:flex-row sm:items-center sm:justify-between"
                style={{ borderLeft: `4px solid ${color}` }}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-300">{year}</span>
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
                      style={{ backgroundColor: color }}
                    >
                      {r.winner.partyAbbr}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm font-semibold text-white">{r.winner.name}</p>
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs sm:text-right">
                  <div>
                    <p className="text-gray-500">Margin</p>
                    <p className="font-semibold text-white">
                      {formatVotes(r.marginVotes)}
                      {r.marginPct ? (
                        <span className="ml-1 text-gray-400">({r.marginPct.toFixed(1)}%)</span>
                      ) : null}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500">Turnout</p>
                    <p className="font-semibold text-white">
                      {r.turnoutPct ? `${r.turnoutPct.toFixed(1)}%` : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500">Votes cast</p>
                    <p className="font-semibold text-white">{formatVotes(r.totalVotes)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-4 flex items-start gap-1.5 text-[11px] text-gray-500">
        <Users className="h-3 w-3 shrink-0 mt-0.5" />
        <span>Source: Election Commission of India. 2011 / 2016 data pending backfill.</span>
      </p>
    </div>
  );
}
