'use client';

import Link from 'next/link';
import type { StateLiveSummary } from '@/lib/live-store';
import { parties } from '@/data/parties';
import { historicalResults } from '@/data/historical-results';
import { constituencies } from '@/data/constituencies';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';

const partyById = Object.fromEntries(parties.map((p) => [p.id, p]));
const constById = Object.fromEntries(constituencies.map((c) => [c.id, c]));

// Precompute 2021 winner party for every AC once per module load.
const winner2021ByAc: Record<string, string> = {};
const seats2021ByParty: Record<string, number> = {};
for (const r of historicalResults) {
  if (r.year !== 2021) continue;
  winner2021ByAc[r.constituencyId] = r.winner.partyId;
  seats2021ByParty[r.winner.partyId] = (seats2021ByParty[r.winner.partyId] ?? 0) + 1;
}

interface Props { summary: StateLiveSummary; }

interface PartyRow {
  partyId: string;
  current: number;
  seats2021: number;
  retained: number;
  gained: number;
  lost: number;
  delta: number;
}

interface FlipRow {
  acId: string;
  acName: string;
  fromParty: string;
  toParty: string;
  winnerName: string;
  marginVotes: number;
  declared: boolean;
}

function compute(summary: StateLiveSummary): {
  partyRows: PartyRow[];
  flips: FlipRow[];
  retainedCount: number;
  flipCount: number;
  declaredRetained: number;
  declaredFlipped: number;
  reporting: number;
} {
  const leaderByAc = summary.leaderByAc ?? {};
  const leaderNameByAc = summary.leaderNameByAc ?? {};
  const marginByAc = summary.marginByAc ?? {};
  const declaredSet = new Set((summary.declaredWinners ?? []).map((w) => w.acId));

  const retained: Record<string, number> = {};
  const gained: Record<string, number> = {};
  const lost: Record<string, number> = {};
  const flips: FlipRow[] = [];
  let declaredRetained = 0;
  let declaredFlipped = 0;
  let reporting = 0;

  for (const [acId, leader] of Object.entries(leaderByAc)) {
    if (!leader) continue;
    reporting++;
    const from = winner2021ByAc[acId];
    if (!from) continue;
    const isDeclared = declaredSet.has(acId);
    if (from === leader) {
      retained[leader] = (retained[leader] ?? 0) + 1;
      if (isDeclared) declaredRetained++;
    } else {
      gained[leader] = (gained[leader] ?? 0) + 1;
      lost[from] = (lost[from] ?? 0) + 1;
      if (isDeclared) declaredFlipped++;
      flips.push({
        acId,
        acName: constById[acId]?.name ?? acId,
        fromParty: from,
        toParty: leader,
        winnerName: leaderNameByAc[acId] ?? '',
        marginVotes: marginByAc[acId] ?? 0,
        declared: isDeclared,
      });
    }
  }

  // Union of parties touching 2021 or 2026
  const allParties = Array.from(new Set<string>([
    ...Object.keys(summary.leadingByParty),
    ...Object.keys(seats2021ByParty),
  ]));
  const partyRows: PartyRow[] = [];
  for (const partyId of allParties) {
    const current = summary.leadingByParty[partyId] ?? 0;
    const s21 = seats2021ByParty[partyId] ?? 0;
    partyRows.push({
      partyId,
      current,
      seats2021: s21,
      retained: retained[partyId] ?? 0,
      gained: gained[partyId] ?? 0,
      lost: lost[partyId] ?? 0,
      delta: current - s21,
    });
  }
  partyRows.sort((a, b) => b.current - a.current || b.seats2021 - a.seats2021);

  // Declared first, then biggest-margin flips so striking calls surface.
  flips.sort((a, b) => {
    if (a.declared !== b.declared) return a.declared ? -1 : 1;
    return b.marginVotes - a.marginVotes;
  });

  return {
    partyRows: partyRows.filter((r) => r.current > 0 || r.seats2021 > 0),
    flips,
    retainedCount: Object.values(retained).reduce((s, n) => s + n, 0),
    flipCount: flips.length,
    declaredRetained,
    declaredFlipped,
    reporting,
  };
}

function DeltaPill({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-bold text-gray-400">
        <Minus className="h-3 w-3" />0
      </span>
    );
  }
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
        <ArrowUp className="h-3 w-3" />{delta}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-bold text-red-300">
      <ArrowDown className="h-3 w-3" />{delta}
    </span>
  );
}

export function Comparison2021({ summary }: Props) {
  const { partyRows, flips, retainedCount, flipCount, declaredRetained, declaredFlipped, reporting } = compute(summary);
  if (partyRows.length === 0) return null;

  const topFlips = flips.slice(0, 8);

  return (
    <section className="border-b border-white/10 px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400">2021 vs 2026</h2>
            <p className="mt-0.5 text-[11px] text-gray-500">
              {reporting} of {summary.totalACs} ACs reporting · numbers update live until ECI declares
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-gray-300">
              <span className="font-bold text-white">{retainedCount}</span> holding{' '}
              <span className="text-gray-500">({declaredRetained} confirmed)</span>
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-gray-300">
              <span className="font-bold text-white">{flipCount}</span> flipping{' '}
              <span className="text-gray-500">({declaredFlipped} confirmed)</span>
            </span>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-[11px] uppercase tracking-wider text-gray-400">
              <tr>
                <th className="px-3 py-2 text-left">Party</th>
                <th className="px-3 py-2 text-right">2026 leading</th>
                <th className="px-3 py-2 text-right">2021</th>
                <th className="px-3 py-2 text-right">Δ</th>
                <th className="px-3 py-2 text-right">Holding</th>
                <th className="px-3 py-2 text-right">Gaining</th>
                <th className="px-3 py-2 text-right">Losing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {partyRows.map((r) => {
                const party = partyById[r.partyId];
                return (
                  <tr key={r.partyId} className="hover:bg-white/5">
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: party?.color ?? '#64748b' }} />
                        <span className="font-semibold text-white">{party?.abbreviation ?? r.partyId}</span>
                        <span className="text-[11px] text-gray-500 truncate max-w-[12rem]">{party?.name ?? r.partyId}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-white">{r.current}</td>
                    <td className="px-3 py-2 text-right font-mono text-gray-400">{r.seats2021}</td>
                    <td className="px-3 py-2 text-right"><DeltaPill delta={r.delta} /></td>
                    <td className="px-3 py-2 text-right font-mono text-gray-300">{r.retained}</td>
                    <td className="px-3 py-2 text-right font-mono text-emerald-300">{r.gained > 0 ? `+${r.gained}` : '—'}</td>
                    <td className="px-3 py-2 text-right font-mono text-red-300">{r.lost > 0 ? `−${r.lost}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {topFlips.length > 0 && (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Biggest flips so far
              </h3>
              <p className="text-[11px] text-gray-500">Sorted by margin · {flipCount} total flips</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {topFlips.map((f) => {
                const fromP = partyById[f.fromParty];
                const toP = partyById[f.toParty];
                return (
                  <Link
                    key={f.acId}
                    href={`/constituency/${f.acId}`}
                    className="flex flex-col gap-1 rounded-xl border border-white/5 bg-white/5 px-3 py-2.5 text-xs transition hover:bg-white/10"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex-1 truncate font-semibold text-white">{f.acName}</span>
                      {f.declared && (
                        <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
                          DECLARED
                        </span>
                      )}
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: fromP?.color ?? '#64748b' }}>
                        {fromP?.abbreviation ?? f.fromParty}
                      </span>
                      <span className="text-gray-500">→</span>
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: toP?.color ?? '#64748b' }}>
                        {toP?.abbreviation ?? f.toParty}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 pl-0.5 text-[11px]">
                      {f.winnerName && (
                        <span className="truncate text-gray-300">{f.winnerName}</span>
                      )}
                      {f.marginVotes > 0 && (
                        <span className="ml-auto shrink-0 font-mono text-gray-400">
                          margin <span className="font-semibold text-white">{f.marginVotes.toLocaleString()}</span>
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
