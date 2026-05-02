'use client';

import Link from 'next/link';
import type { StateLiveSummary } from '@/lib/live-store';
import { parties } from '@/data/parties';
import { constituencies } from '@/data/constituencies';
import { Zap } from 'lucide-react';

const partyById = Object.fromEntries(parties.map(p => [p.id, p]));
const constById = Object.fromEntries(constituencies.map(c => [c.id, c]));

interface Props { summary: StateLiveSummary; }

export function TightestMargins({ summary }: Props) {
  const rows = (summary.tightestMargins ?? []).slice(0, 10);
  if (rows.length === 0) return null;

  return (
    <section className="border-b border-white/10 px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-400">
          <Zap className="h-4 w-4 text-amber-400" />
          Tightest contests
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {rows.map(m => {
            const c = constById[m.acId];
            const party = m.leaderPartyId ? partyById[m.leaderPartyId] : null;
            return (
              <Link
                key={m.acId}
                href={`/constituency/${m.acId}`}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 transition hover:bg-white/10"
                style={{ borderLeft: `3px solid ${party?.color ?? '#64748b'}` }}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{c?.name ?? m.acId}</p>
                  <p className="text-[11px] text-gray-500">
                    {party?.abbreviation ?? '—'} leading in {c?.district ?? ''}
                  </p>
                </div>
                <span className="shrink-0 text-right">
                  <span className="block text-[10px] text-gray-400">margin</span>
                  <span className="block text-sm font-extrabold text-amber-300">{m.marginVotes.toLocaleString()}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
