import type React from 'react';
import { ARC_BOX, arcLayout } from '../../../packages/mandate/src/viz/arc-layout.ts';
import type { ArcDot } from '../../../packages/mandate/src/viz/arc-layout.ts';
import { houseArc } from '../../../packages/mandate/src/repo/house-arc.ts';
import type { HouseArc } from '../../../packages/mandate/src/repo/house-arc.ts';
import type { MapSelection } from '../../../packages/mandate/src/repo/map-selection.ts';
import { fillFor, NOT_HELD } from '../../../packages/mandate/src/viz/party-ink.ts';
import { Panel, Table } from './parts.tsx';

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
 * Those links are for the pointer: the dots are hidden from assistive technology and out of the tab order, because the key beside
 * them carries the same links as real list items, and the table twin carries every number. Colour is never the only channel: the
 * key prints the party's code beside every swatch.
 *
 * The dots are in the party's ink (its KEY, as on the maps), so a party is the same colour here as there. Nothing else is coloured.
 */

const IN = new Intl.NumberFormat('en-IN');
/** How many parties the key names before the rest are counted together. The table twin lists every one. */
const KEY_LIMIT = 8;

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
  const named = arc.parties.slice(0, KEY_LIMIT);
  const folded = arc.parties.slice(KEY_LIMIT);

  const summary =
    `Seats by party: ${arc.parties.map((p) => `${p.label} ${p.n}`).join(', ')}` +
    `${arc.undeclared === 0 ? '' : `, ${arc.undeclared} with no declared winner`}. ${arc.total} seats${
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

        <figcaption className="iei-note iei-arc-cap">
          {delegation === null ? 'Every seat of the house' : `Every seat in ${delegation}`}, one dot each, in the party that won it.
          Ordered by seats, largest first: the order does not mean left or right, or who would govern together.
        </figcaption>
      </figure>

      <div className="iei-arc-side">
        <ul className="iei-arc-key">
          {named.map((p) => (
            <li key={p.key}>
              <a href={hrefFor(p.key)} aria-current={selected === p.key ? 'true' : undefined}>
                <span className="iei-sw" style={{ background: fillFor(p.key) }} aria-hidden="true" />
                <span className="iei-chip">{p.label}</span> <b>{IN.format(p.n)}</b>
              </a>
            </li>
          ))}
          {folded.length === 0 ? null : (
            <li className="iei-arc-rest">
              + {IN.format(folded.length)} smaller {folded.length === 1 ? 'party' : 'parties'} ·{' '}
              {IN.format(folded.reduce((n, p) => n + p.n, 0))} seats
            </li>
          )}
          {arc.undeclared === 0 ? null : (
            <li className="iei-arc-rest">
              <span className="iei-sw iei-sw-hollow" aria-hidden="true" />
              no declared winner <b>{IN.format(arc.undeclared)}</b>
            </li>
          )}
        </ul>

        <details className="iei-arc-table">
          <summary>Seats by party, as a table</summary>
          <Table
            label="Seats by party"
            tight
            head={
              <>
                <th scope="col">Party</th>
                <th scope="col" className="iei-n">
                  Seats
                </th>
                <th scope="col" className="iei-n">
                  {delegation === null ? 'Of the house' : 'Of these seats'}
                </th>
              </>
            }
          >
            {[
              ...arc.parties.map((p) => ({ key: p.key, name: p.label, n: p.n })),
              ...(arc.undeclared === 0 ? [] : [{ key: '', name: 'No declared winner', n: arc.undeclared }]),
            ].map((r) => (
              <tr key={r.key || 'none'}>
                <th scope="row">{r.name}</th>
                <td className="iei-n">{IN.format(r.n)}</td>
                <td className="iei-n">{((100 * r.n) / arc.total).toFixed(1)}%</td>
              </tr>
            ))}
          </Table>
        </details>
      </div>
    </div>
  );
}

/**
 * The panel a map page carries under its map: the whole house, whatever the reader has narrowed the list to, or nothing where the
 * election decides no house (a by-election has no majority to be short of).
 *
 * On the runner-up tab a party in the selection is the RUNNER-UP, and a wedge is a winner, so there the arc shows nothing as
 * selected and a wedge's link switches to the winners as it isolates, instead of answering a question nobody asked.
 *
 * A STATE'S SEATS IN A BIGGER HOUSE (the Lok Sabha election narrowed to one state) are a delegation, not the house: the panel is
 * named for the state, says nothing of a majority, and the arc has none. `delegation` is the state's name in that case, else null.
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
      title={delegation === null ? 'The house' : `${delegation}\u2019s seats`}
      question={delegation === null ? 'Who holds the house, and how far is it from a majority?' : `Which parties won ${delegation}\u2019s seats?`}
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
