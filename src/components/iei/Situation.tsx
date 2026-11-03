import Link from 'next/link';
import { INDIA_SHAPES, INDIA_VIEWBOX } from '../../lib/india-geo.ts';
import { electionHref, stateHref } from '../../../packages/mandate/src/repo/routes.ts';
import type { Frame } from '../../../packages/mandate/src/repo/landscape-frames.ts';
import type { NextUp } from '../../../packages/mandate/src/repo/situation-types.ts';

/**
 * The server's half of the front page's new panels: the map the time machine recolours, and the cards for the elections that come next.
 * Nothing here holds a list of states: both are drawn from what the registry gave the page.
 */

const [, , FRAME_W, FRAME_H] = INDIA_VIEWBOX.split(' ').map(Number) as [number, number, number, number];

/**
 * The map of India for the time machine: every state a link to its page, filled from one frame, with a `data-state` the client moves between
 * frames by. It is a plain figure and not the layered map of the Landscape panel: there are no labels (a label that has to change with the year
 * is a second thing to keep honest), and its job is the change of colour, not the reading of a layer.
 *
 * The fill is set as a style, not an attribute, so the CSS transition on it can run when the client changes it.
 */
export function LandscapeMap({ states, initial }: { states: readonly { id: string; name: string }[]; initial: Frame }) {
  const byName = new Map(states.map((s) => [s.name.toLowerCase(), s]));
  return (
    <figure className="iei-map iei-tm-fig">
      <svg viewBox={INDIA_VIEWBOX} role="img" aria-label={`India, by who led each state's government in ${initial.year}`} style={{ aspectRatio: `${FRAME_W} / ${FRAME_H}` }}>
        <defs>
          {/* A state whose parties are level for most seats: a hatch, so "level" is a shape and not a colour. */}
          <pattern id="iei-tm-level" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#1d1b26" />
            <rect width="2.2" height="6" fill="#8b8ba2" />
          </pattern>
          {/* EACH OUTLINE IS WRITTEN ONCE. The geometry is the heaviest thing on the page (about 60 kB a copy), and this map used to carry two: a fill
              layer and a border layer. Here the outlines are defined once and drawn by reference, with the border as a stroke on the fill, so the page
              pays for one copy of this map and not two. A shape with no fill of its own takes the fill of the element that uses it, which is what lets
              the client change a state's colour by setting a style on the `<use>`. */}
          {INDIA_SHAPES.map((sh, i) => (
            <path key={sh.name} id={`iei-tm-sh-${i}`} d={sh.path} />
          ))}
        </defs>
        <g className="iei-map-fills">
          {INDIA_SHAPES.map(({ name }, i) => {
            const s = byName.get(name.toLowerCase());
            if (s === undefined) {
              return (
                <use key={name} href={`#iei-tm-sh-${i}`} className="iei-map-off">
                  <title>{`${name} — not in the jurisdiction table`}</title>
                </use>
              );
            }
            return (
              <Link key={name} href={stateHref(s.id)} aria-label={initial.titles[s.id]?.replace(/\n/g, ', ') ?? s.name}>
                <use href={`#iei-tm-sh-${i}`} data-state={s.id} style={{ fill: initial.fills[s.id] }}>
                  <title>{initial.titles[s.id] ?? s.name}</title>
                </use>
              </Link>
            );
          })}
        </g>
      </svg>
    </figure>
  );
}

/** "4.6 of 5 years", for a term as far through as `elapsed` says. Words and a number, so the bar is never the only carrier. */
const termWords = (elapsed: number): string => `${elapsed * 5 >= 10 ? '10+' : (elapsed * 5).toFixed(1)} of 5 years`;

/**
 * The elections that come next, soonest first, as cards in one row that wraps.
 *
 * AN ANNOUNCED DATE IS ITSELF; AN INFERRED ONE IS "EXPECTED" AND SAYS HOW. The Commission's schedule is not in the registry yet, so today every card is the
 * second kind: a five-year term counted from the last election. The card says "Expected 2026", prints the term bar with its words ("4.6 of 5 years"), and
 * names the election the count starts from. A card past its term (a bar beyond full) says so in words and is drawn full with a marker, not extended.
 * The bar grows once on arrival (CSS, off under reduced motion).
 */
export function NextUpRail({ items, shown = 8 }: { items: readonly NextUp[]; shown?: number }) {
  const lead = items.slice(0, shown);
  const rest = items.slice(shown);
  const card = (n: NextUp, i: number) => {
    const over = n.termElapsed !== null && n.termElapsed > 1;
    return (
      <li key={`${n.jurisdictionId}-${n.bodyWord}-${n.year}`} className="iei-next-i" style={{ ['--i' as string]: i }}>
        {/* The Lok Sabha belongs to the union, which has no state page: its card goes to the general election it follows. */}
        <Link href={n.jurisdictionId === 'in' ? electionHref(n.after.electionId) : stateHref(n.jurisdictionId)}>
          {/* `on` is the day the Commission ANNOUNCED the election, which is not the day people vote: so an announced card says "Announced" and the year it is for, and
              prints the announcement's own date in the line below, never as the date of the poll. */}
          <span className="iei-next-when">{n.basis === 'announced' ? `Announced for ${n.year}` : `Expected ${n.year}`}</span>
          <b className="iei-next-name">{n.jurisdictionName}</b>
          <span className="iei-rule">
            {n.bodyWord} · {n.seats} seats
          </span>
          {n.termElapsed === null ? null : (
            <span className="iei-next-term" role="img" aria-label={`Term ${termWords(n.termElapsed)}${over ? ', past its end' : ''}`}>
              <span className="iei-next-fill" data-over={over ? 'true' : undefined} style={{ ['--p' as string]: Math.min(1, n.termElapsed).toFixed(3) }} />
            </span>
          )}
          <span className="iei-next-after">
            {n.termElapsed === null ? null : <>{termWords(n.termElapsed)}{over ? ' · past its end' : ''} · </>}
            {n.basis === 'announced' && n.on !== null ? <>announced {n.on} · </> : null}
            after {n.after.year}
            {n.after.leaderLabel === null ? '' : `: ${n.after.leaderLabel} led`}
          </span>
        </Link>
      </li>
    );
  };
  return (
    <>
      <ol className="iei-next" aria-label="Elections that come next, soonest first">
        {lead.map(card)}
      </ol>
      {rest.length === 0 ? null : (
        <details className="iei-twin iei-next-more">
          <summary>{rest.length} more</summary>
          <ol className="iei-next">{rest.map((n, i) => card(n, i))}</ol>
        </details>
      )}
    </>
  );
}
