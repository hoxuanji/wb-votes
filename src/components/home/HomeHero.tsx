'use client';

import { useEffect, useState } from 'react';
import { HeroSearchBar } from '@/components/HeroSearchBar';
import { LastSearchedBanner } from '@/components/LastSearchedBanner';
import { constituencies } from '@/data/constituencies';
import { candidates } from '@/data/candidates';
import { parties } from '@/data/parties';
import { getClientElectionPhase } from '@/lib/election-phase';
import type { StateLiveSummary } from '@/lib/live-store';
import { Radio, CheckCircle2 } from 'lucide-react';

const partyById = Object.fromEntries(parties.map(p => [p.id, p]));

/**
 * HomeHero — phase-aware hero for `/`.
 *
 * - pre:   evergreen hero with 4 stat cards (Constituencies / Candidates / With Cases / Women)
 * - live:  compact hero with top-3-party live chips + declared/total chip
 * - post:  compact hero with final-result chips
 *
 * Search bar is always visible so it stays one glance away regardless of phase.
 */
export function HomeHero() {
  const phase = getClientElectionPhase();
  const totalCriminal = candidates.filter((c) => c.criminalCases > 0).length;
  const womenCount = candidates.filter(c => c.gender === 'Female').length;

  // Live tally for hero chips — only polled when phase !== 'pre'.
  const [summary, setSummary] = useState<StateLiveSummary | null>(null);
  const [probed, setProbed]   = useState(false);
  useEffect(() => {
    if (phase === 'pre') return;
    let cancelled = false;
    async function tick() {
      try {
        const res = await fetch('/api/live/state', { cache: 'no-store' });
        const body = await res.json();
        if (cancelled) return;
        if (body.status === 'ok' && body.summary) {
          setSummary(body.summary as StateLiveSummary);
        }
      } catch { /* keep last-good */ }
      if (!cancelled) setProbed(true);
    }
    tick();
    const id = setInterval(tick, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, [phase]);

  const compact = phase !== 'pre';

  return (
    <section className={`relative overflow-visible bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 px-4 ${compact ? 'pb-8 pt-10' : 'pb-14 pt-14'} text-white`}>
      {/* Ambient orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-16 -left-16 h-72 w-72 rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="absolute left-1/2 top-1/3 h-64 w-64 -translate-x-1/2 rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-3xl text-center">
        {/* Phase badge */}
        <PhaseBadge phase={phase} />

        {/* Title */}
        {phase === 'pre' ? (
          <>
            <h1 className="mb-3 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl md:text-5xl">
              Know Your Candidates.
              <br className="hidden sm:block" />
              <span className="bg-gradient-to-r from-blue-200 via-indigo-200 to-violet-300 bg-clip-text text-transparent">
                Vote Informed.
              </span>
            </h1>
            <p className="mb-8 text-base text-blue-100/80 sm:text-lg">
              বাংলার প্রতিটি ভোটার যেন জেনে-বুঝে ভোট দিতে পারেন — স্বাধীন, নিরপেক্ষ তথ্য।
            </p>
          </>
        ) : (
          <h1 className="mb-5 text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
            {phase === 'live'
              ? <>Counting live — <span className="bg-gradient-to-r from-red-200 via-orange-200 to-amber-300 bg-clip-text text-transparent">West Bengal 2026</span></>
              : <>Result declared — <span className="bg-gradient-to-r from-emerald-200 via-teal-200 to-cyan-300 bg-clip-text text-transparent">West Bengal 2026</span></>
            }
          </h1>
        )}

        <HeroSearchBar />

        {/* Stat cards or live chips */}
        {compact && summary ? (
          <LiveChips summary={summary} />
        ) : !compact ? (
          <div className="mx-auto mt-8 grid max-w-2xl grid-cols-4 gap-3 text-center">
            {[
              { value: constituencies.length, label: 'Constituencies', color: 'from-blue-400/20 to-blue-600/20', border: 'border-blue-400/30' },
              { value: `${candidates.length}+`, label: 'Candidates', color: 'from-indigo-400/20 to-indigo-600/20', border: 'border-indigo-400/30' },
              { value: totalCriminal, label: 'With Cases', color: 'from-red-400/20 to-rose-600/20', border: 'border-red-400/30' },
              { value: womenCount, label: 'Women', color: 'from-violet-400/20 to-violet-600/20', border: 'border-violet-400/30' },
            ].map((s) => (
              <div key={s.label} className={`rounded-xl border ${s.border} bg-gradient-to-br ${s.color} px-2 py-3 backdrop-blur-sm`}>
                <p className="text-xl font-bold text-white">{s.value}</p>
                <p className="mt-0.5 text-[10px] text-blue-200/80">{s.label}</p>
              </div>
            ))}
          </div>
        ) : probed ? (
          // Compact mode + probed at least once + still no data → graceful microcopy
          <p className="mx-auto mt-5 text-xs text-blue-200/60">
            Awaiting live tally — the dashboard populates once the ECI scraper publishes results.
          </p>
        ) : (
          // First 15s before the first probe returns — single subtle pulse
          <div className="mx-auto mt-5 h-4 w-48 animate-pulse rounded-full bg-white/5" />
        )}
      </div>

      <LastSearchedBanner />
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function PhaseBadge({ phase }: { phase: 'pre' | 'live' | 'post' }) {
  if (phase === 'live') {
    return (
      <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-red-400/40 bg-red-500/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-red-100 backdrop-blur-sm">
        <Radio className="h-3 w-3 animate-pulse" />
        Result day · Counting LIVE
      </span>
    );
  }
  if (phase === 'post') {
    return (
      <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-emerald-100 backdrop-blur-sm">
        <CheckCircle2 className="h-3 w-3" />
        Final result · 2026
      </span>
    );
  }
  return (
    <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-blue-200 backdrop-blur-sm">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-300" />
      WB Elections 2026 · Phase 1: 23 Apr · Phase 2: 29 Apr
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function LiveChips({ summary }: { summary: StateLiveSummary }) {
  const entries = Object.entries(summary.leadingByParty).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const undeclared = summary.totalACs - summary.declared;
  return (
    <div className="mx-auto mt-6 flex max-w-2xl flex-wrap justify-center gap-2">
      {entries.map(([partyId, count]) => {
        const p = partyById[partyId];
        const color = p?.color ?? '#64748b';
        return (
          <div
            key={partyId}
            className="flex items-center gap-2 rounded-full border bg-white/10 px-3 py-1.5 text-sm text-white backdrop-blur-sm"
            style={{ borderColor: color }}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="font-bold">{p?.abbreviation ?? partyId}</span>
            <span className="font-extrabold">{count}</span>
          </div>
        );
      })}
      <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-blue-100 backdrop-blur-sm">
        <span className="font-semibold">{summary.declared}</span>
        <span className="text-blue-200/80">/ {summary.totalACs} declared</span>
        {undeclared > 0 && <span className="text-[11px] text-blue-300/80">· {undeclared} pending</span>}
      </div>
    </div>
  );
}
