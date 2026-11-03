import Link from 'next/link';
import { electionHref, stateHref } from '../../packages/mandate/src/repo/routes.ts';
import { homeView, layerChoices, leaderOf } from '../../packages/mandate/src/repo/home.ts';
import { bodyWord } from '../../packages/mandate/src/core/election-kind.ts';
import { turnoutHeadline } from '../../packages/mandate/src/repo/turnout-trust.ts';
import type { HomeView } from '../../packages/mandate/src/repo/home.ts';
import { partyAnchor } from '../../packages/mandate/src/repo/search.ts';
import { readAsk, readSelection, queryHref } from '../../packages/mandate/src/repo/map-selection.ts';
import { readRegistry } from '../../packages/mandate/src/repo/session.ts';
import { glanceOf, indiaSentence, stateChoice } from '../../packages/mandate/src/repo/home-glance.ts';
import { landscapeOverTime } from '../../packages/mandate/src/repo/landscape.ts';
import { frameSentence, framesOf } from '../../packages/mandate/src/repo/landscape-frames.ts';
import { nextUp } from '../../packages/mandate/src/repo/next-up.ts';
import { readLiveFeed } from '../../packages/mandate/src/repo/live-feed.ts';
import { liveReply } from '../../packages/mandate/src/repo/live-reply.ts';
import type { Cell } from '../../packages/mandate/src/repo/home.ts';
import { fillFor } from '../../packages/mandate/src/viz/party-ink.ts';
import { GEOMETRY_SOURCE } from '../lib/india-geo.ts';
import { Foot, Shell } from '../components/iei/Shell.tsx';
import { IndiaMap } from '../components/iei/IndiaMap.tsx';
import { HomeReach, StateCard } from '../components/iei/Story.tsx';
import { LandscapeMap, NextUpRail } from '../components/iei/Situation.tsx';
import { TimeMachine } from '../components/iei/TimeMachine.tsx';
import { LiveBoard } from '../components/iei/LiveBoard.tsx';
import {
  DataList,
  DataRow,
  Incomplete,
  Panel,
  RegistryMissing,
  Sparkline,
  Table,
  Tabs,
  Value,
} from '../components/iei/parts.tsx';
import './iei.css';

/**
 * `/` — INDIA: an overview of where the country stands, what comes next, how it got here, and, when an election is running, where its count is.
 *
 * Rebuilt 2026-11-03 (docs/superpowers/specs/2026-11-03-situation-room-home-design.md). The page used to open on the country and then spend six thousand
 * pixels on one state's story, which made a registry holding one state read as an unfinished product. It is now five things, in the order a visitor needs them:
 *
 *   NOW        one computed sentence about the country and the figures behind it, counted up once on arrival.
 *   LANDSCAPE  the map by who leads each state's assembly, with the layers, the state card and the table that answer to it. A click goes to the state,
 *              which is where a state's own story lives.
 *   NEXT UP    the elections that come next, soonest first, with how far through its term each is. A date is "announced" only if the Commission set it.
 *   HISTORY    the time machine: every year the registry holds an assembly election in, a scrubber and a play button, the map and the tally re-coloured for
 *              the year. A state with no election by that year is not coloured.
 *   REFERENCE  what was just decided, the closest contests, and who holds what.
 *
 * AND ONE MORE, WHEN IT EXISTS: THE LIVE BOARD. With a feed present (`MANDATE_LIVE_PATH`) it is the first thing on the page, polled every twenty seconds. It
 * shows the count, and the projections OTHER PEOPLE have published, each with its publisher: the registry does not forecast, and a board that looked like its
 * own estimate would break the rule this product stands on. With no feed, nothing live renders at all.
 *
 * Every figure is a `SELECT` executed when the page is requested. THERE IS NO LIST OF STATES IN THIS FILE, and there must never be one: the 36 jurisdictions,
 * the seat counts, the elections and every year of the time machine arrive from the registry, so loading Kerala's next assembly puts Kerala on this page without
 * a line of UI changing.
 *
 * WHAT THE PAGE MAY NOT DO, because it is easier to violate in JSX than anywhere else: print a figure no source published, print an inferred date as an announced
 * one, colour a state the registry has no election for, or shade a jurisdiction in a colour that stands for nothing. `Value` cannot render a null as a blank,
 * an inferred year is prefixed with the word for what it is, and an unlit polygon wears an ink that deliberately fails the contrast floor a mark has to clear.
 *
 * THE STATE STORY THAT USED TO BE HERE (repo/home-story.ts and components/iei/Story.tsx) is not deleted: it is the state page's to carry, in the next phase
 * of the design document, and the front page links to it through the map.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The year the page reasons about. A constant rather than a call to the clock, so a list of expiring terms
 * cannot change under a test and the one thing that needs updating is visible instead of buried in SQL.
 */
const THIS_YEAR = 2026;

/** The span of the elections the party table sums over, so its caveat states its own range. */
const oldest = (v: HomeView): number => Math.min(...v.standings.map((s) => s.year));
const newest = (v: HomeView): number => Math.max(...v.standings.map((s) => s.year));

const IN = new Intl.NumberFormat('en-IN');

/** The registry's name for a jurisdiction id, from the rows the page already holds. */
function nameOf(v: HomeView, id: string): string {
  return v.states.find((j) => j.id === id)?.name ?? id;
}

export default function Home({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const ask = readAsk(searchParams);
  /**
   * A link to this page with one parameter changed and the rest kept, anchored at the map: every parameter this page
   * takes changes the map, and a reader who clicks a layer should not be returned to the top of the document. The layer
   * is a subject param, which chooses the data, so it is not a move of the selection and is written here.
   */
  const href = (change: Record<string, string>): string => queryHref('/', ask, change, 'map');

  // A fresh clone has no registry. That is the expected failure, not a bug in this process, and the page
  // says so with the command that fixes it rather than rendering a 500. Anything else is thrown.
  const read = readRegistry((db) => {
    const home = homeView(db, { layer: ask.get('layer'), thisYear: THIS_YEAR });
    // The three things the page was rebuilt around, each from the registry for however many states it holds: how the map of governments
    // changed (repo/landscape.ts), which elections come next with how far through their terms they are (repo/next-up.ts), and the frames
    // the time machine moves between, which repo/landscape-frames.ts builds and tests so that no state is coloured without an election.
    const landscape = landscapeOverTime(db);
    return { home, landscape, next: nextUp(db, new Date()) };
  });
  if (!read.ok) {
    return (
      <Shell here="india">
        <RegistryMissing />
      </Shell>
    );
  }
  const v = read.value.home;
  const { landscape, next: coming } = read.value;
  const frames = framesOf(landscape);
  const frameLines = frames.map(frameSentence);

  // VALIDATED BY MEMBERSHIP, never parsed: `?party=` has to name a party the CURRENT layer actually shows, so
  // a hand-edited value cannot isolate nothing, cannot reach the SQL, and cannot survive a layer switch that
  // makes it meaningless. Switching to the turnout layer drops it, because a turnout band is not a party. The layer
  // is read first, and what it shows is what the selection may be narrowed to: its party links are moves of `sel`.
  const sel = readSelection(searchParams, layerChoices(v.layer), { base: '/', anchor: 'map' });
  const party = sel.isolation?.by === 'party' ? sel.isolation.key : null;
  // The legend names the parties leading more than one state, and always the one being isolated. Everything
  // else is one state each and folds into a disclosure below.
  const many = v.layer.legend.filter((l) => l.key === null || l.key === party || !/^1 state$/.test(l.note ?? ''));
  const shown = many.length > 0 ? many : v.layer.legend.slice(0, 8);
  const rest = v.layer.legend.filter((l) => !shown.includes(l));
  const s = v.snapshot;
  // The party leading each jurisdiction's most recent assembly, for the Upcoming rows.
  const standingOf = (id: string): HomeView['standings'][number] | undefined =>
    v.standings.find((x) => x.jurisdictionId === id);
  // Only a layer that colours a party has a party in each row for a seat count to belong to.
  const seated = v.layer.encoding === 'categorical';

  // The whole country first: every jurisdiction with a result, side by side, and the state the reader chose.
  const askedState = typeof searchParams?.state === 'string' ? searchParams.state : null;
  const rows = glanceOf({ standings: v.standings, houseStandings: v.houseStandings });
  const chosen = stateChoice({ standings: v.standings, houseStandings: v.houseStandings, states: v.states }, askedState);
  const choose = (c: Cell): string => queryHref('/', ask, { state: c.jurisdictionId }, 'map');
  const chooseId = (id: string): string => queryHref('/', ask, { state: id }, 'map');
  const clearHref = queryHref('/', ask, { state: '' }, 'map');
  const selectedId = chosen === null ? null : chosen.status === 'loaded' ? chosen.row.id : chosen.id;

  // THE LIVE FEED, read the way the poll reads it (repo/live-reply.ts), so the first render and every update after it are one function of one file. Absent, the
  // page has no live element at all; an unusable feed is said to be unusable and never guessed at.
  const live = liveReply(readLiveFeed(process.env['MANDATE_LIVE_PATH'], new Date()));
  const liveBoard = live.state === 'boards' ? live.boards[0] : undefined;
  const liveOn = s.live || liveBoard !== undefined;

  const reach = [
    { label: 'States and territories with results', have: s.jurisdictionsWithResults, of: s.jurisdictionsTotal, unit: '' },
    { label: 'Assembly seats', have: s.assemblySeatsHeld, of: s.assemblySeatsTotal, unit: 'seats' },
    { label: 'Lok Sabha seats', have: s.lokSabhaSeatsHeld, of: s.lokSabhaSeatsTotal, unit: 'seats' },
  ].filter((r) => r.of > 0);
  // The map's rows that hold nothing on this layer are one line under the table, not thirty-five rows of "not loaded".
  const lit = v.layer.cells.filter((c) => c.label !== null);
  const held = lit.length > 0 ? lit : v.layer.cells;
  const bare = lit.length > 0 ? v.layer.cells.filter((c) => c.label === null) : [];

  return (
    <Shell here="india" live={liveOn} liveLabel={liveBoard === undefined ? null : `${liveBoard.election.jurisdictionName} · ${liveBoard.status}`}>
      {/* ── THE LIVE BOARD, FIRST WHEN THERE IS ONE. A running election changes this page in place: the count, the projections other people have
          published (each with its publisher) and the events, polled every twenty seconds. With no feed nothing live renders at all, and an
          invalid feed is said to be invalid rather than guessed at. ── */}
      {live.state === 'error' ? (
        <section className="iei-live-board" id="live" aria-label="Live election">
          <p className="iei-eyebrow">Live feed</p>
          <p className="iei-absent">The live feed is configured but cannot be used, so no live count is shown: {live.error}</p>
        </section>
      ) : live.state === 'boards' ? (
        <LiveBoard initial={live.boards} sentences={live.sentences} fills={live.fills} endpoint="/v1/live" />
      ) : null}
      {/* ── THE COUNTRY FIRST. The page used to open on one state's story, which made that state the page's subject; it opens on India now, with every
          state that has a result in one glance, and a state's story is what the reader's choice (or, failing one, the most recent election) opens
          below the map. ── */}
      <div id="india">
        <div className="iei-hero" id="now">
          <div className="iei-head">
            <p className="iei-eyebrow">India</p>
            <h1 className="iei-answer">The electoral landscape</h1>
            <p className="iei-story-lead">{indiaSentence(rows, s.jurisdictionsTotal)}</p>
            <p className="iei-sub">
              Choose a state on the map to see its latest election; the rest are names and seat counts. <b>Nothing here is a prediction.</b> No model, no forecast, no
              probability.
            </p>
          </div>
          {/* How much of the country the registry holds, said once with true denominators, beside the sentence it qualifies. */}
          <div className="iei-hero-reach">
            <p className="iei-eyebrow">How much of India the registry holds</p>
            <HomeReach reach={reach} />
          </div>
        </div>

      {/* ── NEXT UP, directly under the hero: the elections that come next are a headline of this page, not a reference table. Soonest first, with how far
          through its term each one is. An announced date prints as itself; the Commission's schedule is not in the registry yet, so today every card is a
          five-year term counted from the last election, and says "Expected". ── */}
      <Panel id="next" title="Next up" question="Which elections come next?">
        {coming.length === 0 ? (
          <p className="iei-absent">No jurisdiction has an assembly election on record to count a term from.</p>
        ) : (
          <>
            <NextUpRail items={coming} shown={5} />
            {coming.some((n) => n.basis === 'announced') ? null : (
              <p className="iei-note">Inferred, not announced: each date is a five-year term counted from the last election, and the bar shows how much of it has run.</p>
            )}
          </>
        )}
      </Panel>

      {/* ── the map: the product's primary analytical instrument, and its primary navigation ── */}
      <div id="landscape" />
      <Panel
        id="map"
        title={`India · ${v.layer.label}`}
        question={v.layer.question}
        /* The geometry's provenance, in the same drawer as everything else. It used to be spelled out in the
           map's caption on every request. */
        sources={[GEOMETRY_SOURCE]}
      >
        <Tabs
          label="Map layer"
          current={v.layer.key}
          choices={v.layers.map((l) => ({
            key: l.key,
            label: l.label,
            href: href({ layer: l.key }),
            available: l.available,
          }))}
        />

        <div className="iei-linked iei-map-split">
          <IndiaMap layer={v.layer} nameOf={(id) => nameOf(v, id)} selection={sel} hrefFor={choose} selectedId={selectedId} />

          <div>
            <StateCard rows={rows} chosen={chosen} hrefFor={chooseId} clearHref={clearHref} storyHere={null} />
            {/* A CONTEXTUAL LEGEND, and an interactive one. It names the parties this layer actually shows —
                not three slots and an "Others" bucket, and not every party in the registry — and each entry is
                a link that isolates that party on the map. The isolation is URL state, so it is shareable and
                costs no client JavaScript. */}
            <ul className="iei-legend">
              {shown.map((l) => (
                <li key={l.label}>
                  {l.key === null ? (
                    <>
                      <span className="iei-sw" style={{ background: l.fill }} aria-hidden="true" />
                      {l.label}
                      {l.note === undefined ? null : <b>{l.note}</b>}
                    </>
                  ) : (
                    <Link
                      href={sel.href({ party: l.key })}
                      className={party === null ? undefined : party === l.key ? 'iei-legend-on' : 'iei-legend-off'}
                      aria-current={party === l.key ? 'true' : undefined}
                      title={party === l.key ? `Stop isolating ${l.label}` : `Show only where ${l.label} leads`}
                    >
                      <span className="iei-sw" style={{ background: l.fill }} aria-hidden="true" />
                      {l.label}
                      {l.note === undefined ? null : <b>{l.note}</b>}
                    </Link>
                  )}
                </li>
              ))}
              {v.layer.unloaded === 0 ? null : (
                <li>
                  <span className="iei-sw iei-sw-none" aria-hidden="true" />
                  Not loaded <b>{v.layer.unloaded}</b>
                </li>
              )}
              {v.layer.unknown === v.layer.unloaded ? null : (
                <li>
                  <span className="iei-sw iei-sw-none" aria-hidden="true" />
                  No figure <b>{v.layer.unknown - v.layer.unloaded}</b>
                </li>
              )}
            </ul>
            {/* THE TAIL, FOLDED BUT NOT DROPPED. Seventeen parties lead a state, and a legend of seventeen is
                three rows of chrome above the map. The ones leading more than one state are named; the rest go
                behind a disclosure — reachable, isolable, and safe to fold because every polygon on the map
                carries its party's abbreviation, so the legend is a secondary aid rather than the only key. */}
            {rest.length === 0 ? null : (
              <details className="iei-ev iei-legend-more">
                <summary>
                  + {rest.length} more, one state each
                </summary>
                <ul className="iei-legend iei-legend-rest">
                  {rest.map((l) => (
                    <li key={l.label}>
                      <Link
                        href={sel.href({ party: l.key as string })}
                        className={party === null ? undefined : party === l.key ? 'iei-legend-on' : 'iei-legend-off'}
                      >
                        <span className="iei-sw" style={{ background: l.fill }} aria-hidden="true" />
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {party === null ? null : (
              <p className="iei-note">
                Showing only where <b>{v.layer.legend.find((l) => l.key === party)?.label ?? party}</b> leads.{' '}
                <Link href={sel.href('release')}>Show every party</Link>
              </p>
            )}

            {/* THE LAYER'S ROWS — the map's companion, and a genuine comparison across 36 rows, which is what
                a table is for. The seat count and its denominator are one fact in two cells so the figures
                align on their own edge, and they are there only where the layer names a party: they are that
                layer's own figures, the Lok Sabha's under the Lok Sabha layer.

                It was also INVISIBLE until this pass, at every desktop width, and that was a layout defect
                rather than a design choice — the map column's intrinsic width came from a `vh` figure, so in a
                tall window it took the whole row and this column collapsed to about 50px. See iei.css. */}
            <Table
              label="Every jurisdiction in this layer"
              caption={v.layer.question}
              tight
              tall
              head={
                <>
                  <th scope="col">State / UT</th>
                  <th scope="col">{seated ? 'Leads' : 'Value'}</th>
                  {seated ? (
                    <>
                      <th scope="col" className="iei-n">
                        Seats
                      </th>
                      {/* The denominator's own column, so the seat counts align on their own right edge
                          instead of on the width of "of 288". Blank in the header, because "of" is a unit. */}
                      <th scope="col" className="iei-den">
                        <span className="iei-sr">of seats contested</span>
                      </th>
                    </>
                  ) : null}
                  {/* THE YEAR STAYS, and it is the one column of the original five that could not go. These
                      elections span 2014–2026, so "INC 135 of 224" without a date is a claim a reader cannot
                      place. */}
                  <th scope="col" className="iei-n">
                    Elected
                  </th>
                </>
              }
            >
              {held.map((c) => {
                // The table mutes with the map, by the same selection. A highlight that dimmed the polygons and left
                // the rows at full strength would be two answers to one question on one screen.
                const muted = !sel.covers(leaderOf(c));
                return (
                  <tr key={c.jurisdictionId} data-j={c.jurisdictionId} className={muted ? 'iei-legend-off' : undefined}>
                    <th scope="row">
                      <Link href={choose(c)}>{c.jurisdictionName}</Link>
                    </th>
                    <td>
                      {c.label === null ? (
                        <span className="iei-absent">{c.detail[1] ?? 'not loaded'}</span>
                      ) : (
                        <span className="iei-mark">
                          <span className="iei-sw" style={{ background: c.fill }} aria-hidden="true" />
                          <span className="iei-chip">{c.label}</span>
                        </span>
                      )}
                    </td>
                    {seated ? (
                      <>
                        <td className="iei-n">
                          {c.leaderSeats === null ? <span className="iei-absent">—</span> : c.leaderSeats}
                        </td>
                        <td className="iei-den">{c.seatsContested === null ? null : `of ${c.seatsContested}`}</td>
                      </>
                    ) : null}
                    <td className="iei-n">{c.year ?? <span className="iei-absent">—</span>}</td>
                  </tr>
                );
              })}
            </Table>
            {bare.length === 0 ? null : (
              <details className="iei-twin iei-story-unloaded">
                <summary>
                  {bare.length} states and territories {v.layer.unknown === v.layer.unloaded ? 'not loaded' : 'with no figure here'}
                </summary>
                <ul>
                  {bare.map((c) => (
                    <li key={c.jurisdictionId}>
                      <Link href={choose(c)}>{c.jurisdictionName}</Link>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </div>
      </Panel>


      </div>

      {/* ── HOW WE GOT HERE. A scrubber over every year the registry holds an assembly election in. The map and the tally are the present when the page loads
          and with script off; with script, the year moves them. A state with no election by the year is not coloured. ── */}
      <Panel
        id="history"
        title="How we got here"
        question="How has the map of who governs changed over the years?"
        note={
          landscape.years.length < 2 ? (
            <>The registry holds assembly elections in {landscape.years.length === 0 ? 'no year' : `one year, ${landscape.years[0]}`}, so there is no change to show yet: this fills in as more elections are loaded.</>
          ) : undefined
        }
      >
        {frames.length === 0 ? (
          <p className="iei-absent">No assembly election is loaded, so there is no history to show.</p>
        ) : (
          <TimeMachine frames={frames} sentences={frameLines}>
            <LandscapeMap states={(landscape.byYear[landscape.byYear.length - 1]?.states ?? []).map((st) => ({ id: st.id, name: st.name }))} initial={frames[frames.length - 1]!} />
          </TimeMachine>
        )}
      </Panel>

      {/* ── what is coming, and what has just been decided ── */}
      <div className="iei-two iei-two-wide" id="elections">
        <Panel title="Closest contests" question="Which seats were decided by the fewest votes?">
          {v.fights.length === 0 ? (
            <p className="iei-absent">No jurisdiction&rsquo;s latest election has counted results to rank: where a result has declared margins and no vote counts, there is nothing to measure a close contest by.</p>
          ) : (
            <DataList label="The closest counted contests" tight>
              {v.fights.map((f) => (
                <DataRow
                  key={`${f.placeId}-${f.year}`}
                  title={
                    <>
                      {f.placeName}
                      <span className="iei-rule">{f.year}</span>
                    </>
                  }
                  href={f.href}
                  aside={
                    <b>
                      {f.marginVotes === null ? `${f.marginPct.toFixed(2)}% of the votes polled` : `${IN.format(f.marginVotes)} ${f.marginVotes === 1 ? 'vote' : 'votes'}`}
                    </b>
                  }
                  detail={
                    <>
                      {f.winner}
                      {f.runnerUp === null ? null : <> over {f.runnerUp}</>}
                    </>
                  }
                />
              ))}
            </DataList>
          )}
        </Panel>

        <Panel title="Recent results" question="What has been decided most recently?">
          <DataList label="Elections most recently held" tight>
            {v.held.map((r) => {
              const top = v.heldTop.get(r.id) ?? [];
              return (
                <DataRow
                  key={r.id}
                  /* Each row is a link to the election it names. A state's page opens on its newest election, so a row
                     for 2021 linked there would land on 2026. A general election's jurisdiction is the nation, whose
                     page is this one, so its row names the nation and links to the election alone. */
                  title={
                    <>
                      {r.jurisdictionName}
                      <span className="iei-rule">
                        {bodyWord(r.body)} {r.year}
                        {r.fill === 'bypoll' ? ' by-election' : ''}
                      </span>
                    </>
                  }
                  href={electionHref(r.id)}
                  aside={
                    <b>
                      {/* A reading, never a bare number: West Bengal 2026's 93.0% is a seed defect, and
                          this strip is the first turnout figure a first-time reader meets. */}
                      {turnoutHeadline(r.turnout) ?? <span className="iei-absent">turnout not reported</span>}
                    </b>
                  }
                  detail={
                    top.length === 0 ? (
                      <span className="iei-absent">no winner recorded</span>
                    ) : (
                      <>
                        {top.map((p, i) => (
                          <span key={p.key} className="iei-mark">
                            {i === 0 ? null : <span className="iei-of">&nbsp;·&nbsp;</span>}
                            <span className="iei-sw" style={{ background: fillFor(p.key) }} aria-hidden="true" />
                            {p.label} {p.seats}
                          </span>
                        ))}
                        {' '}
                        <span className="iei-of">of {r.seatsContested}</span>{' '}
                        {/* ONE QUIET MARKER, ONLY WHERE IT IS TRUE. This column used to be eight coverage
                            chips — dataset status running down a page of election results. */}
                        <Incomplete state={v.coverageOf.get(r.id) ?? 'unavailable'} />
                      </>
                    )
                  }
                />
              );
            })}
          </DataList>
        </Panel>
      </div>

      {/* ── who holds power, and where ── */}
      <Panel
        id="parties"
        title="Party landscape"
        question="Where does each party actually hold power?"
        note={
          <>
            Assembly seats are summed across <b>each jurisdiction&rsquo;s most recent election</b>, spanning{' '}
            {v.standings.length === 0 ? 'no years' : oldest(v) === newest(v) ? `${oldest(v)}` : `${oldest(v)}–${newest(v)}`} — so this is who sits now, not
            a national vote at one moment. Lok Sabha figures are{' '}
            {v.parties.houseYear === null ? 'the latest on record' : v.parties.houseYear}.
          </>
        }
      >
        {/* A RANKED LIST, NOT A SEVEN-COLUMN TABLE. Party · assemblies · assembly seats · Lok Sabha · change ·
            share · trend was a spreadsheet, and six of the seven columns were secondary to the one question
            the section asks. The rank and the seat total lead; everything else is the row's second line, where
            it is still readable and no longer competing. Nothing was dropped. */}
        <DataList label="Parties by where they hold power" tight>
          {v.parties.rows.map((p, i) => (
            <DataRow
              key={p.key}
              id={partyAnchor(p.key)}
              title={
                <span className="iei-mark">
                  <span className="iei-rank">{i + 1}</span>
                  <span className="iei-sw" style={{ background: fillFor(p.key) }} aria-hidden="true" />
                  <span className="iei-chip">{p.label}</span>
                </span>
              }
              aside={
                <>
                  <b>
                    {IN.format(p.assemblySeats)} assembly {p.assemblySeats === 1 ? 'seat' : 'seats'}
                  </b>
                  {/* A trend of one election is not a trend, and it is not an absence worth stating on every row. */}
                  {p.spark.length < 2 ? null : (
                    <Sparkline
                      points={p.spark}
                      fill={fillFor(p.key)}
                      label={`${p.label} Lok Sabha seats: ${p.spark.map((x) => `${x.year} ${x.seats}`).join(', ')}`}
                    />
                  )}
                </>
              }
              detail={
                <>
                  leads {p.governs === 0 ? 'no assembly' : `${p.governs} ${p.governs === 1 ? 'assembly' : 'assemblies'}`}
                  {' · '}
                  {p.houseSeats === 0 ? (
                    <span className="iei-absent">no Lok Sabha seat</span>
                  ) : (
                    <>
                      {p.houseSeats} Lok Sabha {p.houseSeats === 1 ? 'seat' : 'seats'}
                      {p.houseSeatsChange === null ? '' : ` (${p.houseSeatsChange > 0 ? '+' : ''}${p.houseSeatsChange})`}
                    </>
                  )}
                  {p.houseSharePct === null ? null : (
                    <>
                      {' · '}
                      <Value value={p.houseSharePct} unit="% of the vote" decimals={1} absent="" />
                    </>
                  )}
                </>
              }
            />
          ))}
        </DataList>
      </Panel>

      <Foot />
    </Shell>
  );
}
