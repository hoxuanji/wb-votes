import Link from 'next/link';
import { openRead } from '../../../packages/mandate/src/db/open.ts';
import { getCoverage, INDIA } from '../../../packages/mandate/src/repo/coverage.ts';
import type { Coverage, VerticalState } from '../../../packages/mandate/src/repo/coverage.ts';
import '../p/mandate.css';
import '../situation.css';
import './coverage.css';

/**
 * `/coverage` — what this platform holds, and what it does not.
 *
 * This page exists because the product had no way to say what it was. Six build cycles produced a
 * registry and a handful of surfaces about one state, and someone opening it could only conclude that
 * the thin thing in front of them was the whole intent. Eighteen verticals are specified in
 * docs/platform/00-model.md; four have data. That gap is not something to bury on a methodology page.
 *
 * Every number here is computed at request time by repo/coverage.ts. No status is written down: a
 * vertical is "present" because a probe found rows, "empty" because a table exists and holds none, and
 * "no model" because nothing in the schema can hold it. A hand-maintained status would be wrong within
 * a cycle and this is the page most likely to be quoted back at us.
 *
 * It is deliberately not a roadmap. Each row says what exists and which source would have to be
 * fetched — a disclosure of scope, not a promise about a release.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Coverage',
  description:
    'What this political intelligence platform holds today, what it does not, and where the missing data would come from.',
};

const IN = new Intl.NumberFormat('en-IN');

const LABEL: Record<VerticalState['status'], string> = {
  present: 'Has data',
  empty: 'Table exists, no rows',
  'no-model': 'Not modelled yet',
};

function Row({ v }: { v: VerticalState }) {
  return (
    <tr className={`cv-${v.status}`}>
      <th scope="row">
        <span className="cv-label">{v.label}</span>
        <span className="cv-q">{v.question}</span>
      </th>
      <td className="cv-status">
        {/* Status is text, never colour alone: the three states have to survive a greyscale print and
            a forced-colors palette. */}
        <span className="cv-dot" aria-hidden="true" />
        {LABEL[v.status]}
      </td>
      <td className="n">
        {v.status === 'present' ? (
          <>
            {IN.format(v.count)} <span className="cv-unit">{v.unit}</span>
          </>
        ) : (
          <span className="sr-na">—</span>
        )}
      </td>
      <td className="cv-scope">{v.scope}</td>
      <td className="cv-source">{v.source}</td>
    </tr>
  );
}

function Body({ c }: { c: Coverage }) {
  const g = c.geography;
  return (
    <>
      <p className="sr-eyebrow">Coverage · computed at request time</p>
      <h1 className="sr-answer">
        {c.present} of {c.total} subject areas hold data. {c.noModel} have no model in the schema at
        all.
      </h1>
      <p className="sr-sub">
        This is a political intelligence platform in which elections are one vertical, not the
        subject. The other seventeen are specified and mostly unbuilt, and the honest thing is to say
        which is which on the way in rather than let a reader infer it from an empty page. Nothing
        below is hand-maintained: a row says &ldquo;has data&rdquo; because a query found rows.
      </p>

      <section className="sr-sec">
        <h2 className="sr-h">Geography</h2>
        <p className="sr-note">
          One state of {INDIA.states}. Every table is national in shape — a nation place, two election
          kinds and five place kinds are loaded — so each additional state is a data load rather than a
          rewrite. That is the only claim being made here.
        </p>
        <table className="sr-table cv-geo">
          <thead>
            <tr>
              <th>Unit</th>
              <th className="n">Loaded</th>
              <th className="n">India</th>
              <th className="n">Share</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>States and union territories</td>
              <td className="n">{g.statesLoaded}</td>
              <td className="n">{INDIA.states}</td>
              <td className="n">{g.statePct.toFixed(1)}%</td>
            </tr>
            <tr>
              <td>Assembly constituencies</td>
              <td className="n">{IN.format(g.assemblySeatsLoaded)}</td>
              <td className="n">{IN.format(INDIA.assemblySeats)}</td>
              <td className="n">{g.assemblyPct.toFixed(1)}%</td>
            </tr>
            <tr>
              <td>Parliamentary constituencies</td>
              <td className="n">{g.parliamentarySeatsLoaded}</td>
              <td className="n">{INDIA.lokSabhaSeats}</td>
              <td className="n">{g.parliamentaryPct.toFixed(1)}%</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="sr-sec">
        <h2 className="sr-h">The eighteen subject areas</h2>
        <p className="sr-note">
          {c.present} have data, {c.empty} have a table holding nothing, and {c.noModel} have nothing
          in the schema that could hold them. The source column names what would have to be fetched —
          which is the real constraint, since most of it is not a coding problem.
        </p>
        <table className="sr-table cv-table">
          <thead>
            <tr>
              <th>Subject</th>
              <th>Status</th>
              <th className="n">Rows</th>
              <th>How far it reaches</th>
              <th>Source it needs</th>
            </tr>
          </thead>
          <tbody>
            {c.verticals.map((v) => (
              <Row key={v.key} v={v} />
            ))}
          </tbody>
        </table>
      </section>

      <section className="sr-sec">
        <h2 className="sr-h">Four things that will stay incomplete on purpose</h2>
        <ul className="cv-notes">
          <li>
            <strong>Indian legislatures rarely record division votes.</strong> Most bills pass by voice
            vote and no member-level record is created. A complete import of voting records is
            therefore still mostly silence, and that silence is a fact about the institution rather
            than a gap on our side.
          </li>
          <li>
            <strong>&ldquo;Delivery&rdquo; is a judgement.</strong> A promise marked kept or broken
            without a named assessor, a date and cited evidence is an opinion dressed as a fact. The
            model carries all three, which is why fourteen manifestos sitting in this repo are not yet
            published as a promises tracker.
          </li>
          <li>
            <strong>Charged is not convicted.</strong> The case table holds zero rows deliberately.
            Declared pending-case counts are carried as cited claims from affidavits; no proceeding is
            asserted without a court record.
          </li>
          <li>
            <strong>Attendance is not performance.</strong> Sittings attended and questions asked are
            published because they are countable, not because they measure representation. Each will
            ship with a model card stating what it does not capture.
          </li>
        </ul>
      </section>

      <p className="sr-foot">
        The model behind this table is <code>docs/platform/00-model.md</code>; the numbers come from{' '}
        <code>repo/coverage.ts</code> and change when the registry does.{' '}
        <Link href="/mandate">How it was built</Link> · <Link href="/">Situation room</Link>
      </p>
    </>
  );
}

export default function CoveragePage() {
  let c: Coverage | null = null;
  try {
    c = getCoverage(openRead());
  } catch {
    c = null;
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
          <Link href="/coverage">Coverage</Link>
          <Link href="/classic">WB Votes</Link>
        </nav>
        {c === null ? (
          <>
            <p className="sr-eyebrow">Coverage</p>
            <h1 className="sr-answer">The registry is not built in this checkout.</h1>
            <p className="sr-sub">
              This page counts rows, so it needs the database. Build it with{' '}
              <code>npm run registry:migrate &amp;&amp; npm run registry:ingest</code>, then reload.
            </p>
          </>
        ) : (
          <Body c={c} />
        )}
      </div>
    </main>
  );
}
