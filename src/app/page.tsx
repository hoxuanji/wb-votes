import Link from 'next/link';
import { openRead } from '../../packages/mandate/src/db/open.ts';
import { getSituation, MARGINAL_PP } from '../../packages/mandate/src/repo/situation.ts';
import { INDIA } from '../../packages/mandate/src/repo/coverage.ts';
import type { Situation, SeatRow } from '../../packages/mandate/src/repo/situation.ts';
import '../app/p/mandate.css';
import './situation.css';

/**
 * `/` — the Situation Room (§6.1).
 *
 * This route used to serve the WB Votes home page, which now lives at /classic. The cut is
 * deliberate: four cycles of new surfaces were built beside the old app under a rule that forbade
 * touching it, so nothing linked to them and the product looked unchanged from the front door.
 *
 * Every figure below is computed from the registry at request time. Nothing on this page is
 * written down as a constant except the two thresholds, which are named where they are used.
 *
 * Absent on purpose: Today's Record, Most Watched, Media Pulse, Institutional Arithmetic and the
 * live phase ladder. Each needs data the registry does not hold — a news feed, attention telemetry,
 * Rajya Sabha composition, a poll-date calendar. An empty frame labelled "coming soon" is the one
 * thing this project has a standing rule against, so they are not here at all.
 */

export const runtime = 'nodejs';
// .data/registry.db is gitignored, so this can never be prerendered at build time.
export const dynamic = 'force-dynamic';

const IN = new Intl.NumberFormat('en-IN');

function pp(v: number | null): string {
  return v === null ? '—' : `${v.toFixed(2)}pp`;
}

/** A signed value says so with a sign, so colour is never the only carrier (§27). */
function Signed({ v, unit }: { v: number | null; unit: string }) {
  if (v === null) return <span className="sr-na">not comparable</span>;
  if (v === 0) return <span className="sr-na">no change</span>;
  return (
    <span className={v > 0 ? 'sr-up' : 'sr-down'}>
      {v > 0 ? '+' : '−'}
      {Math.abs(v).toFixed(unit === 'pp' ? 2 : 0)}
      {unit}
    </span>
  );
}

function SeatTable({
  rows,
  scaleTo,
  axis,
}: {
  rows: readonly SeatRow[];
  scaleTo: number;
  axis: string;
}) {
  return (
    <table className="sr-table">
      <thead>
        <tr>
          <th>Seat</th>
          <th className="sr-drop">District</th>
          <th className="sr-track">Margin</th>
          <th className="n">Share</th>
          <th className="n">Votes</th>
          <th className="n">Won by</th>
          <th className="n sr-drop">Changed hands</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.placeId}>
            <td>
              <Link href={r.href}>{r.name}</Link>
            </td>
            <td className="sr-drop sr-place">{r.district}</td>
            <td className="sr-track">
              <span
                style={{ width: `${Math.min(100, ((r.marginPct ?? 0) / scaleTo) * 100).toFixed(1)}%` }}
              />
            </td>
            <td className="n">{pp(r.marginPct)}</td>
            <td className="n">{r.marginVotes === null ? '—' : IN.format(r.marginVotes)}</td>
            <td className="n">{r.winnerParty ?? 'not reported'}</td>
            <td className="n sr-drop">
              {r.flips} of {r.contests - 1}
            </td>
          </tr>
        ))}
        <tr>
          <td className="sr-drop" />
          <td className="sr-drop" />
          <td className="sr-axis">{axis}</td>
          <td colSpan={4} />
        </tr>
      </tbody>
    </table>
  );
}

function Room({ s }: { s: Situation }) {
  const widest = Math.max(MARGINAL_PP, ...s.marginal.map((r) => r.marginPct ?? 0));
  const flagged = s.flags.slice(0, 6);

  return (
    <>
      <p className="sr-eyebrow">
        Situation room · {s.latestYear} · {IN.format(s.seatsDecided)} seats decided
      </p>
      <h1 className="sr-answer">{s.headline}</h1>
      <p className="sr-sub">
        Ranked from the registry at the moment you loaded this page — {IN.format(s.corpus.claims)}{' '}
        claims, each carrying the source it came from. Nothing here was chosen by an editor.
      </p>
      {/* The frame. Without it this page is a set of margin tables with no stated subject, which is
          exactly how it read: elections are one of eighteen subject areas, four of which hold data,
          and a reader should not have to infer that from an absence. */}
      <p className="sr-frame">
        Elections are one vertical of a political intelligence platform, not its subject. Of eighteen
        subject areas — legislative activity, budgets, constituency funds, schemes, promises, funding,
        court records and the rest — <strong>four hold data today</strong>, and one state of{' '}
        {INDIA.states} is loaded. <Link href="/coverage">See exactly what is and is not here</Link>{' '}
        before trusting anything on this page.
      </p>

      <form className="sr-find" action="/search" method="get" role="search">
        <label htmlFor="q" style={{ position: 'absolute', left: '-9999px' }}>
          Search people
        </label>
        <input
          id="q"
          name="q"
          type="search"
          placeholder="Find a politician — মমতা, Mamata and Momota all resolve"
          autoComplete="off"
        />
        <button type="submit">Search</button>
      </form>
      <p className="sr-hint">
        {IN.format(s.corpus.persons)} people in the registry, searchable in Bengali, Devanagari or
        Latin.
      </p>

      <section className="sr-sec">
        <h2 className="sr-h">Closest seats</h2>
        <p className="sr-note">
          Margin as a share of votes cast, ascending. Votes cast comes from the turnout record
          rather than from summing candidates, because the registry holds only the leading
          contestants for {s.latestYear === 2026 ? 'earlier elections' : 'some elections'} and a
          partial sum would overstate every margin here.
        </p>
        <SeatTable rows={s.marginal} scaleTo={widest} axis={`0 → ${widest.toFixed(1)}pp`} />
      </section>

      <section className="sr-sec">
        <h2 className="sr-h">Seats that keep changing hands</h2>
        <p className="sr-note">
          Party changes between consecutive elections, across every contest the registry holds for
          each seat. A seat with an unrecorded winner on either side of a gap counts neither a
          change nor a hold.
        </p>
        <SeatTable rows={s.volatile} scaleTo={widest} axis={`0 → ${widest.toFixed(1)}pp`} />
      </section>

      <section className="sr-sec">
        <h2 className="sr-h">Where the seats moved</h2>
        <p className="sr-note">
          {s.voteCountsPresent
            ? `Vote share and seats won in ${s.latestYear}, against the previous election.`
            : `Seats won in ${s.latestYear} against the previous election. The source for
               ${s.latestYear} reports a winner, a margin and a turnout for each seat but no
               candidate vote counts, so vote share is not available for this election and is shown
               as not reported rather than as zero.`}
        </p>
        <table className="sr-table">
          <thead>
            <tr>
              <th>Party</th>
              <th className="n">Seats</th>
              <th className="n">Previous</th>
              <th className="n">Change</th>
              <th className="n sr-drop">Contested</th>
              <th className="n sr-drop">Vote share</th>
            </tr>
          </thead>
          <tbody>
            {s.momentum.slice(0, 8).map((p) => (
              <tr key={p.partyId}>
                <td>{p.short}</td>
                <td className="n">{p.seatsWon}</td>
                <td className="n">
                  {p.prevSeatsWon === null ? (
                    <span className="sr-na">did not contest</span>
                  ) : (
                    p.prevSeatsWon
                  )}
                </td>
                <td className="n">
                  <Signed v={p.deltaSeats} unit="" />
                </td>
                <td className="n sr-drop">
                  {p.seatsContested === null ? (
                    <span className="sr-na">not reported</span>
                  ) : (
                    p.seatsContested
                  )}
                </td>
                <td className="n sr-drop">
                  {p.sharePct === null ? (
                    <span className="sr-na">not reported</span>
                  ) : (
                    `${p.sharePct.toFixed(2)}%`
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {flagged.length > 0 && (
        <section className="sr-sec">
          <h2 className="sr-h">Flagged for review</h2>
          <p className="sr-note">
            Computed leads, not findings. Each one names the rule that produced it so you can
            disagree with the rule. {s.flags.length} in total.
          </p>
          <ul className="sr-flags">
            {flagged.map((f) => (
              <li key={`${f.rule}-${f.subject}`}>
                <strong>
                  {f.href === null ? f.subject : <Link href={f.href}>{f.subject}</Link>}
                </strong>{' '}
                — {f.detail}
                <div className="sr-rule">rule: {f.rule}</div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="sr-sec">
        <h2 className="sr-h">What this registry knows, and what it has not checked</h2>
        <p className="sr-corpus">
          <strong>{IN.format(s.corpus.persons)}</strong> people,{' '}
          <strong>{IN.format(s.corpus.claims)}</strong> claims, every one carrying a citation. Of{' '}
          <strong>{IN.format(s.corpus.sources)}</strong> sources, only{' '}
          <strong>{IN.format(s.corpus.fetched)}</strong> have had their bytes retrieved and hashed —
          the rest are recorded as asserted by their publisher, and every figure drawn from them is
          marked provisional wherever it appears.{' '}
          <strong>{IN.format(s.corpus.pendingMerges)}</strong> possible duplicate people are still
          waiting on human review, so the people count is an upper bound —{' '}
          <Link href="/review/merges">review a pair</Link> and it becomes a measurement.{' '}
          <Link href="/mandate">How this was built</Link>.
        </p>
      </section>

      <p className="sr-foot">
        Places: <Link href="/pl/wb">West Bengal by district</Link> — the one state loaded.{' '}
        API:{' '}
        <Link href="/v1/entity/person/mamata-banerjee-4a681f">an entity with its sources</Link>.
        <br />
        Older WB Votes tools, still running: <Link href="/classic">home</Link>,{' '}
        <Link href="/quiz">policy quiz</Link>, <Link href="/compare">compare</Link>,{' '}
        <Link href="/funds">funds</Link>, <Link href="/explore">explore</Link>,{' '}
        <Link href="/methodology">methodology</Link>.
      </p>
    </>
  );
}

/** The registry is gitignored, so a fresh clone lands here. It states the two commands rather than
 *  rendering an empty room. */
function NotBuilt() {
  return (
    <>
      <p className="sr-eyebrow">Situation room</p>
      <h1 className="sr-answer">The registry is not built in this checkout.</h1>
      <p className="sr-sub">
        Every figure on this page is computed from <code>.data/registry.db</code>, which is
        gitignored — the committed seed under <code>data/seed/</code> is the input, not the database.
        Build it, then reload:
      </p>
      <p className="sr-corpus">
        <code>
          npm run registry:migrate &amp;&amp; npm run registry:ingest &amp;&amp; npm run
          registry:resolve
        </code>
      </p>
      <p className="sr-foot">
        Meanwhile: <Link href="/classic">the older WB Votes home</Link>, which reads the seed
        directly and does not need the registry.
      </p>
    </>
  );
}

export default function SituationRoom() {
  let s: Situation | null = null;
  try {
    s = getSituation(openRead());
  } catch {
    // openRead throws on a missing or unmigrated database. That is the expected state of a fresh
    // clone, not an error worth a 500.
    s = null;
  }

  return (
    <main className="mandate">
      <div className="sr">
        <nav className="sr-nav">
          <span className="sr-mark">MANDATE</span>
          <Link href="/pl/wb">Places</Link>
          <Link href="/search">People</Link>
          <Link href="/review/merges">Review</Link>
          <Link href="/coverage">Coverage</Link>
          <Link href="/classic">WB Votes</Link>
        </nav>
        {s === null ? <NotBuilt /> : <Room s={s} />}
      </div>
    </main>
  );
}
