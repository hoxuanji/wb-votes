import Link from 'next/link';
import { openRead } from '../../packages/mandate/src/db/open.ts';
import { HISTORY_DEPTH, homeView, hueOf } from '../../packages/mandate/src/repo/home.ts';
import type { HomeView } from '../../packages/mandate/src/repo/home.ts';
import { RegistryUnavailableError } from '../../packages/mandate/src/repo/index.ts';
import { Shell } from '../components/iei/Shell.tsx';
import { IndiaMap } from '../components/iei/IndiaMap.tsx';
import {
  Bar,
  BasisChip,
  Change,
  CoverageChip,
  Metric,
  Panel,
  Scroll,
  Sparkline,
  Value,
} from '../components/iei/parts.tsx';
import './iei.css';

/**
 * `/` — INDIA.
 *
 * The top of an information architecture that runs INDIA → STATE → ELECTION → CONSTITUENCY → CANDIDATE →
 * EVIDENCE. Its job is not to show a result; it is to show the country, and to be the place you choose
 * from. Every figure is a `SELECT` executed when the page is requested, and every section is the same
 * component shape pointed at a different slice — see repo/home.ts, where nothing knows whether it is
 * holding a state assembly, a Lok Sabha election or a by-poll.
 *
 * THERE IS NO LIST OF STATES IN THIS FILE, and there must never be one. The 36 jurisdictions, the seat
 * counts and the elections all arrive from the registry and from `ingest/india.ts` reference data; loading
 * Kerala's next assembly puts Kerala on this page without a line of UI changing.
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
 * A link to this page with one parameter changed and the rest kept.
 *
 * Filters are URL state, which is what makes a view shareable — but a layer link that dropped `?election=`
 * would silently reset the coverage panel, so the whole query is carried through. `#map` sends the browser
 * back to the section that changed rather than to the top of the page.
 */
function href(params: Params, change: Record<string, string>): string {
  const q = new URLSearchParams();
  for (const [k, val] of Object.entries(params ?? {})) {
    const one = first(val);
    if (one !== undefined && one !== '') q.set(k, one);
  }
  for (const [k, val] of Object.entries(change)) q.set(k, val);
  const anchor = 'layer' in change ? '#map' : 'house' in change ? '#history' : '';
  return `/?${q.toString()}${anchor}`;
}

/** The span of the elections the party table sums over, so its caveat states its own range. */
const oldest = (v: HomeView): number => Math.min(...v.standings.map((s) => s.year));
const newest = (v: HomeView): number => Math.max(...v.standings.map((s) => s.year));

/** The widest margin in the close-fight list — the bar's denominator, so the bars are comparable. */
const widest = (v: HomeView): number => Math.max(...v.fights.map((f) => f.marginPct), 0.01);

/** The house a row is about, in the words a reader uses. `ac`/`pc` are the registry's codes. */
function houseWord(house: string): string {
  return house === 'pc' ? 'Lok Sabha' : house === 'ac' ? 'Assembly' : house;
}

/** The registry's name for a jurisdiction id, from the rows the page already holds. */
function nameOf(v: HomeView, id: string): string {
  return v.states.find((j) => j.id === id)?.name ?? id;
}

/** The dateline. Counts, then when the counting happened — which is the honest form of a timestamp. */
function Record({ v, at }: { v: HomeView; at: string }) {
  const s = v.snapshot;
  return (
    <div className="iei-record">
      <span>
        <b>
          {s.jurisdictionsWithResults}
        </b>{' '}
        of {s.jurisdictionsTotal} states &amp; UTs
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
        elections{' '}
        <b>
          <Value value={s.elections} absent="none loaded" />
        </b>
        {s.earliestYear === null ? null : ` since ${s.earliestYear}`}
      </span>
      {s.latest === null ? null : (
        <span>
          latest{' '}
          <b>
            {s.latest.jurisdictionName} {s.latest.year}
          </b>
        </span>
      )}
      <span>computed {at}</span>
      <span>
        <Link href="/coverage">what is and is not loaded</Link>
      </span>
    </div>
  );
}

/**
 * The hero: a computed sentence and the six counts behind it.
 *
 * Not a marketing block and not a giant number. `headline` is built in repo/home.ts from the same rows the
 * page prints, so it cannot drift from them — and its second clause says "derived, not announced" in the
 * sentence rather than in a footnote, because that is where a reader is when they read the figure.
 */
function Hero({ v }: { v: HomeView }) {
  const s = v.snapshot;
  const house = v.parties.houseYear;
  return (
    <div className="iei-hero">
      <div>
        <p className="iei-eyebrow">India · current electoral landscape</p>
        <h1 className="iei-answer">{v.headline}</h1>
        <p className="iei-sub">
          Every figure on this page is counted from the registry when the page is requested, and carries the
          source it came from. Nothing is modelled, predicted or filled in.
        </p>
      </div>
      <dl className="iei-metrics">
        <Metric
          label="Assemblies"
          value={s.assembliesOnRecord}
          of={s.jurisdictionsTotal}
          hint="jurisdictions with an assembly election on record"
        />
        <Metric
          label="Assembly seats"
          value={s.assemblySeatsHeld}
          of={s.assemblySeatsTotal}
          hint="newest election in each"
        />
        <Metric
          label="Lok Sabha seats"
          value={s.lokSabhaSeatsHeld}
          of={s.lokSabhaSeatsTotal}
          hint={house === null ? 'no general election loaded' : `${house}, every constituency resolved`}
        />
        <Metric label="Governing parties" value={s.governingParties} hint="leading an assembly" />
        <Metric label="Elections held" value={s.elections} hint={s.earliestYear === null ? undefined : `back to ${s.earliestYear}`} />
        <Metric label="Terms expiring" value={s.dueSoon} hint="within a year — derived" />
      </dl>
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
    v = homeView(db, {
      layer: first(searchParams?.['layer']),
      election: first(searchParams?.['election']),
      house: first(searchParams?.['house']),
      thisYear: THIS_YEAR,
    });
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
      <Shell here="overview">
        <div className="iei-hero">
          <div>
            <p className="iei-eyebrow">India · election intelligence</p>
            <h1 className="iei-answer">
              {unavailable ? 'The registry is not built in this checkout.' : 'No elections are loaded.'}
            </h1>
            <p className="iei-sub">
              This page counts rows, so it needs the database. Build it with{' '}
              <code>npm run registry:migrate &amp;&amp; npm run registry:ingest</code>, then reload.
            </p>
          </div>
        </div>
      </Shell>
    );
  }

  const at = new Date().toISOString().slice(11, 16) + ' UTC';
  return (
    <Shell
      here="overview"
      states={v.states.map((j) => ({ id: j.id, name: j.name, hasData: j.hasData }))}
      elections={v.choices}
      live={v.snapshot.live}
    >
      <Record v={v} at={at} />
      <Hero v={v} />

      <Panel
        id="map"
        title={v.layer.label}
        question={v.layer.question}
        basis={v.layer.key === 'year' ? 'reference' : 'measured'}
      >
        {/* The layer strip. Plain links, so the layer is URL state: a view can be sent to someone, survives
            a reload, and works with JavaScript off. A layer with nothing behind it is offered as
            unavailable rather than rendering an empty country — and which those are is measured. */}
        <div className="iei-layers" role="group" aria-label="Map layer">
          {v.layers.map((l) =>
            l.available ? (
              <Link
                key={l.key}
                href={href(searchParams, { layer: l.key })}
                className={l.key === v.layer.key ? 'iei-layer iei-layer-on' : 'iei-layer'}
                aria-current={l.key === v.layer.key ? 'true' : undefined}
              >
                {l.label}
              </Link>
            ) : (
              <span key={l.key} className="iei-layer iei-layer-off" aria-disabled="true">
                {l.label}
                <span className="iei-sr"> — unavailable: nothing in the registry can fill this layer</span>
              </span>
            ),
          )}
        </div>

        <div className="iei-linked iei-map-split">
          <IndiaMap layer={v.layer} nameOf={(id) => nameOf(v, id)} />

          <div>
            <ul className="iei-legend">
              {v.layer.legend.map((l) => (
                <li key={l.label}>
                  <span className="iei-sw" style={{ background: l.fill }} aria-hidden="true" />
                  {l.label}
                  {l.note === undefined ? null : <b>{l.note}</b>}
                </li>
              ))}
              {v.layer.unknown === 0 ? null : (
                <li>
                  <span className="iei-sw iei-sw-none" aria-hidden="true" />
                  Not held <b>{v.layer.unknown}</b>
                </li>
              )}
            </ul>

            <Scroll label="Every jurisdiction in this layer">
              <table className="iei-t iei-t-tight">
                <caption className="iei-sr">{v.layer.question}</caption>
                <thead>
                  <tr>
                    <th scope="col">State / UT</th>
                    <th scope="col" className="iei-n">
                      Year
                    </th>
                    <th scope="col">{v.layer.encoding === 'categorical' ? 'Leading party' : 'Value'}</th>
                    <th scope="col" className="iei-n">
                      Seats
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {v.layer.cells.map((c) => {
                    const s = v.standings.find((x) => x.jurisdictionId === c.jurisdictionId);
                    return (
                      <tr key={c.jurisdictionId} data-j={c.jurisdictionId}>
                        <td>
                          <Link href={c.href}>{c.jurisdictionName}</Link>
                        </td>
                        <td className="iei-n">
                          {c.year ?? <span className="iei-absent">—</span>}
                        </td>
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
                          {s === undefined ? (
                            <span className="iei-absent">—</span>
                          ) : (
                            <>
                              {s.leaderSeats}
                              <span className="iei-of"> of {s.seatsContested}</span>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Scroll>
          </div>
        </div>
      </Panel>

      <Panel
        id="states"
        title="Who governs"
        question="Which party leads each assembly, in its most recent election?"
        basis="measured"
      >
        <Scroll label="Jurisdictions by their most recent assembly election">
          <table className="iei-t iei-t-tight">
            <caption className="iei-sr">
              Every jurisdiction with an assembly election on record, newest first
            </caption>
            <thead>
              <tr>
                <th scope="col">State / UT</th>
                <th scope="col" className="iei-n">
                  Year
                </th>
                <th scope="col">Leading party</th>
                <th scope="col" className="iei-n">
                  Seats
                </th>
                <th scope="col" className="iei-col-track">
                  <span className="iei-sr">Share of the seats contested</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {v.standings.map((r) => (
                <tr key={r.jurisdictionId}>
                  <td>
                    <Link href={`/pl/${r.jurisdictionId}`}>{r.jurisdictionName}</Link>
                  </td>
                  <td className="iei-n">{r.year}</td>
                  <td>
                    <span className="iei-sw" style={{ background: hueOf(v.ink, r.leaderKey) }} aria-hidden="true" />
                    <span className="iei-chip">{r.leaderLabel ?? <span className="iei-absent">not recorded</span>}</span>
                    {r.majority ? null : <span className="iei-rule">no outright majority</span>}
                  </td>
                  <td className="iei-n">
                    {r.leaderSeats}
                    <span className="iei-of"> of {r.seatsContested}</span>
                  </td>
                  <td className="iei-col-track">
                    {/* No label: the seat count is the cell immediately before this one, and announcing the
                        bar as well makes a screen reader read every row's figure twice. */}
                    <Bar
                      pct={(100 * r.leaderSeats) / Math.max(1, r.seatsContested)}
                      fill={hueOf(v.ink, r.leaderKey)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scroll>
        <p className="iei-note">
          {v.snapshot.jurisdictionsTotal - v.standings.length} of {v.snapshot.jurisdictionsTotal} jurisdictions
          have no assembly election on record here — three union territories have no legislative assembly at
          all, and the rest are not loaded. <Link href="/coverage">Coverage</Link> says which is which.
        </p>
      </Panel>

      <div className="iei-two iei-two-wide" id="elections">
        <Panel
          title="Upcoming"
          question="Which houses face the electorate next?"
          basis={v.announced.length > 0 ? 'measured' : 'derived'}
          note={
            v.announced.length > 0 ? undefined : (
              <>
                <b>No date on this list was announced by anyone.</b> The Election Commission announces
                schedules; this registry holds none — <code>announced_on</code> is empty for all{' '}
                {v.snapshot.elections} elections and no polling phase is loaded. Every row below is a
                five-year term counted from the last election, which is arithmetic on a past date and not a
                statement about a future one. Once the ECI schedule is ingested, announced dates appear here
                and these rows give way to them.
              </>
            )
          }
        >
          {v.announced.length + v.upcoming.length === 0 ? (
            <p className="iei-absent">No jurisdiction has an assembly election on record to count from.</p>
          ) : (
            <table className="iei-t">
              <thead>
                <tr>
                  <th scope="col">State / UT</th>
                  <th scope="col">House</th>
                  <th scope="col" className="iei-n">
                    Due
                  </th>
                  <th scope="col">Basis</th>
                </tr>
              </thead>
              <tbody>
                {[...v.announced, ...v.upcoming].map((r) => (
                  <tr key={`${r.jurisdictionId}-${r.year}`}>
                    <td>
                      <Link href={`/pl/${r.jurisdictionId}`}>{r.jurisdictionName}</Link>
                    </td>
                    <td className="iei-rule">{houseWord(r.house)}</td>
                    <td className="iei-n">{r.announcedOn ?? r.year}</td>
                    <td>
                      {/* The basis travels with the row, not with the section: an announced date and a
                          derived one must never look alike, even side by side in one table. */}
                      <BasisChip basis={r.announcedOn === null ? 'derived' : 'measured'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {v.overdue.length === 0 ? null : (
            <p className="iei-note">
              {v.overdue.length} more term{v.overdue.length === 1 ? '' : 's'} ended before {THIS_YEAR} on the
              same count — {v.overdue.map((r) => `${r.jurisdictionName} ${r.year}`).join(', ')}. That is a
              statement about where our data stops, not about an election that is coming, which is why it is
              not in the list above. <Link href="/coverage">Coverage</Link>
            </p>
          )}
        </Panel>

        <Panel
          title="Recently held"
          question="What has just been decided, and do we hold all of it?"
          basis="measured"
        >
          <table className="iei-t">
            <thead>
              <tr>
                <th scope="col">Election</th>
                <th scope="col">Won by</th>
                <th scope="col" className="iei-n">
                  Turnout
                </th>
                <th scope="col">Coverage</th>
              </tr>
            </thead>
            <tbody>
              {v.held.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/pl/${r.jurisdictionId}?election=${r.id}`}>{r.jurisdictionName}</Link>
                    <span className="iei-rule">
                      {houseWord(r.house)} {r.year}
                      {r.kind === 'bypoll' ? ' by-election' : ''}
                    </span>
                  </td>
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
                    <CoverageChip state={v.coverageOf.get(r.id) ?? 'unavailable'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="iei-note">
            Coverage is counted, not declared: <b>complete</b> means every constituency the house elects is
            loaded and every contest carries a vote count or a stated reason it does not.{' '}
            <b>Partial</b> names what is missing — see <Link href="#coverage">Data coverage</Link> for the
            election-by-election account.
          </p>
        </Panel>
      </div>

      <Panel
        id="parties"
        title="Party landscape"
        question="Where does each party actually hold power?"
        basis="measured"
        note={
          <>
            Assembly seats are summed across <b>each jurisdiction&rsquo;s most recent election</b>, which is
            the only denominator comparable with today&rsquo;s India — and those elections span{' '}
            {v.standings.length === 0 ? 'no' : `${oldest(v)}–${newest(v)}`}, so this is a snapshot of who sits
            now, not a national vote at one moment.
            {v.parties.houseCounted ? null : ' The latest Lok Sabha published no candidate vote counts, so every share below is absent rather than zero.'}
          </>
        }
      >
        <Scroll label="Parties by where they hold power">
        <table className="iei-t">
          <thead>
            <tr>
              <th scope="col">Party</th>
              <th scope="col" className="iei-n">
                Assemblies
              </th>
              <th scope="col" className="iei-n">
                Assembly seats
              </th>
              <th scope="col" className="iei-col-track">
                <span className="iei-sr">Assembly seats as a share of those loaded</span>
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
              <th scope="col" className="iei-n">
                Change
              </th>
              <th scope="col">
                <span className="iei-sr">Lok Sabha seats over the last five general elections</span>
                Trend
              </th>
            </tr>
          </thead>
          <tbody>
            {v.parties.rows.map((p) => (
              <tr key={p.key}>
                <td>
                  <span className="iei-sw" style={{ background: hueOf(v.ink, p.key) }} aria-hidden="true" />
                  <span className="iei-chip">{p.label}</span>
                </td>
                <td className="iei-n">
                  {p.governs === 0 ? (
                    <span className="iei-absent">none</span>
                  ) : (
                    <>
                      {p.governs}
                      {p.governsMajority < p.governs ? (
                        <span className="iei-of"> {p.governsMajority} with a majority</span>
                      ) : null}
                    </>
                  )}
                </td>
                <td className="iei-n">{p.assemblySeats}</td>
                <td className="iei-col-track">
                  <Bar pct={(100 * p.assemblySeats) / Math.max(1, v.parties.assemblySeats)} fill={hueOf(v.ink, p.key)} />
                </td>
                <td className="iei-n">{p.houseSeats === 0 ? <span className="iei-absent">none</span> : p.houseSeats}</td>
                <td className="iei-n">
                  <Change value={p.houseSeatsChange} absent="did not contest" />
                </td>
                <td className="iei-n">
                  <Value value={p.houseSharePct} unit="%" decimals={1} absent="not reported" />
                </td>
                <td className="iei-n">
                  <Change value={p.houseSharePp} unit="pp" absent="n/a" />
                </td>
                <td>
                  <Sparkline
                    points={p.spark}
                    fill={hueOf(v.ink, p.key)}
                    label={`${p.label} Lok Sabha seats: ${p.spark.map((s) => `${s.year} ${s.seats}`).join(', ')}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </Scroll>
        <p className="iei-note">
          Ranked by jurisdictions governed, then Lok Sabha seats. No pie chart: a party&rsquo;s change
          against last time is the useful comparison, and two pies side by side cannot show it.
        </p>
      </Panel>

      <div className="iei-two iei-two-wide">
        <Panel
          title="Close fights"
          question="Where was the result closest?"
          basis="measured"
          note={
            <>
              Margin as a share of <b>votes polled</b>, never of the result rows summed. For years where the
              source holds only the leading contestants, a sum of those rows understates the votes cast and
              inflates every margin.
            </>
          }
        >
          <table className="iei-t">
            <thead>
              <tr>
                <th scope="col">Seat</th>
                <th scope="col">Won by</th>
                <th scope="col">Runner-up</th>
                <th scope="col" className="iei-n">
                  Margin
                </th>
                <th scope="col" className="iei-col-track">
                  <span className="iei-sr">Margin against the widest shown</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {v.fights.map((f) => (
                <tr key={`${f.placeId}-${f.electionId}`}>
                  <td>
                    <Link href={`/pl/${f.jurisdictionId}?election=${f.electionId}`}>{f.placeName}</Link>
                    <span className="iei-rule">
                      {nameOf(v, f.jurisdictionId)} {f.year}
                    </span>
                  </td>
                  <td>
                    <span className="iei-chip">{f.winner}</span>
                    <span className="iei-rule">
                      <Value value={f.winnerPct} unit="%" decimals={1} absent="share not reported" />
                    </span>
                  </td>
                  <td>
                    {f.runnerUp === null ? (
                      <span className="iei-absent">not recorded</span>
                    ) : (
                      <>
                        <span className="iei-chip">{f.runnerUp}</span>
                        <span className="iei-rule">
                          <Value value={f.runnerUpPct} unit="%" decimals={1} absent="share not reported" />
                        </span>
                      </>
                    )}
                  </td>
                  <td className="iei-n">
                    {f.marginPct}%
                    <span className="iei-of">
                      <Value value={f.marginVotes} absent="votes not reported" /> votes
                    </span>
                  </td>
                  <td className="iei-col-track">
                    <Bar pct={(100 * f.marginPct) / Math.max(0.01, widest(v))} fill="var(--iei-alert)" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel
          id="watch"
          title="What to watch"
          question="Which measurable signals stand out?"
          note={
            <>
              <b>Nothing here is a prediction.</b> Each row is a count or a difference over rows the registry
              holds, and carries the rule and the threshold that produced it, so the threshold is what you
              argue with rather than an oracle. No model, no forecast, no probability.
            </>
          }
        >
          <ul className="iei-signals">
            {v.signals.map((s) => (
              <li key={`${s.rule}-${s.subject}`}>
                <div className="iei-sig-h">
                  <Link href={s.href}>{s.subject}</Link>
                  <BasisChip basis={s.basis === 'derived' ? 'derived' : 'measured'} />
                </div>
                <p className="iei-sig-d">{s.detail}</p>
                <p className="iei-rule">
                  {s.rule} · {s.threshold}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel
        id="history"
        title="Historical elections"
        question={`The last ${HISTORY_DEPTH} ${v.historyHouse === 'pc' ? 'general elections' : 'assembly elections'} in each jurisdiction`}
        basis="measured"
        note={
          <>
            <b>Coverage here is honest by construction.</b> A jurisdiction with two elections on record gets
            two cells; nothing is padded and nothing assumes five. Ordering is by the calendar, not by
            election id — Bihar held one election in February 2005 and another in October, and they are two
            cells in the right order rather than one.
          </>
        }
      >
        <div className="iei-layers" role="group" aria-label="House">
          {(['ac', 'pc'] as const).map((h) => (
            <Link
              key={h}
              href={href(searchParams, { house: h })}
              className={h === v.historyHouse ? 'iei-layer iei-layer-on' : 'iei-layer'}
              aria-current={h === v.historyHouse ? 'true' : undefined}
            >
              {houseWord(h)}
            </Link>
          ))}
        </div>
        <Scroll label={`The last ${HISTORY_DEPTH} elections in each jurisdiction`}>
          <table className="iei-t iei-t-tight iei-hist">
            <caption className="iei-sr">
              Each jurisdiction&rsquo;s last {HISTORY_DEPTH} {houseWord(v.historyHouse)} elections, newest
              first
            </caption>
            <thead>
              <tr>
                <th scope="col">State / UT</th>
                {Array.from({ length: HISTORY_DEPTH }, (_, i) => (
                  <th key={i} scope="col">
                    {i === 0 ? 'Most recent' : `${i} back`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {v.history.map((row) => (
                <tr key={row.jurisdictionId}>
                  <th scope="row">
                    <Link href={`/pl/${row.jurisdictionId}`}>{row.jurisdictionName}</Link>
                  </th>
                  {Array.from({ length: HISTORY_DEPTH }, (_, i) => {
                    const c = row.cells[i];
                    return (
                      <td key={i}>
                        {c === undefined ? (
                          // Not "n/a": there is no election here, which is a different fact from a missing
                          // figure for one that happened.
                          <span className="iei-absent">—</span>
                        ) : (
                          <Link className="iei-cell" href={`/pl/${row.jurisdictionId}?election=${c.electionId}`}>
                            <b>{c.year}</b>
                            <span className="iei-chip">
                              {c.leaderLabel ?? <span className="iei-absent">no winner</span>}
                            </span>
                            <span className="iei-rule">
                              {c.leaderSeats} of {c.seatsContested}
                            </span>
                          </Link>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Scroll>
      </Panel>

      {v.coverage === null ? null : (
        <Panel
          id="coverage"
          title="Data coverage"
          question="How much of this election do we actually hold?"
          basis="measured"
          sources={v.coverage.sources}
        >
          <p className="iei-cov-h">
            <b>{v.coverage.name}</b>
            <CoverageChip state={v.coverage.completeness} />
          </p>
          <dl className="iei-metrics iei-metrics-6">
            <Metric
              label="Constituencies"
              value={v.coverage.contests}
              of={v.coverage.expected}
              absent="none loaded"
              hint={v.coverage.expected === null ? v.coverage.expectedBasis : 'resolved of expected'}
            />
            <Metric
              label="Numeric results"
              value={v.coverage.numericResults}
              hint="contests with a published vote count"
            />
            <Metric
              label="Unopposed"
              value={v.coverage.unopposed}
              hint="elected with no poll — asserted by a cited claim, not a zero"
            />
            <Metric label="Declared winners" value={v.coverage.declaredWinners} hint="contests with a winner row" />
            <Metric
              label="Candidate records"
              value={v.coverage.candidacies}
              hint={
                v.coverage.candidaciesWithoutResult - v.coverage.unopposed > 0
                  ? `${v.coverage.candidaciesWithoutResult - v.coverage.unopposed} of them carry no result row — see below`
                  : 'candidacies loaded'
              }
            />
            <Metric label="Turnout rows" value={v.coverage.turnoutRows} of={v.coverage.contests} hint="per constituency" />
          </dl>

          <p className="iei-note">
            <b>Expected</b> comes from reference data — {v.coverage.expectedBasis}.{' '}
            {v.coverage.referenceSeats === null ? null : (
              <>
                This house elects {v.coverage.referenceSeats} members today.{' '}
              </>
            )}
            {v.coverage.epochs.length === 1 ? (
              <>Its seats were drawn under one delimitation ({v.coverage.epochs[0]?.id}).</>
            ) : (
              <>
                Its seats span {v.coverage.epochs.length} delimitations —{' '}
                {v.coverage.epochs.map((e) => `${e.id} (${e.contests})`).join(', ')} — which is not a defect:
                Assam and Jammu &amp; Kashmir were re-delimited after 2008.
              </>
            )}
          </p>

          {v.coverage.gaps.length === 0 ? (
            <p className="iei-note">
              <b>Nothing is missing.</b> Every constituency this house elects is loaded, and every contest
              carries a vote count or a stated reason it does not.
            </p>
          ) : (
            <ul className="iei-gaps">
              {v.coverage.gaps.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          )}

          {v.coverage.anomalies.length === 0 ? null : (
            // Present-and-wrong, kept apart from missing. These do not change the verdict above: an
            // orphaned row is not a gap, and calling the election Partial for one would tell a reader
            // something is absent when nothing is.
            <ul className="iei-gaps iei-anom">
              {v.coverage.anomalies.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}

          <p className="iei-note">
            Change the election in the picker at the top of the page — the choice is carried in{' '}
            <code>?election=</code>, so this view can be sent to someone. The full account of what the
            platform holds and does not is at <Link href="/coverage">/coverage</Link>.
          </p>
        </Panel>
      )}

      <footer className="iei-foot">
        <p>
          India Election Intelligence is a registry of Indian elections in which every figure carries its
          source, its derivation and its uncertainty. Sources, methods and the gaps are at{' '}
          <Link href="/coverage">/coverage</Link>.
        </p>
      </footer>
    </Shell>
  );
}
