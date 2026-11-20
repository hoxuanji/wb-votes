import Link from 'next/link';
import { getCoverage, INDIA } from '../../../packages/mandate/src/repo/coverage.ts';
import type { Coverage, VerticalState } from '../../../packages/mandate/src/repo/coverage.ts';
import { ledgerGroups } from '../../../packages/mandate/src/repo/coverage-ledger.ts';
import type { LedgerGroup } from '../../../packages/mandate/src/repo/coverage-ledger.ts';
import { electionCoverageView } from '../../../packages/mandate/src/repo/home.ts';
import type { ElectionChoice, ElectionCoverage } from '../../../packages/mandate/src/repo/home.ts';
import { coverageHref } from '../../../packages/mandate/src/repo/routes.ts';
import { readAsk } from '../../../packages/mandate/src/repo/map-selection.ts';
import { readRegistry } from '../../../packages/mandate/src/repo/session.ts';
import { Shell } from '../../components/iei/Shell.tsx';
import {
  CoverageChip,
  Metric,
  Metrics,
  Panel,
  RegistryMissing,
  Table,
  Tabs,
  Value,
} from '../../components/iei/parts.tsx';
import '../iei.css';

/**
 * `/coverage` — what this platform holds, and what it does not.
 *
 * This page exists because the product had no way to say what it was. Eighteen verticals are specified in
 * docs/platform/00-model.md; the headline counts how many have data. That gap is not something to bury on a
 * methodology page.
 *
 * Every number here is computed at request time. No status is written down: a vertical is "present" because
 * a probe found rows, "empty" because a table exists and holds none, and "no model" because nothing in the
 * schema can hold it. A hand-maintained status would be wrong within a cycle and this is the page most
 * likely to be quoted back at us.
 *
 * IT ALSO OWNS PER-ELECTION COVERAGE NOW. That panel used to be the last section of the front page, driven
 * by an election `<select>` in the chrome that existed for nothing else — so a reader who wanted to know how
 * much of Karnataka 2023 was loaded had to find a dropdown at the top of the country's landing page and then
 * scroll past six sections to read the answer. It is here, on the page whose whole subject is the question,
 * with the same deep link: `/coverage?election=ls-2024`.
 *
 * It is deliberately not a roadmap. Each row says what exists and which source would have to be fetched — a
 * disclosure of scope, not a promise about a release.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Coverage',
  description:
    'What this election intelligence platform holds today, what it does not, and where the missing data would come from.',
};

const IN = new Intl.NumberFormat('en-IN');

/** The three states, in this page's own vocabulary and with the product's own mark. */
const STATUS: Record<VerticalState['status'], { word: string; state: 'complete' | 'partial' | 'unavailable' }> = {
  present: { word: 'Has data', state: 'complete' },
  empty: { word: 'Table, no rows', state: 'partial' },
  'no-model': { word: 'Not modelled', state: 'unavailable' },
};

/**
 * How completely one election is represented.
 *
 * Six counts and the gaps, and nothing about the election itself: who won and by how much is the state
 * page's job, and printing it here would be the second copy this phase exists to remove.
 */
function Election({
  c,
  choices,
}: {
  c: ElectionCoverage;
  choices: readonly ElectionChoice[];
}) {
  return (
    <Panel
      id="election"
      title="What each election holds"
      question="How much of this election is loaded?"
      sources={c.sources}
    >
      <Tabs
        label="Election"
        current={c.electionId}
        choices={choices.map((e) => ({
          key: e.id,
          label: e.short,
          href: coverageHref(e.id),
        }))}
      />

      <p className="iei-caveat">
        <b>{c.name}</b> <CoverageChip state={c.completeness} /> — complete means every constituency this house elects is
        loaded and every contest carries a vote count or a stated reason it does not.
      </p>

      <Metrics>
        <Metric
          label="Constituencies"
          value={c.contests}
          of={c.expected}
          absent="none loaded"
          hint={c.expected === null ? c.expectedBasis : 'resolved of expected'}
        />
        <Metric label="Numeric results" value={c.numericResults} hint="contests with a published vote count" />
        <Metric
          label="Unopposed"
          value={c.unopposed}
          hint="elected with no poll — asserted by a cited claim, not a zero"
        />
        <Metric label="Declared winners" value={c.declaredWinners} hint="contests with a winner row" />
        <Metric
          label="Candidate records"
          value={c.candidacies}
          hint={
            c.candidaciesWithoutResult - c.unopposed > 0
              ? `${IN.format(c.candidaciesWithoutResult - c.unopposed)} of them carry no result row`
              : 'candidacies loaded'
          }
        />
        <Metric label="Turnout rows" value={c.turnoutRows} of={c.contests} hint="per constituency" />
      </Metrics>

      <p className="iei-note">
        <b>Expected</b> is {c.expectedBasis}
        {c.referenceSeats === null ? null : <>: {c.referenceSeats} members today</>}.{' '}
        {c.epochs.length === 1 ? (
          <>Its seats were drawn under one delimitation ({c.epochs[0]?.id}).</>
        ) : (
          <>
            Its seats span {c.epochs.length} delimitations — {c.epochs.map((e) => `${e.id} (${e.contests})`).join(', ')}{' '}
            — which is not a defect: Assam and Jammu &amp; Kashmir were re-delimited after 2008.
          </>
        )}
      </p>

      {c.gaps.length === 0 ? (
        <p className="iei-note">
          <b>Nothing is missing.</b> Every constituency this house elects is loaded, and every contest carries
          a vote count or a stated reason it does not.
        </p>
      ) : (
        <ul className="iei-gaps">
          {c.gaps.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      )}

      {c.anomalies.length === 0 ? null : (
        // Present-and-wrong, kept apart from missing. These do not change the verdict above: an orphaned
        // row is not a gap, and calling the election Partial for one would tell a reader something is
        // absent when nothing is.
        <ul className="iei-gaps iei-anom">
          {c.anomalies.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/**
 * The subject areas, grouped by status: what holds data, what is a table with nothing in it, and what has no model.
 *
 * Eighteen rows in the spec's order, each with a status, a row count and a measured reach, was a table in which eleven rows said "Not modelled",
 * "none" and "no <x> model exists yet" in turn. Each group says what is true of every row once (repo/coverage-ledger.ts), a row keeps what only it has,
 * and the subjects with no model are named with the one source each waits for. There is no second, exact copy of all eighteen: the reader who wanted it had two tables saying one thing.
 */
function Ledger({ groups, total }: { groups: readonly LedgerGroup[]; total: number }) {
  return (
    <div className="iei-led">
      {groups.map((g) => {
        const id = `iei-led-${g.status}`;
        return (
          <section className="iei-led-group" key={g.status} aria-labelledby={id}>
            <div className="iei-led-head">
              <h3 id={id}>
                <CoverageChip state={STATUS[g.status].state} word={STATUS[g.status].word} />
                <span className="iei-led-n">
                  {g.entries.length} of {total}
                </span>
              </h3>
              <p className="iei-led-meaning">
                {g.meaning}
                {/* What every subject in the group lacks, said here and not on each of them (repo/coverage-ledger.ts). */}
                {g.shared.sentence === null ? null : <> {g.shared.sentence}</>}
              </p>
            </div>

            {g.status === 'no-model' ? (
              /* Each subject, and the one source it is waiting for. A caveat is kept where it says more than "there is no model yet". */
              <ul className="iei-led-more">
                {g.entries.map((e) => (
                  <li key={e.key}>
                    <b>{e.label}</b>: <span>{e.caveat === null ? '' : `${e.caveat}; `}needs {e.source}.</span>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="iei-led-list">
                {/* The column names, once, where there is room for columns. Each cell names itself for a screen reader and, on a phone, in sight. */}
                <li
                  className={g.entries.some((e) => e.rows !== null) ? 'iei-led-row iei-led-cols iei-led-has' : 'iei-led-row iei-led-cols'}
                  aria-hidden="true"
                >
                  <span>Subject</span>
                  {g.entries.some((e) => e.rows !== null) ? <span>Rows</span> : null}
                  <span>How far it reaches</span>
                  <span>Source it needs</span>
                </li>
                {g.entries.map((e) => (
                  <li className={e.rows === null ? 'iei-led-row' : 'iei-led-row iei-led-has'} key={e.key}>
                    <div className="iei-led-who">
                      <b>{e.label}</b>
                    </div>
                    {e.rows === null ? null : (
                      <p className="iei-led-rows">
                        <b>{IN.format(e.rows.count)}</b>
                        <span className="iei-of"> {e.rows.unit}</span>
                      </p>
                    )}
                    <div className="iei-led-reach">
                      <span className="iei-led-k">How far it reaches</span>
                      {e.reach === null ? (
                        g.shared.reach ? null : <Value value={null} absent="not measured" />
                      ) : (
                        <span className="iei-chip">{e.reach}</span>
                      )}
                      <span className="iei-rule">{e.caveat}</span>
                    </div>
                    <p className="iei-led-src">
                      <span className="iei-led-k">Source it needs</span>
                      {e.source}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Body({
  c,
  election,
  choices,
}: {
  c: Coverage;
  election: ElectionCoverage | null;
  choices: readonly ElectionChoice[];
}) {
  const g = c.geography;
  return (
    <>
      <div className="iei-head">
        <h1 className="iei-answer iei-answer-long">
          {c.present} of {c.total} subject areas hold data. {c.noModel} have no model in the schema at all.
        </h1>
        <p className="iei-note">Coverage, computed at request time</p>
      </div>

      {election === null ? null : <Election c={election} choices={choices} />}

      <Panel
        title="Geography"
        question="How much of India's electoral map is loaded?"
        note={
          <>
            Against the seat totals India has <b>today</b>, from each jurisdiction&rsquo;s most recent election in each house.
          </>
        }
      >
        <Table
          label="Electoral geography loaded against India's own totals"
          caption="Units loaded"
          head={
            <>
              <th scope="col">Unit</th>
              <th scope="col" className="iei-n">
                Loaded
              </th>
              <th scope="col" className="iei-n">
                India
              </th>
              <th scope="col" className="iei-n">
                Share
              </th>
            </>
          }
        >
          <tr>
            <th scope="row">
              States and union territories
              <span className="iei-rule">With a contest on record in either house.</span>
            </th>
            <td className="iei-n">{g.statesLoaded}</td>
            <td className="iei-n">{INDIA.states}</td>
            <td className="iei-n">{g.statePct.toFixed(1)}%</td>
          </tr>
          <tr>
            <th scope="row">Assembly constituencies</th>
            <td className="iei-n">{IN.format(g.assemblySeatsLoaded)}</td>
            <td className="iei-n">{IN.format(INDIA.assemblySeats)}</td>
            <td className="iei-n">{g.assemblyPct.toFixed(1)}%</td>
          </tr>
          <tr>
            <th scope="row">Parliamentary constituencies</th>
            <td className="iei-n">{g.parliamentarySeatsLoaded}</td>
            <td className="iei-n">{INDIA.lokSabhaSeats}</td>
            <td className="iei-n">{g.parliamentaryPct.toFixed(1)}%</td>
          </tr>
          {g.historicalSeatsLoaded === 0 ? null : (
            <tr>
              <th scope="row">
                Constituencies from an earlier delimitation
                <span className="iei-rule">
                  Real seats and not current ones (undivided Bihar numbered 324), counted so no share above can exceed 100%.
                </span>
              </th>
              <td className="iei-n">{IN.format(g.historicalSeatsLoaded)}</td>
              <td className="iei-n">
                <Value value={null} absent="n/a" />
              </td>
              <td className="iei-n">
                <Value value={null} absent="n/a" />
              </td>
            </tr>
          )}
        </Table>
      </Panel>

      <Panel title="What the platform covers" question="Which subject areas hold data, and which are still to be built?">
        <Ledger groups={ledgerGroups(c.verticals)} total={c.total} />
      </Panel>

      <div className="iei-foot">
        <p>
          <Link href="/">India</Link>
        </p>
      </div>
    </>
  );
}

export default function CoveragePage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  // An outage reads as "registry not built"; a defect in a coverage query is thrown rather than shown as one.
  const read = readRegistry((db) => {
    const c = getCoverage(db);
    const view = electionCoverageView(db, readAsk(searchParams).get('election'));
    return { c, election: view.chosen, choices: view.choices };
  });

  return (
    <Shell here="coverage">
      {read.ok ? (
        <Body c={read.value.c} election={read.value.election} choices={read.value.choices} />
      ) : (
        <RegistryMissing />
      )}
    </Shell>
  );
}
