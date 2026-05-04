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
}

function compute(summary: StateLiveSummary): { partyRows: PartyRow[]; flips: FlipRow[]; retainedCount: number; flipCount: number } {
  const leaderByAc = summary.leaderByAc ?? {};

  const retained: Record<string, number> = {};
  const gained: Record<string, number> = {};
  const lost: Record<string, number> = {};
  const flips: FlipRow[] = [];

  for (const [acId, leader] of Object.entries(leaderByAc)) {
    if (!leader) continue;
    const from = winner2021ByAc[acId];
    if (!from) continue;
    if (from === leader) {
      retained[leader] = (retained[leader] ?? 0) + 1;
    } else {
      gained[leader] = (gained[leader] ?? 0) + 1;
      lost[from] = (lost[from] ?? 0) + 1;
      flips.push({
        acId,
        acName: constById[acId]?.name ?? acId,
        fromParty: from,
        toParty: leader,
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

  return {
    partyRows: partyRows.filter((r) => r.current > 0 || r.seats2021 > 0),
    flips,
    retainedCount: Object.values(retained).reduce((s, n) => s + n, 0),
    flipCount: flips.length,
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
  const { partyRows, flips, retainedCount, flipCount } = compute(summary);
  if (partyRows.length === 0) return null;

  const topFlips = flips.slice(0, 8);

  return (
    <section className="border-b border-white/10 px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400">2021 vs 2026</h2>
          <p className="text-[11px] text-gray-500">
            {retainedCount} retained · {flipCount} flipped
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-[11px] uppercase tracking-wider text-gray-400">
              <tr>
                <th className="px-3 py-2 text-left">Party</th>
                <th className="px-3 py-2 text-right">2026</th>
                <th className="px-3 py-2 text-right">2021</th>
                <th className="px-3 py-2 text-right">Δ</th>
                <th className="px-3 py-2 text-right">Retained</th>
                <th className="px-3 py-2 text-right">Gained</th>
                <th className="px-3 py-2 text-right">Lost</th>
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
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">Notable flips</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {topFlips.map((f) => {
                const fromP = partyById[f.fromParty];
                const toP = partyById[f.toParty];
                return (
                  <Link
                    key={f.acId}
                    href={`/constituency/${f.acId}`}
                    className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/5 px-3 py-2 text-xs transition hover:bg-white/10"
                  >
                    <span className="flex-1 truncate font-semibold text-white">{f.acName}</span>
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: fromP?.color ?? '#64748b' }}>
                      {fromP?.abbreviation ?? f.fromParty}
                    </span>
                    <span className="text-gray-500">→</span>
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: toP?.color ?? '#64748b' }}>
                      {toP?.abbreviation ?? f.toParty}
                    </span>
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
