import Link from 'next/link';
import { openRead } from '../../../packages/mandate/src/db/open.ts';
import { getCoverage, INDIA } from '../../../packages/mandate/src/repo/coverage.ts';
import type { Coverage, VerticalState } from '../../../packages/mandate/src/repo/coverage.ts';
import { electionCoverageView } from '../../../packages/mandate/src/repo/home.ts';
import type { ElectionChoice, ElectionCoverage } from '../../../packages/mandate/src/repo/home.ts';
import { Shell } from '../../components/iei/Shell.tsx';
import {
  CoverageChip,
  DataList,
  DataRow,
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
 * docs/platform/00-model.md; four have data. That gap is not something to bury on a methodology page.
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

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

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
      title="One election at a time"
      question="How much of this election do we actually hold?"
      sources={c.sources}
    >
      <Tabs
        label="Election"
        current={c.electionId}
        choices={choices.map((e) => ({
          key: e.id,
          label: e.short,
          href: `/coverage?election=${e.id}#election`,
        }))}
      />

      <p className="iei-caveat">
        <b>{c.name}</b> <CoverageChip state={c.completeness} /> — <b>complete</b> means every constituency
        this house elects is loaded and every contest carries a vote count or a stated reason it does not.
        <b> Partial</b> names what is missing, below.
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
              ? `${c.candidaciesWithoutResult - c.unopposed} of them carry no result row`
              : 'candidacies loaded'
          }
        />
        <Metric label="Turnout rows" value={c.turnoutRows} of={c.contests} hint="per constituency" />
      </Metrics>

      <p className="iei-note">
        <b>Expected</b> comes from reference data — {c.expectedBasis}.{' '}
        {c.referenceSeats === null ? null : <>This house elects {c.referenceSeats} members today. </>}
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
        <p className="iei-eyebrow">Coverage · computed at request time</p>
        <h1 className="iei-answer">
          {c.present} of {c.total} subject areas hold data. {c.noModel} have no model in the schema at all.
        </h1>
        <p className="iei-sub">
          Elections are one vertical here, not the subject. The other seventeen are specified and mostly
          unbuilt, and the honest thing is to say which is which on the way in. Nothing below is
          hand-maintained: a row says it has data because a query found rows, and its reach is counted.
        </p>
      </div>

      {election === null ? null : <Election c={election} choices={choices} />}

      <Panel
        title="Geography"
        question="How much of India's electoral map is loaded?"
        note={
          <>
            Counted against the seat totals India has <b>today</b>, and from each jurisdiction&rsquo;s most
            recent election in each house — the only denominator that compares like with like. Seats that
            exist only in an earlier delimitation are reported separately rather than dropped, because a
            percentage that can exceed 100 is not a measurement.
          </>
        }
      >
        <Table
          label="Electoral geography loaded against India's own totals"
          caption="Units loaded, against the number India has today"
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
            <th scope="row">States and union territories</th>
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
          <tr>
            <th scope="row">
              Constituencies from an earlier delimitation
              <span className="iei-rule">
                Real seats, and not current ones — undivided Bihar numbered 324, and Andhra Pradesh&rsquo;s
                2009 and 2014 elections precede Telangana. Counted so no ratio above can exceed 100%.
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
        </Table>
      </Panel>

      <Panel
        title="The eighteen subject areas"
        question="What does this platform model, and what does it only intend to?"
        note={
          <>
            {c.present} have data, {c.empty} have a table holding nothing, and {c.noModel} have nothing in the
            schema that could hold them. The source column names what would have to be fetched — which is the
            real constraint, since most of it is not a coding problem.
          </>
        }
      >
        <Table
          label="The eighteen subject areas and what each holds"
          caption="Every subject area in the model, its status, its measured reach and the source it still needs"
          wide
          head={
            <>
              <th scope="col">Subject</th>
              <th scope="col">Status</th>
              <th scope="col" className="iei-n">
                Rows
              </th>
              <th scope="col">
                How far it reaches
              </th>
              <th scope="col">
                Source it needs
              </th>
            </>
          }
        >
          {c.verticals.map((v) => (
            <tr key={v.key}>
              <th scope="row">
                {v.label}
                <span className="iei-rule">{v.question}</span>
              </th>
              <td>
                {/* Status is a word with a shape beside it, never colour alone: the three states have to
                    survive a greyscale print and a forced-colors palette. ONE vocabulary — the chip used to
                    print "Complete" with "Has data" underneath it, which is the same fact said twice in two
                    different languages. */}
                <CoverageChip state={STATUS[v.status].state} word={STATUS[v.status].word} />
              </td>
              <td className="iei-n">
                {v.status === 'present' ? (
                  <>
                    {IN.format(v.count)}
                    <span className="iei-of"> {v.unit}</span>
                  </>
                ) : (
                  <Value value={null} absent="none" />
                )}
              </td>
              <td>
                {/* Reach is MEASURED; scope is the caveat. Keeping them apart is what stops the second from
                    being read as the first — the line that said "one state" was a caveat that had become a
                    false count. */}
                {v.reach === null ? null : <span className="iei-chip">{v.reach}</span>}
                <span className="iei-rule">{v.scope}</span>
              </td>
              <td title={v.source}>
                {v.source}
              </td>
            </tr>
          ))}
        </Table>
      </Panel>

      <Panel
        title="Four things that will stay incomplete on purpose"
        question="Which gaps are not gaps?"
      >
        <DataList label="Deliberate incompleteness">
          <DataRow
            title="Indian legislatures rarely record division votes."
            detail="Most bills pass by voice vote and no member-level record is created. A complete import of voting records is therefore still mostly silence, and that silence is a fact about the institution rather than a gap on our side."
          />
          <DataRow
            title="“Delivery” is a judgement."
            detail="A promise marked kept or broken without a named assessor, a date and cited evidence is an opinion dressed as a fact. The model carries all three, which is why fourteen manifestos sitting in this repo are not published as a promises tracker."
          />
          <DataRow
            title="Charged is not convicted."
            detail="The case table holds zero rows deliberately. Declared pending-case counts are carried as cited claims from affidavits; no proceeding is asserted without a court record."
          />
          <DataRow
            title="Attendance is not performance."
            detail="Sittings attended and questions asked are published because they are countable, not because they measure representation. Each will ship with a model card stating what it does not capture."
          />
        </DataList>
      </Panel>

      <footer className="iei-foot">
        <p>
          Every figure here is computed when the page is requested. The model behind these tables is{' '}
          <code>docs/platform/00-model.md</code>. <Link href="/">India</Link>
        </p>
      </footer>
    </>
  );
}

export default function CoveragePage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  let c: Coverage | null = null;
  let election: ElectionCoverage | null = null;
  let choices: ElectionChoice[] = [];
  let db: ReturnType<typeof openRead> | null = null;
  try {
    db = openRead();
    c = getCoverage(db);
    const view = electionCoverageView(db, first(searchParams?.['election']));
    election = view.chosen;
    choices = view.choices;
  } catch {
    c = null;
  } finally {
    db?.close();
  }

  return (
    <Shell here="coverage">{c === null ? <RegistryMissing /> : <Body c={c} election={election} choices={choices} />}</Shell>
  );
}
