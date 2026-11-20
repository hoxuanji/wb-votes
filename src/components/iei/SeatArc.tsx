import type React from 'react';
import { ARC_BOX, arcLayout } from '../../../packages/mandate/src/viz/arc-layout.ts';
import type { ArcDot } from '../../../packages/mandate/src/viz/arc-layout.ts';
import { houseArc } from '../../../packages/mandate/src/repo/house-arc.ts';
import type { HouseArc } from '../../../packages/mandate/src/repo/house-arc.ts';
import type { MapSelection } from '../../../packages/mandate/src/repo/map-selection.ts';
import { fillFor, NOT_HELD } from '../../../packages/mandate/src/viz/party-ink.ts';
import { Panel } from './parts.tsx';

/**
 * The house as a parliament arc: one dot per seat, in the party that won it, on a half ring.
 *
 * ── WHAT IT IS FOR ──
 *
 * The map answers "where"; this answers "how many, and how near a majority". It is the picture a legislature is read by, and
 * it is drawn from the same seats the map is (`houseArc`, repo/house-arc.ts), so the two cannot disagree. A seat with no declared
 * winner is a hollow dot, because it is a seat that exists and was not counted for anyone.
 *
 * ── WHAT THE ORDER MEANS: NOTHING POLITICAL ──
 *
 * Wedges run largest party first from the left. The registry holds no left-to-right or alliance data, so an order that looked
 * like one would be invented; the caption says so.
 *
 * ── HOW IT IS READ ──
 *
 * A wedge links to the party isolation the page already has (the map and the list narrow to that party; the other wedges dim).
 * Those links are for the pointer: the dots are hidden from assistive technology and out of the tab order. The page's own key beside its map
 * (the legend of parties, with the same links and the same counts) is the keyboard's way to them, and the ring's name lists every count in
 * words, so the arc carries neither a second key nor a table of the same numbers. Colour is never the only channel: the key prints each party's code.
 *
 * The dots are in the party's ink (its KEY, as on the maps), so a party is the same colour here as there. Nothing else is coloured.
 */

const IN = new Intl.NumberFormat('en-IN');
function Dots({ dots }: { dots: readonly ArcDot[] }) {
  return (
    <>
      {dots.map((d, i) => (
        <circle key={i} cx={d.x.toFixed(1)} cy={d.y.toFixed(1)} r={d.r.toFixed(1)} />
      ))}
    </>
  );
}

export function SeatArc({
  arc,
  selected,
  hrefFor,
  delegation = null,
}: {
  arc: HouseArc;
  /** The name of the state whose seats these are, where they are part of a bigger house: then there is no majority to state. */
  delegation?: string | null;
  /** The party the reader has isolated, or null. The others are dimmed. */
  selected: string | null;
  /** The page's own link for a party. The selection toggles, so the link for the selected party releases it. */
  hrefFor: (partyKey: string) => string;
}) {
  const dots = arcLayout(arc.total);
  let from = 0;
  const wedges = arc.parties.map((party) => {
    const slice = dots.slice(from, from + party.n);
    from += party.n;
    return { party, slice };
  });
  const hollow = dots.slice(from);
  const lead = arc.leader;

  const summary =
    `Seats by party: ${arc.parties.map((p) => `${p.label} ${p.n}`).join(', ')}` +
    `${arc.undeclared === 0 ? '' : `, ${arc.undeclared} with no declared winner`}. ${arc.total} seat${arc.total === 1 ? '' : 's'}${
      arc.majority === null ? '' : `, majority ${arc.majority}`
    }.`;

  return (
    <div className="iei-arc-wrap">
      <figure className="iei-arc" data-selected={selected === null ? undefined : 'true'}>
        <div className="iei-arc-stage">
        <svg className="iei-arc-svg" viewBox={`0 0 ${ARC_BOX.w} ${ARC_BOX.h}`} role="img" aria-label={summary}>
          {wedges.map(({ party, slice }, i) => (
            <a key={party.key} href={hrefFor(party.key)} tabIndex={-1} aria-hidden="true">
              <title>{`${party.label} · ${IN.format(party.n)} of ${IN.format(arc.total)} seats`}</title>
              <g
                className="iei-arc-p"
                data-party={party.key}
                fill={fillFor(party.key)}
                data-dim={selected !== null && selected !== party.key ? 'true' : undefined}
                style={{ '--i': i } as React.CSSProperties}
              >
                <Dots dots={slice} />
              </g>
            </a>
          ))}
          {hollow.length === 0 ? null : (
            <g className="iei-arc-none" fill={NOT_HELD} data-dim={selected === null ? undefined : 'true'}>
              <title>{`${IN.format(hollow.length)} ${hollow.length === 1 ? 'seat' : 'seats'} with no declared winner`}</title>
              <Dots dots={hollow} />
            </g>
          )}
        </svg>

        {/* At the centre of the ring, in HTML so it keeps its size when the ring scales down to a phone (where it drops under
            the ring instead, because the ring's hollow is then smaller than the number). */}
        <div className="iei-arc-centre">
          {lead === null ? null : (
            <>
              <span className="iei-arc-lead">
                <span className="iei-sw" style={{ background: fillFor(lead.key) }} aria-hidden="true" />
                {lead.label}
              </span>
              <span className="iei-arc-n">
                <b>{IN.format(lead.n)}</b> <span className="iei-of">of {IN.format(arc.total)}</span>
              </span>
            </>
          )}
        </div>
        </div>

        {arc.majority === null ? null : (
          <p className="iei-arc-maj">
            majority {IN.format(arc.majority)}
            {lead === null
              ? ' · no seat has a declared winner'
              : arc.shortBy === null
                ? ` · ${lead.label} has it`
                : ` · short by ${IN.format(arc.shortBy)}`}
          </p>
        )}

        {/* WHAT A HOLLOW DOT IS, without its count: the page's own key beside the map says "no declared winner N", and the ring's name has every count. */}
        {arc.undeclared === 0 ? null : <p className="iei-note iei-arc-hollow">A hollow dot is a seat with no declared winner.</p>}

        <figcaption className="iei-sr">
          {delegation === null ? 'Every seat of the house' : `Every seat in ${delegation}`}, one dot each, in the party that won it.
        </figcaption>
      </figure>

    </div>
  );
}

/** "West Bengal's seats", and "2 states' seats" rather than "2 states's". */
const seatsOf = (name: string): string => `${name}\u2019${name.endsWith('s') ? '' : 's'} seats`;

/**
 * The panel a map page carries under its map: the whole house, whatever the reader has narrowed the list to, or nothing where the
 * election decides no house (a by-election has no majority to be short of).
 *
 * On the runner-up tab a party in the selection is the RUNNER-UP, and a wedge is a winner, so there the arc shows nothing as
 * selected and a wedge's link switches to the winners as it isolates, instead of answering a question nobody asked.
 *
 * A STATE'S SEATS IN A BIGGER HOUSE (the Lok Sabha election narrowed to one state) are a delegation, not the house: the panel is
 * named for the state, says nothing of a majority, and the arc has none. `delegation` is the state's name in that case, or how
 * many states for the Lok Sabha of which the registry holds the seats of several but not all, else null.
 */
export function HousePanel({
  seats,
  majority,
  selection,
  delegation = null,
}: {
  seats: readonly { partyKey: string | null; partyLabel: string | null }[];
  majority: number | null;
  selection: MapSelection;
  delegation?: string | null;
}) {
  const arc = houseArc(seats, majority, delegation === null ? 'house' : 'delegation');
  if (arc === null) return null;
  const runnerUp = selection.mode === 'runnerup';
  const selected = !runnerUp && selection.isolation?.by === 'party' ? selection.isolation.key : null;
  return (
    <Panel
      id="house"
      title={delegation === null ? 'The house' : seatsOf(delegation)}
      question={delegation === null ? 'Who holds the house, and how far is it from a majority?' : `Which parties won ${seatsOf(delegation)}?`}
    >
      <SeatArc
        arc={arc}
        selected={selected}
        delegation={delegation}
        hrefFor={(key) => (runnerUp ? selection.href({ mode: 'winners' }, { party: key }) : selection.href({ party: key }))}
      />
    </Panel>
  );
}
