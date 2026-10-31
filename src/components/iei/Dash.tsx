import Link from 'next/link';
import { Fragment } from 'react';
import type { CSSProperties } from 'react';
import { dumbbell } from '../../../packages/mandate/src/viz/story.ts';
import { marginColumns } from '../../../packages/mandate/src/viz/margin-columns.ts';
import { shareText } from '../../../packages/mandate/src/viz/bullet.ts';
import { turnoutDots } from '../../../packages/mandate/src/viz/turnout-dots.ts';
import { voteLadder } from '../../../packages/mandate/src/viz/vote-ladder.ts';
import { fillFor, tokenFor } from '../../../packages/mandate/src/viz/party-ink.ts';
import { ribbonInk } from '../../../packages/mandate/src/viz/ribbon-ink.ts';
import { displayName } from '../../../packages/mandate/src/repo/display-name.ts';
import type { PlaceStory } from '../../../packages/mandate/src/repo/place-story.ts';
import type { MarginStrip } from '../../../packages/mandate/src/repo/seat-proof.ts';
import { ordinal } from '../../../packages/mandate/src/repo/seat-story.ts';
import { Finding } from './Finding.tsx';
import { MarginFigure, PartyChip, PersonLink, TableTwin } from './marks.tsx';
import { Panel, Table, Tabs } from './parts.tsx';

/**
 * The Analysis page: one computed sentence and the picture that proves it, then one picture for each next question, each with its exact table at
 * the foot. A reader who stops at the first screen has the finding, the rule that chose it, and the ladder of where the vote went.
 *
 * Every party is inked by its KEY, with its code beside every swatch; a figure the record does not hold is a dashed mark or a sentence, never a
 * zero, an empty frame or an interpolation; nothing is drawn for a 2026 candidate's share, turnout or runner-up, because none is on record.
 *
 * Ribbons join the same party across two counted elections and say nothing about voters moving. They are opaque tints of the party's ink
 * (viz/ribbon-ink.ts), the followed party's brightest and the rest fainter, and not the ink at a fraction of opacity, which went grey-brown over
 * the card; with no party followed they are all in between. The only motion is the ladder's rows arriving in election order (iei.css);
 * everything below the first screen is still.
 */

const IN = new Intl.NumberFormat('en-IN');
const at = (i: number): CSSProperties => ({ '--i': i }) as CSSProperties;
const pct = (n: number): string => shareText(n);
const sgn = (n: number): string => (n > 0 ? '+' : n < 0 ? '−' : '±');
const arrow = (n: number): string => (n > 0 ? '▲' : n < 0 ? '▼' : '■');

/* ───────────────────────────── the head ───────────────────────────── */

export function AnalysisHead({ name, story }: { name: string; story: PlaceStory }) {
  return (
    <div className="iei-head iei-an-head">
      <p className="iei-eyebrow">Constituency · analysis</p>
      <h1 className="iei-answer">How {name} got this way</h1>
      <Finding finding={story.finding} />
      <p className="iei-an-rule">Why this finding: {story.rule}</p>
    </div>
  );
}

/* ───────────────────────────── where did the vote go ───────────────────────────── */

export function VoteLadder({ story, followHref }: { story: PlaceStory; followHref: (label: string) => string }) {
  const followedKey = story.followed?.key ?? null;
  const { rows, ribbons, order } = voteLadder(story.ladder, { followed: followedKey });
  if (rows.length === 0) return null;
  const parties = new Map<string, string>();
  for (const r of rows) for (const s of r.segments) if (s.key !== null && !parties.has(s.key)) parties.set(s.key, s.label);
  return (
    <Panel id="ladder" title="Where did the vote go?" question={`Each bar is the votes polled at one election of ${story.ladder.length === 1 ? 'the record' : 'the window'}.`}>
      <div className="iei-an-two">
        <div>
          <div className="iei-an-ladder">
            {rows.map((r, i) => (
              <Fragment key={r.id}>
                <div className="iei-an-row" style={at(i)}>
                  <span className="iei-an-yr">{r.label}</span>
                  {r.evidence === 'counted' ? (
                    <div className="iei-an-bar" role="img" aria-label={`${r.label}: ${r.segments.map((s) => `${s.label} ${pct(s.share)}%`).join(', ')}`}>
                      {r.segments.map((s) => {
                        const on = s.key === null ? undefined : tokenFor(s.key).on;
                        return (
                          <span
                            key={`${s.key}-${s.name}-${s.start}`}
                            className={['iei-an-seg', s.winner ? 'iei-an-win' : '', s.tail ? 'iei-an-others' : ''].filter(Boolean).join(' ')}
                            style={{ left: `${s.start}%`, width: `${s.width}%`, background: s.key === null ? undefined : fillFor(s.key), color: on }}
                            title={`${s.label}${s.name === null ? '' : ` · ${displayName(s.name)}`} · ${pct(s.share)}% of votes polled${s.winner ? ' · won' : ''}`}
                          >
                            {s.width >= 18 ? `${s.label} ${pct(s.share)}` : s.width >= 7 && !s.tail ? s.label : ''}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <div className={r.evidence === 'declared' ? 'iei-an-bar iei-an-declared' : 'iei-an-bar iei-an-none'}>
                      {r.evidence === 'declared' && story.rowWinners[r.id] !== undefined ? <PartyChip partyId={story.rowWinners[r.id]?.key ?? null} code={story.rowWinners[r.id]?.label ?? ''} /> : null}
                      <span>{story.rowNotes[r.id]}</span>
                    </div>
                  )}
                </div>
                {i === rows.length - 1 ? null : (
                  <div className="iei-an-ribrow" aria-hidden="true">
                    {(ribbons[i] ?? []).length === 0 ? null : (
                      <svg className="iei-an-rib" viewBox="0 0 100 20" preserveAspectRatio="none">
                        {(ribbons[i] ?? []).map((rb) => (
                          <polygon
                            key={rb.key}
                            points={rb.points}
                            style={{ fill: ribbonInk(fillFor(rb.key), rb.followed ? 'bright' : followedKey === null ? 'mid' : 'faint') }}
                          />
                        ))}
                      </svg>
                    )}
                  </div>
                )}
              </Fragment>
            ))}
          </div>
          <ul className="iei-an-key">
            {order.filter((k) => parties.has(k)).map((k) => (
              <li key={k}>
                <PartyChip partyId={k} code={parties.get(k) ?? k} />
              </li>
            ))}
          </ul>
          <p className="iei-note">
            Outlined is the winner; dashed is an election with no candidate votes on record; the unfilled end of a bar is votes the registry does not itemise by candidate. A ribbon joins
            the same party across two counted elections: it is not a count of voters who moved. <a href="#tables">Exact figures</a>
          </p>
        </div>
        <aside className="iei-an-follow" aria-label="Follow one party">
          <h3 className="iei-eyebrow">Follow one party</h3>
          <Tabs label="Party to follow" current={story.followed?.label ?? ''} choices={story.chips.map((c) => ({ key: c.label, label: c.label, href: followHref(c.label) }))} />
          {story.followed === null ? null : (
            <ul className="iei-an-fl">
              {story.follow.map((f) => (
                <li key={f.label}>
                  <span className="iei-an-fy">{f.label.slice(0, 4)}</span>
                  <span className="iei-an-fs">
                    {f.share === null ? <span className="iei-absent">{f.note}</span> : <b>{pct(f.share)}%</b>}
                  </span>
                  <span className="iei-an-fd">{f.delta === null ? null : `${sgn(f.delta)}${Math.abs(f.delta).toFixed(1)} pp`}</span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </Panel>
  );
}

/* ───────────────────────────── how close ───────────────────────────── */

export function MarginHero({ story, retrieved }: { story: PlaceStory; retrieved: string | null }) {
  const h = story.hero;
  if (h === null) return null;
  const placed = marginColumns(h.columns, { signed: false });
  const lone = h.columns.length === 1;
  return (
    <Panel id="close" title={story.closeAnswer ?? 'How close was it?'} question={story.closeAnswer === null ? undefined : 'How close was it?'}>
      <div className="iei-an-hero">
        <div className="iei-an-herotile">
          <p className="iei-seat-k">
            Winning margin · {h.year} · <span className="iei-seat-basis">{h.basis}</span>
          </p>
          <p className="iei-seat-big">
            <PartyChip partyId={h.party.key} code={h.party.label} /> <b>{IN.format(h.votes)}</b> <span>votes</span>
          </p>
          <p className="iei-seat-line">
            {h.winner === null ? null : <PersonLink id={h.personId} name={h.winner} />}
          </p>
          {h.delta === null ? null : (
            <p className="iei-seat-line">
              <span aria-hidden="true">{arrow(h.delta.votes)} </span>
              {sgn(h.delta.votes)}
              {IN.format(Math.abs(h.delta.votes))} votes on {h.delta.vs.year}&rsquo;s {h.delta.vs.basis} margin of {IN.format(h.delta.vs.votes)} ({h.delta.vs.party.label})
            </p>
          )}
          {h.rank === null ? null : (
            <p className="iei-seat-line">
              {h.rank.rank === 1 ? 'The closest' : `${ordinal(h.rank.rank)} closest`} of {h.rank.of} {h.rank.basis === 'declared' ? 'declared' : 'counted'} margins that year; the median is {IN.format(Math.round(h.rank.medianVotes))} votes.
            </p>
          )}
          {h.bar === null ? null : (
            <>
              <div className="iei-seat-bullet" role="img" aria-label={`${IN.format(h.votes)} votes against a median of ${IN.format(Math.round(h.rank?.medianVotes ?? 0))}`}>
                <span className="iei-seat-bullet-fill" style={{ width: `${(h.bar.fill ?? 0) * 100}%`, background: fillFor(h.party.key) }} />
                <span className="iei-seat-bullet-tick" style={{ left: `${h.bar.tick * 100}%` }} />
              </div>
              <p className="iei-seat-ticklabel">Tick: the median seat of that election</p>
            </>
          )}
          {h.basis === 'declared' ? (
            <p className="iei-note">
              Declared, not counted: {h.year} published the winner and the margin and no candidate&rsquo;s votes. A margin as a share of votes polled is not drawn for it.
            </p>
          ) : null}
        </div>
        {lone ? (
          <div className="iei-an-notdrawn">
            <h3 className="iei-limits-h">Not drawn, and why</h3>
            <ul>
              {story.notDrawn.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div>
            <ol className="iei-an-cols" style={{ '--n': h.columns.length } as CSSProperties}>
              {h.columns.map((c, i) => {
                const p = placed.cols[i];
                return (
                  <li key={c.id} style={at(i)} title={c.votes === null ? `${c.label}: no margin on record` : `${c.label}: ${c.party?.label} won by ${IN.format(c.votes)} votes (${c.basis})`}>
                    <span className="iei-an-colbox" aria-hidden="true">
                      {p === undefined || p.dir === 'none' ? null : (
                        <span
                          className={p.dashed ? 'iei-an-col iei-an-col-d' : 'iei-an-col'}
                          style={{ height: `${Math.max(p.frac * 100, 1)}%`, ...(p.dashed ? { borderColor: p.key === null ? undefined : fillFor(p.key) } : { background: p.key === null ? undefined : fillFor(p.key) }) }}
                        />
                      )}
                      {p !== undefined && p.handRule ? <span className="iei-an-hand" /> : null}
                    </span>
                    <span className="iei-an-cv">{c.votes === null ? <span className="iei-absent">no margin</span> : IN.format(c.votes)}</span>
                    <span className="iei-an-cl">
                      {c.label}
                      {c.party === null ? null : <> · {c.party.label}</>}
                      {c.basis === 'declared' ? <em> declared</em> : null}
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className="iei-note">
              One scale, from zero. Each column is in its winner&rsquo;s ink; a rule between two columns is where the seat changed hands. Rank is by votes within each election, closest first, over the contests that have a
              result and a margin.
            </p>
          </div>
        )}
      </div>
      {retrieved === null ? null : <p className="iei-rule">Results retrieved {retrieved}</p>}
    </Panel>
  );
}

/* ───────────────────────────── where does that margin sit among every seat's ───────────────────────────── */

const pcOf = (f: number): string => `${Math.round(f * 10000) / 100}%`;

/**
 * One dot for each seat of the election the hero is about, on a LOG axis: where the seat's margin sits in the field of every other seat's. A dot is
 * inked by the winner's party and has the party's code in its hover text and in the exact table under the figure; a margin that was only declared is a
 * hollow dot; a seat with no declared winner has no margin and so no dot, and a sentence counts them. The seat is ringed and named.
 *
 * Dots are stacked into rows so none overlaps, and the stack is computed for three track widths (viz/seat-strip.ts): each dot carries its row in all
 * three, and the stylesheet picks one by viewport. Nothing moves.
 */
export function MarginStripPanel({ s }: { s: MarginStrip }) {
  const L = s.strip;
  const me = L.dots.find((d) => d.self);
  const dotStyle = (d: (typeof L.dots)[number]): CSSProperties =>
    ({ '--x': pcOf(d.x), '--ls': d.lane.s, '--lm': d.lane.m, '--ll': d.lane.l, '--ink': d.key === null ? undefined : fillFor(d.key) }) as CSSProperties;
  return (
    <Panel id="field" title="How does that margin compare with every other seat's?" question={`${s.of} ${s.scope} seats in ${s.year}: each winning margin is a dot.`}>
      <figure className="iei-st" style={{ '--rs': L.lanes.s * 2 + 1, '--rm': L.lanes.m * 2 + 1, '--rl': L.lanes.l * 2 + 1 } as CSSProperties}>
        <div className="iei-st-plot" role="img" aria-label={s.ariaLabel}>
          <div className="iei-st-top">
            {me === undefined ? null : (
              <span className="iei-st-self" style={{ '--x': pcOf(me.x) } as CSSProperties}>
                <b>{s.self.name}</b>
                <span>{IN.format(s.self.votes)} votes</span>
              </span>
            )}
          </div>
          <div className="iei-st-swarm">
            {L.ticks.filter((t) => t.major).map((t) => (
              <i key={t.value} className="iei-st-grid" style={{ '--x': pcOf(t.x) } as CSSProperties} />
            ))}
            {me === undefined ? null : <i className="iei-st-lead" style={{ '--x': pcOf(me.x) } as CSSProperties} />}
            {L.dots.map((d) => (
              <i key={d.id} className={[d.basis === 'declared' ? 'iei-st-dot iei-st-dot-d' : 'iei-st-dot', d.self ? 'iei-st-dot-me' : ''].filter(Boolean).join(' ')} style={dotStyle(d)} title={d.tip} />
            ))}
          </div>
          <ol className="iei-st-axis" aria-hidden="true">
            {L.ticks.map((t) => (
              <li key={t.value} className={t.major ? 'iei-st-t iei-st-t-major' : 'iei-st-t'} style={{ '--x': pcOf(t.x) } as CSSProperties}>
                {t.major ? <span>{IN.format(t.value)}</span> : null}
              </li>
            ))}
          </ol>
        </div>
        <p className="iei-st-unit">Winning margin, in votes, on a log scale</p>
        <ul className="iei-rk-key">
          {s.keys.map((k) => (
            <li key={k.key}>
              <PartyChip partyId={k.key} code={k.code} /> <span>{k.n}</span>
            </li>
          ))}
        </ul>
        <figcaption className="iei-note">{s.caption}</figcaption>
        {s.left === null ? null : (
          <p className="iei-note iei-st-left">
            <i className="iei-st-none" aria-hidden="true" /> {s.left}
          </p>
        )}
      </figure>
      <TableTwin summary={`All ${s.of} margins, closest first`}>
        <Table
          label={`All ${s.of} margins of ${s.year}`}
          caption={`The ${s.of} ${s.scope} margins of ${s.year}, closest first, each seat linked.`}
          captionVisible
          tight
          tall
          head={
            <>
              <th scope="col" className="iei-n">
                Place
              </th>
              <th scope="col">Seat</th>
              <th scope="col">Won by</th>
              <th scope="col" className="iei-n">
                Margin, votes
              </th>
            </>
          }
        >
          {s.rows.map((r) => (
            <tr key={r.placeId} aria-current={r.placeId === s.self.placeId ? 'true' : undefined}>
              <th scope="row" className="iei-n">
                {r.rank}
              </th>
              <td>{r.placeId === s.self.placeId ? <b>{r.name}</b> : <Link href={r.href}>{r.name}</Link>}</td>
              <td>
                <PartyChip partyId={r.party.key} code={r.party.label} />
              </td>
              <td className="iei-n">
                <MarginFigure votes={r.votes} basis={r.basis} />
              </td>
            </tr>
          ))}
        </Table>
      </TableTwin>
    </Panel>
  );
}

/* ───────────────────────────── was that the state's doing ───────────────────────────── */

export function GapPanels({ story, stateName }: { story: PlaceStory; stateName: string }) {
  const panels = story.wave.panels;
  if (panels.length === 0) return null;
  return (
    <Panel id="wave" title={story.wave.answer ?? "Was that the state's doing?"} question={story.wave.answer === null ? undefined : "Was that the state's doing?"}>
      <div className="iei-an-two iei-an-waves">
        {panels.map((p) => (
          <div key={p.party.key}>
            <h3 className="iei-limits-h">
              <PartyChip partyId={p.party.key} code={p.party.label} /> here, against {stateName}
            </h3>
            <ol className="iei-an-gaps">
              {p.rows.map((r) => {
                const d = dumbbell({ a: r.state, b: r.seat, min: 0, max: 60 });
                return (
                  <li key={r.label}>
                    <span className="iei-an-fy">{r.label.slice(0, 4)}</span>
                    {r.seat === null && r.state === null ? (
                      <span className="iei-an-gapn iei-absent">{r.note}</span>
                    ) : (
                      <span className="iei-an-gt" aria-hidden="true">
                        {d.from === null || d.to === null ? null : <i className="iei-story-vline" style={{ left: `${d.from * 100}%`, width: `${(d.to - d.from) * 100}%` }} />}
                        {d.ax === null ? null : <i className="iei-an-state" style={{ left: `${d.ax * 100}%`, borderColor: fillFor(p.party.key) }} title={`${stateName}: ${pct(r.state ?? 0)}%`} />}
                        {d.bx === null ? null : <i className="iei-an-seatdot" style={{ left: `${d.bx * 100}%`, background: fillFor(p.party.key) }} title={`Here: ${pct(r.seat ?? 0)}%`} />}
                      </span>
                    )}
                    <span className="iei-an-gv">
                      {r.gap === null ? (r.seat !== null ? <span className="iei-absent">no state figure</span> : r.state !== null ? <span className="iei-absent">not listed here</span> : null) : `${sgn(r.gap)}${Math.abs(r.gap).toFixed(1)} pp`}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
      <p className="iei-note">
        A dot is the party&rsquo;s share here, a ring is its share across the state, on one axis from 0 to 60%. The state&rsquo;s share is the party&rsquo;s votes over the votes polled in the seats of that
        election with candidate votes on record. Nothing is drawn for an election with none.
      </p>
    </Panel>
  );
}

/* ───────────────────────────── did people turn out ───────────────────────────── */

export function TurnoutRows({ story, district, state }: { story: PlaceStory; district: string | null; state: string | null }) {
  const rows = story.turnout.rows;
  if (rows.length === 0) return null;
  const dots = turnoutDots(rows);
  if (!rows.some((r) => r.seat !== null)) {
    return (
      <Panel id="turnout" title="Did people turn out?">
        <p className="iei-absent">No turnout that can be stood behind is on record for this seat: where an election published no candidate votes, its turnout has nothing to be checked against and is withheld.</p>
      </Panel>
    );
  }
  return (
    <Panel id="turnout" title={story.turnout.answer ?? 'Did people turn out?'} question={story.turnout.answer === null ? undefined : 'Did people turn out?'}>
      <ol className="iei-an-tr">
        {dots.rows.map((r, i) => (
          <li key={r.id} style={at(i)}>
            <span className="iei-an-fy">{r.label}</span>
            {r.pending ? (
              <span className="iei-an-gapn iei-absent">verification pending · no turnout is drawn for it</span>
            ) : (
              <span className="iei-an-gt" aria-hidden="true">
                {r.districtX === null ? null : <i className="iei-an-state" style={{ left: `${r.districtX * 100}%` }} title={`${district ?? 'District'}: ${r.district?.toFixed(1)}%`} />}
                {r.stateX === null ? null : <i className="iei-an-tick" style={{ left: `${r.stateX * 100}%` }} title={`${state ?? 'State'}: ${r.state?.toFixed(1)}%`} />}
                {r.seatX === null ? null : <i className="iei-an-seatdot iei-an-seatdot-n" style={{ left: `${r.seatX * 100}%` }} title={`Here: ${r.seat?.toFixed(1)}%`} />}
              </span>
            )}
            <span className="iei-an-gv iei-an-hide">{r.seat === null ? null : `${r.seat.toFixed(1)}%`}</span>
          </li>
        ))}
      </ol>
      <p className="iei-note">
        A filled dot is this seat, a ring {district === null ? 'its district' : `is ${district}`}, a tick {state ?? 'the state'}. The axis runs from {dots.min}% to {dots.max}%, not from zero: from zero a gap of one to
        three points would show as nothing.
      </p>
    </Panel>
  );
}

/* ───────────────────────────── notes, limits, tables ───────────────────────────── */

export function Notes({ story }: { story: PlaceStory }) {
  if (story.notes.length === 0) return null;
  return (
    <Panel id="notes" title="Worth a second look" question="What in this record meets a stated rule?">
      <ul className="iei-an-notes">
        {story.notes.map((n) => (
          <li key={n.text}>
            <span>{n.text}</span>
            <span className="iei-rule">{n.rule}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function LeavesOut({ story, caveats }: { story: PlaceStory; caveats: readonly { label: string; text: string }[] }) {
  return (
    <Panel id="leaves" title="What this page leaves out" question="Where does the record stop?">
      <div className="iei-limits">
        <ul>
          {story.leavesOut.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </div>
      <details className="iei-twin iei-an-caveats">
        <summary>What these measures do not tell you</summary>
        <dl>
          {caveats.map((c) => (
            <div key={c.label}>
              <dt>{c.label}</dt>
              <dd>{c.text}</dd>
            </div>
          ))}
        </dl>
      </details>
    </Panel>
  );
}

export function Tables({ story, stateName, district }: { story: PlaceStory; stateName: string; district: string | null }) {
  const h = story.hero;
  const counted = story.ladder.filter((r) => r.evidence === 'counted');
  const parties = [...new Map(counted.flatMap((r) => r.segments.filter((s) => s.key !== null).map((s) => [s.key as string, s.label] as const))).entries()];
  return (
    <section className="iei-sec" id="tables" aria-labelledby="tables-h">
      <div className="iei-h">
        <div className="iei-h-title">
          <h2 id="tables-h">The numbers behind the pictures</h2>
          <p>Each picture above has its exact figures here.</p>
        </div>
      </div>
      {h === null ? null : (
        <Table
          label="The record"
          caption="The record: each election's winner, margin and where the margin ranks among its election's contests, closest first, by votes."
          captionVisible
          tight
          head={
            <>
              <th scope="col">Election</th>
              <th scope="col">Won by</th>
              <th scope="col" className="iei-n">
                Margin, votes
              </th>
              <th scope="col">Basis</th>
              <th scope="col" className="iei-n">
                Rank, closest first
              </th>
            </>
          }
        >
          {[...h.columns].reverse().map((c, i) => {
            const r = [...h.ranks].reverse()[i]?.rank ?? null;
            return (
              <tr key={c.id}>
                <th scope="row">{c.label}</th>
                <td>{c.party === null ? <span className="iei-absent">no winner declared</span> : <PartyChip partyId={c.party.key} code={c.party.label} />}</td>
                <td className="iei-n">{c.votes === null || c.basis === null ? <span className="iei-absent">not reported</span> : <MarginFigure votes={c.votes} basis={c.basis} counted />}</td>
                <td>{c.basis ?? <span className="iei-absent">—</span>}</td>
                <td className="iei-n">{r === null ? <span className="iei-absent">not ranked</span> : `${ordinal(r.rank)} of ${r.of}`}</td>
              </tr>
            );
          })}
        </Table>
      )}
      {counted.length === 0 ? null : (
        <Table
          label="Share of votes polled, by candidate party"
          caption="Share of the votes polled, by candidate party, at each counted election. A party outside an election's listed candidates is not listed there."
          captionVisible
          tight
          head={
            <>
              <th scope="col">Party</th>
              {counted.map((r) => (
                <th key={r.id} scope="col" className="iei-n">
                  {r.label}
                </th>
              ))}
            </>
          }
        >
          {parties.map(([key, label]) => (
            <tr key={key}>
              <th scope="row">
                <PartyChip partyId={key} code={label} />
              </th>
              {counted.map((r, i) => {
                const s = r.segments.find((x) => x.key === key && !x.tail);
                const before = i === 0 ? undefined : counted[i - 1]?.segments.find((x) => x.key === key && !x.tail);
                return (
                  <td key={r.id} className="iei-n">
                    {s === undefined ? <span className="iei-absent">not listed</span> : `${pct(s.share)}%`}
                    {s === undefined || before === undefined ? null : <span className="iei-of"> {sgn(s.share - before.share)}{Math.abs(s.share - before.share).toFixed(1)}</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </Table>
      )}
      {story.wave.panels.length === 0 ? null : (
        <Table
          label="Seat against state"
          caption={`Each party's share here against its share across ${stateName}, in percent of the votes polled, and the gap in percentage points.`}
          captionVisible
          tight
          head={
            <>
              <th scope="col">Party</th>
              <th scope="col">Election</th>
              <th scope="col" className="iei-n">
                Here
              </th>
              <th scope="col" className="iei-n">
                {stateName}
              </th>
              <th scope="col" className="iei-n">
                Gap, pp
              </th>
            </>
          }
        >
          {story.wave.panels.flatMap((p) =>
            p.rows.map((r) => (
              <tr key={`${p.party.key}-${r.label}`}>
                <th scope="row">
                  <PartyChip partyId={p.party.key} code={p.party.label} />
                </th>
                <td>{r.label}</td>
                <td className="iei-n">{r.seat === null ? <span className="iei-absent">{r.note ?? 'not listed'}</span> : `${pct(r.seat)}%`}</td>
                <td className="iei-n">{r.state === null ? <span className="iei-absent">not on record</span> : `${pct(r.state)}%`}</td>
                <td className="iei-n">{r.gap === null ? <span className="iei-absent">—</span> : `${sgn(r.gap)}${Math.abs(r.gap).toFixed(1)}`}</td>
              </tr>
            )),
          )}
        </Table>
      )}
      {story.turnout.rows.length === 0 ? null : (
        <Table
          label="Turnout"
          caption={`Turnout at each election, here${district === null ? '' : `, in ${district}`} and across ${stateName}. A withheld election has no figure.`}
          captionVisible
          tight
          head={
            <>
              <th scope="col">Election</th>
              <th scope="col" className="iei-n">
                Here
              </th>
              <th scope="col" className="iei-n">
                {district ?? 'District'}
              </th>
              <th scope="col" className="iei-n">
                {stateName}
              </th>
            </>
          }
        >
          {story.turnout.rows.map((r) => (
            <tr key={r.id}>
              <th scope="row">{r.label}</th>
              {r.pending ? (
                <td colSpan={3} className="iei-n">
                  <span className="iei-absent">verification pending</span>
                </td>
              ) : (
                <>
                  <td className="iei-n">{r.seat === null ? <span className="iei-absent">not reported</span> : `${r.seat.toFixed(1)}%`}</td>
                  <td className="iei-n">{r.district === null ? <span className="iei-absent">—</span> : `${r.district.toFixed(1)}%`}</td>
                  <td className="iei-n">{r.state === null ? <span className="iei-absent">—</span> : `${r.state.toFixed(1)}%`}</td>
                </>
              )}
            </tr>
          ))}
        </Table>
      )}
    </section>
  );
}

