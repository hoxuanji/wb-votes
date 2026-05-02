'use client';

import Link from 'next/link';
import { Trophy, Zap, Swords, Star } from 'lucide-react';
import { parties } from '@/data/parties';
import { constituencies } from '@/data/constituencies';
import type { NotableWin } from '@/lib/election-analysis';

const partyById = Object.fromEntries(parties.map(p => [p.id, p]));
const constById = Object.fromEntries(constituencies.map(c => [c.id, c]));

const ICONS = {
  biggest_margin:     { icon: Trophy, label: 'Biggest margin',    tone: 'amber'   },
  tightest_margin:    { icon: Zap,    label: 'Tightest margin',   tone: 'red'     },
  incumbent_loss:     { icon: Swords, label: 'Upset',              tone: 'rose'    },
  first_time_winner:  { icon: Star,   label: 'First-time winner',  tone: 'emerald' },
} as const;

const TONE_STYLES: Record<string, { border: string; bg: string; text: string; icon: string }> = {
  amber:   { border: 'border-amber-500/30',   bg: 'bg-amber-500/10',   text: 'text-amber-300',   icon: 'text-amber-400'   },
  red:     { border: 'border-red-500/30',     bg: 'bg-red-500/10',     text: 'text-red-300',     icon: 'text-red-400'     },
  rose:    { border: 'border-rose-500/30',    bg: 'bg-rose-500/10',    text: 'text-rose-300',    icon: 'text-rose-400'    },
  emerald: { border: 'border-emerald-500/30', bg: 'bg-emerald-500/10', text: 'text-emerald-300', icon: 'text-emerald-400' },
};

interface Props { wins: NotableWin[]; }

export function NotableWinsUpsetsPanel({ wins }: Props) {
  if (wins.length === 0) {
    return (
      <section className="border-t border-white/10 px-4 py-10">
        <div className="mx-auto max-w-6xl rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-center">
          <p className="text-sm text-gray-400">No notable wins surfaced yet — data still aggregating.</p>
        </div>
      </section>
    );
  }

  // Dedup by acId across different kinds (prefer earlier kind per ICONS order).
  const seen = new Set<string>();
  const featured: NotableWin[] = [];
  for (const w of wins) {
    const key = `${w.kind}|${w.acId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    featured.push(w);
    if (featured.length >= 6) break;
  }

  return (
    <section id="upsets" className="border-t border-white/10 px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <h2 className="mb-4 text-lg font-bold text-white">Notable wins &amp; upsets</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((w, i) => {
            const cfg = ICONS[w.kind];
            const tone = TONE_STYLES[cfg.tone];
            const c = constById[w.acId];
            const party = partyById[w.partyId];
            const Icon = cfg.icon;
            return (
              <Link
                key={`${w.kind}-${w.acId}-${i}`}
                href={`/constituency/${w.acId}`}
                className={`rounded-2xl border ${tone.border} ${tone.bg} p-4 transition hover:scale-[1.01]`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${tone.icon}`} />
                  <span className={`text-[11px] font-bold uppercase tracking-wider ${tone.text}`}>
                    {cfg.label}
                  </span>
                </div>
                <p className="text-sm font-bold text-white truncate">{w.candidateName}</p>
                <p className="text-[11px] text-gray-400">
                  {c?.name ?? w.acId} · {c?.district ?? ''}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: party?.color ?? '#64748b' }}>
                    {party?.abbreviation ?? w.partyId}
                  </span>
                  <span className="text-[11px] text-gray-400">
                    margin <span className="font-bold text-white">{w.marginVotes.toLocaleString()}</span>
                  </span>
                </div>
                {w.note && <p className="mt-2 text-[11px] italic text-gray-500">{w.note}</p>}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
