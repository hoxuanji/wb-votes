import Link from 'next/link';
import { openRead } from '../../../../packages/mandate/src/db/open.ts';
import {
  AUTO_MERGE_AT,
  QUEUE_AT,
  nextForReview,
  recallEstimate,
} from '../../../../packages/mandate/src/repo/review.ts';
import type { Candidate, Pair } from '../../../../packages/mandate/src/repo/review.ts';
import '../../p/mandate.css';
import '../../situation.css';
import './review.css';

/**
 * `/review/merges` — the tool that turns "6,167 people" into a measurement.
 *
 * The registry auto-merged 1,160 pairs and left 8,683 in a queue nobody could see. Cycle 1's audit
 * measured PRECISION on the merges it made and found no errors; nothing has ever measured RECALL on
 * the merges it did not make. So the person count has been published as a fact and is an upper bound.
 *
 * One pair at a time, three buttons, a plain form POST. No client JS: the whole surface is a server
 * render and a 303, which also means the back button works and a reload cannot double-record.
 *
 * Deciding here does NOT merge. It records a judgement. Mutating person rows needs the undo tape and
 * the claim moves, and that lives in `mandate resolve --apply-reviewed`.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Merge review' };

const IN = new Intl.NumberFormat('en-IN');
const pct1 = (n: number) => `${n.toFixed(1)}%`;

function Side({ c, other }: { c: Candidate; other: Candidate }) {
  // Highlight what differs, because sameness is judged on the differences.
  const yearsOverlap = c.contests.some((x) => other.contests.some((y) => y.year === x.year));
  return (
    <div className="rv-side">
      <p className="rv-name">{c.canonicalName}</p>
      <Link className="rv-id" href={`/p/${c.id}`}>
        {c.id}
      </Link>
      <dl className="rv-facts">
        <dt>Born</dt>
        <dd>
          {c.birthYear === null ? (
            <span className="sr-na">not reported</span>
          ) : (
            `${c.birthYear}${c.birthYearConfidence === null ? '' : ` (${c.birthYearConfidence})`}`
          )}
        </dd>
        <dt>Sex</dt>
        <dd>{c.sex ?? <span className="sr-na">not reported</span>}</dd>
        <dt>Names on file</dt>
        <dd>{c.aliases.length === 0 ? <span className="sr-na">none</span> : c.aliases.join(' · ')}</dd>
      </dl>
      <table className="sr-table rv-contests">
        <thead>
          <tr>
            <th>Year</th>
            <th>Seat</th>
            <th className="n">Party</th>
            <th className="n">Age</th>
            <th className="n">Result</th>
          </tr>
        </thead>
        <tbody>
          {c.contests.length === 0 ? (
            <tr>
              <td colSpan={5} className="sr-na">
                no recorded contest
              </td>
            </tr>
          ) : (
            c.contests.map((x, i) => (
              <tr key={`${x.year}-${x.place}-${i}`}>
                <td>{x.year}</td>
                <td>{x.place}</td>
                <td className="n">{x.party ?? <span className="sr-na">—</span>}</td>
                <td className="n">{x.ageDeclared ?? <span className="sr-na">—</span>}</td>
                <td className="n">{x.isWinner ? 'won' : x.status}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {yearsOverlap && (
        <p className="rv-warn">
          Contested in the same year as the other record. One person cannot hold two candidacies in one
          election unless the seats differ — check the seats before merging.
        </p>
      )}
    </div>
  );
}

function Evidence({ p }: { p: Pair }) {
  const e = p.evidence;
  if (e === null || typeof e !== 'object') {
    return <p className="sr-rule">evidence: {String(e)}</p>;
  }
  const rows = Object.entries(e as Record<string, unknown>);
  return (
    <details className="rv-ev">
      <summary>Why the resolver scored this {p.score.toFixed(3)}</summary>
      <table className="sr-table">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td>{k}</td>
              <td className="n">{v === null ? 'null' : String(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="sr-rule">
        Blocked by <strong>{p.blockedBy}</strong>. Scored below the {AUTO_MERGE_AT} auto-merge line and
        at or above the {QUEUE_AT} queue floor, which is why a human is looking at it.
      </p>
    </details>
  );
}

export default function MergeReview({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const one = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v;
  const saved = one(searchParams?.['saved']);
  const already = one(searchParams?.['already']);
  const error = one(searchParams?.['error']);
  let pair: Pair | null = null;
  let est: ReturnType<typeof recallEstimate> | null = null;
  let unavailable = false;
  try {
    const db = openRead();
    pair = nextForReview(db);
    est = recallEstimate(db);
  } catch {
    unavailable = true;
  }

  return (
    <main className="mandate">
      <div className="sr">
        <nav className="sr-nav">
          <span className="sr-mark">
            <Link href="/" style={{ color: 'inherit', textDecoration: 'none' }}>
              MANDATE
            </Link>
          </span>
          <Link href="/pl/wb">Places</Link>
          <Link href="/search">People</Link>
          <Link href="/review/merges">Review</Link>
          <Link href="/mandate">Build</Link>
        </nav>

        <p className="sr-eyebrow">Merge review · recall measurement</p>
        <h1 className="sr-answer">Are these two records the same person?</h1>

        {unavailable && (
          <p className="sr-corpus">
            The registry cannot be read right now. Build it with{' '}
            <code>npm run registry:migrate &amp;&amp; npm run registry:ingest</code>.
          </p>
        )}

        {est !== null && (
          <>
            <p className="sr-sub">
              The resolver merged <strong>{IN.format(est.autoMerges)}</strong> pairs on its own and left{' '}
              <strong>{IN.format(est.bands.reduce((n, b) => n + b.size, 0))}</strong> for a human. Of
              those, <strong>{IN.format(est.reviewed)}</strong> have been decided and{' '}
              <strong>{IN.format(est.confirmedMisses)}</strong> were the same person — merges the
              resolver missed.
            </p>

            <table className="sr-table rv-bands">
              <thead>
                <tr>
                  <th>Score band</th>
                  <th className="n">Pairs</th>
                  <th className="n">Reviewed</th>
                  <th className="n">Same</th>
                  <th className="n">Duplicate rate</th>
                  <th className="n sr-drop">Implies missed</th>
                </tr>
              </thead>
              <tbody>
                {est.bands.map((b) => (
                  <tr key={b.label}>
                    <td>{b.label}</td>
                    <td className="n">{IN.format(b.size)}</td>
                    <td className="n">
                      {b.reviewed} of {b.target}
                    </td>
                    <td className="n">{b.sameCount}</td>
                    <td className="n">
                      {b.ratePct === null ? <span className="sr-na">unsampled</span> : pct1(b.ratePct)}
                    </td>
                    <td className="n sr-drop">
                      {b.weighted === null ? (
                        <span className="sr-na">—</span>
                      ) : (
                        `~${IN.format(Math.round(b.weighted))}`
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="sr-corpus rv-est">
              {est.recallPct === null ? (
                <>
                  <strong>No recall figure yet.</strong> {est.unsampled.length} of{' '}
                  {est.bands.length} bands have no reviewed pair ({est.unsampled.join(', ')}), and a
                  total that treated an unreviewed band as zero would be biased low by exactly the
                  bands nobody has looked at. The sample is stratified with a target of{' '}
                  {est.bands[0]?.target ?? 0} per band because 7,114 of the pairs sit in the lowest
                  band — a uniform sample would spend itself there and estimate the top band from a
                  handful of rows.
                </>
              ) : (
                <>
                  Recall within candidate pairs:{' '}
                  <strong>
                    {pct1(est.recallPct)} ({pct1(est.recallLowPct ?? 0)}–{pct1(est.recallHighPct ?? 0)})
                  </strong>
                  . That is {IN.format(est.autoMerges)} merges made against an estimated{' '}
                  {IN.format(Math.round(est.estimatedMisses ?? 0))} missed, band-weighted, with Wilson
                  intervals. <strong>It is an upper bound on true recall:</strong> two duplicates that
                  never shared a blocking key were never compared, so they cannot appear anywhere in
                  this measurement.
                </>
              )}
            </p>
          </>
        )}

        {/* The POST redirects with one of three outcomes. All three are shown: a decision that
            silently failed to record is the one failure mode that would corrupt the measurement
            while looking like progress. */}
        {saved !== undefined && (
          <p className="rv-saved">
            Recorded as <strong>{saved}</strong>. Nothing was merged — deciding here writes a
            judgement, and applying it is a separate step.
          </p>
        )}
        {already !== undefined && (
          <p className="rv-saved rv-stale">
            That pair was already decided, so nothing changed. Two tabs, or a resubmitted form — the
            earlier judgement stands rather than being overwritten by this one.
          </p>
        )}
        {error !== undefined && (
          <p className="rv-saved rv-stale">
            {error === 'malformed'
              ? 'That submission was missing a pair or a decision, so nothing was recorded.'
              : 'The registry could not be written to, so nothing was recorded.'}
          </p>
        )}

        {pair === null && !unavailable ? (
          <p className="sr-corpus">
            Nothing pending. Every candidate pair has been decided, which means the estimate above is
            a census rather than a sample.
          </p>
        ) : pair === null ? null : (
          <>
            <section className="sr-sec rv-pair">
              <Side c={pair.a} other={pair.b} />
              <Side c={pair.b} other={pair.a} />
            </section>

            <Evidence p={pair} />

            <form className="rv-actions" method="post" action="/review/merges/decide">
              <input type="hidden" name="a" value={pair.aId} />
              <input type="hidden" name="b" value={pair.bId} />
              <button type="submit" name="decision" value="merged" className="rv-same">
                Same person
              </button>
              <button type="submit" name="decision" value="rejected" className="rv-diff">
                Different people
              </button>
              <button type="submit" name="decision" value="deferred" className="rv-skip">
                Cannot tell from this
              </button>
            </form>
            <p className="sr-rule">
              &ldquo;Cannot tell&rdquo; is a real answer and is recorded as one — the pair leaves the
              queue and is excluded from the rate, because a forced guess would corrupt the very number
              this page exists to produce.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
