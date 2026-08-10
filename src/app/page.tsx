import Link from 'next/link';
import { openRead } from '../../packages/mandate/src/db/open.ts';
import {
  bypolls,
  closeFights,
  currentStandings,
  due,
  recent,
  swings,
} from '../../packages/mandate/src/repo/elections.ts';
import type { CloseFight, Dated, Standing, Swing } from '../../packages/mandate/src/repo/elections.ts';
import { getCoverage, jurisdictions, INDIA } from '../../packages/mandate/src/repo/coverage.ts';
import type { Coverage, JurisdictionState } from '../../packages/mandate/src/repo/coverage.ts';
import { Nav } from './nav.tsx';
import './iei.css';

/**
 * `/` — the national front door.
 *
 * WHAT THIS IS NOT ANY MORE: West Bengal's results with a national frame drawn around them. One state was
 * the hero because one state was the data; 31 states and 1,188 elections later the front page's job is to
 * be a place to choose from, not a place to read one result.
 *
 * Every section is a SELECT over the registry at request time, and every section is the same component
 * shape applied to a different slice — see repo/elections.ts, where nothing knows whether it is holding a
 * state assembly, a Lok Sabha election or a by-poll. Adding Kerala's history to the registry adds Kerala
 * to this page; there is no list of states in this file, and there must never be one.
 *
 * TWO THINGS DELIBERATELY ABSENT, because the honest version of each needs data we do not hold:
 *  · A choropleth of India. place_geometry holds 313 outlines and all of them are West Bengal, so a
 *    national map would be an empty country with one state in it. The 36-tile grid below is the same
 *    information without the pretence, and the map appears when the boundaries are acquired.
 *  · Exit polls. There is no model, no source and no rows. A section header with nothing behind it is
 *    worse than its absence.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IN = new Intl.NumberFormat('en-IN');

/**
 * Party colour, assigned in fixed order to the parties that govern the most states, with everything else
 * neutral. Five hues rather than the three the rest of the product caps at: every tile here is directly
 * labelled with its party's abbreviation, so colour is reinforcement rather than the only channel, which
 * is the condition that makes more hues safe. The order is by states governed, so a party's colour does
 * not move when one state's row is filtered out of some other view.
 */
const PARTY_HUES = ['#a98bf2', '#5ec8c8', '#e0a458', '#e8927c', '#6fb3e0'];
const NEUTRAL = '#4a4459';

function hueMap(rows: readonly Standing[]): Map<string, string> {
  const byParty = new Map<string, number>();
  for (const r of rows) if (r.leaderKey !== null) byParty.set(r.leaderKey, (byParty.get(r.leaderKey) ?? 0) + 1);
  const ranked = [...byParty.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return new Map(ranked.slice(0, PARTY_HUES.length).map(([k], i) => [k, PARTY_HUES[i] as string]));
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="iei-sec">
      <div className="iei-h">
        <h2>{title}</h2>
        {note === undefined ? null : <p>{note}</p>}
      </div>
      {children}
    </section>
  );
}

/** WHO GOVERNS: one tile per jurisdiction, coloured by the party leading its most recent assembly. */
function Governs({ rows, all }: { rows: readonly Standing[]; all: readonly JurisdictionState[] }) {
  const hues = hueMap(rows);
  const byId = new Map(rows.map((r) => [r.jurisdictionId, r]));
  const legend = [...hues.entries()].map(([key, fill]) => ({
    fill,
    label: rows.find((r) => r.leaderKey === key)?.leaderLabel ?? key,
    n: rows.filter((r) => r.leaderKey === key).length,
  }));
  const other = rows.filter((r) => r.leaderKey !== null && !hues.has(r.leaderKey)).length;
  return (
    <>
      <ul className="iei-tiles">
        {all.map((j) => {
          const s = byId.get(j.id);
          const fill = s?.leaderKey == null ? null : (hues.get(s.leaderKey) ?? NEUTRAL);
          return (
            <li key={j.id} className={s === undefined ? 'iei-tile iei-tile-off' : 'iei-tile'}>
              <span className="iei-tile-id">{j.id.toUpperCase()}</span>
              {s === undefined ? (
                <span className="iei-tile-none">{j.seats === null ? 'no assembly' : 'not loaded'}</span>
              ) : (
                <>
                  <b style={{ color: fill ?? 'inherit' }}>{s.leaderLabel}</b>
                  <span className="iei-tile-n">
                    {s.leaderSeats}/{s.seatsContested} · {s.year}
                  </span>
                  <span className="iei-tile-bar" aria-hidden="true">
                    <i
                      style={{
                        width: `${Math.min(100, (100 * s.leaderSeats) / Math.max(1, s.seatsContested))}%`,
                        background: fill ?? NEUTRAL,
                      }}
                    />
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ul>
      <ul className="iei-swatches">
        {legend.map((l) => (
          <li key={l.label}>
            <span style={{ background: l.fill }} />
            {l.label} {l.n}
          </li>
        ))}
        {other > 0 ? (
          <li>
            <span style={{ background: NEUTRAL }} />
            other {other}
          </li>
        ) : null}
      </ul>
    </>
  );
}

/** One card shape for any dated election — upcoming, held, or a by-poll. */
function ElectionRows({ rows, kind }: { rows: readonly Dated[]; kind: 'due' | 'held' }) {
  if (rows.length === 0) return <p className="iei-na">Nothing to show yet.</p>;
  return (
    <table className="iei-t">
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.id}-${r.year}-${r.jurisdictionId}`}>
            <td className="iei-n">{r.year}</td>
            <td>
              <Link href={`/pl/${r.jurisdictionId}`}>{r.jurisdictionName}</Link>
              <span className="iei-sub">{r.kind === 'bypoll' ? 'by-election' : r.kind}</span>
            </td>
            {kind === 'held' ? (
              <>
                <td>{r.leaderLabel ?? <span className="iei-na">—</span>}</td>
                <td className="iei-n">
                  {r.leaderSeats}/{r.seatsContested}
                </td>
              </>
            ) : (
              <td className="iei-n" colSpan={2}>
                <span className="iei-badge iei-unverified">TERM ENDS</span>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Fights({ rows }: { rows: readonly CloseFight[] }) {
  if (rows.length === 0) return <p className="iei-na">No margins are computable yet.</p>;
  const worst = Math.max(...rows.map((r) => r.marginPct), 0.01);
  return (
    <table className="iei-t">
      <thead>
        <tr>
          <th>Seat</th>
          <th>State</th>
          <th>Won by</th>
          <th className="iei-n">Margin</th>
          <th className="iei-track">&nbsp;</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.placeId}>
            <td>
              <Link href={`/pl/${r.placeId.split('.').join('/')}`}>{r.placeName}</Link>
            </td>
            <td className="iei-n">{r.jurisdictionId.toUpperCase()}</td>
            <td>{r.winner}</td>
            <td className="iei-n">
              {r.marginPct}%
              {r.marginVotes === null ? null : <span className="iei-sub">{IN.format(r.marginVotes)} votes</span>}
            </td>
            <td className="iei-track">
              <span
                className="iei-bar"
                style={{ width: `${Math.max(2, (100 * r.marginPct) / worst)}%`, background: '#e8927c' }}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Vote share now against last time. The sign is the story, so it leads the cell. */
function Swings({ rows }: { rows: readonly Swing[] }) {
  if (rows.length === 0) return <p className="iei-na">No jurisdiction has counts on both sides yet.</p>;
  return (
    <div className="iei-swings">
      {rows.map((s) => (
        <div key={s.nowId} className="iei-swing">
          <h3>
            <Link href={`/pl/${s.jurisdictionId}`}>{s.jurisdictionName}</Link>
            <span className="iei-sub">
              {s.thenYear} → {s.year}
            </span>
          </h3>
          <table className="iei-t">
            <tbody>
              {s.rows.map((r) => (
                <tr key={r.key}>
                  <td>{r.label}</td>
                  <td className="iei-n">{r.nowPct === null ? '—' : `${r.nowPct}%`}</td>
                  <td className={`iei-n ${r.changePp === null ? '' : r.changePp >= 0 ? 'iei-up' : 'iei-down'}`}>
                    {r.changePp === null ? (
                      <span className="iei-na">n/a</span>
                    ) : (
                      `${r.changePp > 0 ? '+' : ''}${r.changePp}`
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const db = openRead();
  let standings: Standing[] = [];
  let held: Dated[] = [];
  let upcoming: Dated[] = [];
  let overdue: Dated[] = [];
  let fights: CloseFight[] = [];
  let shifts: Swing[] = [];
  let polls: Dated[] = [];
  let coverage: Coverage | null = null;
  let states: JurisdictionState[] = [];
  try {
    standings = currentStandings(db);
    held = recent(db, 8);
    const nextUp = due(db, THIS_YEAR);
    upcoming = nextUp.upcoming;
    overdue = nextUp.overdue;
    fights = closeFights(db, 'assembly', 10);
    shifts = swings(db, 'assembly', 6);
    polls = bypolls(db, 6);
    coverage = getCoverage(db);
    states = jurisdictions(db);
  } finally {
    db.close();
  }

  const g = coverage?.geography;
  return (
    <div className="iei">
      <Nav here="home" states={states} />
      <main className="iei-body">
        <div className="iei-status">
          <span>
            <span className="iei-dot iei-dot-idle" />
            {standings.length} of {INDIA.states} jurisdictions have results
          </span>
          <span>
            assembly seats <b>{IN.format(g?.assemblySeatsLoaded ?? 0)}</b> of {IN.format(INDIA.assemblySeats)}
          </span>
          <span>
            Lok Sabha <b>{IN.format(g?.parliamentarySeatsLoaded ?? 0)}</b> of {IN.format(INDIA.lokSabhaSeats)}
          </span>
          <span>
            most recent <b>{held[0] === undefined ? '—' : `${held[0].jurisdictionName} ${held[0].year}`}</b>
          </span>
          <span>
            <Link href="/coverage">what is and is not loaded</Link>
          </span>
        </div>

        <Section
          title="Who governs"
          note={<>Leading party in each jurisdiction&rsquo;s most recent assembly election</>}
        >
          <Governs rows={standings} all={states} />
        </Section>

        <div className="iei-two">
          <Section
            title="Next due"
            note={
              <>
                Five-year term from the last election &mdash; <b>derived, not announced</b>
              </>
            }
          >
            <ElectionRows rows={upcoming} kind="due" />
            {overdue.length === 0 ? null : (
              <p className="iei-rule">
                {overdue.length} more terms ended before {THIS_YEAR} in our data &mdash; the registry stops at
                2022 for most states. <Link href="/coverage">Coverage</Link>
              </p>
            )}
          </Section>
          <Section title="Recent results" note={<>Newest first, any house</>}>
            <ElectionRows rows={held} kind="held" />
          </Section>
        </div>

        <Section
          title="Close fights across states"
          note={<>Margin as a share of votes polled, most recent election of each jurisdiction</>}
        >
          <Fights rows={fights} />
        </Section>

        <Section
          title="Vote share against last time"
          note={<>Percentage points gained or lost, same house, consecutive elections</>}
        >
          <Swings rows={shifts} />
        </Section>

        <Section title="By-elections" note={<>A separate kind of election, and its own signal</>}>
          <ElectionRows rows={polls} kind="held" />
        </Section>

        <footer className="iei-foot">
          <p>
            Every figure on this page is computed from the registry when the page is requested. Sources,
            methods and the gaps are at <Link href="/coverage">/coverage</Link>.
          </p>
        </footer>
      </main>
    </div>
  );
}

/**
 * The year the page reasons about. A constant rather than `new Date()` so a term-expiry list cannot change
 * under a test, and so the one place that needs updating is visible instead of scattered through the SQL.
 */
const THIS_YEAR = 2026;
