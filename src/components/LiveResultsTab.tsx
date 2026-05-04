'use client';

import { useEffect, useState } from 'react';
import { Radio, Info, Clock, Trophy, AlertCircle, ArrowRight } from 'lucide-react';
import { getPartyById } from '@/data/parties';
import { historicalResults } from '@/data/historical-results';
import type { ACLiveResult } from '@/lib/live-store';

interface LiveResultsTabProps {
  constituencyId: string;
  className?: string;
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleString('en-IN');
}

function winner2021For(constituencyId: string) {
  return historicalResults.find((r) => r.constituencyId === constituencyId && r.year === 2021)?.winner;
}

export function LiveResultsTab({ constituencyId, className = '' }: LiveResultsTabProps) {
  const [data, setData] = useState<ACLiveResult | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'no-data' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch(`/api/live/results/${encodeURIComponent(constituencyId)}`, { cache: 'no-store' });
        const body = await res.json();
        if (cancelled) return;
        if (body.status === 'ok') {
          setData(body.data);
          setStatus('ok');
        } else {
          setData(null);
          setStatus('no-data');
        }
      } catch {
        if (!cancelled) setStatus('error');
      }
    }

    tick();
    const id = setInterval(tick, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, [constituencyId]);

  if (status === 'loading') {
    return (
      <div className={`rounded-xl border border-white/10 bg-white/5 p-6 ${className}`}>
        <div className="h-6 w-1/3 animate-pulse rounded bg-white/10" />
        <div className="mt-4 space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-white/5" />
          ))}
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className={`rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center ${className}`}>
        <p className="text-sm text-red-300">Unable to load live results. Retrying in 15s.</p>
      </div>
    );
  }

  if (status === 'no-data' || !data) {
    return (
      <div className={`rounded-xl border border-dashed border-white/10 p-8 text-center ${className}`}>
        <Info className="mx-auto mb-2 h-7 w-7 text-gray-500" />
        <p className="text-sm font-medium text-gray-300">Counting not yet started</p>
        <p className="mt-1 text-xs text-gray-500">Live vote counts will appear here on result day.</p>
      </div>
    );
  }

  const leader = data.candidates[0];
  const runnerUp = data.candidates[1];
  const leaderParty = leader ? getPartyById(leader.partyId) : null;
  const runnerUpParty = runnerUp ? getPartyById(runnerUp.partyId) : null;
  const leaderColor = leaderParty?.color ?? '#546E7A';
  const maxVotes = Math.max(...data.candidates.map((c) => c.votes), 1);
  const votesPending = data.totalCounted === 0 && data.marginVotes > 0;
  const w2021 = winner2021For(constituencyId);
  const w2021Party = w2021 ? getPartyById(w2021.partyId) : null;
  const isFlip = w2021 && leader && w2021.partyId !== leader.partyId;
  const isRetain = w2021 && leader && w2021.partyId === leader.partyId;
  const marginShare = data.totalCounted > 0 ? (data.marginVotes / data.totalCounted) * 100 : 0;

  return (
    <div className={`rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          {data.declared ? (
            <Trophy className="h-4 w-4 text-amber-400" />
          ) : (
            <Radio className="h-4 w-4 animate-pulse text-red-400" />
          )}
          {data.declared ? 'Result Declared' : 'Live Results'}
        </h3>
        <span className="flex items-center gap-1 text-[11px] text-gray-500">
          <Clock className="h-3 w-3" />
          {timeAgo(data.lastUpdated)}
        </span>
      </div>

      {/* Winner hero (declared) */}
      {leader && data.declared && (
        <div
          className="relative mb-4 overflow-hidden rounded-xl p-4 text-white shadow-lg"
          style={{
            background: `linear-gradient(135deg, ${leaderColor} 0%, ${leaderColor}cc 45%, rgba(250, 204, 21, 0.85) 130%)`,
          }}
        >
          <div className="absolute -right-6 -top-6 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/30 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-200 backdrop-blur">
            <Trophy className="h-3 w-3" /> Winner
          </div>
          <p className="relative text-[11px] font-semibold uppercase tracking-[0.2em] text-white/80">
            Declared
          </p>
          <p className="relative mt-1 text-2xl font-extrabold leading-tight">{leader.name}</p>
          <div className="relative mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded bg-black/30 px-2 py-0.5 text-[11px] font-bold text-white backdrop-blur">
              {leaderParty?.abbreviation ?? leader.partyId}
            </span>
            {leader.votes > 0 && (
              <span className="font-mono text-white/90">
                {leader.votes.toLocaleString()} votes
              </span>
            )}
            {leader.voteShare > 0 && (
              <span className="text-white/80">· {leader.voteShare.toFixed(1)}%</span>
            )}
            <span className="text-white/80">· margin {data.marginVotes.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* Leader card (live, not declared) */}
      {leader && !data.declared && (
        <div
          className="mb-4 rounded-lg border border-white/10 bg-black/20 p-3"
          style={{ borderLeft: `4px solid ${leaderColor}` }}
        >
          <p className="text-xs text-gray-400">Leading</p>
          <p className="mt-0.5 text-base font-bold text-white">{leader.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: leaderColor }}>
              {leaderParty?.abbreviation ?? leader.partyId}
            </span>
            {leader.votes > 0 ? (
              <span className="text-gray-400">
                {leader.votes.toLocaleString()} votes · {leader.voteShare.toFixed(1)}%
              </span>
            ) : (
              <span className="text-gray-500">vote count pending</span>
            )}
            <span className="font-mono text-amber-300">margin {data.marginVotes.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* Margin / 2021 analysis strip — replaces the duplicate "SAIKAT PANJA · 0 votes" row */}
      {leader && (
        <div className="mb-4 grid gap-3 rounded-xl border border-white/10 bg-white/5 p-4 sm:grid-cols-2">
          {/* Head-to-head */}
          {runnerUp ? (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Head-to-head</p>
              <div className="mt-2 space-y-2">
                <Rail name={leader.name} party={leaderParty} share={leader.voteShare} votes={leader.votes} leading />
                <Rail name={runnerUp.name} party={runnerUpParty} share={runnerUp.voteShare} votes={runnerUp.votes} />
              </div>
              {data.totalCounted > 0 && (
                <p className="mt-2 text-[11px] text-gray-500">
                  Margin <span className="font-mono text-white">{data.marginVotes.toLocaleString()}</span>
                  {marginShare > 0 && <span> · {marginShare.toFixed(1)}% of counted</span>}
                </p>
              )}
            </div>
          ) : (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Margin</p>
              <p className="mt-2 font-mono text-lg font-bold text-white">{data.marginVotes.toLocaleString()}</p>
              <p className="text-[11px] text-gray-500">No runner-up data yet</p>
            </div>
          )}

          {/* 2021 vs 2026 */}
          {w2021 && leader && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">2021 → 2026</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
                  style={{ backgroundColor: w2021Party?.color ?? '#546E7A' }}
                >
                  {w2021Party?.abbreviation ?? w2021.partyId}
                </span>
                <ArrowRight className="h-3 w-3 text-gray-500" />
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
                  style={{ backgroundColor: leaderColor }}
                >
                  {leaderParty?.abbreviation ?? leader.partyId}
                </span>
                {isFlip && (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                    FLIP
                  </span>
                )}
                {isRetain && (
                  <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-bold text-blue-300">
                    HOLD
                  </span>
                )}
              </div>
              <p className="mt-2 truncate text-[11px] text-gray-500">
                2021: {w2021.name}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Pending-votes banner */}
      {votesPending && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            ECI hasn&apos;t published per-candidate vote counts for this AC yet — only the
            leader, trailer, and margin are available. Counts will appear here as soon as ECI posts them.
          </span>
        </div>
      )}

      {/* Full candidate list — hide vote columns when all zero, keep names+parties */}
      {data.candidates.length > 0 && (
        <>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">
            All candidates ({data.candidates.length})
          </p>
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {data.candidates.map((c) => {
              const party = getPartyById(c.partyId);
              const color = party?.color ?? '#546E7A';
              const widthPct = (c.votes / maxVotes) * 100;
              return (
                <div key={c.candidateId} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-xs font-medium text-white">
                        {c.name}
                        {party && (
                          <span
                            className="ml-1.5 rounded px-1 py-0.5 text-[9px] font-bold text-white"
                            style={{ backgroundColor: color }}
                          >
                            {party.abbreviation}
                          </span>
                        )}
                      </p>
                      {c.votes > 0 ? (
                        <p className="shrink-0 text-[11px] text-gray-400">
                          {c.votes.toLocaleString()}
                          <span className="ml-1 text-gray-500">({c.voteShare.toFixed(1)}%)</span>
                        </p>
                      ) : (
                        <p className="shrink-0 text-[10px] text-gray-600">pending</p>
                      )}
                    </div>
                    {c.votes > 0 && (
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${widthPct}%`, backgroundColor: color }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <p className="mt-4 flex items-center justify-between text-[11px] text-gray-500">
        <span>
          Total counted: <span className="text-gray-300">{data.totalCounted.toLocaleString()}</span>
          {data.totalElectors && ` of ${data.totalElectors.toLocaleString()} electors`}
        </span>
        <span>polling every 15s</span>
      </p>
    </div>
  );
}

interface RailProps {
  name: string;
  party: ReturnType<typeof getPartyById> | null;
  share: number;
  votes: number;
  leading?: boolean;
}

function Rail({ name, party, share, votes, leading }: RailProps) {
  const color = party?.color ?? '#546E7A';
  const pct = Math.max(0, Math.min(100, share));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5 truncate text-[12px]">
          <span className={leading ? 'font-bold text-white' : 'font-medium text-gray-300'}>{name}</span>
          {party && (
            <span
              className="rounded px-1 py-0.5 text-[9px] font-bold text-white"
              style={{ backgroundColor: color }}
            >
              {party.abbreviation}
            </span>
          )}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-gray-400">
          {votes > 0 ? `${votes.toLocaleString()}${share > 0 ? ` · ${share.toFixed(1)}%` : ''}` : 'pending'}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full" style={{ width: `${pct || 0}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}
