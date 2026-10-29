import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { dumbbell } from '../../../packages/mandate/src/viz/story.ts';
import type { HouseSeg } from '../../../packages/mandate/src/viz/story.ts';
import { fillFor } from '../../../packages/mandate/src/viz/party-ink.ts';
import { electionHref, stateHref } from '../../../packages/mandate/src/repo/routes.ts';
import type { StoryDistrict, StoryParty, StoryView, StoryVote } from '../../../packages/mandate/src/repo/home-story.ts';
import type { GlanceRow, StateChoice } from '../../../packages/mandate/src/repo/home-glance.ts';
import { DataList, DataRow, Panel, Table } from './parts.tsx';
import { SeatFlow } from './SeatFlow.tsx';
import { MarginDistribution } from './Distribution.tsx';

/**
 * The front page's story: one sentence, the picture that proves it, four doors, and a chapter for each question the sentence raises.
 *
 * Everything here is drawn from `StoryView` (repo/home-story.ts), which chose the story by rule; nothing in this file knows a state, a
 * party or a year. Every picture has its table or its sentence beside it (a `title` is never the only place a figure is written), and a
 * chapter that cannot be drawn from the registry is left out and named once, by `StoryCannot`, instead of drawn empty.
 *
 * MOTION is the ladder's and nothing else's: the four bars wipe in from the left in election order (`iei-wipe`, see iei.css). The chapters
 * below the first screen do not promise to move.
 *
 * WHAT IS NEVER PRINTED: a vote share, a turnout or a runner-up for an election that published none. A 2026 row has a square (its seats) and
 * no circle, and says "votes not reported" where its figure would be.
 */

const IN = new Intl.NumberFormat('en-IN');
const one = (n: number): string => n.toFixed(1);
/** A margin under 1% of votes polled keeps a second decimal, so that 57 votes in 250,000 does not read as 0.0%. */
const marginShare = (n: number): string => (n < 1 ? n.toFixed(2) : n.toFixed(1));
const pos = (x: number): string => `${Math.round(x * 10000) / 100}%`;
const at = (i: number): CSSProperties => ({ '--i': i }) as CSSProperties;

function Sw({ k }: { k: string | null }) {
  return k === null ? null : <span className="iei-sw" style={{ background: fillFor(k) }} aria-hidden="true" />;
}

function Party({ p, bold = false }: { p: StoryParty; bold?: boolean }) {
  return (
    <span className="iei-mark">
      <Sw k={p.key} />
      {bold ? <b>{p.label}</b> : <span className="iei-chip">{p.label}</span>}
    </span>
  );
}

/** "a", "a and b", "a, b and c". */
function list(items: readonly ReactNode[]): ReactNode {
  return items.map((x, i) => (
    <span key={i}>
      {i === 0 ? '' : i === items.length - 1 ? ' and ' : ', '}
      {x}
    </span>
  ));
}

const joinNames = (names: readonly string[]): string =>
  names.length <= 3 ? names.join(names.length === 2 ? ' and ' : ', ').replace(/, ([^,]*)$/, ' and $1') : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;

/* ───────────────────────────── the answer ───────────────────────────── */

export function StoryHead({ view }: { view: StoryView }) {
  const { lead, sentence: s } = view;
  const earlier = s.earlier.map((e) =>
    e.seats === 0 ? (
      <>none in {e.year}</>
    ) : (
      <>
        <b>{e.seats}</b> in {e.year}
      </>
    ),
  );
  // Why this state is the one shown, said every time: a page that shows one state owes the reader the reason.
  const why =
    view.basis === 'asked'
      ? 'Chosen on the map. Choose another state there to see its latest election here.'
      : view.choices > 1
        ? 'Showing the most recent election on record. Choose another state on the map to see its latest election here.'
        : `${view.jurisdiction.name} is the only state with an assembly result on record, so it is the one shown here.`;
  return (
    <div className="iei-head iei-story-head" id="state">
      <p className="iei-eyebrow">
        {view.jurisdiction.name} · latest assembly election, {view.latest.year}
      </p>
      <h2 className="iei-story-lead iei-story-sentence">
        <Party p={lead} bold /> won <b>{s.seats}</b> of {view.jurisdiction.name}&rsquo;s <b>{view.total}</b> seats in {view.latest.year}
        {s.direction === null || earlier.length === 0 ? null : (
          <>
            , {s.direction} {list(earlier)}
          </>
        )}
        .
      </h2>
      <p className="iei-sub">{view.scope}</p>
      <p className="iei-note">{why}</p>
    </div>
  );
}

/* ───────────────────────────── the whole country, and the state chosen in it ───────────────────────────── */

const houseLine = (label: string, h: GlanceRow['assembly']): ReactNode =>
  h === null ? (
    <span className="iei-absent">no {label} result on record</span>
  ) : h.leader === null ? (
    <>
      {label} {h.year}: <span className="iei-absent">no winner declared</span>
    </>
  ) : (
    <>
      {label} {h.year}: <Party p={h.leader} /> <b>{h.seats}</b> of {h.of}
      {h.majority ? ' · majority' : ' · no majority'}
    </>
  );

/**
 * The card beside the map, and it is two things on purpose. With no state chosen it is a GLANCE: the latest election of every state that has one, in one
 * order that judges none of them (home-glance.ts). With a state chosen it is that state's HIGHLIGHT: its latest assembly election and its slice of the latest
 * Lok Sabha, and the ways on. Either way a state is a link, so the choice is in the URL and costs no script; hovering the map or a row lights the other.
 */
export function StateCard({
  rows,
  chosen,
  hrefFor,
  clearHref,
  storyHere,
}: {
  rows: readonly GlanceRow[];
  chosen: StateChoice | null;
  hrefFor: (id: string) => string;
  clearHref: string;
  /** The state the section below the map is about, so the card can point at it. */
  storyHere: string | null;
}) {
  if (chosen !== null) {
    const name = chosen.status === 'loaded' ? chosen.row.name : chosen.name;
    return (
      <section className="iei-story-card" aria-label={`Latest elections in ${name}`}>
        <p className="iei-eyebrow">{name}</p>
        {chosen.status === 'loaded' ? (
          <>
            <p className="iei-story-card-l">{houseLine('Assembly', chosen.row.assembly)}</p>
            <p className="iei-story-card-l">{houseLine('Lok Sabha', chosen.row.loksabha)}</p>
          </>
        ) : (
          <p className="iei-story-card-l">
            <span className="iei-absent">No election result is on record for {name} yet.</span>{' '}
            {chosen.seats === null ? null : `Its assembly has ${IN.format(chosen.seats)} seats in the reference data.`}
          </p>
        )}
        <p className="iei-story-card-go">
          <Link href={stateHref(chosen.status === 'loaded' ? chosen.row.id : chosen.id)}>Open {name}</Link>
          {storyHere !== null && chosen.status === 'loaded' && storyHere === chosen.row.id ? <Link href="#state">Its latest election, below</Link> : null}
          <Link href={clearHref}>All states</Link>
        </p>
      </section>
    );
  }
  return (
    <section className="iei-story-card" aria-label="Latest elections, state by state">
      <p className="iei-eyebrow">Latest elections, state by state</p>
      {rows.length === 0 ? (
        <p className="iei-absent">No election result is on record yet.</p>
      ) : (
        <ul className="iei-story-glance">
          {rows.map((r) => (
            <li key={r.id} data-j={r.id}>
              <Link href={hrefFor(r.id)} className="iei-story-gname">
                {r.name}
              </Link>
              <span className="iei-story-gl">{houseLine('Assembly', r.assembly)}</span>
              <span className="iei-story-gl">{houseLine('Lok Sabha', r.loksabha)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="iei-note">Most recent election first, then by name. Choose a state on the map or here to see its latest election.</p>
    </section>
  );
}

export function StoryDoors({ view }: { view: StoryView }) {
  return (
    <nav className="iei-story-doors" aria-labelledby="story-doors-h">
      <h2 className="iei-eyebrow" id="story-doors-h">
        Open the record
      </h2>
      <ul>
        {view.doors.map((d) => (
          <li key={d.door}>
            <Link href={d.href} className="iei-story-door">
              <span className="iei-story-door-k">{d.door}</span>
              <b>{d.title}</b>
              <span>{d.line}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/* ───────────────────────────── the proof: four houses ───────────────────────────── */

const segClass = (s: HouseSeg): string =>
  s.role === 'others' ? 'iei-res-seg iei-res-others' : s.role === 'none' ? 'iei-res-seg iei-story-none' : 'iei-res-seg';

export function StoryHouses({ view }: { view: StoryView }) {
  const { lead, partner, houses } = view;
  // Every party that ever held a seat, none folded, the party with most seats at the newest election first.
  const newest = houses[houses.length - 1]!;
  const seatsOf = (h: (typeof houses)[number], key: string): number => h.tally.find((t) => t.key === key)?.seats ?? 0;
  const parties = [...new Map(houses.flatMap((h) => h.tally.map((t) => [t.key, t.label] as const))).entries()].sort(
    (a, b) => seatsOf(newest, b[0]) - seatsOf(newest, a[0]) || Math.max(...houses.map((h) => seatsOf(h, b[0]))) - Math.max(...houses.map((h) => seatsOf(h, a[0]))) || (a[0] < b[0] ? -1 : 1),
  );
  return (
    <figure className="iei-story-fig">
      <ol className="iei-story-houses" aria-label="Seats by party at each election">
        {houses.map((h, i) => {
          const leadSeg = h.segments.find((s) => s.role === 'lead');
          const partnerSeg = h.segments.find((s) => s.role === 'partner');
          return (
            <li key={h.electionId} className="iei-story-house" style={at(i)}>
              <Link href={electionHref(h.electionId)} className="iei-story-yr">
                {h.year}
              </Link>
              <div className="iei-story-track">
                <div className="iei-res-bar iei-story-bar" aria-hidden="true">
                  {h.segments.map((s) => (
                    <span
                      key={`${s.role}-${s.key ?? s.label}`}
                      className={segClass(s)}
                      style={{ flexGrow: s.n, background: s.key === null ? undefined : fillFor(s.key) }}
                      title={`${s.label}: ${s.n} ${s.n === 1 ? 'seat' : 'seats'}`}
                    />
                  ))}
                </div>
                <i className="iei-story-half" aria-hidden="true" />
              </div>
              <p className="iei-story-ends">
                <span>
                  <Sw k={lead.key} />
                  {lead.label} {leadSeg === undefined ? <span className="iei-absent">no seat</span> : <b>{leadSeg.n}</b>}
                </span>
                {partner === null ? null : (
                  <span>
                    <Sw k={partner.key} />
                    {partner.label} <b>{partnerSeg?.n ?? 0}</b>
                  </span>
                )}
              </p>
            </li>
          );
        })}
      </ol>
      <figcaption className="iei-note">
        Each bar is the whole house, {IN.format(view.total)} seats, and the line is half of it. The order of the colours means nothing else: the
        party in the sentence starts at the left, and the party that lost it most seats ends at the right. Hatched is the smaller parties added
        together; dashed is seats with no declared winner.
      </figcaption>
      <details className="iei-twin">
        <summary>Seats by party at each election, as a table</summary>
        <Table
          label="Seats by party at each election"
          tight
          head={
            <>
              <th scope="col">Party</th>
              {houses.map((h) => (
                <th key={h.electionId} scope="col" className="iei-n">
                  {h.year}
                </th>
              ))}
            </>
          }
        >
          {parties.map(([key, label]) => (
            <tr key={key}>
              <th scope="row">
                <Party p={{ key, label }} />
              </th>
              {houses.map((h) => (
                <td key={h.electionId} className="iei-n">
                  {seatsOf(h, key)}
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <th scope="row">No declared winner</th>
            {houses.map((h) => (
              <td key={h.electionId} className="iei-n">
                {h.undeclared}
              </td>
            ))}
          </tr>
        </Table>
      </details>
    </figure>
  );
}

/* ───────────────────────────── what changed, and where ───────────────────────────── */

export function StoryChanged({ view }: { view: StoryView }) {
  const c = view.changed;
  if (c === null) return null;
  const { lead, partner } = view;
  return (
    <Panel id="changed" title="What changed" question={`Whose seats did ${lead.label} take?`}>
      <p className="iei-story-lead">
        <b>{IN.format(c.flows.flipped)}</b> of the <b>{IN.format(c.flows.compared)}</b> seats that can be compared changed hands since{' '}
        {c.previousYear}.
        {c.leadFromPartner === null || partner === null ? null : (
          <>
            {' '}
            <b>{IN.format(c.leadFromPartner)}</b> of them went from {partner.label} to {lead.label}.
          </>
        )}
      </p>
      <SeatFlow flows={c.flows} previousYear={c.previousYear} year={view.latest.year} />
      <p className="iei-note">
        <Link href={`${stateHref(view.jurisdiction.id)}?mode=flips&shape=tiles#map`}>See every seat on the map</Link>
      </p>
    </Panel>
  );
}

function DistrictRow({ d, max }: { d: StoryDistrict; max: number }) {
  const gained = d.gains.map((g) => `${g.label} ${g.n}`).join(', ');
  return (
    <li className="iei-story-drow">
      <Link href={d.href} className="iei-story-dname">
        {d.name}
      </Link>
      <span className="iei-story-dtrack" aria-hidden="true">
        <span className="iei-story-dbar" style={{ width: `${(100 * d.comparable) / max}%` }}>
          {d.gains.map((g) => (
            <i key={g.key} style={{ flexGrow: g.n, background: fillFor(g.key) }} title={`${g.n} to ${g.label}`} />
          ))}
          <i className="iei-story-held" style={{ flexGrow: d.comparable - d.flipped }} />
        </span>
      </span>
      <span className="iei-story-dval">
        <b>{d.flipped}</b> of {d.comparable}
        {d.flipped === 0 ? null : <span className="iei-sr">, to {gained}</span>}
      </span>
    </li>
  );
}

export function StoryWhere({ view }: { view: StoryView }) {
  const { districts } = view;
  const most = districts[0];
  if (most === undefined) return null;
  const max = Math.max(...districts.map((d) => d.comparable));
  const none = districts.filter((d) => d.flipped === 0 && d.comparable >= 3).map((d) => d.name);
  return (
    <Panel id="where" title="Where" question="Where did seats change hands?">
      <p className="iei-story-lead">
        {most.flipped === 0 ? (
          <>No seat changed hands in any district.</>
        ) : (
          <>
            <strong className="iei-story-nm">{most.name}</strong> had the most seats change hands, <b>{most.flipped}</b> of {most.comparable}.
            {none.length === 0 ? null : <> No seat changed hands in {joinNames(none)}.</>}
          </>
        )}
      </p>
      <ol className="iei-story-dlist" aria-label="Districts by seats that changed hands">
        {districts.slice(0, 8).map((d) => (
          <DistrictRow key={d.id} d={d} max={max} />
        ))}
      </ol>
      {districts.length <= 8 ? null : (
        <details className="iei-twin iei-story-more">
          <summary>The other {districts.length - 8} districts</summary>
          <ol className="iei-story-dlist" aria-label="The other districts">
            {districts.slice(8).map((d) => (
              <DistrictRow key={d.id} d={d} max={max} />
            ))}
          </ol>
        </details>
      )}
      <p className="iei-note">
        A bar is a district&rsquo;s seats that can be compared with the earlier election. The coloured part changed hands, in the colour of the
        party that won them; the grey part did not.
        {view.noDistrict === 0 ? null : <> {view.noDistrict} seats are in no district on record and are not listed.</>}
      </p>
    </Panel>
  );
}

/* ───────────────────────────── did the votes follow the seats ───────────────────────────── */

function VoteRow({ p, v, first }: { p: StoryParty; v: StoryVote; first: boolean }) {
  const d = dumbbell({ a: v.votePct, b: v.seatPct, min: 0, max: 100 });
  const ink = fillFor(p.key);
  return (
    <li className="iei-story-vrow">
      <span className="iei-story-vyr">{first ? <Link href={electionHref(v.electionId)}>{v.year}</Link> : null}</span>
      <span className="iei-story-vparty">
        <Party p={p} />
      </span>
      <span className="iei-story-vtrack" aria-hidden="true">
        <i className="iei-story-vhalf" />
        {d.from === null || d.to === null ? null : <i className="iei-story-vline" style={{ left: pos(d.from), width: pos(d.to - d.from) }} />}
        {d.ax === null || v.votePct === null ? null : (
          <i className="iei-story-vote" style={{ left: pos(d.ax), background: ink }} title={`${p.label} ${v.year}: ${one(v.votePct)}% of the votes`} />
        )}
        {d.bx === null || v.seatPct === null ? null : (
          <i className="iei-story-seat" style={{ left: pos(d.bx), background: ink }} title={`${p.label} ${v.year}: ${one(v.seatPct)}% of the seats`} />
        )}
      </span>
      <span className="iei-story-vfig">
        {v.votePct === null ? <span className="iei-absent">votes not reported</span> : <><b>{one(v.votePct)}%</b> votes</>}
        {' · '}
        {v.seatPct === null ? <span className="iei-absent">seats not reported</span> : <><b>{one(v.seatPct)}%</b> seats</>}
      </span>
    </li>
  );
}

export function StoryVotes({ view }: { view: StoryView }) {
  const { lead, partner, votes } = view;
  const rows = votes.lead.map((v, i) => ({ v, w: votes.partner?.[i] ?? null }));
  // The newest election both parties have a vote share for: the sentence says what the picture shows there.
  const counted = [...rows].reverse().find((r) => r.v.votePct !== null && (r.w === null || r.w.votePct !== null));
  const unpublished = rows.some((r) => r.v.votePct === null);
  return (
    <Panel id="votes" title="Votes and seats" question="Did the votes follow the seats?">
      <p className="iei-story-lead">
        {counted === undefined ? (
          <>No election on record published candidate votes, so no vote share is drawn; each square is a share of the seats.</>
        ) : (
          <>
            In {counted.v.year},{' '}
            {partner === null || counted.w === null ? null : (
              <>
                {partner.label} took <b>{one(counted.w.votePct!)}%</b> of the votes and <b>{one(counted.w.seatPct ?? 0)}%</b> of the seats;{' '}
              </>
            )}
            {lead.label} <b>{one(counted.v.votePct!)}%</b>
            {partner === null ? ' of the votes and ' : ' and '}
            <b>{one(counted.v.seatPct ?? 0)}%</b>
            {partner === null ? ' of the seats' : ''}.
            {unpublished ? <> For {view.latest.year} the registry holds the seats and not the votes.</> : null}
          </>
        )}
      </p>
      <ol className="iei-story-votes" aria-label="Share of votes and share of seats, by party and election">
        {rows.flatMap(({ v, w }) => [
          <VoteRow key={`${v.electionId}-${lead.key}`} p={lead} v={v} first />,
          ...(partner === null || w === null ? [] : [<VoteRow key={`${v.electionId}-${partner.key}`} p={partner} v={w} first={false} />]),
        ])}
      </ol>
      <p className="iei-note">
        A circle is a share of the votes polled in the seats where the registry holds candidates&rsquo; votes; a square is a share of the
        house&rsquo;s seats; the line between them is how far the seats ran from the votes. The dashed line is half.
      </p>
      <details className="iei-twin">
        <summary>Votes and seats by party, as a table</summary>
        <Table
          label="Votes and seats by party at each election"
          tight
          head={
            <>
              <th scope="col">Party</th>
              {view.houses.map((h) => (
                <th key={h.electionId} scope="col">
                  {h.year}
                </th>
              ))}
            </>
          }
        >
          {votes.all.map((a) => (
            <tr key={a.party.key}>
              <th scope="row">
                <Party p={a.party} />
              </th>
              {a.points.map((pt) => (
                <td key={pt.electionId}>
                  {pt.votePct === null ? <span className="iei-absent">votes not reported</span> : `${one(pt.votePct)}% of votes`}
                  {', '}
                  {pt.seats} {pt.seats === 1 ? 'seat' : 'seats'}
                  {pt.seatPct === null ? '' : ` (${one(pt.seatPct)}%)`}
                </td>
              ))}
            </tr>
          ))}
        </Table>
      </details>
    </Panel>
  );
}

/* ───────────────────────────── how close ───────────────────────────── */

export function StoryClose({ view }: { view: StoryView }) {
  const { bins, counted, countedSpan, declared, declaredYear } = view.close;
  const total = bins === null ? 0 : bins.bins.reduce((n, b) => n + b.n, 0);
  return (
    <Panel id="close" title="How close" question="How close can a seat be?">
      {bins === null ? (
        <p className="iei-absent">
          No election on record published candidate votes, so no margin can be set against the votes polled.
        </p>
      ) : (
        <div className="iei-two iei-story-closewrap">
          <div>
            <h3 className="iei-story-h3">{bins.year}: margin over votes polled</h3>
            <MarginDistribution
              bins={bins.bins}
              selected={null}
              total={total}
              hrefFor={(b) => (b === null ? electionHref(bins.electionId) : `${electionHref(bins.electionId)}?bin=${b}#map`)}
              mapped={false}
            />
          </div>
          <div>
            <h3 className="iei-story-h3">
              Closest counted results, {countedSpan === null || countedSpan.from === countedSpan.to ? bins.year : `${countedSpan.from}–${countedSpan.to}`}
            </h3>
            <DataList label="The closest counted results" tight>
              {counted.map((c) => (
                <DataRow
                  key={`${c.name}-${c.year}`}
                  title={c.name}
                  href={c.href}
                  aside={<b>{IN.format(c.votes)} votes</b>}
                  detail={
                    <>
                      <Party p={{ key: c.winner.key, label: c.winner.label }} />
                      {c.runnerUp === null ? ' won' : <> over {c.runnerUp.label}</>} · {marginShare(c.share)}% of votes polled · {c.year}
                    </>
                  }
                />
              ))}
            </DataList>
          </div>
        </div>
      )}
      {declared.length === 0 ? null : (
        <div className="iei-story-declared">
          <h3 className="iei-story-h3">{declaredYear}: the closest declared margins</h3>
          <ul className="iei-story-cards">
            {declared.map((c) => (
              <li key={c.name}>
                <Link href={c.href}>
                  <b>{c.name}</b>
                </Link>
                <span>
                  <Party p={{ key: c.winner.key, label: c.winner.label }} /> won by <b>{IN.format(c.votes)}</b> votes, <span className="iei-of">declared</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="iei-note">
            Declared: the source published each margin and no vote counts, so there is no runner-up or share on record, and these are not ranked
            against the counted results.
          </p>
        </div>
      )}
    </Panel>
  );
}

/* ───────────────────────────── who was always there ───────────────────────────── */

export function StoryPeople({ view }: { view: StoryView }) {
  const s = view.streak;
  if (s === null) return null;
  const first = view.houses[0]!.year;
  const n = s.rows.length;
  return (
    <Panel id="people" title="People" question="Who was always there?">
      <p className="iei-story-lead">
        {s.party === null || s.seatsNow === null ? (
          <>
            <b>{n}</b> members of the {view.latest.year} house hold a seat they won at all {s.elections} elections since {first}.
          </>
        ) : (
          <>
            <b>{n}</b> of {s.party.label}&rsquo;s <b>{s.seatsNow}</b> seats in {view.latest.year} {n === 1 ? 'is' : 'are'} held by someone who has
            won that seat at all {s.elections} elections since {first}.
          </>
        )}
      </p>
      <Table
        label="Members who won the same seat at every election"
        tight
        className="iei-story-ptable"
        head={
          <>
            <th scope="col">Member</th>
            <th scope="col" className="iei-story-seat-col">
              Seat
            </th>
            {view.houses.map((h) => (
              <th key={h.electionId} scope="col" className="iei-n">
                {h.year}
              </th>
            ))}
          </>
        }
      >
        {s.rows.map((r) => (
          <tr key={r.personId}>
            <th scope="row">
              <Link href={r.personHref}>{r.name}</Link>
              <Link href={r.href} className="iei-story-seat-under">
                {r.seat}
              </Link>
            </th>
            <td className="iei-story-seat-col">
              <Link href={r.href}>{r.seat}</Link>
            </td>
            {r.cells.map((c) => (
              <td key={c.year} className="iei-n">
                <span className="iei-mark">
                  <Sw k={c.party.key} />
                  <span className="iei-chip">{c.party.label}</span>
                </span>{' '}
                {c.margin === null ? (
                  <span className="iei-absent">no margin</span>
                ) : (
                  <>
                    {IN.format(c.margin.votes)}
                    {c.margin.basis === 'declared' ? <span className="iei-of"> declared</span> : null}
                  </>
                )}
              </td>
            ))}
          </tr>
        ))}
      </Table>
      <p className="iei-note">
        Margins are in votes. One marked declared was published without vote counts. A person who changed party is a separate record in the
        registry, so {n} is a count on record, not a ceiling.
      </p>
    </Panel>
  );
}

/* ───────────────────────────── what cannot be said ───────────────────────────── */

export function StoryCannot({ view }: { view: StoryView }) {
  if (view.cannot.length === 0) return null;
  return (
    <Panel id="cannot" title="What this registry cannot yet say">
      <ul className="iei-story-cannot">
        {view.cannot.map((c) => (
          <li key={c.question}>
            <b>{c.question}</b> {c.why}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* ───────────────────────────── the reach ledger ───────────────────────────── */

export type Reach = { label: string; have: number; of: number; unit: string };

/** Three figures against their true denominators, once: the absence said in one place instead of in 35 rows. */
export function HomeReach({ reach }: { reach: readonly Reach[] }) {
  return (
    <ul className="iei-story-reach" aria-label="How much of India the registry holds">
      {reach.map((r) => (
        <li key={r.label}>
          <span className="iei-story-reach-l">{r.label}</span>
          <span className="iei-story-reach-bar" aria-hidden="true">
            <i style={{ width: `${(100 * r.have) / r.of}%` }} />
          </span>
          <span className="iei-story-reach-v">
            <b>{IN.format(r.have)}</b> of {IN.format(r.of)} {r.unit}
          </span>
        </li>
      ))}
    </ul>
  );
}
