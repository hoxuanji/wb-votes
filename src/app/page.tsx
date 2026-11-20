import Link from 'next/link';
import { electionHref, stateHref } from '../../packages/mandate/src/repo/routes.ts';
import { homeView, layerChoices, leaderOf, PARTY_RANK_RULE, showsPartyLandscape } from '../../packages/mandate/src/repo/home.ts';
import { homeSources } from '../../packages/mandate/src/repo/home-sources.ts';
import { houseScope, landscapeScope, seatsLoadedLine } from '../../packages/mandate/src/repo/home-scope.ts';
import { bodyWord } from '../../packages/mandate/src/core/election-kind.ts';
import { turnoutHeadline } from '../../packages/mandate/src/repo/turnout-trust.ts';
import type { HomeView } from '../../packages/mandate/src/repo/home.ts';
import { partyAnchor } from '../../packages/mandate/src/repo/search.ts';
import { readAsk, readSelection, queryHref } from '../../packages/mandate/src/repo/map-selection.ts';
import { readRegistry } from '../../packages/mandate/src/repo/session.ts';
import { glanceOf, indiaSentence, stateChoice } from '../../packages/mandate/src/repo/home-glance.ts';
import { landscapeOverTime } from '../../packages/mandate/src/repo/landscape.ts';
import { frameSentence, framesOf, hasHistory } from '../../packages/mandate/src/repo/landscape-frames.ts';
import { nextUp } from '../../packages/mandate/src/repo/next-up.ts';
import { readLiveFeed } from '../../packages/mandate/src/repo/live-feed.ts';
import { liveReply } from '../../packages/mandate/src/repo/live-reply.ts';
import type { Cell } from '../../packages/mandate/src/repo/home.ts';
import { fillFor } from '../../packages/mandate/src/viz/party-ink.ts';
import { GEOMETRY_SOURCE } from '../lib/india-geo.ts';
import { Foot, Shell } from '../components/iei/Shell.tsx';
import { IndiaMap } from '../components/iei/IndiaMap.tsx';
import { StateCard } from '../components/iei/Story.tsx';
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
    // The sources of the three modules that put a registry result in front of a reader: see repo/home-sources.ts for why three.
    return { home, landscape, next: nextUp(db, new Date()), sources: homeSources(db, home) };
  });
  if (!read.ok) {
    return (
      <Shell here="india">
        <RegistryMissing />
      </Shell>
    );
  }
  const v = read.value.home;
  const { landscape, next: coming, sources: src } = read.value;
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

  // The layers nothing in the registry can fill, grouped by the reason they cannot, so a reason is said once.
  const unfilled: { why: string; labels: string[] }[] = [];
  for (const l of v.layers) {
    if (l.available || l.why === null || l.key === v.layer.key) continue;
    const at = unfilled.find((u) => u.why === l.why);
    if (at === undefined) unfilled.push({ why: l.why, labels: [l.label] });
    else at.labels.push(l.label);
  }

  // The whole country first: every jurisdiction with a result, side by side, and the state the reader chose.
  const askedState = typeof searchParams?.state === 'string' ? searchParams.state : null;
  const rows = glanceOf({ standings: v.standings, houseStandings: v.houseStandings });
  const chosen = stateChoice({ standings: v.standings, houseStandings: v.houseStandings, states: v.states }, askedState);
  // The note on what "majority" means is in the drawer only where the word is on the panel: the state card prints it for a loaded state's houses (the chosen
  // state's, or every state's in the glance), so a chosen state with no result, or a registry whose leaders hold no majority, has nothing for it to qualify.
  const majorityShown = (chosen === null ? rows : chosen.status === 'loaded' ? [chosen.row] : []).some((r) => r.assembly?.majority === true || r.loksabha?.majority === true);
  const choose = (c: Cell): string => queryHref('/', ask, { state: c.jurisdictionId }, 'map');
  const chooseId = (id: string): string => queryHref('/', ask, { state: id }, 'map');
  const clearHref = queryHref('/', ask, { state: '' }, 'map');
  const selectedId = chosen === null ? null : chosen.status === 'loaded' ? chosen.row.id : chosen.id;

  // THE LIVE FEED, read the way the poll reads it (repo/live-reply.ts), so the first render and every update after it are one function of one file. Absent, the
  // page has no live element at all; an unusable feed is said to be unusable and never guessed at.
  const live = liveReply(readLiveFeed(process.env['MANDATE_LIVE_PATH'], new Date()));
  const liveBoard = live.state === 'boards' ? live.boards[0] : undefined;
  const liveOn = s.live || liveBoard !== undefined;

  // HOW MUCH OF THE COUNTRY THE REGISTRY HOLDS, as one sentence beside the disclaimer it qualifies and not as a strip of big figures with bars: the title says how many
  // states, and this says what the seat totals counted over (repo/home-scope.ts).
  const loadedLine = seatsLoadedLine(s);
  // The map's rows that hold nothing on this layer are one line under the table, not thirty-five rows of "not loaded".
  const lit = v.layer.cells.filter((c) => c.label !== null);
  const held = lit.length > 0 ? lit : v.layer.cells;
  const bare = lit.length > 0 ? v.layer.cells.filter((c) => c.label === null) : [];

  // How much of the country the party landscape's seats are counted over: null when the registry holds every seat.
  const partyScope = landscapeScope(s);

  // WHAT THE TWO QUIET MARKERS IN "RECENT RESULTS" MEAN, in the drawer, and only for the markers this render actually shows. "Partly loaded" is
  // repo/home.ts's `partial`, which is any of three gaps (a constituency not loaded, a contest with no vote count, a contest with no turnout row), so
  // the sentence names all three and does not say "constituencies" alone. "Result unavailable" is an election with no contest loaded.
  const coverage = (id: string) => v.coverageOf.get(id) ?? 'unavailable';
  const partly = v.held.some((r) => coverage(r.id) === 'partial');
  const nothing = v.held.some((r) => coverage(r.id) === 'unavailable');
  // SAID ONCE WHEN IT IS TRUE OF EVERY ROW. Five rows each ending in "partly loaded" is one fact printed five times; when every election listed is short in
  // the same way, the fact is one sentence above the list and the rows carry nothing. Only when the rows differ does a row wear its own marker, and then the
  // sentence says what the markers mean.
  const uniform = v.held.length > 0 && v.held.every((r) => coverage(r.id) === coverage(v.held[0]!.id)) && coverage(v.held[0]!.id) !== 'complete';
  const coverageLink = (
    <>
      <Link className="iei-ev-a" href="/coverage">
        Coverage
      </Link>{' '}
      lists which.
    </>
  );
  const coverageWords =
    !(partly || nothing) ? undefined : uniform ? (
      <>
        {partly
          ? <>Each election below is partly loaded: the registry is missing some constituencies, vote counts or turnout rows. </>
          : <>No contest is loaded for any election below. </>}
        {coverageLink}
      </>
    ) : (
      <>
        {partly ? <>&ldquo;Partly loaded&rdquo; marks an election with a gap in what the registry holds: constituencies not loaded, contests with no vote count, or contests with no turnout row. </> : null}
        {nothing ? <>&ldquo;Result unavailable&rdquo; marks an election with no contest loaded. </> : null}
        {coverageLink}
      </>
    );
  // "Recent results" has a drawer of its own only for sources the map's drawer does not already hold: the same two publishers behind the same elections, listed
  // twice, was a source line repeated per section. Where the rows read an election the map does not, the drawer is there and complete.
  const recentSources = src.recent.every((r) => src.map.some((m) => m.id === r.id)) ? [] : src.recent;

  // A SECTION APPEARS ONLY WHEN THE REGISTRY CAN ANSWER ITS QUESTION. Absent, it is not an apology: what the registry lacks is /coverage's to say.
  const showHistory = hasHistory(frames);
  const showClosest = v.fights.length > 0;
  const showParties = showsPartyLandscape(v);

  const closest = !showClosest ? null : (
      <Panel
        className="iei-sec-flat"
        title="Closest contests"
        question="Which seats were decided by the fewest votes?"
      >
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
      </Panel>
  );

  const recentResults = (
      <Panel className="iei-sec-flat" title="Recent results" question="What has been decided most recently?" sources={recentSources} note={coverageWords}>
        <DataList label="Elections most recently held" tight>
          {v.held.map((r) => {
            const top = v.heldTop.get(r.id) ?? [];
            // A Lok Sabha election the registry holds part of says how much of the house that is, so "BJP 12 of 42" is not read as a national count.
            const scope = houseScope({ body: r.body, fill: r.fill, loaded: r.seatsContested, houseTotal: s.lokSabhaSeatsTotal });
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
                      {scope === null ? (
                        <span className="iei-of">of {r.seatsContested}</span>
                      ) : (
                        <>
                          <span className="iei-of">&nbsp;·&nbsp;</span>
                          <span className="iei-of">{scope}</span>
                        </>
                      )}{' '}
                      {/* ONE QUIET MARKER, ONLY WHERE IT IS TRUE. This column used to be eight coverage
                          chips — dataset status running down a page of election results. */}
                      {uniform ? null : <Incomplete state={v.coverageOf.get(r.id) ?? 'unavailable'} />}
                    </>
                  )
                }
              />
            );
          })}
        </DataList>
      </Panel>
  );

  return (
    <Shell here="india" live={liveOn} liveLabel={liveBoard === undefined ? null : `${liveBoard.election.jurisdictionName} · ${liveBoard.status}`}>
      {/* ── THE LIVE BOARD, FIRST WHEN THERE IS ONE. A running election changes this page in place: the count, the projections other people have
          published (each with its publisher) and the events, polled every twenty seconds. With no feed nothing live renders at all, and an
          invalid feed is said to be invalid rather than guessed at. ── */}
      {live.state === 'error' ? (
        <section className="iei-live-board" id="live" aria-label="Live election">
          <p className="iei-absent">The live feed is configured but cannot be used, so no live count is shown: {live.error}</p>
        </section>
      ) : live.state === 'boards' ? (
        <LiveBoard initial={live.boards} sentences={live.sentences} fills={live.paints} endpoint="/v1/live" />
      ) : null}
      {/* ── THE COUNTRY FIRST. The page used to open on one state's story, which made that state the page's subject; it opens on India now, with every
          state that has a result in one glance, and a state's story is what the reader's choice (or, failing one, the most recent election) opens
          below the map. ── */}
      <div id="india">
        <div className="iei-hero" id="now">
          {/* THE TITLE IS THE ANSWER. It was the topic ("The electoral landscape") over an eyebrow ("India") over the sentence that answers the page's
              question; the sentence is the title now, and the wordmark and the rail already say which product and which place this is. */}
          <div className="iei-head">
            <h1 className="iei-answer iei-answer-long">{indiaSentence(rows, s.jurisdictionsTotal)}</h1>
            {/* THE PLAIN DOOR for a reader who came for one seat and not for the country. The product's one search field is in the bar, in small mono, and
                at a phone's width its hint is cut off; this says in a sentence what the field finds and takes the reader to it. It is a link to the
                field (`#iei-q`) and not a second field: the bar's field is the only one, on purpose (Shell.tsx). What it names is what the field's own
                hint names. */}
            <p className="iei-sub iei-find">
              <b>Nothing here is a prediction.</b> {loadedLine === null ? null : <>{loadedLine} </>}Looking for a seat or a person? <a href="#iei-q">Search by name</a>.
            </p>
          </div>
        </div>


      {/* ── the map: the product's primary analytical instrument, and its primary navigation ── */}
      <div id="landscape" />
      {/* KEYED BY WHAT THE WORKBENCH SHOWS. A native <details> keeps its open state when the page is navigated in place, so a drawer opened on one layer stayed open on the
          next. The key has to sit on a host element: a key on a server component is gone by the time the markup reaches the browser. */}
      <div key={`${v.layer.key}|${selectedId ?? ''}|${party ?? ''}`} style={{ display: 'contents' }}>
      <Panel
        id="map"
        className="iei-bench"
        title={`India · ${v.layer.label}`}
        question={v.layer.question}
        /* The results behind the map, the state card and the table beside it, and the boundary file, in one drawer. The boundary used to be
           the only thing in it, which put a source on the outlines and none on the seat counts drawn over them. It is listed first because a
           drawer shows its first eight and says how many more it holds, and the outlines are not to be the entry that goes missing. */
        sources={[GEOMETRY_SOURCE, ...src.map]}
        caveat={majorityShown ? <>&ldquo;Majority&rdquo; is counted here, not published: more than half of the seats contested, from the seat totals.</> : undefined}
      >
        <Tabs
          label="Map layer"
          row
          current={v.layer.key}
          choices={v.layers
            .filter((l) => l.available || l.key === v.layer.key)
            .map((l) => ({
              key: l.key,
              label: l.label,
              href: href({ layer: l.key }),
              available: l.available,
            }))}
        />

        {/* A WAY PAST THE MAP FOR A KEYBOARD. The map is thirty-six links in a row, and the table beside it names the same states once each, so a
            reader who does not need the picture should not have to cross it to reach the list. Hidden until it takes focus, and placed before the
            first polygon so that it is the first stop after the layer tabs. */}
        <a className="iei-skip iei-skip-in" href="#map-list">
          Skip to the list of states
        </a>

        <div className="iei-linked iei-map-split">
          <IndiaMap layer={v.layer} nameOf={(id) => nameOf(v, id)} selection={sel} hrefFor={choose} selectedId={selectedId} />

          <div id="map-list">
            <StateCard rows={rows} chosen={chosen} hrefFor={chooseId} clearHref={clearHref} storyHere={null} changes={v.changes} />
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
                  Not loaded
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
            {/* THE STATES THE REGISTRY DOES NOT HOLD, NAMED ONCE, here and folded. The map's own labels name the ones that fit, and the old chip row and
                second list are gone: this is the one list. Plain names, not links: every polygon on the map is already a way to the same card, and 35 more links
                to "no election on record yet" were the page's largest block of tab stops. */}
            {bare.length === 0 ? null : (
              <details className="iei-twin iei-story-unloaded">
                <summary>
                  {bare.length} states and territories {v.layer.unknown === v.layer.unloaded ? 'not loaded' : 'with no figure here'}
                </summary>
                <ul>
                  {bare.map((c) => (
                    <li key={c.jurisdictionId}>{c.jurisdictionName}</li>
                  ))}
                </ul>
              </details>
            )}
            {/* WHAT THE LAYERS CANNOT SHOW, SAID ONCE, in the footer of the instrument that would have shown it: a tab that reads "unavailable" three times is
                the same absence three times, and not a tab at all is the honest shape of a layer nothing in the registry can fill. Layers with the same reason are
                one clause, and the reason is the layer's own (repo/home.ts, `whyEmpty`). */}
            {unfilled.length === 0 ? null : (
              <p className="iei-note">
                Not available from this registry, for the states it holds:{' '}
                {unfilled.map((u, i) => (
                  <span key={u.why}>
                    {i === 0 ? '' : '; '}
                    {u.labels.join(', ').replace(/, ([^,]*)$/, ' and $1')}, because {u.why}
                  </span>
                ))}
                .
              </p>
            )}
          </div>
        </div>
      </Panel>
      </div>

      {/* ── NEXT UP, under the map (the owner's order, docs/superpowers/specs/2026-11-03-situation-room-home-design.md: the sentence and the figures, the landscape, then what comes next): the elections that come next are a headline of this page, not a reference table. Soonest first, with how far
          through its term each one is. An announced date prints as itself; the Commission's schedule is not in the registry yet, so today every card is a
          five-year term counted from the last election, and says "Expected". ── */}
      <Panel id="next" className="iei-sec-flat" title="Next up" question="Which elections come next?">
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



      </div>

      {/* ── HOW WE GOT HERE. A scrubber over every year the registry holds an assembly election in. The map and the tally are the present when the page loads
          and with script off; with script, the year moves them. A state with no election by the year is not coloured. It is on the page only when TWO OR MORE
          states have an election on record: with one, the picture is one state's colour and a scrubber over that state's own years, which is the state page's
          chapter and not the country's. ── */}
      {!showHistory ? null : (
        <Panel id="history" className="iei-sec-flat" title="How we got here" question="How has the map of who governs changed over the years?">
          <TimeMachine frames={frames} sentences={frameLines}>
            <LandscapeMap states={(landscape.byYear[landscape.byYear.length - 1]?.states ?? []).map((st) => ({ id: st.id, name: st.name }))} initial={frames[frames.length - 1]!} />
          </TimeMachine>
        </Panel>
      )}

      {/* ── what has just been decided, and how close the closest seats were. TWO CARDS SIDE BY SIDE ONLY WHEN BOTH EXIST: "Closest contests" is a section only
          when there is at least one counted contest to rank (what is missing is /coverage's to say), and a lone card takes the width. ── */}
      {closest === null ? (
        <div id="elections">{recentResults}</div>
      ) : (
        <div className="iei-two iei-two-wide" id="elections">
          {closest}
          {recentResults}
        </div>
      )}

      {/* ── who holds power, and where. TWO OR MORE JURISDICTIONS only: with one, this is the inspector's own state card ranked again. The id and the party
          anchors go with it, so search points at a party row only when this section is on the page (repo/home.ts `showsPartyLandscape`). ── */}
      {!showParties ? null : (
      <Panel
        id="parties"
        className="iei-sec-flat"
        title="Party landscape"
        question="Where does each party actually hold power?"
        sources={src.parties}
        note={
          <>
            {/* WHAT THE PANEL COUNTED OVER comes first: it is the sentence a reader needs before the numbers, and the one that goes missing when a
                panel is shared or reached from the rail. It is absent when the registry holds every seat (repo/home-scope.ts). */}
            {partyScope === null ? null : <>{partyScope} </>}
            Assembly seats are summed across <b>each jurisdiction&rsquo;s most recent election</b>, spanning{' '}
            {v.standings.length === 0 ? 'no years' : oldest(v) === newest(v) ? `${oldest(v)}` : `${oldest(v)}–${newest(v)}`} — so this is who sits now, not
            a national vote at one moment. Lok Sabha figures are{' '}
            {v.parties.houseYear === null ? 'the latest on record' : v.parties.houseYear}. {PARTY_RANK_RULE}
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
      )}

      <Foot />
    </Shell>
  );
}
