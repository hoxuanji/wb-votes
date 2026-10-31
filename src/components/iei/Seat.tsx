import Link from 'next/link';
import type { CSSProperties } from 'react';
import { fillFor } from '../../../packages/mandate/src/viz/party-ink.ts';
import { shareText } from '../../../packages/mandate/src/viz/bullet.ts';
import type { Spark } from '../../../packages/mandate/src/viz/spark.ts';
import { inr } from '../../../packages/mandate/src/repo/brief.ts';
import { marginShareText } from '../../../packages/mandate/src/repo/close-call.ts';
import type { PlaceBrief } from '../../../packages/mandate/src/repo/place.ts';
import type { FieldCandidate, FieldElection, SeatField } from '../../../packages/mandate/src/repo/seat-field.ts';
import type { SeatHistory } from '../../../packages/mandate/src/repo/seat-history.ts';
import { money, ordinal, panelScale, rosterLead } from '../../../packages/mandate/src/repo/seat-story.ts';
import type { Flag, Limit, SeatNumbers } from '../../../packages/mandate/src/repo/seat-story.ts';
import { ROSTER_ORDERS } from '../../../packages/mandate/src/repo/place-filters.ts';
import type { RosterOrder } from '../../../packages/mandate/src/repo/place-filters.ts';
import { Limits, MarginFigure, PartyChip, PersonLink } from './marks.tsx';
import { DataList, DataRow, Panel, Table, Tabs } from './parts.tsx';

/**
 * The seat page below its finding: the numbers, how each election divided the vote, everyone who stood, and what the record cannot say.
 *
 * Every picture has its words beside it (the twin list under the hero, the text of every panel row, the roster's own table), and an absence is a
 * word: a figure the record does not hold is "not reported" or a gap with its year, never a zero and never a blank.
 *
 * Motion is the bars growing from their baseline once on load (iei.css); nothing else moves.
 */

const IN = new Intl.NumberFormat('en-IN');
const at = (i: number): CSSProperties => ({ '--i': i }) as CSSProperties;
const sign = (n: number): string => (n > 0 ? '+' : n < 0 ? '−' : '±');
const arrow = (n: number): string => (n > 0 ? '▲' : n < 0 ? '▼' : '■');

/* ───────────────────────────── the line ───────────────────────────── */

/** A position in the picture as a percentage of its box: the frame scales with the tile, and a label placed this way keeps its place. */
const pc = (v: number, of: number): string => `${Math.round((v / of) * 10000) / 100}%`;

/**
 * Where the figure at one end of the line goes: above its dot, or beside it when the line leaves (or arrives at) the dot steeply from above, where a
 * figure above would sit on the line. The oldest figure starts at its dot and the newest ends at it, so "beside" is under the line, away from it.
 * A figure is about 35px wide and 8px clear of its dot, so a line rising by more than a fifth of its run crosses it.
 */
const STEEP = 0.2;

function sideOf(dots: Spark['dots'], at: number): 'above' | 'beside' {
  const d = dots[at];
  const next = dots[at === 0 ? 1 : at - 1];
  if (d === undefined || next === undefined || next.x === d.x) return 'above';
  return (d.y - next.y) / Math.abs(next.x - d.x) >= STEEP ? 'beside' : 'above';
}

/**
 * The line is SVG and its labels are HTML over it. A label inside the SVG is scaled with the frame: set at 11px in a 400-unit frame it
 * rendered at 7.5px to 11.5px at 1440 and 8.2px at 390. Over it, the label is the mark type token at every width, and only the line and
 * its dots scale. Which labels fit is decided in viz/spark.ts (`show`, `word`); the labels are hidden from assistive technology because the
 * picture's own name and the table beside it carry the same numbers.
 */
function SeatSpark({ spark, label, ink, format }: { spark: Spark; label: string; ink: string | null; format: (v: number) => string }) {
  if (!spark.enough) return <p className="iei-seat-fact">{spark.fact}</p>;
  const first = spark.dots[0];
  const last = spark.dots[spark.dots.length - 1];
  const fill = ink === null ? undefined : { fill: ink };
  const edge = (x: number): 'start' | 'mid' | 'end' => (x <= spark.width / 4 ? 'start' : x >= (spark.width * 3) / 4 ? 'end' : 'mid');
  return (
    <div className="iei-seat-spw">
      <svg className="iei-seat-sp" viewBox={`0 0 ${spark.width} ${spark.height}`} role="img" aria-label={label}>
        <line className="iei-seat-sp-base" x1={0} x2={spark.width} y1={spark.baseline} y2={spark.baseline} />
        {spark.gaps.map((g) => (
          <g key={g.label}>
            <line className="iei-seat-sp-gap" x1={g.x} x2={g.x} y1={8} y2={spark.baseline} />
          </g>
        ))}
        {spark.runs.map((d) => (
          <path key={d} className="iei-seat-sp-run" d={d} />
        ))}
        {spark.stubs.map((d) => (
          <path key={d} className="iei-seat-sp-stub" d={d} />
        ))}
        {spark.dots.map((d) => (
          <circle
            key={d.label}
            className={d.basis === 'declared' ? 'iei-seat-sp-dot iei-seat-sp-ring' : 'iei-seat-sp-dot'}
            cx={d.x}
            cy={d.y}
            r={4}
            style={d.basis === 'declared' ? (ink === null ? undefined : { stroke: ink }) : fill}
          >
            <title>{d.tip}</title>
          </circle>
        ))}
      </svg>
      <div className="iei-seat-spl" aria-hidden="true">
        {[first, last].map((d, i) =>
          d === undefined || (i === 1 && d === first) ? null : (
            <span
              key={i}
              className="iei-seat-sp-val"
              data-at={i === 0 ? 'start' : 'end'}
              data-by={sideOf(spark.dots, i === 0 ? 0 : spark.dots.length - 1)}
              style={{ left: pc(d.x, spark.width), top: pc(d.y, spark.height) }}
            >
              {format(d.value)}
            </span>
          ),
        )}
        {spark.ticks
          .filter((t) => t.show)
          .map((t) => (
            <span key={t.label} className="iei-seat-sp-yr" style={{ left: pc(t.x, spark.width) }}>
              {t.label}
            </span>
          ))}
        {spark.gaps
          .filter((g) => g.word)
          .map((g) => (
            <span key={`g-${g.label}`} className="iei-seat-sp-yr iei-seat-sp-nf" data-at={edge(g.x)} style={{ left: pc(g.x, spark.width), top: pc(spark.baseline, spark.height) }}>
              no figure
            </span>
          ))}
      </div>
    </div>
  );
}

/* ───────────────────────────── the numbers ───────────────────────────── */

export function SeatKpis({ nums, retrieved }: { nums: SeatNumbers; retrieved: string | null }) {
  const { hero, share, turnout, absent, closest } = nums;
  if (hero === null && share === null && turnout === null) return null;
  return (
    <div className="iei-seat-kpis">
      {hero === null ? null : (
        <div className="iei-seat-tile iei-seat-hero">
          <p className="iei-seat-k">
            Winning margin · {hero.year} · <span className="iei-seat-basis">{hero.basis}</span>
          </p>
          <p className="iei-seat-big">
            <PartyChip partyId={hero.party.key} code={hero.party.label} /> <b>{IN.format(hero.votes)}</b> <span>votes</span>
          </p>
          {hero.newerMissing === null ? null : (
            <p className="iei-seat-line">No result row is loaded for {hero.newerMissing}; this is the last election that has one.</p>
          )}
          {hero.delta === null ? (
            <p className="iei-seat-line">{hero.noDelta}</p>
          ) : (
            <p className="iei-seat-line">
              <span aria-hidden="true">{arrow(hero.delta.votes)} </span>
              {sign(hero.delta.votes)}
              {IN.format(Math.abs(hero.delta.votes))} votes on {hero.delta.vs.year}&rsquo;s {hero.delta.vs.basis} margin of{' '}
              {IN.format(hero.delta.vs.votes)} ({hero.delta.vs.party.label})
            </p>
          )}
          <SeatSpark spark={hero.spark} label={`Winning margin by election: ${hero.twin.map((t) => `${t.year} ${t.votes === null ? 'none' : IN.format(t.votes)}`).join(', ')}`} ink={fillFor(hero.party.key)} format={(v) => IN.format(v)} />
          {hero.twin.length < 2 ? null : (
            <dl className="iei-seat-twin">
              {hero.twin.map((t) => (
                <div key={t.year}>
                  <dt>{t.year}</dt>
                  <dd>
                    {t.party === null ? <span className="iei-absent">no winner declared</span> : <PartyChip partyId={t.party.key} code={t.party.label} />}{' '}
                    {t.votes === null || t.basis === null ? null : <MarginFigure votes={t.votes} basis={t.basis} counted />}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {hero.basis === 'declared' ? (
            <p className="iei-note">
              Declared, not counted: {hero.year} published the winner and the margin and no candidate&rsquo;s votes, so there is no runner-up and no share to compare. A
              hollow ring is a declared figure.
            </p>
          ) : null}
          {closest === null ? null : (
            <p className="iei-seat-line">
              Closest counted margin: <b>{IN.format(closest.votes)}</b> votes, {closest.year}.
            </p>
          )}
        </div>
      )}

      {share === null ? null : (
        <div className="iei-seat-tile">
          <p className="iei-seat-k">Winner&rsquo;s share · {share.year}</p>
          <p className="iei-seat-big iei-seat-big-s">
            <PartyChip partyId={share.party.key} code={share.party.label} /> <b>{shareText(share.share)}%</b>
          </p>
          <div className="iei-seat-bullet" role="img" aria-label={`${share.party.label} won ${shareText(share.share)}% of the votes polled; half is 50%`}>
            <span className="iei-seat-bullet-fill" style={{ width: `${share.bar.fill === null ? 0 : share.bar.fill * 100}%`, background: fillFor(share.party.key) }} />
            <span className="iei-seat-bullet-tick" style={{ left: `${share.bar.tick * 100}%` }} />
          </div>
          <p className="iei-seat-ticklabel">50% = half the votes polled</p>
          {share.votes === null || share.polled === null ? null : (
            <p className="iei-seat-line">
              {IN.format(share.votes)} of {IN.format(share.polled)} votes polled
            </p>
          )}
          {share.delta === null ? null : (
            <p className="iei-seat-line">
              {sign(share.delta.pp)}
              {Math.abs(share.delta.pp).toFixed(1)} pp on {share.delta.year}&rsquo;s {shareText(share.delta.share)}% ({share.delta.party.label})
            </p>
          )}
          <p className="iei-seat-line">
            {share.overHalf === 0
              ? share.counted === 1
                ? 'Under half of the votes polled.'
                : `Under half in all ${share.counted} counted elections.`
              : `Over half in ${share.overHalf} of ${share.counted} counted ${share.counted === 1 ? 'election' : 'elections'}.`}
          </p>
        </div>
      )}

      {turnout === null ? null : (
        <div className="iei-seat-tile">
          <p className="iei-seat-k">Turnout · {turnout.year}</p>
          <p className="iei-seat-big iei-seat-big-s">
            <b>{turnout.pct.toFixed(1)}%</b>
            {turnout.electors === null ? null : <span> of {IN.format(turnout.electors)} electors</span>}
          </p>
          <SeatSpark spark={turnout.spark} label="Turnout by election" ink={null} format={(v) => `${v}%`} />
          {turnout.delta === null ? null : (
            <p className="iei-seat-line">
              {sign(turnout.delta.pp)}
              {Math.abs(turnout.delta.pp).toFixed(1)} pp on {turnout.delta.year}
            </p>
          )}
          {turnout.pending === null ? null : <p className="iei-seat-line">{turnout.pending}: verification pending. No turnout is drawn for it.</p>}
        </div>
      )}

      {absent === null ? null : (
        <div className="iei-seat-tile iei-seat-fold">
          <p className="iei-seat-k">Not on record</p>
          <ul>
            {absent.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          <p className="iei-note">
            The registry holds no figure for these. That is not a statement that the election was not held, or that nobody stood. <Link href="/coverage">Coverage</Link>
          </p>
        </div>
      )}
      {retrieved === null ? null : <p className="iei-rule iei-seat-retrieved">Results retrieved {retrieved}</p>}
    </div>
  );
}

/* ───────────────────────────── how each election divided the vote ───────────────────────────── */

const trailOf = (c: FieldCandidate): string[] =>
  c.elsewhere.map((e) => (e.won ? `${e.year} won` : e.rank === null ? `${e.year} stood` : `${e.year} ${ordinal(e.rank)}`));

/** What an election did, in a heading: who held or took the seat, by how many. */
function headingOf(e: FieldElection, history: SeatHistory, brief: PlaceBrief): string {
  const r = history.results.find((x) => x.contestId === e.contestId);
  if (r === undefined || r.winner === null) return e.namedAsElected === null ? 'No winner is declared' : `No result row is loaded; the candidacy record names ${e.namedAsElected.display} as elected`;
  const i = history.results.indexOf(r);
  const before = history.results.slice(i + 1).find((x) => x.winner !== null);
  const verb =
    before === undefined || before.winner === null
      ? 'won'
      : before.winner.party.key === r.winner.party.key
        ? 'held the seat'
        : `took the seat from ${before.winner.party.label}`;
  const by = r.margin === null ? '' : ` by ${IN.format(Math.abs(r.margin.votes))} votes`;
  const c = brief.contests.find((x) => x.contestId === e.contestId);
  const share =
    r.margin !== null && r.margin.basis === 'counted' && c !== undefined && c.turnout.state === 'reported' && c.voters !== null && c.voters > 0
      ? `, ${marginShareText((100 * Math.abs(r.margin.votes)) / c.voters)}% of votes polled`
      : '';
  return `${r.winner.party.label} ${verb}${by} (${r.margin?.basis ?? 'no margin'}${share})`.replace('(no margin)', '').trim();
}

/**
 * The rows of a counted election and whether bars can be drawn for them: only where candidates have a share of the votes polled, and the shares
 * do not add up to more than the votes polled (which would be a record at odds with itself). Otherwise the votes are listed and no bar is drawn.
 */
function rowsOf(e: FieldElection): { rows: FieldCandidate[]; bars: boolean; why: string | null } {
  const rows = e.candidates.filter((c) => c.share !== null || c.votes !== null).slice(0, 5);
  const sum = rows.reduce((n, c) => n + (c.share ?? 0), 0);
  const any = rows.some((c) => c.share !== null);
  return {
    rows,
    bars: any && sum <= 105,
    why: !any ? 'The votes polled are not on record, so no share or bar is drawn.' : sum > 105 ? 'The shares add up to more than the votes polled, so no bar is drawn.' : null,
  };
}

function CountedPanel({ e, scale, history, brief, index }: { e: FieldElection; scale: number; history: SeatHistory; brief: PlaceBrief; index: number }) {
  const { rows, bars, why } = rowsOf(e);
  const itemised = rows.reduce((n, c) => n + (c.share ?? 0), 0);
  const c = brief.contests.find((x) => x.contestId === e.contestId);
  const foot = [
    bars && 100 - itemised >= 0.05 ? `Not itemised ${(100 - itemised).toFixed(1)}%` : null,
    why,
    c !== undefined && c.turnout.state === 'reported' ? `turnout ${c.turnout.pct.toFixed(1)}%` : null,
    c !== undefined && c.turnout.state === 'reported' && c.electors !== null ? `electors ${IN.format(c.electors)}` : null,
  ].filter((x): x is string => x !== null);
  return (
    <>
      <h3 className="iei-seat-ph">
        <span className="iei-seat-py">{e.year}{e.byPoll ? ' by-poll' : ''}</span> {headingOf(e, history, brief)}
      </h3>
      <ol className="iei-seat-rows" style={at(index)}>
        {rows.map((r, i) => (
          <li key={r.candidacyId} className={r.isWinner ? 'iei-seat-win' : undefined}>
            <PartyChip partyId={r.party.key} code={r.party.label} />
            <span className="iei-seat-nm">
              <PersonLink id={r.personId} name={r.name} />
              {trailOf(r).length === 0 ? null : <span className="iei-seat-trail">also {trailOf(r).join(', ')}</span>}
            </span>
            <span className="iei-seat-sh">{r.share === null ? <span className="iei-absent">no share</span> : `${shareText(r.share)}%`}</span>
            <span className="iei-seat-vt">{r.votes === null ? '' : IN.format(r.votes)}</span>
            {!bars || r.share === null ? null : (
              <span className="iei-seat-track" aria-hidden="true">
                <span className="iei-seat-bar" style={{ ...at(i), width: `${(r.share / scale) * 100}%`, background: fillFor(r.party.key) }} />
                <i className="iei-seat-tick" style={{ left: `${(50 / scale) * 100}%` }} />
              </span>
            )}
          </li>
        ))}
      </ol>
      {foot.length === 0 ? null : <p className="iei-seat-foot">{foot.join(' · ')}</p>}
    </>
  );
}

function UnitStrip({ e }: { e: FieldElection }) {
  const sorted = [...e.candidates].sort((a, b) => (a.party.label < b.party.label ? -1 : a.party.label > b.party.label ? 1 : 0) || (a.display < b.display ? -1 : 1));
  return (
    <p className="iei-seat-units" aria-hidden="true">
      {sorted.map((c) => (
        <i key={c.candidacyId} className={c.isWinner || c.namedAsElected ? 'iei-seat-unit iei-seat-unit-win' : 'iei-seat-unit'} style={{ background: fillFor(c.party.key) }} title={`${c.display} (${c.party.label})`} />
      ))}
    </p>
  );
}

function DeclaredPanel({ e, history, brief, single }: { e: FieldElection; history: SeatHistory; brief: PlaceBrief; single: boolean }) {
  const w = e.winner ?? e.namedAsElected;
  const c = brief.contests.find((x) => x.contestId === e.contestId);
  const others = e.candidates.length - (w === null ? 0 : 1);
  const facts = w === null ? [] : [
    w.age === null ? null : `age ${w.age}`,
    w.education,
    w.occupation,
    w.assets === null ? null : `declared assets ${money(w.assets)}`,
    w.cases === null ? null : `${w.cases} ${w.cases === 1 ? 'case' : 'cases'} declared pending`,
  ].filter((x): x is string => x !== null);
  return (
    <>
      <h3 className="iei-seat-ph">
        <span className="iei-seat-py">{single ? 'The one election on record' : `${e.year}${e.byPoll ? ' by-poll' : ''}`}</span> {headingOf(e, history, brief)}
      </h3>
      {w === null ? (
        <p className="iei-seat-line">No candidate is named as elected.</p>
      ) : (
        <div className="iei-seat-card">
          <p>
            <b><PersonLink id={w.personId} name={w.name} /></b> <PartyChip partyId={w.party.key} code={w.party.label} />{' '}
            <span className="iei-seat-tag">{w.isWinner ? 'declared winner' : 'named as elected'}</span>
          </p>
          {facts.length === 0 ? <p className="iei-absent">nothing declared is on record</p> : <p className="iei-seat-line">{facts.join(' · ')}</p>}
          {trailOf(w).length === 0 ? null : <p className="iei-seat-trail">Stood here: {trailOf(w).join(' · ')}</p>}
        </div>
      )}
      <p className="iei-seat-line">
        No candidate&rsquo;s votes are on record for {e.year}, so there are no bars.
        {others > 0 ? (
          <>
            {' '}
            {others} {others === 1 ? 'other' : 'others'} stood: <Link href="#field">who they are</Link>.
          </>
        ) : null}
      </p>
      {e.candidates.length > 1 ? <UnitStrip e={e} /> : null}
      {c !== undefined && c.turnout.state === 'unverified' ? <p className="iei-seat-foot">Turnout: verification pending</p> : null}
    </>
  );
}

export function SeatPanels({ field, history, brief }: { field: SeatField; history: SeatHistory; brief: PlaceBrief }) {
  const scale = panelScale(field);
  const only = field.elections.length === 1;
  let drawn = 0;
  const seen = new Set<number>();
  const hasCounted = field.elections.some((e) => e.evidence === 'counted' && rowsOf(e).bars);
  return (
    <div>
      <div className="iei-seat-panels">
        {field.elections.map((e) => {
          const anchor = seen.has(e.year) ? undefined : `ep-${e.year}`;
          seen.add(e.year);
          const cls = e.evidence === 'counted' ? 'iei-seat-panel' : 'iei-seat-panel iei-seat-panel-d';
          return (
            <section key={e.contestId} id={anchor} className={cls} aria-label={`${e.year}`}>
              {e.evidence === 'counted' ? (
                <CountedPanel e={e} scale={scale} history={history} brief={brief} index={drawn++} />
              ) : e.evidence === 'none' ? (
                <>
                  <h3 className="iei-seat-ph">
                    <span className="iei-seat-py">{e.year}</span> no candidates on record
                  </h3>
                </>
              ) : (
                <DeclaredPanel e={e} history={history} brief={brief} single={only} />
              )}
            </section>
          );
        })}
      </div>
      {hasCounted ? (
        <p className="iei-note">
          All the bars here share one scale: full width is {scale}% of the votes polled, and the dashed line is 50%. Earlier contests are shown only where the registry has
          linked the records. One person can appear under more than one record.
        </p>
      ) : null}
    </div>
  );
}

/* ───────────────────────────── who stood ───────────────────────────── */

function sorted(c: readonly FieldCandidate[], order: RosterOrder, dir: 'asc' | 'desc'): FieldCandidate[] {
  const byName = (a: FieldCandidate, b: FieldCandidate): number => (a.display < b.display ? -1 : a.display > b.display ? 1 : 0);
  const out = [...c];
  if (order === 'default') return out.sort((a, b) => Number(b.isWinner || b.namedAsElected) - Number(a.isWinner || a.namedAsElected) || byName(a, b));
  const sign2 = dir === 'desc' ? -1 : 1;
  if (order === 'party') return out.sort((a, b) => sign2 * (a.party.label < b.party.label ? -1 : a.party.label > b.party.label ? 1 : 0) || byName(a, b));
  return out.sort((a, b) => (a.age === null ? 1 : 0) - (b.age === null ? 1 : 0) || sign2 * ((a.age ?? 0) - (b.age ?? 0)) || byName(a, b));
}

const NR = <span className="iei-absent">not reported</span>;

export function SeatRoster({ election, order, dir, base }: { election: FieldElection; order: RosterOrder; dir: 'asc' | 'desc'; base: string }) {
  const rows = sorted(election.candidates, order, dir);
  const href = (key: RosterOrder): string => (key === 'default' ? `${base}#field` : `${base}?order=${key}${key === order && dir === 'asc' ? '&dir=desc' : ''}#field`);
  const aria = (key: RosterOrder): 'ascending' | 'descending' | undefined => (order === key && key !== 'default' ? (dir === 'asc' ? 'ascending' : 'descending') : undefined);
  return (
    <Panel id="field" title={`Who stood in ${election.year}`} question="Who is on the ballot, and what did each declare?">
      <p className="iei-story-lead iei-seat-rl">{rosterLead(election)}</p>
      <p className="iei-note">
        {election.evidence === 'roster' ? 'The registry holds no result for this seat' : `The registry holds no votes, shares or finish order for the ${election.candidates.length - 1 === 1 ? 'other candidate' : 'other candidates'}`},
        so the order is the winner first, then A to Z. Everything below is what each candidate declared in an affidavit; none of it is a result.
      </p>
      <Tabs label="Order the candidates by" current={order} choices={ROSTER_ORDERS.map((o) => ({ key: o.key, label: o.label, href: href(o.key) }))} />
      <Table
        label={`Candidates in ${election.year}`}
        tight
        className="iei-seat-roster"
        head={
          <>
            <th scope="col" aria-sort={aria('party')}>
              Party
            </th>
            <th scope="col">Candidate</th>
            <th scope="col" className="iei-n" aria-sort={aria('age')}>
              Age
            </th>
            <th scope="col" className="iei-seat-hide">
              Education
            </th>
            <th scope="col" className="iei-seat-hide">
              Occupation
            </th>
            <th scope="col" className="iei-n">
              Declared assets
            </th>
            <th scope="col" className="iei-n iei-seat-hide">
              Liabilities
            </th>
            <th scope="col" className="iei-n iei-seat-hide">
              Cases declared pending
            </th>
          </>
        }
      >
        {rows.map((c) => (
          <tr key={c.candidacyId}>
            <th scope="row" className="iei-seat-party">
              <PartyChip partyId={c.party.key} code={c.party.label} />
            </th>
            <td className="iei-seat-who">
              <PersonLink id={c.personId} name={c.name} />
              {c.isWinner ? <span className="iei-seat-tag">declared winner</span> : null}
              {c.namedAsElected ? <span className="iei-seat-tag">named as elected</span> : null}
              {c.sittingMember ? <span className="iei-seat-tag iei-seat-tag-claim">sitting member, declared</span> : null}
              {trailOf(c).length === 0 ? null : <span className="iei-seat-trail">Stood here: {trailOf(c).join(' · ')}</span>}
            </td>
            <td className="iei-n">{c.age ?? NR}</td>
            <td className="iei-seat-hide">{c.education ?? NR}</td>
            <td className="iei-seat-hide">{c.occupation ?? NR}</td>
            <td className="iei-n">{c.assets === null ? NR : `Rs ${IN.format(c.assets)}`}</td>
            <td className="iei-n iei-seat-hide">{c.liabilities === null ? NR : `Rs ${IN.format(c.liabilities)}`}</td>
            <td className="iei-n iei-seat-hide">{c.cases === null ? NR : c.cases}</td>
          </tr>
        ))}
      </Table>
      <p className="iei-note iei-seat-phone">Education, occupation, liabilities and cases are on each candidate&rsquo;s page.</p>
      <p className="iei-note">
        Cases declared is the count of pending cases the candidate wrote in the affidavit. It records nothing about their stage, court or outcome, and it is not a criminal
        record. Self-declared{election.declaredAsOf === null ? '' : `, as of ${election.declaredAsOf}`}.
      </p>
    </Panel>
  );
}

/* ───────────────────────────── what the record does not say, and what is flagged ───────────────────────────── */

export function SeatLimits({ limits }: { limits: readonly Limit[] }) {
  if (limits.length === 0) return null;
  return (
    <Panel id="limits" title="What the record does not say" question="Where does this seat's record stop?">
      <Limits heading="Each absence, once" items={limits.map((l) => ({ id: l.id, text: l.text }))} />
    </Panel>
  );
}

export function SeatFlags({ flags, elections }: { flags: readonly Flag[]; elections: number }) {
  if (flags.length === 0 && elections < 2) return null;
  return (
    <Panel id="flagged" title="Flagged" question="Does anything about this seat's record meet a stated rule?">
      {flags.length === 0 ? (
        <p className="iei-note">
          Nothing is, by these rules: a counted winning margin under 1% of the votes polled; a contest with nobody in it; a candidacy and a result that disagree.
        </p>
      ) : (
        <DataList label="Flags">
          {flags.map((f) => (
            <DataRow key={f.text} title={f.text} rule={`Rule: ${f.rule}`} />
          ))}
        </DataList>
      )}
    </Panel>
  );
}
