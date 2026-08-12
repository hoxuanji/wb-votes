import Link from 'next/link';
import { openRead } from '../../packages/mandate/src/db/open.ts';
import { homeView } from '../../packages/mandate/src/repo/home.ts';
import type { HomeView } from '../../packages/mandate/src/repo/home.ts';
import { RegistryUnavailableError } from '../../packages/mandate/src/repo/index.ts';
import { partyAnchor } from '../../packages/mandate/src/repo/search.ts';
import { fillFor } from '../../packages/mandate/src/viz/party-ink.ts';
import { GEOMETRY_SOURCE } from '../lib/india-geo.ts';
import { Shell } from '../components/iei/Shell.tsx';
import { IndiaMap } from '../components/iei/IndiaMap.tsx';
import {
  BasisChip,
  Change,
  CoverageChip,
  DataList,
  DataRow,
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
 * FOUR SECTIONS, DOWN FROM NINE, and the four answer the four questions a front page owes a reader: where
 * am I, what is happening, what matters, where do I go next. What went, and why — because a deletion is a
 * claim and has to be defensible:
 *
 *  · A SIX-METRIC HERO STRIP. Every one of the six — assemblies on record, assembly seats, Lok Sabha
 *    seats, governing parties, elections held, terms expiring — was printed a second time on the same
 *    screen, in the dateline above it or in a section below it. The dateline keeps the counts; the tiles
 *    were the second copy.
 *  · "WHO GOVERNS", a 36-row table of state, year, leading party and seats. The map's companion table is
 *    36 rows of state, year, leading party and seats, with the same links. It was the same table twice,
 *    once with a bar.
 *  · CLOSE FIGHTS. Watch's knife-edge rule is the same fact at the same threshold — seats decided by under
 *    1% of votes polled — and it reaches them through a rule the reader can argue with.
 *  · HISTORICAL ELECTIONS, a 36×5 grid of 180 cells whose every cell was a link to a state page. That is a
 *    table of contents for the level below, which is what the map already is. A state's own elections are
 *    on that state's page.
 *  · DATA COVERAGE, for one election at a time, driven by a `<select>` in the chrome. `/coverage` is a page
 *    whose entire subject is that question, and the panel moved to it — with its deep link, so
 *    `/coverage?election=ls-2024` still resolves.
 *
 * WHAT THE PAGE MAY NOT DO, stated here because it is easier to violate in JSX than anywhere else: print a
 * figure no source published, print a derived date as an announced one, or shade a jurisdiction in a colour
 * that stands for nothing. `Value` cannot render a null as a blank, `BasisChip` marks the derived rows, and
 * an unlit polygon wears an ink that deliberately fails the contrast floor a mark has to clear.
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

/** The registry's name for a jurisdiction id, from the rows the page already holds. */
function nameOf(v: HomeView, id: string): string {
  return v.states.find((j) => j.id === id)?.name ?? id;
}

/**
 * The dateline: what is loaded, and when the counting happened.
 *
 * This is the one place the page states its own scope, and it is a line rather than a grid because every
 * cell in it is a count of the same kind. It replaced a six-tile metric strip that said the same six
 * things twice as tall.
 */
function Dateline({ v, at }: { v: HomeView; at: string }) {
  const s = v.snapshot;
  return (
    <div className="iei-record">
      <span>
        <b>{s.jurisdictionsWithResults}</b> of {s.jurisdictionsTotal} states &amp; UTs
      </span>
      <span>
        assembly seats{' '}
        <b>
          <Value value={s.assemblySeatsHeld} of={s.assemblySeatsTotal} absent="none held" />
        </b>
      </span>
      <span>
        Lok Sabha{' '}
        <b>
          <Value value={s.lokSabhaSeatsHeld} of={s.lokSabhaSeatsTotal} absent="none held" />
        </b>
      </span>
      <span>
        <b>
          <Value value={s.elections} absent="no" />
        </b>{' '}
        elections{s.earliestYear === null ? '' : ` since ${s.earliestYear}`}
      </span>
      <span>computed {at}</span>
      <span>
        <Link href="/coverage">what is and is not loaded</Link>
      </span>
    </div>
  );
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

  const at = new Date().toISOString().slice(11, 16) + ' UTC';
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
  return (
    <Shell here="india" live={v.snapshot.live}>
      <Dateline v={v} at={at} />

      <div className="iei-head">
        <p className="iei-eyebrow">India · current electoral landscape</p>
        <h1 className="iei-answer">{v.headline}</h1>
      </div>

      {/* ── the map: the product's primary analytical instrument, and its primary navigation ── */}
      <Panel
        id="map"
        title={`India · ${v.layer.label}`}
        question={v.layer.question}
        basis={v.layer.key === 'year' ? 'reference' : 'measured'}
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

            {/* THIS IS "WHO GOVERNS". There is no second table of it below: the panel that used to hold
                one printed the same 36 rows, the same four columns and the same links, with a bar. */}
            <Table
              label="Every jurisdiction in this layer"
              caption={v.layer.question}
              tight
              tall
              head={
                <>
                  <th scope="col">State / UT</th>
                  <th scope="col" className="iei-n">
                    Year
                  </th>
                  <th scope="col">{v.layer.encoding === 'categorical' ? 'Leading party' : 'Value'}</th>
                  <th scope="col" className="iei-n">
                    Seats
                  </th>
                  {/* The denominator's own column, so the seat counts align on their own right edge
                      instead of on the width of "of 288". Blank in the header, because "of" is a unit. */}
                  <th scope="col" className="iei-den">
                    <span className="iei-sr">of seats contested</span>
                  </th>
                </>
              }
            >
              {v.layer.cells.map((c) => {
                const s = v.standings.find((x) => x.jurisdictionId === c.jurisdictionId);
                // The table mutes with the map. A highlight that dimmed the polygons and left the rows at full
                // strength would be two answers to one question on one screen.
                const muted = party !== null && c.partyKey !== party;
                return (
                  <tr key={c.jurisdictionId} data-j={c.jurisdictionId} className={muted ? 'iei-legend-off' : undefined}>
                    <th scope="row">
                      <Link href={c.href}>{c.jurisdictionName}</Link>
                    </th>
                    <td className="iei-n">{c.year ?? <span className="iei-absent">—</span>}</td>
                    <td>
                      {c.label === null ? (
                        <span className="iei-absent">{c.detail[1] ?? 'not loaded'}</span>
                      ) : (
                        <>
                          <span className="iei-sw" style={{ background: c.fill }} aria-hidden="true" />
                          <span className="iei-chip">{c.label}</span>
                        </>
                      )}
                    </td>
                    <td className="iei-n">
                      {s === undefined ? <span className="iei-absent">—</span> : s.leaderSeats}
                    </td>
                    <td className="iei-den">{s === undefined ? null : `of ${s.seatsContested}`}</td>
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
          title="Next"
          question="Which assemblies face the electorate next?"
          basis={v.announced.length > 0 ? 'measured' : 'derived'}
          note={
            v.announced.length > 0 ? undefined : (
              <>
                <b>No date on this list was announced by anyone.</b> Every row is a five-year term counted
                from the last election — arithmetic on a past date, not a statement about a future one.
                Announced dates replace them the moment the Commission&rsquo;s schedule is ingested.
              </>
            )
          }
        >
          {next.length === 0 ? (
            <p className="iei-absent">No jurisdiction has an assembly election on record to count from.</p>
          ) : (
            <Table
              label="Assemblies facing the electorate next"
              caption="The next assembly election in each jurisdiction, announced where a date exists and derived otherwise"
              head={
                <>
                  <th scope="col">State / UT</th>
                  {/* NO "HOUSE" COLUMN. `upcoming()` counts assembly terms, so every one of its eight rows
                      said "Assembly" — a column of one repeated word, which is eight cells of noise and a
                      header that looks like a filter. The section's question says it once instead. */}
                  <th scope="col" className="iei-n">
                    Due
                  </th>
                  <th scope="col">Basis</th>
                </>
              }
            >
              {next.map((r) => (
                <tr key={`${r.jurisdictionId}-${r.year}`}>
                  <th scope="row">
                    <Link href={`/pl/${r.jurisdictionId}`}>{r.jurisdictionName}</Link>
                  </th>
                  <td className="iei-n">{r.announcedOn ?? r.year}</td>
                  <td>
                    {/* The basis travels with the row, not with the section: an announced date and a
                        derived one must never look alike, even side by side in one table. */}
                    <BasisChip basis={r.announcedOn === null ? 'derived' : 'measured'} />
                  </td>
                </tr>
              ))}
            </Table>
          )}
          {v.overdue.length === 0 ? null : (
            <p className="iei-note">
              {v.overdue.length} more term{v.overdue.length === 1 ? '' : 's'} ended before {THIS_YEAR} on the
              same count. That is a statement about where our data stops, not about an election that is
              coming, which is why it is not above. <Link href="/coverage">Coverage</Link>
            </p>
          )}
        </Panel>

        <Panel title="Just decided" question="What has been decided most recently?" basis="measured">
          <Table
            label="Elections most recently held"
            caption="Elections most recently held, newest first, with how completely each is loaded"
            head={
              <>
                <th scope="col">Election</th>
                <th scope="col">Won by</th>
                <th scope="col" className="iei-n">
                  Turnout
                </th>
                <th scope="col">Coverage</th>
              </>
            }
          >
            {v.held.map((r) => (
              <tr key={r.id}>
                <th scope="row">
                  {/* TWO DESTINATIONS, AND NEITHER IS DEAD. The jurisdiction links to its place page; the
                      election links to its own record on /coverage. A general election's jurisdiction is
                      the nation, whose page is this one — so its name is plain text rather than a link to
                      /pl/in, which is a 404. That link existed until this phase, hidden behind a query
                      string the navigation test's regex did not match. */}
                  {r.kind === 'general' ? (
                    r.jurisdictionName
                  ) : (
                    <Link href={`/pl/${r.jurisdictionId}`}>{r.jurisdictionName}</Link>
                  )}
                  <span className="iei-rule">
                    <Link href={`/coverage?election=${r.id}#election`}>
                      {houseWord(r.house)} {r.year}
                      {r.kind === 'bypoll' ? ' by-election' : ''}
                    </Link>
                  </span>
                </th>
                <td>
                  {r.leaderLabel === null ? (
                    <span className="iei-absent">no winner recorded</span>
                  ) : (
                    <>
                      <span className="iei-chip">{r.leaderLabel}</span>
                      <span className="iei-rule">
                        {r.leaderSeats} of {r.seatsContested}
                      </span>
                    </>
                  )}
                </td>
                <td className="iei-n">
                  <Value value={r.turnoutPct} unit="%" decimals={1} absent="not reported" />
                </td>
                <td>
                  {/* Counted, not declared, and the count is on /coverage rather than in a paragraph
                      under this table. */}
                  <CoverageChip state={v.coverageOf.get(r.id) ?? 'unavailable'} />
                </td>
              </tr>
            ))}
          </Table>
        </Panel>
      </div>

      {/* ── who holds power, and where ── */}
      <Panel
        id="parties"
        title="Party landscape"
        question="Where does each party actually hold power?"
        basis="measured"
        note={
          <>
            Assembly seats are summed across <b>each jurisdiction&rsquo;s most recent election</b>, and those
            elections span {v.standings.length === 0 ? 'no years' : `${oldest(v)}–${newest(v)}`} — so this is
            who sits now, not a national vote at one moment.
            {v.parties.houseCounted
              ? null
              : ' The latest Lok Sabha published no candidate vote counts, so every share is absent rather than zero.'}
          </>
        }
      >
        <Table
          label="Parties by where they hold power"
          caption="Parties ranked by the number of assemblies they lead, then by Lok Sabha seats"
          head={
            <>
              <th scope="col">Party</th>
              <th scope="col" className="iei-n">
                Assemblies
              </th>
              <th scope="col" className="iei-n">
                Assembly seats
              </th>
              <th scope="col" className="iei-n">
                {v.parties.houseYear === null ? 'Lok Sabha' : `Lok Sabha ${v.parties.houseYear}`}
              </th>
              <th scope="col" className="iei-n">
                {v.parties.previousHouseYear === null ? 'Change' : `vs ${v.parties.previousHouseYear}`}
              </th>
              <th scope="col" className="iei-n">
                Share
              </th>
              <th scope="col" className="iei-drop">
                <span className="iei-sr">Lok Sabha seats over the last five general elections</span>
                Trend
              </th>
            </>
          }
        >
          {/* An id per row, so a party hit in search lands on the party rather than on the section. The
              anchor is built by the same function the search hits use, because two spellings of one
              fragment is a link that silently goes nowhere. */}
          {v.parties.rows.map((p) => (
            <tr key={p.key} id={partyAnchor(p.key)}>
              <th scope="row">
                <span className="iei-mark">
                  <span className="iei-sw" style={{ background: fillFor(p.key) }} aria-hidden="true" />
                  <span className="iei-chip">{p.label}</span>
                </span>
              </th>
              {/* THE COUNT ONLY. It used to carry "5 with a majority" as an inline suffix, which put two
                  numbers in one right-aligned tabular cell — "11 5 with a majority" — and made the column
                  ragged in a table whose whole point is that figures line up. Whether a party's seats are an
                  outright majority is visible in the map's companion table, where the seat count is printed
                  against the seats contested. */}
              <td className="iei-n">
                {p.governs === 0 ? <span className="iei-absent">none</span> : p.governs}
              </td>
              <td className="iei-n">{p.assemblySeats}</td>
              <td className="iei-n">
                {p.houseSeats === 0 ? <span className="iei-absent">none</span> : p.houseSeats}
              </td>
              <td className="iei-n">
                <Change value={p.houseSeatsChange} absent="did not contest" />
              </td>
              <td className="iei-n">
                <Value value={p.houseSharePct} unit="%" decimals={1} absent="not reported" />
              </td>
              <td className="iei-drop">
                <Sparkline
                  points={p.spark}
                  fill={fillFor(p.key)}
                  label={`${p.label} Lok Sabha seats: ${p.spark.map((s) => `${s.year} ${s.seats}`).join(', ')}`}
                />
              </td>
            </tr>
          ))}
        </Table>
      </Panel>

      {/* ── the signals, each found a different way ── */}
      <Panel
        id="watch"
        title="What to watch"
        question="Which measurable signals stand out?"
        note={
          <>
            <b>Nothing here is a prediction.</b> Each row is a count or a difference over rows the registry
            holds, and carries the rule and the threshold that produced it — so the threshold is what you
            argue with rather than an oracle. No model, no forecast, no probability.
          </>
        }
      >
        <DataList label="Measurable signals">
          {v.signals.map((s) => (
            <DataRow
              key={`${s.rule}-${s.subject}`}
              title={s.subject}
              href={s.href}
              aside={<BasisChip basis={s.basis === 'derived' ? 'derived' : 'measured'} />}
              detail={s.detail}
              rule={`${s.rule} · ${s.threshold}`}
            />
          ))}
        </DataList>
      </Panel>

      <footer className="iei-foot">
        <p>
          {/* "Nothing is modelled, predicted or filled in" used to be here as well. The Watch section says
              it one screen up, in the place where it is load-bearing. */}
          India Election Intelligence is a registry of Indian elections in which every figure carries its
          source, its derivation and its uncertainty. What is loaded, what is not, and where the gaps are:{' '}
          <Link href="/coverage">/coverage</Link>.
        </p>
      </footer>
    </Shell>
  );
}
