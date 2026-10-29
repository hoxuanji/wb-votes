import { inr } from '../../../packages/mandate/src/repo/brief.ts';
import { fillFor } from '../../../packages/mandate/src/viz/party-ink.ts';
import { heldCaption, segmentLabel, shareText } from '../../../packages/mandate/src/repo/seat-history.ts';
import type { ResultBar, SeatHistory } from '../../../packages/mandate/src/repo/seat-history.ts';

/**
 * A seat's history, drawn from `seatHistory` (repo/seat-history.ts): the strip of who held it, and a bar per election.
 *
 * ── THE STRIP ──
 *
 * One block per election, oldest first, filled with the ink of the party that won it, with the year and the party printed
 * under it: the ink is never the only channel. Blocks of one party touch, so a seat held throughout is one unbroken run; where
 * the seat changed hands a gap opens and a rule is drawn in it, in the interface's own ink (hue is the party's, not the
 * mark's). An election with no declared winner is a dashed outline with no ink, because it belongs to no party.
 *
 * ── THE BARS ──
 *
 * A bar is the votes polled in one election. Each segment is one candidate's share of them, in the ink of that candidate's
 * party; the exception is the tail, since past six candidates the lowest are added together as "Others (n)" in a hatch, which
 * is no party's ink. What no segment accounts for is left as the track, and the key says "not itemised" beside it. A segment's
 * width is its share (flex-grow, so the 2px gaps between segments take nothing from the proportions). The key under the bar is
 * the text that names every segment and prints its share; the bar itself is for the eye and is hidden from a screen reader so
 * that nothing is read twice.
 *
 * An election with no candidate counts has no bar at all, not an empty one: its row says in words that the shares are not on
 * record. The election table under all of this is the exact form of the same numbers.
 */

export function HeldBy({ history }: { history: SeatHistory }) {
  const { held } = history;
  if (held.length === 0) return null;
  const marks = history.handOffs > 0 || history.undeclared > 0;
  return (
    <figure className="iei-held">
      <figcaption className="iei-held-h">
        <b>Held by</b> {heldCaption(history)}
      </figcaption>
      <ol className="iei-held-run">
        {held.map((b, i) => {
          const before = held[i - 1]?.party ?? null;
          const after = held[i + 1]?.party ?? null;
          // The ends of a run are rounded and its joins are flush: a notch between two blocks of one party would break it.
          const starts = b.party === null || before?.key !== b.party.key;
          const ends = b.party === null || after?.key !== b.party.key;
          return (
            <li
              key={b.contestId}
              className={[
                'iei-held-b',
                b.changedHands ? 'iei-held-hand' : '',
                starts ? 'iei-held-s' : '',
                ends ? 'iei-held-e' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ '--i': i } as React.CSSProperties}
              title={
                b.party === null
                  ? `${b.label}: no winner declared`
                  : `${b.label}: won by ${b.party.label}${b.winner === null ? '' : ` (${b.winner})`}${
                      b.changedHands ? ', and the seat changed hands' : ''
                    }`
              }
            >
              <span
                className={b.party === null ? 'iei-held-ink iei-held-none' : 'iei-held-ink'}
                style={b.party === null ? undefined : { background: fillFor(b.party.key) }}
                aria-hidden="true"
              />
              <a className="iei-held-a" href={`#ep-${b.year}`}>
                <span className="iei-held-yr">
                  {b.year}
                  {b.byPoll ? (
                    <>
                      {' '}
                      <span className="iei-poll">by-poll</span>
                    </>
                  ) : null}
                </span>
              </a>
              {b.party === null ? (
                <span className="iei-held-p iei-absent">no result declared</span>
              ) : (
                <span className="iei-held-p">{b.party.label}</span>
              )}
              {b.changedHands ? <span className="iei-sr">, the seat changed hands</span> : null}
            </li>
          );
        })}
      </ol>
      {marks ? (
        <p className="iei-held-key">
          {history.handOffs > 0 ? 'A rule between two blocks is where the seat changed hands. ' : ''}
          {history.undeclared > 0 ? 'A dashed block is an election with no declared winner.' : ''}
        </p>
      ) : null}
    </figure>
  );
}

function Key({ bar }: { bar: ResultBar }) {
  return (
    <ul className="iei-res-key">
      {bar.segments.map((s) => (
        <li
          key={s.party === null ? 'others' : `${s.party.key}:${s.name}`}
          className={s.winner ? 'iei-res-win' : undefined}
          title={`${s.name ?? segmentLabel(s)}${s.votes === null ? '' : `, ${inr(s.votes)} votes`}`}
        >
          <span
            className={s.party === null ? 'iei-sw iei-sw-others' : 'iei-sw'}
            style={s.party === null ? undefined : { background: fillFor(s.party.key) }}
            aria-hidden="true"
          />
          <span className="iei-chip">{segmentLabel(s)}</span> <b>{shareText(s.share)}%</b>
        </li>
      ))}
      {bar.unitemised > 0 ? (
        <li>
          <span className="iei-sw iei-sw-rest" aria-hidden="true" />
          <span className="iei-chip">not itemised</span> <b>{shareText(bar.unitemised)}%</b>
        </li>
      ) : null}
    </ul>
  );
}

export function ResultBars({ history }: { history: SeatHistory }) {
  const { results } = history;
  if (results.length === 0) return null;
  const drawn = results.some((r) => r.bar !== null);
  return (
    <div className="iei-res">
      {drawn ? (
        <p className="iei-note iei-res-how">
          Each bar is the votes polled in that election. A coloured segment is one candidate&rsquo;s share of them, in the colour
          of that candidate&rsquo;s party; the unfilled part is votes the registry does not itemise by candidate.
        </p>
      ) : null}
      <ol className="iei-res-list" aria-label="Result of each election">
        {results.map((r) => (
          <li key={r.contestId} className="iei-res-row">
            <span className="iei-res-yr">
              {r.year}
              {r.byPoll ? (
                <>
                  {' '}
                  <span className="iei-poll">by-poll</span>
                </>
              ) : null}
            </span>
            <p className="iei-res-say">{r.statement}</p>
            <div className="iei-res-main">
              {r.bar === null ? null : (
                <>
                  <div className="iei-res-bar" aria-hidden="true">
                    {r.bar.segments.map((s) => (
                      <span
                        key={s.party === null ? 'others' : `${s.party.key}:${s.name}`}
                        className={s.party === null ? 'iei-res-seg iei-res-others' : 'iei-res-seg'}
                        style={{ flexGrow: s.share, background: s.party === null ? undefined : fillFor(s.party.key) }}
                      />
                    ))}
                    {r.bar.unitemised > 0 ? <span className="iei-res-rest" style={{ flexGrow: r.bar.unitemised }} /> : null}
                  </div>
                  <Key bar={r.bar} />
                </>
              )}
              {r.note === null ? null : <p className="iei-note iei-res-note">{r.note}</p>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
