import Link from 'next/link';
import { fillFor } from '../../../packages/mandate/src/viz/party-ink.ts';
import { inr } from '../../../packages/mandate/src/repo/brief.ts';
import { PAGE_SIZE } from '../../../packages/mandate/src/repo/candidates-index.ts';
import type { CandidateRow, CandidatesView, Facet, LadderCell } from '../../../packages/mandate/src/repo/candidates-index.ts';
import { PartyChip, PersonLink } from './marks.tsx';
import { Table, Tabs } from './parts.tsx';

/**
 * `/candidates`: who stood in one election, as a list you can narrow. Not a ranking: the only orders are name and seat, the only figure per person
 * is a declared winner's own margin, and a facet is a count with a link, never a score.
 *
 * Everything is a link and a GET form, so the back button restores the selection and nothing needs client script. A facet value with no candidate in
 * it is not drawn, a selected value is marked and pressing it removes it, and a filter that finds nobody says which filters it was and how to clear
 * them. Before 2026 the registry holds each seat's top five only, so a dotted square in the ladder is "no contest on record" and never "did not stand".
 */

const IN = new Intl.NumberFormat('en-IN');

export function CandidatesHead({ view }: { view: CandidatesView }) {
  const e = view.election;
  const winnersOnly = e.winners === e.candidates;
  return (
    <div className="iei-head">
      <p className="iei-eyebrow">Candidates</p>
      <h1 className="iei-answer">Who is on record, election by election</h1>
      <p className="iei-story-lead">
        <b>{IN.format(e.candidates)}</b> {winnersOnly ? 'declared winners are on record' : e.counted ? 'candidates are on record' : 'candidates stood'} for <b>{IN.format(e.seats)}</b>{' '}
        seats in the {e.label} election.
        {winnersOnly ? null : (
          <>
            {' '}
            <b>{IN.format(e.before)}</b> had stood before on record.
          </>
        )}
      </p>
      <p className="iei-sub">
        Matched by name, seat and party: a candidate who changed party or seat appears as separate records. Nothing here is ranked.
        {e.counted ? ' Before 2026 the registry holds each seat’s top five only.' : ''}
      </p>
    </div>
  );
}

function Bars({ title, note, items, max, open = 7 }: { title: string; note?: string; items: readonly Facet[]; max: number; open?: number }) {
  if (items.length === 0) return null;
  const row = (f: Facet) => (
    <li key={f.key}>
      <Link href={f.href} className="iei-pp-fr" aria-current={f.on ? 'true' : undefined} title={f.on ? `Stop filtering on ${f.label}` : `Only ${f.label}`}>
        <span className="iei-pp-fl">
          {f.ink === null ? null : <span className="iei-sw" style={{ background: fillFor(f.ink) }} aria-hidden="true" />}
          <span className={f.ink === null ? undefined : 'iei-chip'}>{f.label}</span>
        </span>
        <span className="iei-pp-fb" aria-hidden="true">
          <i style={{ width: `${(100 * f.n) / max}%`, background: f.ink === null ? undefined : fillFor(f.ink) }} />
        </span>
        <span className="iei-pp-fn">
          {IN.format(f.n)}
          {f.won === 0 ? null : <em> {f.won} won</em>}
        </span>
      </Link>
    </li>
  );
  const head = items.slice(0, open);
  const rest = items.slice(open);
  return (
    <section className="iei-pp-facet" aria-label={title}>
      <h2 className="iei-eyebrow">{title}</h2>
      {note === undefined ? null : <p className="iei-note">{note}</p>}
      <ul>{head.map(row)}</ul>
      {rest.length === 0 ? null : (
        <details className="iei-twin">
          <summary>and {rest.length} more</summary>
          <ul>{rest.map(row)}</ul>
        </details>
      )}
    </section>
  );
}

export function Facets({ view }: { view: CandidatesView }) {
  const maxOf = (f: readonly Facet[]): number => Math.max(1, ...f.map((x) => x.n));
  return (
    <aside className="iei-pp-facets" aria-label="Narrow the list">
      <Bars
        title="Party in this election"
        note="Independents are one line here, not one party."
        items={view.parties}
        max={maxOf(view.parties)}
      />
      <Bars title="District" items={view.districts} max={maxOf(view.districts)} open={8} />
      <Bars
        title="Repeat contestants"
        note="People with two or more contests on record. Among contests on record; before 2026 that is each seat’s top five."
        items={view.shapes}
        max={maxOf(view.shapes)}
        open={5}
      />
    </aside>
  );
}

function Ladder({ cells }: { cells: readonly LadderCell[] }) {
  return (
    <span className="iei-pp-lad">
      {cells.map((c) => (
        <span
          key={c.id}
          className={`iei-pp-sq iei-pp-sq-${c.state}`}
          style={c.party === null ? undefined : c.state === 'won' ? { background: fillFor(c.party.key), borderColor: fillFor(c.party.key) } : { borderColor: fillFor(c.party.key) }}
          title={c.title}
        >
          <span className="iei-sr">{c.title}</span>
        </span>
      ))}
    </span>
  );
}

function Row({ r }: { r: CandidateRow }) {
  return (
    <tr>
      <th scope="row" className="iei-pp-name">
        <PersonLink id={r.personId} name={r.name} />
        {r.declaredWinner || r.namedAsElected ? (
          <span className="iei-seat-tag">
            {r.declaredWinner ? 'declared winner' : 'named as elected'}
            {r.declaredMargin === null ? '' : `, margin ${IN.format(r.declaredMargin.votes)}${r.declaredMargin.basis === 'declared' ? ' declared' : ''}`}
          </span>
        ) : null}
      </th>
      <td>
        <Link href={r.seatHref}>{r.seatName}</Link>
        {r.district === null ? null : <span className="iei-pp-dist">{r.district.name}</span>}
      </td>
      <td>{r.party === null ? <span className="iei-absent">not recorded</span> : <PartyChip partyId={r.party.key} code={r.party.label} />}</td>
      <td>
        <Ladder cells={r.ladder} />
      </td>
    </tr>
  );
}

export function CandidateList({ view }: { view: CandidatesView }) {
  const { query: q, total, pages, rows } = view;
  const from = total === 0 ? 0 : (q.page - 1) * PAGE_SIZE + 1;
  const to = Math.min(total, q.page * PAGE_SIZE);
  const pageHref = (n: number): string => view.href({ page: String(n) });
  return (
    <div className="iei-pp-list">
      {view.chips.length === 0 ? null : (
        <p className="iei-pp-chips">
          {view.chips.map((c) => (
            <Link key={c.label} href={c.href} className="iei-tab" title="Remove this filter">
              {c.label} ×
            </Link>
          ))}
          <Link href={view.href({ party: null, district: null, career: null, repeat: null, q: null })} className="iei-tab">
            Clear all
          </Link>
        </p>
      )}
      {total === 0 ? (
        <div className="iei-empty">
          <p>
            No candidate matches {view.chips.length === 0 ? 'this' : view.chips.map((c) => c.label).join(' and ')} in the {view.election.label} election.
            {q.repeat ? ' Repeat contestants are people with more than one contest on record.' : ''}
          </p>
          <p>
            <Link href={view.href({ party: null, district: null, career: null, repeat: null, q: null })}>Clear all</Link> · <Link href="/coverage">What the registry holds</Link>
          </p>
        </div>
      ) : (
        <>
          <p className="iei-note">
            {view.election.winners === view.election.candidates
              ? `Only each seat’s winner is on record, so this list is the ${inr(view.election.winners)} declared winners.`
              : 'Only a declared winner has a result on record, so only winners carry a result line. A dotted square is a contest not on record, not a zero.'}
          </p>
          <Table
            label={`Candidates in the ${view.election.label} election`}
            tight
            className="iei-pp-table"
            head={
              <>
                <th scope="col">Name</th>
                <th scope="col">Seat</th>
                <th scope="col">Party</th>
                <th scope="col">
                  Elections <span className="iei-of">{view.columns.map((c) => c.label.replace('Assembly ', '').replace('Lok Sabha ', 'LS ')).join(' · ')}</span>
                </th>
              </>
            }
          >
            {rows.map((r) => (
              <Row key={r.personId} r={r} />
            ))}
          </Table>
          <nav className="iei-pp-pager" aria-label="Pages">
            <span>
              Showing {IN.format(from)} to {IN.format(to)} of {IN.format(total)}
            </span>
            {q.page > 1 ? <Link href={pageHref(q.page - 1)}>Previous {PAGE_SIZE}</Link> : null}
            {q.page < pages ? <Link href={pageHref(q.page + 1)}>Next {PAGE_SIZE}</Link> : null}
            <span className="iei-pp-sort">
              Order:{' '}
              {q.sort === 'name' ? <b>name</b> : <Link href={view.href({ sort: 'name' })}>name</Link>} ·{' '}
              {q.sort === 'seat' ? <b>seat</b> : <Link href={view.href({ sort: 'seat' })}>seat</Link>}
            </span>
          </nav>
        </>
      )}
    </div>
  );
}

export function Find({ view }: { view: CandidatesView }) {
  const q = view.query;
  return (
    <form action="/candidates" method="get" className="iei-pp-find" role="search">
      <input type="hidden" name="election" value={q.election} />
      {q.party === null ? null : <input type="hidden" name="party" value={q.party} />}
      {q.district === null ? null : <input type="hidden" name="district" value={q.district} />}
      {q.career === null ? null : <input type="hidden" name="career" value={q.career} />}
      {!q.repeat ? null : <input type="hidden" name="repeat" value="1" />}
      {q.sort === 'name' ? null : <input type="hidden" name="sort" value={q.sort} />}
      <label>
        <span className="iei-sr">Find a name in this election</span>
        <input type="search" name="q" defaultValue={q.q} placeholder="Find a name in this election" maxLength={60} />
      </label>
      <button type="submit">Find</button>
      <Link href={q.repeat ? view.href({ repeat: null }) : view.href({ repeat: '1' })} className="iei-tab" aria-current={q.repeat ? 'true' : undefined}>
        Repeat contestants only
      </Link>
    </form>
  );
}

export function ElectionTabs({ view }: { view: CandidatesView }) {
  return <Tabs label="Election" current={view.election.id} choices={view.elections.map((e) => ({ key: e.id, label: e.label, href: e.href }))} />;
}
