'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Frame } from '../../../packages/mandate/src/repo/landscape-frames.ts';

/**
 * How we got here: a scrubber over the years the registry holds an assembly election in, a play button, and the map and the party tally
 * re-coloured for the year chosen.
 *
 * PROGRESSIVE, ON PURPOSE. The server renders the LAST frame, the present: the map, the tally and the ribbon are the page's own markup, so the
 * section is complete with script off and before hydration. The controls are not rendered until the component has mounted, because buttons that
 * do nothing are worse than no buttons. The map is the server's child; this component never draws a state, it sets the fill and the tooltip of each
 * `[data-state]` it finds, which keeps the geometry (the one expensive piece of markup on the page) out of the client bundle and out of React.
 *
 * WHAT A FRAME MAY SAY IS DECIDED ELSEWHERE. repo/landscape-frames.ts builds each frame and tests the rules: a state with no election by the year is the
 * no-election ink and never a party's colour; a state level for most seats is hatched and has no leader. This file moves between frames and holds none
 * of those rules.
 *
 * MOTION is the fill transition on the map (CSS, off under reduced motion) and the cursor on the ribbon. Play is a user's own action, so it is available to
 * a reduced-motion reader too; it steps at a readable pace and the fills change without a transition.
 *
 * KEYBOARD AND SCREEN READER. The scrubber is a native range input: arrows step, Home and End jump, and its value is announced as the year. A polite live
 * region says the stop's sentence when the reader changes the year, and not on every step of a playback, which would be a stream of speech.
 */

const STEP_MS = 1100;

export function TimeMachine({ frames, sentences, children }: { frames: Frame[]; sentences: string[]; children: React.ReactNode }) {
  const last = frames.length - 1;
  const [i, setI] = useState(last);
  const [mounted, setMounted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [said, setSaid] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const f = frames[i] ?? frames[last];

  useEffect(() => setMounted(true), []);

  // Apply the frame to the server-rendered map: a fill and a tooltip per state, found by data attribute.
  useEffect(() => {
    const el = root.current;
    if (el === null || f === undefined) return;
    for (const p of el.querySelectorAll<SVGElement>('[data-state]')) {
      const id = p.dataset['state'] ?? '';
      p.style.fill = f.fills[id] ?? 'var(--iei-void)';
      const t = p.querySelector('title');
      if (t !== null && f.titles[id] !== undefined) t.textContent = f.titles[id] ?? '';
    }
  }, [f]);

  // Play: one stop every STEP_MS from where the reader is (or from the start, if they are at the end), then stop.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setI((n) => {
        if (n >= last) {
          setPlaying(false);
          return n;
        }
        return n + 1;
      });
    }, STEP_MS);
    return () => clearInterval(id);
  }, [playing, last]);

  const choose = useCallback(
    (n: number) => {
      setPlaying(false);
      setI(Math.max(0, Math.min(last, n)));
      setSaid(sentences[Math.max(0, Math.min(last, n))] ?? '');
    },
    [last, sentences],
  );

  if (f === undefined) return null;
  const peak = Math.max(1, ...frames.map((x) => x.total));

  return (
    <div className="iei-tm" ref={root} data-playing={playing ? 'true' : undefined}>
      <div className="iei-tm-top">
        <div className="iei-tm-year" aria-hidden="true">
          {f.year}
        </div>
        {mounted ? (
          <div className="iei-tm-controls">
            <button
              type="button"
              className="iei-tm-play"
              onClick={() => {
                if (!playing && i >= last) setI(0);
                setPlaying(!playing);
              }}
              aria-pressed={playing}
            >
              {playing ? 'Pause' : i >= last ? 'Replay' : 'Play'}
            </button>
            <button type="button" onClick={() => choose(i - 1)} disabled={i <= 0} aria-label="Previous election year">
              ‹
            </button>
            <input
              type="range"
              min={0}
              max={last}
              step={1}
              value={i}
              onChange={(e) => choose(Number(e.target.value))}
              aria-label="Year"
              aria-valuetext={String(f.year)}
              list="iei-tm-stops"
            />
            <datalist id="iei-tm-stops">
              {frames.map((x, n) => (
                <option key={x.year} value={n} label={String(x.year)} />
              ))}
            </datalist>
            <button type="button" onClick={() => choose(i + 1)} disabled={i >= last} aria-label="Next election year">
              ›
            </button>
          </div>
        ) : null}
        <p className="iei-tm-count">
          <b>{f.withResult}</b> of {f.total} states and territories have an assembly election on record by {f.year}.
        </p>
      </div>

      <div className="iei-tm-body">
        <div className="iei-tm-map">{children}</div>

        <div className="iei-tm-side">
          <h3 className="iei-lb-h">States led, {f.year}</h3>
          {f.tally.length === 0 ? (
            <p className="iei-absent">No state has a result by this year.</p>
          ) : (
            <ul className="iei-tm-tally">
              {f.tally.map((t) => (
                <li key={t.key}>
                  <span className="iei-sw" style={{ background: t.fill }} aria-hidden="true" />
                  <span className="iei-chip">{t.label}</span>
                  <span className="iei-tm-bar" aria-hidden="true">
                    <span style={{ width: `${((t.states / f.total) * 100).toFixed(2)}%`, background: t.fill }} />
                  </span>
                  <b>{t.states}</b>
                </li>
              ))}
            </ul>
          )}

          {/* THE RIBBON: one column per stop, the whole column is every state and territory, and the filled part is the states with a result
              that year, split by the party leading each. What is not filled is not loaded or not yet elected, said by the empty space and
              not by a colour. Clicking a column is a mouse shortcut; the range input is the accessible control. */}
          <div
            className="iei-tm-rib"
            role="img"
            aria-label={`States led by each party at each stop, ${frames[0]?.year ?? ''} to ${frames[last]?.year ?? ''}`}
            onClick={(e) => {
              if (!mounted) return;
              const col = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
              if (col !== null) choose(Number(col.dataset['i']));
            }}
          >
            {frames.map((x, n) => (
              <div key={x.year} className="iei-tm-col" data-i={n} aria-current={n === i ? 'true' : undefined}>
                <span className="iei-tm-stack" style={{ height: `${((x.total / peak) * 100).toFixed(2)}%` }}>
                  {[...x.tally].reverse().map((t) => (
                    <span key={t.key} style={{ height: `${((t.states / x.total) * 100).toFixed(2)}%`, background: t.fill }} title={`${t.label} ${t.states}`} />
                  ))}
                </span>
                <span className="iei-tm-yr">{x.year}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="iei-sr" role="status" aria-live="polite">
        {said}
      </p>
    </div>
  );
}
