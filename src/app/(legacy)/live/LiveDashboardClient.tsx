'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Radio, Clock, Info, ArrowRight } from 'lucide-react';
import { parties } from '@/data/parties';
import { getConstituencyById } from '@/data/constituencies';
import type { StateLiveSummary, ScraperMeta } from '@/lib/live-store';

const partyById = Object.fromEntries(parties.map((p) => [p.id, p]));

function timeAgo(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function LiveDashboardClient() {
  const [summary, setSummary] = useState<StateLiveSummary | null>(null);
  const [meta, setMeta] = useState<ScraperMeta | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const res = await fetch('/api/live/state', { cache: 'no-store' });
        const body = await res.json();
        if (cancelled) return;
        setSummary(body.summary ?? null);
        setMeta(body.meta ?? null);
        setLoaded(true);
      } catch {
        if (!cancelled) setLoaded(true);
      }
    }
    tick();
    const id = setInterval(tick, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const leadingSorted = summary
    ? Object.entries(summary.leadingByParty).sort((a, b) => b[1] - a[1])
    : [];
  const totalLeading = leadingSorted.reduce((s, [, n]) => s + n, 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold text-white">
          <Radio className="h-6 w-6 animate-pulse text-red-400" />
          Live Results — West Bengal 2026
        </h1>
        {meta?.lastRun && (
          <p className="mt-1 flex items-center gap-1 text-sm text-gray-400">
            <Clock className="h-3.5 w-3.5" />
            Last updated {timeAgo(meta.lastRun)} · {meta.acsParsed ?? 0} ACs parsed
            {meta.lastStatus !== 'ok' && (
              <span className="ml-2 rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                {meta.lastStatus}
              </span>
            )}
          </p>
        )}
      </div>

      {!loaded && (
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-white/5" />
          ))}
        </div>
      )}

      {loaded && !summary && (
        <div className="rounded-xl border border-dashed border-white/10 p-12 text-center">
          <Info className="mx-auto mb-3 h-8 w-8 text-gray-500" />
          <p className="text-base font-semibold text-gray-300">Counting not yet started</p>
          <p className="mt-2 text-sm text-gray-500">
            This dashboard will light up on result day with state-wide tallies, leading parties, and the tightest margins.
          </p>
        </div>
      )}

      {loaded && summary && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Declared</p>
              <p className="mt-1 text-3xl font-extrabold text-white">
                {summary.declared}
                <span className="ml-1 text-base font-semibold text-gray-500">/ {summary.totalACs}</span>
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-emerald-400"
                  style={{ width: `${(summary.declared / summary.totalACs) * 100}%` }}
                />
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Leading party</p>
              {leadingSorted[0] ? (
                <>
                  <p
                    className="mt-1 text-3xl font-extrabold"
                    style={{ color: partyById[leadingSorted[0][0]]?.color ?? '#fff' }}
                  >
                    {partyById[leadingSorted[0][0]]?.abbreviation ?? leadingSorted[0][0]}
                  </p>
                  <p className="mt-0.5 text-sm text-gray-400">{leadingSorted[0][1]} seats</p>
                </>
              ) : (
                <p className="mt-1 text-base text-gray-400">No lead yet</p>
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Turnout</p>
              <p className="mt-1 text-3xl font-extrabold text-white">
                {summary.turnoutPct ? `${summary.turnoutPct.toFixed(1)}%` : '—'}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">state-wide average</p>
            </div>
          </div>

          <div className="mb-6 rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5">
            <h2 className="mb-3 text-sm font-bold text-white">Leading party breakdown</h2>
            <div className="space-y-2">
              {leadingSorted.map(([pid, count]) => {
                const p = partyById[pid];
                const pct = totalLeading > 0 ? (count / totalLeading) * 100 : 0;
                return (
                  <div key={pid} className="flex items-center gap-3">
                    <span className="w-16 shrink-0 text-xs font-semibold text-gray-300">
                      {p?.abbreviation ?? pid}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: p?.color ?? '#64748b' }}
                      />
                    </div>
                    <span className="w-12 shrink-0 text-right text-xs font-bold text-white">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5">
            <h2 className="mb-3 text-sm font-bold text-white">Tightest margins</h2>
            <ul className="divide-y divide-white/5">
              {summary.tightestMargins.slice(0, 10).map((m) => {
                const c = getConstituencyById(m.acId);
                const p = m.leaderPartyId ? partyById[m.leaderPartyId] : null;
                return (
                  <li key={m.acId}>
                    <Link
                      href={`/constituency/${m.acId}`}
                      className="flex items-center justify-between gap-3 py-2.5 text-sm text-gray-200 hover:text-white"
                    >
                      <div className="min-w-0 flex items-center gap-2">
                        {p && (
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: p.color }}
                          />
                        )}
                        <span className="truncate font-medium">{c?.name ?? m.acId}</span>
                        <span className="text-xs text-gray-500">{c?.district}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-xs font-bold text-amber-300">
                          {m.marginVotes.toLocaleString()} margin
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-gray-500" />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
