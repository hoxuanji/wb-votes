'use client';

import { useEffect, useState } from 'react';
import { Radio, Info, Clock, Trophy } from 'lucide-react';
import { getPartyById } from '@/data/parties';
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
  const leaderParty = leader ? getPartyById(leader.partyId) : null;
  const leaderColor = leaderParty?.color ?? '#546E7A';
  const maxVotes = Math.max(...data.candidates.map((c) => c.votes), 1);

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
            <span className="font-mono text-white/90">
              {leader.votes.toLocaleString()} votes
            </span>
            {leader.voteShare > 0 && (
              <span className="text-white/80">· {leader.voteShare.toFixed(1)}%</span>
            )}
            <span className="text-white/80">· margin {data.marginVotes.toLocaleString()}</span>
          </div>
        </div>
      )}

      {leader && !data.declared && (
        <div
          className="mb-4 rounded-lg border border-white/10 bg-black/20 p-3"
          style={{ borderLeft: `4px solid ${leaderColor}` }}
        >
          <p className="text-xs text-gray-400">Leading</p>
          <p className="mt-0.5 text-base font-bold text-white">{leader.name}</p>
          <div className="mt-1 flex items-center gap-2 text-xs">
            <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: leaderColor }}>
              {leaderParty?.abbreviation ?? leader.partyId}
            </span>
            <span className="text-gray-400">
              {leader.votes.toLocaleString()} votes · {leader.voteShare.toFixed(1)}%
            </span>
            <span className="text-gray-500">· margin {data.marginVotes.toLocaleString()}</span>
          </div>
        </div>
      )}

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
                      <span className="ml-1.5 text-[10px] font-semibold text-gray-500">
                        {party.abbreviation}
                      </span>
                    )}
                  </p>
                  <p className="shrink-0 text-[11px] text-gray-400">
                    {c.votes.toLocaleString()}
                    <span className="ml-1 text-gray-500">({c.voteShare.toFixed(1)}%)</span>
                  </p>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${widthPct}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 flex items-center justify-between text-[11px] text-gray-500">
        <span>
          Total counted: <span className="text-gray-300">{data.totalCounted.toLocaleString()}</span>
          {data.totalElectors && ` of ${data.totalElectors.toLocaleString()} electors`}
          {' · '}
          {data.candidates.length} candidate{data.candidates.length === 1 ? '' : 's'}
        </span>
        <span>polling every 15s</span>
      </p>
    </div>
  );
}
