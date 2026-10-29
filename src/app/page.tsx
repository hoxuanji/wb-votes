import Link from 'next/link';
import { electionHref, stateHref } from '../../packages/mandate/src/repo/routes.ts';
import { homeView, layerChoices, leaderOf } from '../../packages/mandate/src/repo/home.ts';
import { bodyWord } from '../../packages/mandate/src/core/election-kind.ts';
import { turnoutHeadline } from '../../packages/mandate/src/repo/turnout-trust.ts';
import type { HomeView } from '../../packages/mandate/src/repo/home.ts';
import { partyAnchor } from '../../packages/mandate/src/repo/search.ts';
import { readAsk, readSelection, queryHref } from '../../packages/mandate/src/repo/map-selection.ts';
import { readRegistry } from '../../packages/mandate/src/repo/session.ts';
import { storyView } from '../../packages/mandate/src/repo/home-story.ts';
import { glanceOf, indiaSentence, stateChoice } from '../../packages/mandate/src/repo/home-glance.ts';
import type { Cell } from '../../packages/mandate/src/repo/home.ts';
import { fillFor } from '../../packages/mandate/src/viz/party-ink.ts';
import { GEOMETRY_SOURCE } from '../lib/india-geo.ts';
import { Foot, Shell } from '../components/iei/Shell.tsx';
import { IndiaMap } from '../components/iei/IndiaMap.tsx';
import {
  HomeReach,
  StateCard,
  StoryCannot,
  StoryChanged,
  StoryClose,
  StoryDoors,
  StoryHead,
  StoryHouses,
  StoryPeople,
  StoryVotes,
  StoryWhere,
} from '../components/iei/Story.tsx';
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
 * `/` — INDIA.
 *
 * The top of an information architecture that runs INDIA → STATE → ELECTION → CONSTITUENCY → CANDIDATE →
 * EVIDENCE. Every figure is a `SELECT` executed when the page is requested — see repo/home.ts, where nothing
 * knows whether it is holding a state assembly, a Lok Sabha election or a by-poll.
 *
 * ── THE STORY FIRST, THE REFERENCE LAYER LAST ──
 *
 * The page opens on one computed sentence about one state's assembly, the four houses that prove it, four doors into the record, and a
 * chapter for each question the sentence raises (repo/home-story.ts picks the story by rule, never by name; components/iei/Story.tsx draws
 * it). The India map, the elections and the parties are the coda under `#india`, where someone looking for a coverage map goes looking:
 * with one state loaded, the map cannot carry the first screen. A registry with no assembly result has no story and keeps the old title.
 *
 * THERE IS NO LIST OF STATES IN THIS FILE, and there must never be one. The 36 jurisdictions, the seat
 * counts and the elections all arrive from the registry and from `ingest/india.ts` reference data; loading
 * Kerala's next assembly puts Kerala on this page without a line of UI changing.
 *
 * ── WHAT THE FINAL DESIGN PASS REMOVED, AND WHY ──
 *
 * The page was correct and it read like an audit log. Rendered, it carried ELEVEN "Measured" and NINE
 * "Derived" — twenty provenance words before a reader met an election — plus eight coverage chips, six cells
 * of registry row counts, and the wall-clock time a query ran. Every one of those is useful to someone
 * validating the pipeline and to nobody deciding how to read an election. What went:
 *
 *  · THE DATELINE STRIP. "36 of 36 states & UTs · assembly seats 4,117 of 4,123 · Lok Sabha 543 of 543 ·
 *    1,202 elections since 1961 · computed 14:11 UTC · what is and is not loaded". Four row counts, one
 *    clock, one link. The single useful figure is a clause of the hero's own sentence now.
 *  · EVERY `basis` CHIP. `Panel` no longer takes one. "A database query produced this measurement" is a fact
 *    about the software that a reader assumes.
 *  · THE `BASIS` COLUMN UNDER NEXT — eight identical DERIVED badges in the loudest colour on the page, and a
 *    three-sentence caveat above them explaining five-year-term arithmetic. The row says `Expected 2026`,
 *    which is the thing a reader needs told, and the arithmetic is behind the panel's ⓘ.
 *  · THE COVERAGE COLUMN UNDER JUST DECIDED. Dataset status beside eight election results. A result that is
 *    genuinely short now carries four quiet words; the ledger is `/coverage`.
 *  · 726 DISTRICT HAIRLINES over the national map. See IndiaMap.tsx.
 *
 * ── WHAT IT GAINED, AND WHY THAT IS NOT A CONTRADICTION ──
 *
 * CLOSEST CONTESTS: five seats decided by almost nothing, each row a link to that constituency. It is the
 * most navigable thing this registry holds and the page had no route into a seat at all. It is paid for out of
 * What to watch, which went from nine rows to four — so the section count is unchanged and the element count
 * is down. `closeFights()` already existed and was already imported here, unused.
 *
 * WHAT THE PAGE MAY NOT DO, stated here because it is easier to violate in JSX than anywhere else: print a
 * figure no source published, print an inferred date as an announced one, or shade a jurisdiction in a colour
 * that stands for nothing. `Value` cannot render a null as a blank, an inferred year is prefixed with the word
 * for what it is, and an unlit polygon wears an ink that deliberately fails the contrast floor a mark has to
 * clear.
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
    // `?state=` is the state the reader chose on the map. It is looked up among the jurisdictions the registry has results for (and, for the card,
    // among all of them) and used nowhere else, so a hand-edited value is ignored and never reaches SQL. Without one the story is of the most
    // recent election on record, by a rule that is about the data (repo/home-story.ts), and the page says so.
    const asked = searchParams?.state;
    const story = storyView(db, {
      candidates: home.standings.map((st) => ({ id: st.jurisdictionId, name: nameOf(home, st.jurisdictionId) })),
      chosen: typeof asked === 'string' ? asked : null,
    });
    return { home, story };
  });
  if (!read.ok) {
    return (
      <Shell here="india">
        <RegistryMissing />
      </Shell>
    );
  }
  const v = read.value.home;
  const story = read.value.story;

  const next = [...v.announced, ...v.upcoming];
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
    <Shell here="india" live={s.live}>
      {/* ── THE COUNTRY FIRST. The page used to open on one state's story, which made that state the page's subject; it opens on India now, with every
          state that has a result in one glance, and a state's story is what the reader's choice (or, failing one, the most recent election) opens
          below the map. ── */}
      <div id="india">
        <div className="iei-hero">
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

      {/* ── the map: the product's primary analytical instrument, and its primary navigation ── */}
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
            <StateCard rows={rows} chosen={chosen} hrefFor={chooseId} clearHref={clearHref} storyHere={story?.jurisdiction.id ?? null} />
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

      {/* ── the chosen state's latest election, or the most recent on record: the sentence, the proof beside four doors, then one chapter per question ── */}
      {story === null ? null : (
        <>
          <div className="iei-story-top">
            <StoryHead view={story} />
            <div className="iei-story-fold">
              <StoryHouses view={story} />
              <StoryDoors view={story} />
            </div>
          </div>
          <StoryChanged view={story} />
          <StoryWhere view={story} />
          <StoryVotes view={story} />
          <StoryClose view={story} />
          <StoryPeople view={story} />
          <StoryCannot view={story} />
        </>
      )}

      {/* ── what is coming, and what has just been decided ── */}
      <div className="iei-two iei-two-wide" id="elections">
        <Panel
          title="Upcoming"
          question="Which assemblies face the electorate next?"
          /* ONE SENTENCE, WHERE THERE WERE THREE. `announced_on` is null for all 1,202 rows, so every date on
             this list is arithmetic rather than a schedule, and a reader is entitled to know that once. What
             went is the rest of the old caveat — a paragraph on how the arithmetic works and a promise about
             what happens when the Commission's schedule is ingested — plus a whole column of DERIVED badges.
             The uncertainty is not hidden; it is stated at the size a caveat should be. */
          note={
            v.announced.length > 0 ? undefined : (
              <>
                No date here was announced by anyone: each is a five-year term counted from the last election.
              </>
            )
          }
        >
          {next.length === 0 ? (
            <p className="iei-absent">No jurisdiction has an assembly election on record to count from.</p>
          ) : (
            <DataList label="Assemblies facing the electorate next">
              {next.map((r) => {
                const st = standingOf(r.jurisdictionId);
                return (
                  <DataRow
                    key={`${r.jurisdictionId}-${r.year}`}
                    title={r.jurisdictionName}
                    href={stateHref(r.jurisdictionId)}
                    /* THE INFERENCE IS IN THE WORD, NOT IN A BADGE. `announced_on` is null for all 1,202 rows,
                       so every one of these is a five-year term counted from the last election — arithmetic on
                       a past date. It used to be marked with a DERIVED chip in its own column: eight identical
                       badges saying one thing eight times. "Expected 2026" says the same thing in the place a
                       reader is already looking, and the arithmetic is one ⓘ away. An ANNOUNCED date, when the
                       Commission's schedule is ingested, prints as itself with no qualifier — which is the
                       distinction that has to survive, and it does. */
                    aside={<b>{r.announcedOn ?? `Expected ${r.year}`}</b>}
                    detail={
                      st === undefined ? (
                        'no assembly election on record'
                      ) : (
                        <>
                          <span className="iei-mark">
                            <span
                              className="iei-sw"
                              style={{ background: fillFor(st.leaderKey ?? '') }}
                              aria-hidden="true"
                            />
                            {st.leaderLabel ?? 'no winner recorded'}
                          </span>{' '}
                          {st.leaderSeats} of {st.seatsContested} · elected {st.year}
                        </>
                      )
                    }
                  />
                );
              })}
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
