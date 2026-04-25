'use client';

import { useState, useEffect } from 'react';

const PHASE2_START = new Date('2026-04-29T01:30:00Z'); // 7:00 AM IST
const PHASE2_END   = new Date('2026-04-29T12:30:00Z'); // 6:00 PM IST

function pad(n: number) { return n.toString().padStart(2, '0'); }

export function VoteCountdown() {
  const [state, setState] = useState<'idle' | 'countdown' | 'live' | 'done'>('idle');
  const [d, setD]   = useState(0);
  const [h, setH]   = useState(0);
  const [m, setM]   = useState(0);
  const [s, setS]   = useState(0);

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      if (now >= PHASE2_END.getTime())   { setState('done'); return; }
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
      <div className="border-t border-white/10 bg-white/5 px-4 py-5">
        <div className="mx-auto max-w-6xl text-center text-sm font-medium text-gray-500">
          Phase 2 voting has concluded · 29 Apr 2026
        </div>
      </div>
    );
  }

  if (state === 'live') {
    return (
      <div className="border-t border-green-500/20 bg-green-500/10 px-4 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-3">
          <span className="h-2.5 w-2.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-sm font-semibold text-green-300">Phase 2 voting is in progress · 29 April 2026 · Polls close at 6 PM</span>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-violet-500/20 bg-gradient-to-r from-violet-900/30 via-indigo-900/20 to-blue-900/20 px-4 py-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Left: label */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-400">Upcoming</p>
            <h3 className="mt-0.5 text-lg font-bold text-violet-100">Phase 2 Voting Opens</h3>
            <p className="text-sm text-violet-300">29 April 2026 · 7:00 AM · 256 constituencies</p>
          </div>

          {/* Right: countdown blocks */}
          <div className="flex items-end gap-2">
            {[
              { value: d,    label: 'Days'    },
              { value: h,    label: 'Hours'   },
              { value: m,    label: 'Minutes' },
              { value: s,    label: 'Seconds' },
            ].map(({ value, label }, i) => (
              <div key={label} className="flex items-end gap-2">
                {i > 0 && <span className="mb-3 text-xl font-bold text-violet-400">:</span>}
                <div className="flex flex-col items-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/10 border border-white/15">
                    <span className="font-mono text-2xl font-extrabold text-violet-100">{pad(value)}</span>
                  </div>
                  <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-violet-400">{label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
