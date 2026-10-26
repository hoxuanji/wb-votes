import { FLOW_H, OTHERS, flowLayout } from '../../../packages/mandate/src/viz/flow-layout.ts';
import type { FlowNode } from '../../../packages/mandate/src/viz/flow-layout.ts';
import { leftOut } from '../../../packages/mandate/src/repo/seat-flows.ts';
import type { SeatFlows } from '../../../packages/mandate/src/repo/seat-flows.ts';
import { fillFor } from '../../../packages/mandate/src/viz/party-ink.ts';
import { Table } from './parts.tsx';

/**
 * How seats moved between parties: who held them at the previous election, on the left, who won them now, on the right, joined by
 * ribbons as thick as the seats that moved.
 *
 * ── WHAT IT SAYS THAT THE TALLY DOES NOT ──
 *
 * "139 changed hands" cannot say that 117 of them went from TMC to BJP. The matrix beside it lists the flips; this draws every seat
 * that can be compared, holds included, so the size of what stayed is visible beside the size of what moved. A held seat is a
 * fainter ribbon in the party's ink and a seat that changed hands a brighter one in the ink of the party that gained it.
 *
 * ── WHAT IT LEAVES OUT, AND SAYS SO ──
 *
 * A seat can only be compared with itself. One redrawn since the previous election has no predecessor and one with no declared
 * winner at either election has no pair, so neither is a ribbon. The sentence under the picture counts them and says why; it never
 * says "all". Nothing is drawn for a seat that is not on record.
 *
 * ── HOW IT IS DRAWN ──
 *
 * The geometry is `flowLayout` (viz/flow-layout.ts), measured in a column FLOW_H units tall. The boxes and their names are HTML, so
 * the type keeps its size on a phone, and only the ribbons are SVG, stretched between the two columns. A name is printed only for a
 * box tall enough to carry one; the key names every party drawn. The picture is for the eye and is hidden from assistive technology:
 * the sentence, the key and the table carry the same numbers.
 */

const IN = new Intl.NumberFormat('en-IN');

const seatsWord = (n: number): string => (n === 1 ? 'seat' : 'seats');
const pct = (units: number): string => (Math.round((units / FLOW_H) * 100000) / 1000).toString();

function Column({ nodes, side }: { nodes: readonly FlowNode[]; side: 'from' | 'to' }) {
  return (
    <ol className={`iei-flow-col iei-flow-${side}`} aria-hidden="true">
      {nodes.map((n) => (
        <li key={n.key || 'others'} data-party={n.key} data-seats={n.seats} style={{ top: `${pct(n.y0)}%`, height: `${pct(n.y1 - n.y0)}%` }}>
          <i className={n.key === OTHERS ? 'iei-res-others' : undefined} style={n.key === OTHERS ? undefined : { background: fillFor(n.key) }} />
          {!n.named ? null : (
            <span>
              {n.label} <b>{IN.format(n.seats)}</b>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

export function SeatFlow({
  flows,
  previousYear,
  year,
}: {
  flows: SeatFlows;
  /** The year of the election the seats are compared with, or null where the page does not know it. */
  previousYear: number | null;
  year: number;
}) {
  if (flows.flows.length === 0) return null;
  const labels = new Map(flows.parties.map((p) => [p.key, p.label]));
  const layout = flowLayout(flows.flows, (k) => labels.get(k) ?? k);
  const from = new Map(layout.from.map((n) => [n.key, n.label]));
  const to = new Map(layout.to.map((n) => [n.key, n.label]));
  const before = previousYear === null ? 'the previous election' : String(previousYear);
  const total = flows.compared + flows.left.incomparable + flows.left.undeclared;
  const drawn = [...new Set([...layout.from, ...layout.to].map((n) => n.key))].filter((k) => k !== OTHERS);
  const folded = [...layout.from, ...layout.to].some((n) => n.key === OTHERS);

  return (
    <div className="iei-flow-wrap">
      <figure className="iei-flow">
        <div className="iei-flow-heads">
          <span>Held in {before}</span>
          <span>Won in {year}</span>
        </div>
        <div className="iei-flow-stage">
          <Column nodes={layout.from} side="from" />
          <svg className="iei-flow-ribbons" viewBox={`0 0 100 ${FLOW_H}`} preserveAspectRatio="none" aria-hidden="true">
            {layout.ribbons.map((r) => (
              <path
                key={`${r.from}>${r.to}`}
                className={`iei-flow-${r.movement}`}
                style={{ fill: r.movement === 'mixed' || r.to === OTHERS ? 'var(--iei-ink-3)' : fillFor(r.to) }}
                d={r.path}
              >
                <title>
                  {`${from.get(r.from) ?? r.from} → ${to.get(r.to) ?? r.to} · ${IN.format(r.n)} ${seatsWord(r.n)}, ${
                    r.movement === 'held' ? 'held' : r.movement === 'moved' ? 'changed hands' : 'held or changed hands'
                  }`}
                </title>
              </path>
            ))}
          </svg>
          <Column nodes={layout.to} side="to" />
        </div>
        <figcaption className="iei-note iei-flow-cap">
          {IN.format(flows.compared)} of {IN.format(total)} seats are in the picture, compared with {before}. {leftOut(flows.left)}{' '}
          A brighter ribbon is seats that changed hands, in the colour of the party that gained them; a fainter one is seats held.
          {layout.to.some((n) => n.key === OTHERS) ? ' Grey ribbons go to the smaller parties together.' : null}
        </figcaption>
      </figure>

      <ul className="iei-flow-key">
        {drawn.map((k) => (
          <li key={k}>
            <span className="iei-sw" style={{ background: fillFor(k) }} aria-hidden="true" />
            <span className="iei-chip">{labels.get(k) ?? k}</span>
          </li>
        ))}
        {!folded ? null : (
          <li>
            <span className="iei-sw iei-sw-others" aria-hidden="true" />
            <span className="iei-chip">smaller parties together</span>
          </li>
        )}
      </ul>

      <details className="iei-flow-table">
        <summary>Seats that moved, as a table</summary>
        <Table
          label="Seats by previous holder and winner"
          tight
          head={
            <>
              <th scope="col">Held in {before}</th>
              <th scope="col">Won in {year}</th>
              <th scope="col" className="iei-n">
                Seats
              </th>
              <th scope="col">Result</th>
            </>
          }
        >
          {flows.flows.map((f) => (
            <tr key={`${f.from}>${f.to}`}>
              <th scope="row">{labels.get(f.from) ?? f.from}</th>
              <td>{labels.get(f.to) ?? f.to}</td>
              <td className="iei-n">{IN.format(f.n)}</td>
              <td>{f.from === f.to ? 'Held' : 'Changed hands'}</td>
            </tr>
          ))}
        </Table>
      </details>
    </div>
  );
}
