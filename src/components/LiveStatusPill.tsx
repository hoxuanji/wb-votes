'use client';

import { useEffect, useState } from 'react';
import { Trophy, Radio } from 'lucide-react';
import { getPartyById } from '@/data/parties';
import type { ACLiveResult } from '@/lib/live-store';

/**
 * Tiny pill for the constituency header that shows at-a-glance live status:
 *   LEADING · BJP       — counting in progress, live-colour chip
 *   DECLARED · TMC      — ECI has called it, gold chip
 * Hidden when there's no live data yet (e.g., AC hasn't reported).
 * Polls the same /api/live/results/:id endpoint LiveResultsTab uses.
 */
export function LiveStatusPill({ constituencyId }: { constituencyId: string }) {
  const [data, setData] = useState<ACLiveResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const res = await fetch(`/api/live/results/${encodeURIComponent(constituencyId)}`, { cache: 'no-store' });
        const body = await res.json();
        if (!cancelled && body.status === 'ok') setData(body.data);
      } catch {
        // swallow — pill just stays hidden until next successful tick
      }
    }
    tick();
    const id = setInterval(tick, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, [constituencyId]);

  if (!data || !data.leaderPartyId) return null;

  const party = getPartyById(data.leaderPartyId);
  const abbr = party?.abbreviation ?? data.leaderPartyId;
  const color = party?.color ?? '#64748b';

  if (data.declared) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-300">
        <Trophy className="h-3 w-3" />
        Declared · {abbr}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider"
      style={{ backgroundColor: `${color}22`, color, border: `1px solid ${color}55` }}
    >
      <Radio className="h-3 w-3 animate-pulse" />
      Leading · {abbr}
    </span>
  );
}
