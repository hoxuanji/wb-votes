import Link from 'next/link';
import { constituencyHref, districtHref, stateHref } from '../../packages/mandate/src/repo/routes.ts';
import { openRead } from '../../packages/mandate/src/db/open.ts';
import { homeView } from '../../packages/mandate/src/repo/home.ts';
import { turnoutHeadline } from '../../packages/mandate/src/repo/turnout-trust.ts';
import type { HomeView } from '../../packages/mandate/src/repo/home.ts';
import { RegistryUnavailableError } from '../../packages/mandate/src/repo/index.ts';
import { partyAnchor } from '../../packages/mandate/src/repo/search.ts';
import { fillFor } from '../../packages/mandate/src/viz/party-ink.ts';
import { GEOMETRY_SOURCE } from '../lib/india-geo.ts';
import { Foot, Shell } from '../components/iei/Shell.tsx';
import { IndiaMap } from '../components/iei/IndiaMap.tsx';
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
 * EVIDENCE. Its job is not to show a result; it is to show the country, and to be the place you choose
 * from. Every figure is a `SELECT` executed when the page is requested — see repo/home.ts, where nothing
 * knows whether it is holding a state assembly, a Lok Sabha election or a by-poll.
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

type Params = Record<string, string | string[] | undefined> | undefined;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * A link to this page with one parameter changed and the rest kept, anchored at the map.
 *
 * An empty value DROPS the parameter rather than writing `party=`, so "show every party" produces the URL a
 * reader would have arrived at, not a longer one that means the same thing. The anchor is `#map` because every
 * parameter this page takes changes the map, and a reader who clicks a legend entry should not be returned to
 * the top of the document.
 */
function href(params: Params, change: Record<string, string>): string {
  const q = new URLSearchParams();
  for (const [k, val] of Object.entries(params ?? {})) {
    const one = first(val);
    if (one !== undefined && one !== '') q.set(k, one);
  }
  for (const [k, val] of Object.entries(change)) {
    if (val === '') q.delete(k);
    else q.set(k, val);
  }
  const s = q.toString();
  return s === '' ? '/#map' : `/?${s}#map`;
}

/** The span of the elections the party table sums over, so its caveat states its own range. */
const oldest = (v: HomeView): number => Math.min(...v.standings.map((s) => s.year));
const newest = (v: HomeView): number => Math.max(...v.standings.map((s) => s.year));

/** The house a row is about, in the words a reader uses. `ac`/`pc` are the registry's codes. */
function houseWord(house: string): string {
  return house === 'pc' ? 'Lok Sabha' : house === 'ac' ? 'Assembly' : house;
}

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
  let v: HomeView | null = null;
  let unavailable = false;
  // openRead() is INSIDE the try. A missing .data/registry.db throws there, not in homeView, so opening
  // outside it sent a fresh clone a 500 instead of the page that names the command to fix it.
  let db: ReturnType<typeof openRead> | null = null;
  try {
    db = openRead();
    v = homeView(db, { layer: first(searchParams?.['layer']), thisYear: THIS_YEAR });
  } catch (e) {
    // A fresh clone has no registry. That is the expected failure, not a bug in this process, and the page
    // says so with the command that fixes it rather than rendering a 500.
    if (!(e instanceof RegistryUnavailableError) && !/unable to open database file/.test(String(e))) throw e;
    unavailable = true;
  } finally {
    db?.close();
  }

  if (v === null) {
    return (
      <Shell here="india">
        {unavailable ? (
          <RegistryMissing />
        ) : (
          <div className="iei-empty">
            <h1 className="iei-answer">No elections are loaded.</h1>
            <p className="iei-sub">
              The registry is built but holds no election. Ingest one with{' '}
              <code>npm run registry:ingest</code>.
            </p>
          </div>
        )}
      </Shell>
    );
  }

  const next = [...v.announced, ...v.upcoming];
  // VALIDATED BY MEMBERSHIP, never parsed: `?party=` has to name a party the CURRENT layer actually shows, so
  // a hand-edited value cannot isolate nothing, cannot reach the SQL, and cannot survive a layer switch that
  // makes it meaningless. Switching to the turnout layer drops it, because a turnout band is not a party.
  const asked = first(searchParams?.['party']);
  const party = v.layer.legend.some((l) => l.key === asked) ? (asked as string) : null;
  // The legend names the parties leading more than one state, and always the one being isolated. Everything
  // else is one state each and folds into a disclosure below.
  const many = v.layer.legend.filter((l) => l.key === null || l.key === party || !/^1 state$/.test(l.note ?? ''));
  const shown = many.length > 0 ? many : v.layer.legend.slice(0, 8);
  const rest = v.layer.legend.filter((l) => !shown.includes(l));
  const s = v.snapshot;
  // The party leading each jurisdiction, for the standings list beside the map.
  const standingOf = (id: string): HomeView['standings'][number] | undefined =>
    v.standings.find((x) => x.jurisdictionId === id);

  return (
    <Shell here="india" live={s.live}>
      {/* ── the hero: a short title, and the country in one sentence under it ──
          It used to be a 20-word computed claim at display size with a methodology clause inside it
          ("— derived, not announced"). The claim is the sub-line now, where a sentence belongs, and the map
          below is what the reader's eye lands on — which is the intent: the map is the hero. */}
      <div className="iei-head">
        <p className="iei-eyebrow">India</p>
        <h1 className="iei-answer">The electoral landscape</h1>
        <p className="iei-sub">
          {v.headline}{' '}
          {s.elections === 0 || s.earliestYear === null ? null : (
            <>
              {IN.format(s.elections)} elections on record since {s.earliestYear}.
            </>
          )}
        </p>
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
            href: href(searchParams, { layer: l.key }),
            available: l.available,
          }))}
        />

        <div className="iei-linked iei-map-split">
          <IndiaMap layer={v.layer} nameOf={(id) => nameOf(v, id)} highlight={party} />

          <div>
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
                      href={href(searchParams, party === l.key ? { party: '' } : { party: l.key })}
                      className={party === null ? undefined : party === l.key ? 'iei-legend-on' : 'iei-legend-off'}
                      aria-pressed={party === l.key}
                      title={party === l.key ? `Stop isolating ${l.label}` : `Show only where ${l.label} leads`}
                    >
                      <span className="iei-sw" style={{ background: l.fill }} aria-hidden="true" />
                      {l.label}
                      {l.note === undefined ? null : <b>{l.note}</b>}
                    </Link>
                  )}
                </li>
              ))}
              {v.layer.unknown === 0 ? null : (
                <li>
                  <span className="iei-sw iei-sw-none" aria-hidden="true" />
                  Not held <b>{v.layer.unknown}</b>
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
                        href={href(searchParams, party === l.key ? { party: '' } : { party: l.key as string })}
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
                <Link href={href(searchParams, { party: '' })}>Show every party</Link>
              </p>
            )}

            {/* WHO GOVERNS WHERE — the map's companion, and a genuine comparison across 36 rows, which is what
                a table is for. FOUR COLUMNS, down from five: the seat count and its denominator are one fact
                in two cells so the figures align on their own edge.

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
                  <th scope="col">{v.layer.encoding === 'categorical' ? 'Leads' : 'Value'}</th>
                  <th scope="col" className="iei-n">
                    Seats
                  </th>
                  {/* The denominator's own column, so the seat counts align on their own right edge
                      instead of on the width of "of 288". Blank in the header, because "of" is a unit. */}
                  <th scope="col" className="iei-den">
                    <span className="iei-sr">of seats contested</span>
                  </th>
                  {/* THE YEAR STAYS, and it is the one column of the original five that could not go. These
                      elections span 2014–2026, so "INC 135 of 224" without a date is a claim a reader cannot
                      place — and the section's whole question is who governs NOW. */}
                  <th scope="col" className="iei-n">
                    Elected
                  </th>
                </>
              }
            >
              {v.layer.cells.map((c) => {
                const st = standingOf(c.jurisdictionId);
                // The table mutes with the map. A highlight that dimmed the polygons and left the rows at full
                // strength would be two answers to one question on one screen.
                const muted = party !== null && c.partyKey !== party;
                return (
                  <tr key={c.jurisdictionId} data-j={c.jurisdictionId} className={muted ? 'iei-legend-off' : undefined}>
                    <th scope="row">
                      <Link href={c.href}>{c.jurisdictionName}</Link>
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
                    <td className="iei-n">
                      {st === undefined ? <span className="iei-absent">—</span> : st.leaderSeats}
                    </td>
                    <td className="iei-den">{st === undefined ? null : `of ${st.seatsContested}`}</td>
                    <td className="iei-n">{c.year ?? <span className="iei-absent">—</span>}</td>
                  </tr>
                );
              })}
            </Table>
          </div>
        </div>
      </Panel>

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
                  /* A general election's jurisdiction is the nation, whose page is this one, so its name is
                     plain text rather than a link to /pl/in — which is a 404, and was one, hidden behind a
                     query string a navigation test's regex did not match. */
                  title={
                    <>
                      {r.jurisdictionName}
                      <span className="iei-rule">
                        {houseWord(r.house)} {r.year}
                        {r.kind === 'bypoll' ? ' by-election' : ''}
                      </span>
                    </>
                  }
                  href={r.kind === 'general' ? undefined : stateHref(r.jurisdictionId)}
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
            {v.standings.length === 0 ? 'no years' : `${oldest(v)}–${newest(v)}`} — so this is who sits now, not
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
                  <b>{IN.format(p.assemblySeats)}</b>
                  <Sparkline
                    points={p.spark}
                    fill={fillFor(p.key)}
                    label={`${p.label} Lok Sabha seats: ${p.spark.map((x) => `${x.year} ${x.seats}`).join(', ')}`}
                  />
                </>
              }
              detail={
                <>
                  {p.governs === 0 ? 'no assembly' : `${p.governs} ${p.governs === 1 ? 'assembly' : 'assemblies'}`}
                  {' · '}
                  {p.houseSeats === 0 ? (
                    <span className="iei-absent">no Lok Sabha seat</span>
                  ) : (
                    <>
                      {p.houseSeats} Lok Sabha
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

      {/* ── the two signal modules, and neither is a table ── */}
      <div className="iei-two">
        <Panel
          id="fights"
          title="Closest contests"
          question="Which seats were decided by almost nothing?"
        >
          {v.fights.length === 0 ? (
            <p className="iei-absent">No election on record publishes a margin.</p>
          ) : (
            <DataList label="The tightest results in the country" tight>
              {v.fights.map((f) => (
                <DataRow
                  key={`${f.electionId}-${f.placeId}`}
                  title={f.placeName}
                  href={f.href}
                  aside={
                    <b>
                      {f.marginVotes === null ? 'margin not reported' : `${IN.format(Math.abs(f.marginVotes))} votes`}
                    </b>
                  }
                  detail={
                    <>
                      <span className="iei-mark">
                        <span className="iei-sw" style={{ background: fillFor(f.winner) }} aria-hidden="true" />
                        {f.winner}
                      </span>{' '}
                      {f.runnerUp === null ? 'won' : `over ${f.runnerUp}`} · {f.marginPct}% of votes polled ·{' '}
                      {nameOf(v, f.jurisdictionId)} {f.year}
                    </>
                  }
                />
              ))}
            </DataList>
          )}
        </Panel>

        <Panel
          id="watch"
          title="Notable shifts"
          question="Which measurable movements stand out?"
          note={<><b>Nothing here is a prediction.</b> No model, no forecast, no probability.</>}
        >
          {/* FOUR ROWS, DOWN FROM NINE, and no `rule · threshold` line under each one. The threshold is still
              what a reader argues with rather than an oracle — it is in the row's ⓘ-equivalent, the title
              attribute, and in repo/home.ts where the rule is named and exported. Nine rows each carrying its
              own methodology footnote made the footnotes the loudest thing in the section. */}
          <DataList label="Measurable signals" tight>
            {v.signals.map((sig) => (
              <DataRow
                key={`${sig.rule}-${sig.subject}`}
                title={sig.subject}
                href={sig.href}
                detail={<span title={`${sig.rule} · ${sig.threshold}`}>{sig.detail}</span>}
              />
            ))}
          </DataList>
        </Panel>
      </div>

      <Foot />
    </Shell>
  );
}
