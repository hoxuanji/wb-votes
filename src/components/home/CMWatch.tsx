'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Crown, AlertTriangle, TrendingDown, CheckCircle2, Radio } from 'lucide-react';
import { getPartyById } from '@/data/parties';
import type { ACLiveResult } from '@/lib/live-store';

/**
 * Chief-minister-watch banner. Hardcoded for Mamata Banerjee (AITC) contesting
 * Bhabanipur (c0166) — her seat since 2011. Polls the AC's live result and
 * renders one of four states, each tonally distinct so viewers can feel the
 * drama without reading numbers:
 *
 *   WINNER            gold, 'CM retains her seat'        — declared, she won
 *   DEFEATED          red,  'CM defeated in her own seat' — declared, she lost
 *   TRAILING          amber,'CM trailing — could lose'    — live, she's behind
 *   LEADING           green,'CM leading in Bhabanipur'    — live, she's ahead
 *   Hidden when no data or she's not on the candidate list.
 */

const CM = {
  name: 'MAMATA BANERJEE',
  acId: 'c0166',
  acName: 'Bhabanipur',
  since: 'her constituency since 2011',
};

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
}

export function CMWatch() {
  const [data, setData] = useState<ACLiveResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const res = await fetch(`/api/live/results/${CM.acId}`, { cache: 'no-store' });
        const body = await res.json();
        if (!cancelled && body.status === 'ok') setData(body.data);
      } catch { /* ignore; banner stays on last good state */ }
    }
    tick();
    const id = setInterval(tick, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (!data) return null;
  const cmName = normalize(CM.name);
  const cm = data.candidates.find((c) => normalize(c.name) === cmName);
  if (!cm) return null;

  const leader = data.candidates[0];
  const cmIsLeader = leader && normalize(leader.name) === cmName;
  const declared = data.declared;
  const marginAgainstCm = cmIsLeader ? 0 : Math.max(0, (leader?.votes ?? 0) - cm.votes);
  const leaderParty = leader ? getPartyById(leader.partyId) : null;
  const cmParty = getPartyById(cm.partyId);

  // Four states, rendered with distinct colour language.
  let tone: 'win' | 'lose' | 'trail' | 'lead';
  let icon: React.ReactNode;
  let kicker: string;
  let headline: string;
  let sub: string;

  if (declared && cmIsLeader) {
    tone = 'win';
    icon = <CheckCircle2 className="h-6 w-6" />;
    kicker = 'Chief Minister retains';
    headline = `${CM.name} holds ${CM.acName}`;
    sub = `Winning margin ${data.marginVotes.toLocaleString()} · ${CM.since}`;
  } else if (declared && !cmIsLeader) {
    tone = 'lose';
    icon = <AlertTriangle className="h-6 w-6" />;
    kicker = 'Chief Minister defeated';
    headline = `${CM.name} loses ${CM.acName}`;
    sub = `Lost to ${leader?.name ?? '—'} (${leaderParty?.abbreviation ?? ''}) by ${data.marginVotes.toLocaleString()} votes · ${CM.since}`;
  } else if (!declared && !cmIsLeader) {
    tone = 'trail';
    icon = <TrendingDown className="h-6 w-6" />;
    kicker = 'Chief Minister trailing';
    headline = `${CM.name} behind by ${marginAgainstCm.toLocaleString()} in ${CM.acName}`;
    sub = `${leader?.name ?? '—'} (${leaderParty?.abbreviation ?? ''}) is leading · ${CM.since}`;
  } else {
    tone = 'lead';
    icon = <Crown className="h-6 w-6" />;
    kicker = 'Chief Minister leading';
    headline = `${CM.name} ahead by ${data.marginVotes.toLocaleString()} in ${CM.acName}`;
    sub = `${CM.since} · counting in progress`;
  }

  const classes: Record<typeof tone, string> = {
    win: 'border-emerald-400/40 text-emerald-100',
    lose: 'border-red-500/50 text-red-50 ring-2 ring-red-500/20',
    trail: 'border-amber-400/40 text-amber-50',
    lead: 'border-emerald-400/30 text-emerald-50',
  };
  const bgs: Record<typeof tone, string> = {
    win: 'linear-gradient(135deg, rgba(16,185,129,0.25), rgba(0,0,0,0.3))',
    lose: 'linear-gradient(135deg, rgba(239,68,68,0.30), rgba(0,0,0,0.35))',
    trail: 'linear-gradient(135deg, rgba(245,158,11,0.25), rgba(0,0,0,0.3))',
    lead: 'linear-gradient(135deg, rgba(16,185,129,0.20), rgba(0,0,0,0.3))',
  };

  return (
    <section className="relative overflow-hidden border-b border-white/10 px-4 py-6">
      <Link
        href={`/constituency/${CM.acId}`}
        className={`group mx-auto block max-w-6xl rounded-2xl border p-5 transition hover:brightness-110 ${classes[tone]}`}
        style={{ background: bgs[tone] }}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className={`shrink-0 rounded-full p-2 ${tone === 'lose' ? 'animate-pulse bg-red-500/20' : 'bg-white/10'}`}>
              {icon}
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] opacity-80">
                {tone === 'lose' ? (
                  <span className="inline-flex items-center gap-2">
                    <Radio className="h-3 w-3 animate-pulse" />
                    {kicker}
                  </span>
                ) : kicker}
              </p>
              <p className="mt-1 text-lg font-extrabold sm:text-xl">{headline}</p>
              <p className="mt-1 text-[12px] opacity-80">{sub}</p>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="flex items-baseline justify-end gap-2">
              <span className="rounded bg-black/25 px-1.5 py-0.5 text-[10px] font-bold backdrop-blur">
                {cmParty?.abbreviation ?? cm.partyId}
              </span>
              <span className="text-2xl font-extrabold tabular-nums">
                {cm.votes > 0 ? cm.votes.toLocaleString() : '—'}
              </span>
            </div>
            <p className="mt-0.5 text-[10px] uppercase tracking-wider opacity-70">Mamata&apos;s votes</p>
          </div>
        </div>
      </Link>
    </section>
  );
}
