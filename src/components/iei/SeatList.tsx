import { fillFor } from '../../../packages/mandate/src/viz/party-ink.ts';
import { gaps, marginSaid } from '../../../packages/mandate/src/repo/seat-list.ts';
import type { ListHeading, RowFacts } from '../../../packages/mandate/src/repo/seat-list.ts';

/**
 * The parts of the seat list beside a map that the state page and the election page share, so that what a row says of a
 * figure it does not have is written once. The wording and its rules are the package's (repo/seat-list.ts); this is the
 * markup.
 */

/**
 * Two decimals, because the closest seats are decided by hundredths of a point, and a real-but-small value never rounds away to
 * nothing: below the smallest two decimals can say it is printed as that bound.
 */
function pct(v: number): string {
  if (v !== 0 && Number(v.toFixed(2)) === 0) return '<0.01%';
  return `${v.toFixed(2)}%`;
}

/**
 * WHAT THE LIST IS AND HOW MUCH OF IT IS SHOWN, as a heading. A hairline and a step of space above it set it apart from
 * the district chooser or the legend before it, which used to run straight into the first seat.
 */
export function ListHead({ head, said }: { head: ListHeading; said?: string | null }) {
  return (
    <>
      <div className="iei-list-head">
        <h3 className="iei-list-title">{head.title}</h3>
        <p className="iei-list-count">{head.count}</p>
      </div>
      {head.note === null ? null : <p className="iei-absent">{head.note}</p>}
      {said === undefined || said === null ? null : <p className="iei-note iei-list-said">{said}</p>}
    </>
  );
}

/**
 * The right-hand figure of a row: the margin in votes, or the words for its absence. An absence is words and never a bare
 * dash, because a dash beside other numbers reads as zero.
 */
export function RowMargin({ seat }: { seat: RowFacts }) {
  const said = marginSaid(seat);
  return <b>{said ?? <span className="iei-absent">{gaps(seat).margin}</span>}</b>;
}

/**
 * Who won, over whom, by how much of the votes polled: what is known of a contest, and for each thing that is not, the
 * words for it. The page appends whatever else it knows of the seat.
 */
export function RowContest({
  seat,
  quiet,
}: {
  seat: RowFacts & { partyKey: string | null; runnerUpKey: string | null };
  /** Gaps the list says once above its rows (see sharedGaps); a row then leaves them out. */
  quiet?: { runnerUp: boolean; share: boolean };
}) {
  const gap = gaps(seat);
  return (
    <>
      <span className="iei-mark">
        <span className="iei-sw" style={{ background: fillFor(seat.partyKey ?? '') }} aria-hidden="true" />
        {seat.partyLabel ?? 'no winner recorded'}
      </span>
      {seat.runnerUpLabel === null ? null : (
        <>
          {' over '}
          <span className="iei-mark">
            <span className="iei-sw" style={{ background: fillFor(seat.runnerUpKey ?? '') }} aria-hidden="true" />
            {seat.runnerUpLabel}
          </span>
        </>
      )}
      {gap.runnerUp === null || quiet?.runnerUp === true ? null : (
        <>
          {' · '}
          <span className="iei-absent">{gap.runnerUp}</span>
        </>
      )}
      {quiet?.share === true && seat.marginPct === null ? null : seat.marginPct !== null ? (
        <>
          {' · '}
          {pct(seat.marginPct)}
        </>
      ) : gap.share === null ? null : (
        <>
          {' · '}
          <span className="iei-absent">{gap.share}</span>
        </>
      )}
    </>
  );
}
