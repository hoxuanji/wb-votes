'use client';

import { useState, useEffect } from 'react';

const PHASE2_START = new Date('2026-04-29T01:30:00Z'); // 7:00 AM IST
const PHASE2_END   = new Date('2026-04-29T12:30:00Z'); // 6:00 PM IST

function pad(n: number) { return n.toString().padStart(2, '0'); }

export function VoteCountdown() {
  const [state, setState] = useState<'idle' | 'countdown' | 'live' | 'done'>('idle');
  const [d, setD] = useState(0);
  const [h, setH] = useState(0);
  const [m, setM] = useState(0);
  const [s, setS] = useState(0);

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      if (now >= PHASE2_END.getTime()) { setState('done'); return; }
      if (now >= PHASE2_START.getTime()) { setState('live'); return; }
      const diff = PHASE2_START.getTime() - now;
      setD(Math.floor(diff / 86400000));
      setH(Math.floor((diff % 86400000) / 3600000));
      setM(Math.floor((diff % 3600000) / 60000));
      setS(Math.floor((diff % 60000) / 1000));
      setState('countdown');
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  if (state === 'idle') return null;

  if (state === 'done') {
    return (
      <div className="flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-500">
        <span className="h-2 w-2 rounded-full bg-gray-400" />
        Phase 2 voting concluded
      </div>
    );
  }

  if (state === 'live') {
    return (
      <div className="flex items-center gap-2 rounded-full bg-green-50 border border-green-200 px-3 py-1.5 text-xs font-semibold text-green-700">
        <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
        Phase 2 voting in progress
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-full bg-violet-50 border border-violet-200 px-3 py-1.5">
      <span className="h-2 w-2 rounded-full bg-violet-500" />
      <span className="text-[11px] font-semibold text-violet-700">Phase 2 in</span>
      <div className="flex items-center gap-1 font-mono text-[11px] font-bold text-violet-900">
        {d > 0 && <><span>{d}d</span><span className="text-violet-300">:</span></>}
        <span>{pad(h)}h</span>
        <span className="text-violet-300">:</span>
        <span>{pad(m)}m</span>
        <span className="text-violet-300">:</span>
        <span>{pad(s)}s</span>
      </div>
    </div>
  );
}
