import Link from 'next/link';
import { fillFor } from '../../../packages/mandate/src/viz/party-ink.ts';
import { labelWidth, placeLabels } from '../../../packages/mandate/src/viz/plot-labels.ts';
import {
  locatorCaption,
  locatorDescription,
  locatorSeatTitle,
} from '../../../packages/mandate/src/repo/seat-locator.ts';
import type { SeatLocatorView } from '../../../packages/mandate/src/repo/seat-locator.ts';

/**
 * Where a seat is: its outline among the other seats of its house in its state, in one frame.
 *
 * ── WHAT IS DRAWN, IN ORDER ──
 *
 *   1. the other seats in the void ink, each a link to its own page, so the picture is also a way to the next seat
 *   2. the seat, in the ink of the party that won it at its latest election, with a bright outline on top of its neighbours
 *   3. for a seat too small to find at this scale (most are, at the scale of a state), a ring round it
 *   4. its name, placed by `placeLabels` (the plot's own placement), with a leader line where it could not sit beside the seat
 *
 * The colour is the seat's party at its LATEST election and says so in the seat's tooltip and in the caption: colour is
 * never the only channel, and a locator that coloured a seat by an election it did not name would be a claim about a date.
 * A seat whose latest contest declared no winner has no party to be coloured by, and is drawn in the neutral ink.
 *
 * ── THE FRAME ──
 *
 * The view's frame is in the maps' units (a state is about 137 across). Everything the reader sees as TEXT or a RING is
 * drawn in a 320-unit box whose units are CSS pixels at the size the stylesheet gives it (`--iei-locator-w`), as the
 * vote-against-seat plot is, so `placeLabels` can be told a name is set at 13 units and mean it. The
 * outlines go through one `transform` into that box; every stroke is `non-scaling-stroke`, so none of them is scaled by it.
 *
 * ── KEYBOARD ──
 *
 * The neighbours are links and a state has hundreds of them, so the figure opens with a skip link to what follows it:
 * without one a keyboard user would pass a tab stop per seat to reach the lens tabs. The links do not prefetch for the
 * same reason (a seat page viewed would otherwise ask for every other seat of its state).
 */

/** The box's side in its own units. The stylesheet's `--iei-locator-w` is this number of CSS pixels. */
const SIDE = 320;
/** The name's size: `--iei-f-data`, in this frame's units. */
const FONT = 13;
/** A seat whose longer side is under twice this many units is too small to find, so it is ringed. */
const RING = 14;
/** The air between a ringed seat and its ring. */
const AIR = 7;

export function SeatLocator({ view }: { view: SeatLocatorView }) {
  const [vx, vy, vw] = view.viewBox.split(' ').map(Number) as [number, number, number, number];
  const scale = SIDE / vw;
  const { seat } = view;
  const winner = seat.latest?.winner ?? null;

  // The seat's centre and half its longer side, in box units: what the ring and the name are placed round.
  const x = ((seat.bounds.x0 + seat.bounds.x1) / 2 - vx) * scale;
  const y = ((seat.bounds.y0 + seat.bounds.y1) / 2 - vy) * scale;
  const half = (Math.max(seat.bounds.x1 - seat.bounds.x0, seat.bounds.y1 - seat.bounds.y0) / 2) * scale;
  const ringed = half < RING;
  const marker = { x, y, r: ringed ? Math.max(RING, half + AIR) : half };
  // `placeLabels` is handed the seat as an obstacle too: otherwise the cheapest place for the name is on top of it.
  const { placed } = placeLabels(
    [{ ...marker, key: 'seat', width: labelWidth(seat.name, FONT), weight: 1 }],
    [marker],
    { x0: 4, y0: 4, x1: SIDE - 4, y1: SIDE - 4 },
    16,
  );
  const name = placed[0];

  return (
    <figure className="iei-loc">
      <a className="iei-skip" href="#after-locator">
        Skip the seat locator
      </a>
      <svg
        viewBox={`0 0 ${SIDE} ${SIDE}`}
        role="group"
        aria-labelledby="iei-loc-t"
        aria-describedby="iei-loc-d"
      >
        <title id="iei-loc-t">{`Where ${seat.name} is`}</title>
        <desc id="iei-loc-d">{locatorDescription(view)}</desc>
        <g transform={`scale(${scale.toFixed(4)}) translate(${-vx} ${-vy})`}>
          <g className="iei-loc-hood">
            {view.neighbours.map((n) => (
              <Link key={n.id} href={n.href} prefetch={false}>
                <title>{n.name}</title>
                <path d={n.path} />
              </Link>
            ))}
          </g>
          <path
            d={seat.path}
            className="iei-loc-seat"
            style={winner === null ? undefined : { fill: fillFor(winner.key) }}
          >
            <title>{locatorSeatTitle(view)}</title>
          </path>
        </g>
        {ringed ? <circle cx={x} cy={y} r={marker.r} className="iei-loc-ring" aria-hidden="true" /> : null}
        {name === undefined ? null : (
          <g className="iei-loc-label" aria-hidden="true">
            {name.leader === null ? null : (
              <line x1={name.leader.x1} y1={name.leader.y1} x2={name.leader.x2} y2={name.leader.y2} />
            )}
            <text x={name.x} y={name.y} dy="0.35em" textAnchor={name.anchor}>
              {seat.name}
            </text>
          </g>
        )}
      </svg>
      <figcaption>
        {winner === null || seat.latest === null ? null : (
          <>
            <span className="iei-mark">
              <span className="iei-sw" style={{ background: fillFor(winner.key) }} aria-hidden="true" />
              {`${winner.label}, ${seat.latest.year}`}
            </span>
            {' · '}
          </>
        )}
        {locatorCaption(view)}
      </figcaption>
    </figure>
  );
}
