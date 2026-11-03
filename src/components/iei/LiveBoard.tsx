'use client';

import { useEffect, useState } from 'react';
import { projectionWord } from '../../../packages/mandate/src/repo/situation-types.ts';
import type { LiveBoard as Board } from '../../../packages/mandate/src/repo/situation-types.ts';

/**
 * The live board: where an election stands as its count comes in, and what other people have published about where it is going.
 *
 * It renders from props on the server, so the page shows the last known count with script off and before hydration; after mount it polls
 * `/v1/live` every twenty seconds (and not while the tab is hidden) and swaps the numbers in without a reload. Its widths are CSS transitions, so a
 * party's bar slides to its new length rather than jumping; under reduced motion they are instant.
 *
 * WHAT IT WILL NOT DO. It computes no forecast and prints no probability. A projection is on this board only as a row with the publisher that
 * made it, the day it was published, the method that publisher gave and a link, and the board says in its own heading that these are other
 * people's numbers. The registry's rule is "nothing here is a prediction", and a live board is where that rule is easiest to break: a bar that
 * looks like the registry's own estimate would be exactly that. So the count and the projections are two panels with two headings, never
 * one chart.
 *
 * STALENESS IS SAID, NOT HIDDEN. A feed whose own timestamp is older than the freshness window is marked in words at the top, because a stale count shown as
 * live is a false statement about the world. A failed poll keeps the last board and says when it last updated.
 */

/** `fills` maps a party key to its colour, computed on the server (viz/party-ink.ts) so the client carries no palette. */
type Reply = { boards: Board[]; sentences: string[]; fills: Record<string, string> };

const POLL_MS = 20_000;

const when = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }) + ' IST';
};

const STATUS: Record<Board['status'], string> = { polling: 'Polling', counting: 'Counting', declared: 'Declared' };

export function LiveBoard({
  initial,
  sentences,
  fills: initialFills,
  endpoint,
}: {
  initial: Board[];
  sentences: string[];
  fills: Record<string, string>;
  endpoint: string;
}) {
  const [boards, setBoards] = useState<Board[]>(initial);
  const [lines, setLines] = useState<string[]>(sentences);
  const [fills, setFills] = useState<Record<string, string>>(initialFills);
  const [at, setAt] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async (): Promise<void> => {
      if (document.hidden) {
        timer = setTimeout(poll, POLL_MS);
        return;
      }
      try {
        const res = await fetch(endpoint, { cache: 'no-store', headers: { accept: 'application/json' } });
        if (!res.ok) throw new Error(`the feed answered ${res.status}`);
        const body = (await res.json()) as Reply;
        if (alive && Array.isArray(body.boards)) {
          setBoards(body.boards);
          setLines(body.sentences);
          setFills(body.fills);
          setFailed(null);
        }
      } catch (e) {
        if (alive) setFailed(`${when(new Date().toISOString())}: ${e instanceof Error ? e.message : 'the update failed'}`);
      }
      if (alive) timer = setTimeout(poll, POLL_MS);
    };
    timer = setTimeout(poll, POLL_MS);
    return () => {
      alive = false;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [endpoint]);

  const board = boards[Math.min(at, boards.length - 1)];
  if (board === undefined) return null;
  const sentence = lines[Math.min(at, lines.length - 1)] ?? '';
  const total = board.seats.total;
  const pct = (n: number): string => `${total === 0 ? 0 : Math.min(100, (n / total) * 100).toFixed(2)}%`;
  const top = Math.max(1, ...board.parties.map((p) => p.won + p.leading));

  return (
    <section className="iei-live-board" id="live" aria-label="Live election">
      <header className="iei-lb-head">
        <p className="iei-eyebrow">
          <span className="iei-dot iei-dot-live" aria-hidden="true" /> Live · {STATUS[board.status]}
        </p>
        <h2 className="iei-lb-title">
          {board.election.jurisdictionName} <span className="iei-rule">{board.election.name}</span>
        </h2>
        {boards.length < 2 ? null : (
          <div className="iei-lb-pick" role="group" aria-label="Live elections">
            {boards.map((b, i) => (
              <button key={`${b.election.id ?? b.election.name}-${i}`} type="button" aria-pressed={i === at} onClick={() => setAt(i)}>
                {b.election.jurisdictionName}
              </button>
            ))}
          </div>
        )}
        <p className="iei-lb-asof" role="status">
          As of {when(board.asOf)}
          {board.stale ? <b className="iei-lb-stale"> · this count is out of date: the feed has not updated within its freshness window</b> : null}
          {failed === null ? null : <span className="iei-lb-fail"> · last update failed ({failed}); showing the last count</span>}
        </p>
      </header>

      <p className="iei-story-lead iei-lb-sentence">{sentence}</p>

      <div className="iei-lb-grid">
        <div className="iei-lb-count">
          <h3 className="iei-lb-h">The count</h3>
          <div
            className="iei-lb-prog"
            role="img"
            aria-label={`${board.seats.declared} of ${total} seats won or led; ${board.seats.majority} is a majority`}
          >
            <span className="iei-lb-prog-fill" style={{ width: pct(board.seats.declared) }} />
            <span className="iei-lb-prog-maj" style={{ left: pct(board.seats.majority) }} />
          </div>
          <p className="iei-lb-prog-cap">
            <b>{board.seats.declared}</b> of {total} seats won or led · majority {board.seats.majority}
          </p>
          <ul className="iei-lb-parties">
            {board.parties.map((p) => (
              <li key={p.party.key}>
                <span className="iei-lb-pn">
                  <span className="iei-sw" style={{ background: fills[p.party.key] }} aria-hidden="true" />
                  {p.party.label}
                </span>
                <span className="iei-lb-bar" aria-hidden="true">
                  <span className="iei-lb-won" style={{ width: `${((p.won / top) * 100).toFixed(2)}%`, backgroundColor: fills[p.party.key] }} />
                  <span className="iei-lb-lead" style={{ width: `${((p.leading / top) * 100).toFixed(2)}%`, backgroundColor: fills[p.party.key] }} />
                </span>
                <span className="iei-lb-pv">
                  <b>{p.won}</b> won · {p.leading} leading
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="iei-lb-proj">
          <h3 className="iei-lb-h">What others project</h3>
          <p className="iei-note">
            Published by the organisations named, on the dates shown. The registry does not forecast and has not checked or adjusted any of these.
          </p>
          {board.projections.length === 0 ? (
            <p className="iei-absent">No projection has been published for this election in the feed.</p>
          ) : (
            <table className="iei-lb-table">
              <thead>
                <tr>
                  <th scope="col">Publisher</th>
                  <th scope="col">Seats projected</th>
                </tr>
              </thead>
              <tbody>
                {board.projections.map((p, i) => (
                  <tr key={`${p.publisher}-${i}`}>
                    <th scope="row">
                      {p.url === null ? p.publisher : <a className="iei-body-link" href={p.url}>{p.publisher}</a>}
                      <span className="iei-rule">
                        {projectionWord(p)} · published {p.publishedOn}
                      </span>
                      {p.method === null ? null : <span className="iei-lb-method">{p.method}</span>}
                    </th>
                    <td>
                      {p.ranges.map((r) => (
                        <span key={r.party.key} className="iei-lb-range">
                          <span className="iei-chip">{r.party.label}</span> {r.low === r.high ? r.low : `${r.low}–${r.high}`}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {board.events.length === 0 ? null : (
        <div className="iei-lb-events">
          <h3 className="iei-lb-h">Events</h3>
          <ol>
            {board.events.map((e, i) => (
              <li key={`${e.at}-${i}`}>
                <time dateTime={e.at}>{when(e.at)}</time> {e.url === null ? e.text : <a className="iei-body-link" href={e.url}>{e.text}</a>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
