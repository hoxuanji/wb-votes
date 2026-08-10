import Link from 'next/link';
import { openRead } from '../../packages/mandate/src/db/open.ts';
import { getSituation, MARGINAL_PP } from '../../packages/mandate/src/repo/situation.ts';
import type { Situation, SeatRow } from '../../packages/mandate/src/repo/situation.ts';
import { fillFor, getMap, seatTitle } from '../../packages/mandate/src/repo/map.ts';
import type { MapMode, MapView } from '../../packages/mandate/src/repo/map.ts';
import { calendar, changeLog } from '../../packages/mandate/src/repo/room.ts';
import type { CalendarEntry, ChangeEntry } from '../../packages/mandate/src/repo/room.ts';
import { getCoverage, jurisdictions, INDIA } from '../../packages/mandate/src/repo/coverage.ts';
import type { Coverage, JurisdictionState } from '../../packages/mandate/src/repo/coverage.ts';
import { Nav } from './nav.tsx';
import './iei.css';

/**
 * `/` — the National Situation Room (§25).
 *
 * Section order is the brief's: LIVE STATUS, WHAT CHANGED, BATTLEGROUNDS, MAP, SIGNALS, ELECTION
 * CALENDAR. MOST WATCHED is absent because it needs attention telemetry that does not exist, and LATEST
 * ANALYSIS is folded into the research strip rather than padded out with links to this page.
 *
 * What this deliberately is NOT, per §21: a hero, a wall of KPI cards, or a page of methodology. The
 * previous version opened with a 30px sentence and nine explanatory paragraphs — ~350 words of reasoning
 * that belongs in code comments, which is where it now lives. Each method is one link to /coverage.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IN = new Intl.NumberFormat('en-IN');
const MODES: { key: MapMode; label: string }[] = [
  { key: 'party', label: 'Winner' },
  { key: 'margin', label: 'Margin' },
  { key: 'turnout', label: 'Turnout' },
];

/** §16's vocabulary as a component, so the four words are never improvised per surface. */
function Badge({ kind }: { kind: 'CONFIRMED' | 'REPORTED' | 'DEVELOPING' | 'UNVERIFIED' }) {
  return <span className={`iei-badge iei-${kind.toLowerCase()}`}>{kind}</span>;
}

/** The whole result in one row. §21: a chart that needs a caption is not doing its job, so the segments
 *  carry their own labels and there is no legend. Party colour is contextual here, as on the map. */
const SHARE_HUES = ['#a98bf2', '#5ec8c8', '#e0a458'];
function SeatShare({ s }: { s: Situation }) {
  const total = s.momentum.reduce((n, p) => n + p.seatsWon, 0);
  if (total === 0) return null;
  const top = s.momentum.slice(0, 3);
  const rest = s.momentum.slice(3).reduce((n, p) => n + p.seatsWon, 0);
  const seg = (label: string, seats: number, fill: string) => (
    <span key={label} style={{ background: fill, flexBasis: `${(100 * seats) / total}%` }}>
      {(100 * seats) / total > 6 ? `${label} ${seats}` : ''}
    </span>
  );
  return (
    <div className="iei-share" role="img" aria-label={top.map((p) => `${p.short} ${p.seatsWon}`).join(', ')}>
      {top.map((p, i) => seg(p.short, p.seatsWon, SHARE_HUES[i] ?? '#4a4459'))}
      {rest > 0 ? seg('OTH', rest, '#4a4459') : null}
    </div>
  );
}

/** 36 cells, one per jurisdiction. This is the pan-India picture: a ratio said in a sentence is an
 *  assertion, a grid with one cell lit is a fact you can count. */
function National({ rows }: { rows: readonly JurisdictionState[] }) {
  return (
    <ul className="iei-grid">
      {rows.map((j) => (
        <li
          key={j.id}
          className={j.hasData ? 'iei-has' : j.seats === null ? 'iei-none' : undefined}
          title={
            j.seats === null
              ? `${j.name} — no legislative assembly`
              : `${j.name} — ${j.loaded} of ${j.seats} seats loaded`
          }
        >
          <b>{j.id.toUpperCase()}</b>
          {j.seats === null ? 'no assy' : `${j.loaded}/${j.seats}`}
        </li>
      ))}
    </ul>
  );
}

function SeatTable({ rows, widest }: { rows: readonly SeatRow[]; widest: number }) {
  return (
    <table className="iei-t">
      <thead>
        <tr>
          <th>Seat</th>
          <th className="iei-drop">District</th>
          <th className="iei-track">Margin</th>
          <th className="iei-n">pp</th>
          <th className="iei-n">Votes</th>
          <th className="iei-n">Held by</th>
          <th className="iei-n iei-drop">Changed</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.placeId}>
            <td>
              <Link href={r.href}>{r.name}</Link>
            </td>
            <td className="iei-drop">
              <span className="iei-sub">{r.district}</span>
            </td>
            <td className="iei-track">
              <span
                className="iei-bar"
                style={{ width: `${Math.min(100, ((r.marginPct ?? 0) / widest) * 100).toFixed(1)}%` }}
              />
            </td>
            <td className="iei-n">{r.marginPct === null ? '—' : r.marginPct.toFixed(2)}</td>
            <td className="iei-n">{r.marginVotes === null ? '—' : IN.format(r.marginVotes)}</td>
            <td className="iei-n">{r.winnerParty ?? <span className="iei-na">n/r</span>}</td>
            <td className="iei-n iei-drop">
              {r.flips}/{Math.max(0, r.contests - 1)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Room({
  s,
  view,
  cal,
  log,
  cov,
  nat,
}: {
  s: Situation;
  view: MapView | null;
  cal: CalendarEntry[];
  log: ChangeEntry[];
  cov: Coverage | null;
  nat: JurisdictionState[];
}) {
  const widest = Math.max(MARGINAL_PP, ...s.marginal.map((r) => r.marginPct ?? 0));
  const underCut = s.marginal.filter((r) => (r.marginPct ?? 99) < MARGINAL_PP).length;
  const latest = cal[0];

  return (
    <>
      {/* ── §25 LIVE STATUS ─────────────────────────────────────────────────────────────────── */}
      <div className="iei-status">
        <span>
          <span className="iei-dot iei-dot-idle" />
          STATUS <b>NO ACTIVE ELECTION</b>
        </span>
        <span>
          LAST DECLARED{' '}
          <b>{latest === undefined ? 'NONE' : `${latest.kind.toUpperCase()} ${latest.year}`}</b>
        </span>
        <span>
          COVERAGE{' '}
          <b>
            1 OF {INDIA.states} STATES
          </b>
        </span>
        <span>
          SOURCES VERIFIED{' '}
          <b>
            {s.corpus.fetched} OF {IN.format(s.corpus.sources)}
          </b>
        </span>
      </div>

      <SeatShare s={s} />

      <dl className="iei-kpi">
        <div>
          <dt>Seats decided</dt>
          <dd>
            {IN.format(s.seatsDecided)}
            <small>{s.latestYear} assembly · West Bengal</small>
          </dd>
        </div>
        <div>
          <dt>Closest of eight</dt>
          <dd>
            {underCut}
            <small>under {MARGINAL_PP}pp in the shortlist below</small>
          </dd>
        </div>
        <div>
          <dt>People</dt>
          <dd>
            {IN.format(s.corpus.persons)}
            <small>{IN.format(s.corpus.pendingMerges)} possible duplicates unreviewed</small>
          </dd>
        </div>
        <div>
          <dt>Cited claims</dt>
          <dd>
            {IN.format(s.corpus.claims)}
            <small>every figure carries its source</small>
          </dd>
        </div>
      </dl>

      {/* ── §25 WHAT CHANGED ────────────────────────────────────────────────────────────────── */}
      <section className="iei-sec" id="changed">
        <div className="iei-h">
          <h2>What changed</h2>
          <p>
            Registry, not news. <Link href="/coverage">Why</Link>
          </p>
        </div>
        <table className="iei-t">
          <thead>
            <tr>
              <th>When</th>
              <th>Pipeline</th>
              <th className="iei-n">Rows in</th>
              <th className="iei-n">Rows out</th>
              <th className="iei-n">Anomalies</th>
              <th className="iei-n">Status</th>
            </tr>
          </thead>
          <tbody>
            {log.map((e) => (
              <tr key={e.at}>
                <td>
                  <span className="iei-sub">{e.at.replace('T', ' ').slice(0, 16)}Z</span>
                </td>
                <td>{e.pipeline}</td>
                <td className="iei-n">{e.rowsIn === null ? '—' : IN.format(e.rowsIn)}</td>
                <td className="iei-n">{e.rowsOut === null ? '—' : IN.format(e.rowsOut)}</td>
                <td className="iei-n">{e.anomalies === 0 ? '—' : e.anomalies}</td>
                <td className="iei-n">
                  <Badge kind={e.status === 'ok' ? 'CONFIRMED' : 'DEVELOPING'} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ── §14/§25 BATTLEGROUNDS ───────────────────────────────────────────────────────────── */}
      <section className="iei-sec" id="battlegrounds">
        <div className="iei-h">
          <h2>Battlegrounds</h2>
          <p>
            Margin as a share of votes cast. <Link href="/coverage">Method</Link>
          </p>
        </div>
        <div className="iei-two">
          <div>
            <SeatTable rows={s.marginal} widest={widest} />
          </div>
          <div>
            <div className="iei-h">
              <h2>Changed hands most</h2>
              <p>Party changes, four elections</p>
            </div>
            <SeatTable rows={s.volatile.slice(0, 6)} widest={widest} />
          </div>
        </div>
      </section>

      {/* ── §5/§23 the map is in the workspace, not on a page of its own ───────────────────── */}
      <section className="iei-sec" id="map">
        <div className="iei-h">
          <h2>Map · {view === null ? 'unavailable' : view.finding}</h2>
          <div className="iei-modes">
            {MODES.map((m) => (
              <Link
                key={m.key}
                href={`/map?by=${m.key}`}
                className={view?.mode === m.key ? 'iei-mode-on' : undefined}
              >
                {m.label}
              </Link>
            ))}
          </div>
        </div>
        {view === null ? (
          <p className="iei-na">No constituency outlines are stored.</p>
        ) : (
          <div className="iei-two">
            <div className="iei-map">
              <svg viewBox={view.viewBox} role="img" aria-label={view.finding}>
                {view.seats.map((seat) => (
                  <a key={seat.placeId} href={seat.href}>
                    <title>{seatTitle(view, seat)}</title>
                    <path
                      d={seat.path}
                      fill={fillFor(view, seat)}
                      stroke="#08070c"
                      strokeWidth={0.6}
                    />
                  </a>
                ))}
              </svg>
              <ul className="iei-swatches">
                {view.legend.map((l) => (
                  <li key={l.label}>
                    <span style={{ background: l.fill }} aria-hidden="true" />
                    {l.label}
                  </li>
                ))}
              </ul>
            </div>

            {/* ── §15/§18 SIGNALS, beside the map so a lead and its place are read together ── */}
            <div id="signals">
              <div className="iei-h">
                <h2>Signals</h2>
                <p>Computed leads</p>
              </div>
              <ul className="iei-signals">
                {s.flags.slice(0, 7).map((f) => (
                  <li key={`${f.rule}-${f.subject}`}>
                    <span className="iei-when">
                      <Badge kind="REPORTED" />
                    </span>
                    <div>
                      <p className="iei-sig-h">
                        {f.href === null ? f.subject : <Link href={f.href}>{f.subject}</Link>}
                      </p>
                      <p className="iei-sig-d">{f.detail}</p>
                      <p className="iei-rule">rule · {f.rule}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>

      {/* ── pan-India: the denominator, with structure behind it ────────────────────────────── */}
      <section className="iei-sec" id="national">
        <div className="iei-h">
          <h2>India · {nat.filter((j) => j.hasData).length} of {nat.length} jurisdictions loaded</h2>
          <p>
            {IN.format(INDIA.assemblySeats)} assembly seats · {INDIA.lokSabhaSeats} Lok Sabha
          </p>
        </div>
        <National rows={nat} />
      </section>

      {/* ── §26 ELECTION CALENDAR ───────────────────────────────────────────────────────────── */}
      <section className="iei-sec" id="calendar">
        <div className="iei-h">
          <h2>Election calendar</h2>
          <p>Recorded dates only, never estimated</p>
        </div>
        <table className="iei-t">
          <thead>
            <tr>
              <th>Election</th>
              <th>Type</th>
              <th className="iei-drop">Level</th>
              <th className="iei-n">Seats</th>
              <th className="iei-n">Counted</th>
              <th className="iei-n">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {cal.map((e) => (
              <tr key={e.id}>
                <td>{e.name}</td>
                <td>
                  <span className="iei-sub">{e.kind}</span>
                </td>
                <td className="iei-drop">
                  <span className="iei-sub">{e.level}</span>
                </td>
                <td className="iei-n">{e.seats}</td>
                <td className="iei-n">
                  {e.countingOn ?? <span className="iei-na">no date on record</span>}
                </td>
                <td className="iei-n">
                  <Badge kind={e.confidence} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="iei-foot">
        {cov === null
          ? null
          : `${cov.present} of ${cov.total} subject areas hold data · ${cov.noModel} have no model yet · `}
        <Link href="/coverage">Coverage and method</Link> · <Link href="/map">Full map</Link> ·{' '}
        <Link href="/search">Search people</Link> · <Link href="/review/merges">Merge review</Link> ·{' '}
        <Link href="/classic">WB Votes, the previous app</Link>
        <br />
        Elections are one vertical of a political intelligence platform. Most of the others are not built,
        and the coverage page states exactly which.
      </p>
    </>
  );
}

export default function Home() {
  let s: Situation | null = null;
  let view: MapView | null = null;
  let cal: CalendarEntry[] = [];
  let log: ChangeEntry[] = [];
  let cov: Coverage | null = null;
  let nat: JurisdictionState[] = [];
  try {
    const db = openRead();
    s = getSituation(db);
    view = getMap(db, 'party');
    cal = calendar(db);
    log = changeLog(db, 5);
    cov = getCoverage(db);
    nat = jurisdictions(db);
  } catch {
    s = null;
  }

  return (
    <div className="iei">
      <Nav here="home" />
      <main className="iei-body">
        {s === null ? (
          <div className="iei-sec">
            <div className="iei-h">
              <h2>Registry not built</h2>
            </div>
            <p className="iei-na">
              Every figure here is computed from <code>.data/registry.db</code>, which is gitignored.
              Build it with <code>npm run registry:migrate</code>,{' '}
              <code>npm run registry:ingest</code>, <code>npm run registry:resolve</code>.
            </p>
          </div>
        ) : (
          <Room s={s} view={view} cal={cal} log={log} cov={cov} nat={nat} />
        )}
      </main>
    </div>
  );
}
