'use client';

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import type { StateLiveSummary, ScraperMeta } from '@/lib/live-store';
import { StateTally } from '@/components/home/StateTally';
import { DeclaredWinners } from '@/components/home/DeclaredWinners';
import { PartyScoreboard } from '@/components/home/PartyScoreboard';
import { PartyInsights } from '@/components/home/PartyInsights';
import { Comparison2021 } from '@/components/home/Comparison2021';
import { ACResultsTicker } from '@/components/home/ACResultsTicker';
import { TightestMargins } from '@/components/home/TightestMargins';

type Status = 'loading' | 'ok' | 'no-data' | 'error';

function timeAgo(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleString('en-IN');
}

/**
 * LiveCountingPanel — the "Live Counting" tab body on `/`.
 *
 * Scope is narrower than the old LiveHomeDashboard: this is now a tab panel,
 * so it drops the red LIVE banner (moved into HomeHero), its own map section
 * (reachable via the Explore tab), and the footer CTA (tab nav replaces it).
 */
export function LiveCountingPanel() {
  const [summary, setSummary] = useState<StateLiveSummary | null>(null);
  const [meta, setMeta]       = useState<ScraperMeta | null>(null);
  const [status, setStatus]   = useState<Status>('loading');
  const [lastOkAt, setLastOkAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const res = await fetch('/api/live/state', { cache: 'no-store' });
        const body = await res.json();
        if (cancelled) return;
        if (body.status === 'ok' && body.summary) {
          setSummary(body.summary as StateLiveSummary);
          setMeta(body.meta as ScraperMeta ?? null);
          setStatus('ok');
          setLastOkAt(new Date().toISOString());
        } else {
          setStatus('no-data');
        }
      } catch {
        if (!cancelled) setStatus('error');
      }
    }
    tick();
    const id = setInterval(tick, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (status === 'loading') {
    return (
      <div className="px-4 py-10">
        <div className="mx-auto max-w-6xl">
          <div className="h-10 w-full animate-pulse rounded-full bg-white/5" />
          <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-white/5" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (status === 'no-data' || !summary) {
    return (
      <div className="px-4 py-14">
        <div className="mx-auto max-w-2xl rounded-2xl border border-dashed border-white/15 bg-white/5 p-8 text-center">
          <h3 className="text-lg font-bold text-white">Counting hasn&apos;t started yet</h3>
          <p className="mt-1 text-sm text-gray-400">
            The live scraper runs once counting begins. Switch to the Explore tab to browse candidate-level data while you wait.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="text-white">
      {/* Freshness indicator strip */}
      <div className="border-b border-white/10 px-4 py-2 text-[11px] text-gray-400">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            Updated {timeAgo(summary.lastUpdated)} · polls every 15s
          </span>
          {status === 'error' && lastOkAt && (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-200">
              Connection issue — last sync {timeAgo(lastOkAt)}
            </span>
          )}
          {meta?.lastStatus === 'partial' && (
            <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-orange-200">
              Partial: {meta.lastError ?? 'some ACs failed to parse'}
            </span>
          )}
        </div>
      </div>

      <StateTally summary={summary} />
      <DeclaredWinners summary={summary} />
      <PartyScoreboard summary={summary} />
      <PartyInsights summary={summary} />
      <Comparison2021 summary={summary} />
      <ACResultsTicker summary={summary} />
      <TightestMargins summary={summary} />
    </div>
  );
}
