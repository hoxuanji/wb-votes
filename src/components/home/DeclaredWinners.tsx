'use client';

import Link from 'next/link';
import { Trophy, Sparkles } from 'lucide-react';
import type { StateLiveSummary } from '@/lib/live-store';
import { parties } from '@/data/parties';
import { constituencies } from '@/data/constituencies';

const partyById = Object.fromEntries(parties.map((p) => [p.id, p]));
const constById = Object.fromEntries(constituencies.map((c) => [c.id, c]));

interface Props { summary: StateLiveSummary; }

export function DeclaredWinners({ summary }: Props) {
  const winners = summary.declaredWinners ?? [];
  if (winners.length === 0) return null;

  return (
    <section className="relative border-b border-amber-500/20 px-4 py-8">
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-amber-500/5 via-transparent to-emerald-500/5" />
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-200">
            <Trophy className="h-4 w-4" />
            Declared winners
            <Sparkles className="h-3.5 w-3.5 text-amber-300/70" />
          </h2>
          <p className="text-[11px] text-gray-400">
            {winners.length} of {summary.totalACs} declared
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {winners.slice(0, 12).map((w) => {
            const party = partyById[w.partyId];
            const color = party?.color ?? '#64748b';
            const acName = constById[w.acId]?.name ?? w.acId;
            return (
              <Link
                key={w.acId}
                href={`/constituency/${w.acId}`}
                className="group relative overflow-hidden rounded-xl border border-white/10 p-4 transition hover:border-amber-300/40 hover:shadow-lg"
                style={{ background: `linear-gradient(135deg, ${color}22 0%, rgba(0,0,0,0.2) 70%)` }}
              >
                <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-20 blur-2xl" style={{ background: color }} />
                <div className="relative flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 group-hover:text-white/70">
                      {acName}
                    </p>
                    <p className="mt-1 truncate text-sm font-bold text-white">{w.candidateName}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
                        style={{ backgroundColor: color }}
                      >
                        {party?.abbreviation ?? w.partyId}
                      </span>
                      <span className="text-[11px] text-gray-400">
                        margin <span className="font-mono font-semibold text-white">{w.marginVotes.toLocaleString()}</span>
                      </span>
                    </div>
                  </div>
                  <Trophy className="h-5 w-5 shrink-0 text-amber-300/90 drop-shadow" />
                </div>
              </Link>
            );
          })}
        </div>

        {winners.length > 12 && (
          <p className="mt-3 text-center text-[11px] text-gray-500">
            + {winners.length - 12} more declared — see full list below
          </p>
        )}
      </div>
    </section>
  );
}
