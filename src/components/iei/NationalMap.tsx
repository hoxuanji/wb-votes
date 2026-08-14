import Link from 'next/link';
import { INDIA_SHAPES } from '../../lib/india-geo.ts';
import { fillFor, NOT_HELD } from '../../../packages/mandate/src/viz/party-ink.ts';
import type { NationalMapView, NationalSeat } from '../../../packages/mandate/src/repo/national-map.ts';

/**
 * The national electoral map: one polygon per parliamentary constituency, coloured by who won it.
 *
 * THIS IS THE CLAIM THE PRODUCT DID NOT MAKE. `IndiaMap` colours a state by its GOVERNMENT — one figure for
 * a whole state, and explicitly not a statement about any area inside it. That layer is still right for the
 * question it answers. This one answers the other question, the one a reader actually arrives with: who won
 * each seat. 492 of 543 polygons, in the same projection as the state borders drawn under them.
 *
 * ── WHY PARLIAMENTARY AND NOT ASSEMBLY ──
 *
 * The registry holds 3,936 assembly outlines for the current delimitation too, and drawing those nationally
 * was tried first. Measured: 4,071 KB of path text, and about 2 px per constituency on a 1,000 px frame.
 * At two pixels a polygon is not something a reader can point at, hover, compare or navigate to, and this
 * codebase already deleted 726 district hairlines from the national map for exactly that reason. A
 * parliamentary seat is about 9 px, which is a target. Assembly detail lives one level down, where
 * `StateMap` already draws all 224 of Karnataka's.
 *
 * ── SERVER-RENDERED SVG, NO CLIENT JAVASCRIPT ──
 *
 * Every seat is an `<a>`, so the map is keyboard-navigable and works in a text browser. Party isolation is
 * URL state, so a filtered map is shareable and costs nothing to hydrate. The hover card is a native
 * `<title>`, which a mouse and a screen reader both read.
 *
 * ── WHAT IS DRAWN, IN ORDER ──
 *
 *   1. STATE FILLS in the canvas colour — a backdrop, so a seat with no polygon leaves a hole that reads as
 *      part of the country rather than as empty space.
 *   2. CONSTITUENCY FILLS by winning party.
 *   3. STATE BORDERS on top, so the country is legible through 492 small polygons.
 *
 * No per-seat labels. 492 abbreviations at 9 px is the wall of text the brief forbids; colour is never the
 * only channel because every polygon carries its full result in a hover card and in the linked list beside
 * it.
 */

/** The frame's proportions, so the figure claims exactly the width its shape needs. */
function aspectOf(viewBox: string): number {
  const [, , w, h] = viewBox.split(' ').map(Number) as [number, number, number, number];
  return h > 0 ? w / h : 1;
}

const IN = new Intl.NumberFormat('en-IN');

/** One decimal, and a real-but-small value never rounds to zero. */
function pct(v: number | null): string {
  if (v === null) return 'not reported';
  if (v !== 0 && Number(v.toFixed(1)) === 0) return '<0.1%';
  return `${v.toFixed(1)}%`;
}

/**
 * The hover card, as a multi-line `<title>`.
 *
 * Carries the runner-up, which is the half of every margin no surface in this product has ever shown —
 * `result.margin` exists for winners only, but rank-2 vote counts exist for 542 of these 543 seats.
 */
function card(s: NationalSeat): string {
  const lines = [`${s.name.toUpperCase()}${s.number === null ? '' : ` · ${s.number}`}`];
  if (s.jurisdictionName !== null) lines.push(s.jurisdictionName);
  if (s.partyLabel === null) {
    lines.push('no winner recorded');
  } else {
    lines.push(`${s.partyLabel}${s.winnerName === null ? '' : ` — ${s.winnerName}`}`);
    if (s.runnerUpLabel !== null) {
      lines.push(`over ${s.runnerUpLabel}${s.runnerUpName === null ? '' : ` — ${s.runnerUpName}`}`);
    }
    if (s.marginVotes !== null) {
      lines.push(`margin ${IN.format(s.marginVotes)} votes · ${pct(s.marginPct)} of votes polled`);
    }
    if (s.turnoutPct !== null) lines.push(`turnout ${pct(s.turnoutPct)}`);
  }
  return lines.join('\n');
}

export function NationalMap({
  view,
  /** A party key whose polygons stay saturated while the rest mute. Null highlights nothing. */
  highlight = null,
}: {
  view: NationalMapView;
  highlight?: string | null;
}) {
  const { viewBox } = view.geometry;
  const aspect = aspectOf(viewBox);
  const drawable = view.seats.filter((s) => s.path !== null);

  return (
    <div className="iei-map-col" style={{ ['--iei-map-w' as string]: `calc(var(--iei-map-h) * ${aspect.toFixed(3)})` }}>
      <figure className="iei-map iei-map-national">
        <svg
          viewBox={viewBox}
          role="img"
          aria-label={`India, ${view.election?.name ?? 'no election'}. ${drawable.length} of ${
            view.seats.length
          } parliamentary constituencies drawn, coloured by winning party.`}
          style={{ aspectRatio: aspect }}
        >
          {/* 1 — the country as a backdrop, so an undrawable seat is a gap in India rather than in nothing. */}
          <g className="iei-map-canvas" aria-hidden="true">
            {INDIA_SHAPES.map((s) => (
              <path key={s.name} d={s.path} fill={NOT_HELD} />
            ))}
          </g>

          {/* 2 — the seats. Each one a link, each one carrying its whole result in a native title. */}
          <g className="iei-map-fills">
            {drawable.map((s) => {
              const muted = highlight !== null && s.partyKey !== highlight;
              const shape = (
                <path
                  d={s.path as string}
                  fill={s.partyKey === null ? NOT_HELD : fillFor(s.partyKey)}
                  opacity={muted ? 0.2 : 1}
                >
                  <title>{card(s)}</title>
                </path>
              );
              return s.href === null ? (
                <g key={s.versionId}>{shape}</g>
              ) : (
                <Link key={s.versionId} href={s.href} aria-label={card(s)}>
                  {shape}
                </Link>
              );
            })}
          </g>

          {/* 3 — state borders last, so the country stays readable through 492 small polygons. */}
          <g className="iei-map-borders" aria-hidden="true">
            {INDIA_SHAPES.map((s) => (
              <path key={s.name} d={s.path} />
            ))}
          </g>
        </svg>

        {/* WHAT THE MAP CANNOT DRAW, AND WHY — the only caption. The epochs are named because that is the
            reason: a seat redrawn in 2022 has no polygon under the boundary it was fought on, and drawing
            it on the one it replaced would put a result somewhere it did not happen. */}
        <figcaption>
          {drawable.length === view.seats.length ? (
            <>All {view.seats.length} constituencies drawn.</>
          ) : (
            <>
              {drawable.length} of {view.seats.length} constituencies drawn — the registry holds no boundary
              for the other {view.seats.length - drawable.length}.
            </>
          )}
          {view.geometry.otherFrames === 0 ? null : (
            <> {view.geometry.otherFrames} withheld for being in another projection.</>
          )}
        </figcaption>
      </figure>
    </div>
  );
}
