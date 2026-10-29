import Link from 'next/link';
import type { CSSProperties } from 'react';
import { fillFor } from '../../../packages/mandate/src/viz/party-ink.ts';
import { marginColumns } from '../../../packages/mandate/src/viz/margin-columns.ts';
import { displayName } from '../../../packages/mandate/src/repo/display-name.ts';
import { inr, rupees } from '../../../packages/mandate/src/repo/brief.ts';
import type { PersonBrief } from '../../../packages/mandate/src/repo/person.ts';
import type { SamePerson } from '../../../packages/mandate/src/repo/person-links.ts';
import { bodyOfPlace, lostCounted, marginCols, won } from '../../../packages/mandate/src/repo/person-story.ts';
import type { RunColumn } from '../../../packages/mandate/src/repo/person-story.ts';
import type { FieldElection } from '../../../packages/mandate/src/repo/seat-field.ts';
import type { SeatHistory } from '../../../packages/mandate/src/repo/seat-history.ts';
import { electionHref } from '../../../packages/mandate/src/repo/routes.ts';
import { MarginFigure, PartyChip, PersonLink } from './marks.tsx';
import { Panel, Table, Value } from './parts.tsx';
import { ResultBars } from './SeatHistory.tsx';

/**
 * The person page below its finding: who and where, the run of the seat's elections with this person marked in each, who they stood against, who
 * else was on the ballot, the exact record, and what they declared.
 *
 * A person here is a short, partial record: one seat, one party, one to four contests, the top five of three counted elections and a bare winner for
 * the fourth, one affidavit. So an absence is blank and said: a year with no candidacy is an empty column and never "did not stand", a declared
 * margin is a dashed bar with the word, and a person with no result row of their own is "not the declared winner", never "lost".
 *
 * Nothing here is ranked or sorted by what a person declared. Declared assets are one number in one panel.
 */

const IN = new Intl.NumberFormat('en-IN');
const at = (i: number): CSSProperties => ({ '--i': i }) as CSSProperties;

const bodyOf = bodyOfPlace;

/* ───────────────────────────── identity ───────────────────────────── */

export function PersonIdentity({ brief }: { brief: PersonBrief }) {
  const c = brief.candidacies[0];
  const s = brief.sitting;
  const facts = [
    c?.ageDeclared == null ? null : `age ${c.ageDeclared}`,
    c?.educationDeclared == null || c.educationDeclared === '' ? null : c.educationDeclared,
  ].filter((x): x is string => x !== null);
  const office = brief.declared.cabinet;
  if (c === undefined && s === null) return null;
  return (
    <p className="iei-pp-id">
      {c === undefined ? (
        s === null ? null : (
          <>
            <span>{s.party ?? 'Party not recorded'}</span>
            <span>
              {s.placeHref === null ? s.placeName : <Link href={s.placeHref}>{s.placeName}</Link>} <span className="iei-seat-tag">press claim</span>
            </span>
          </>
        )
      ) : (
        <>
          {c.partyShortName === null ? null : <PartyChip partyId={c.partyId ?? c.partyShortName} code={c.partyShortName} />}
          <span>
            {c.placeHref === null ? c.placeName : <Link href={c.placeHref}>{c.placeName}</Link>}
            <span className="iei-of">
              {' '}
              ({bodyOf(c.placeKind)}
              {c.placeNumber === null ? '' : ` no. ${c.placeNumber}`})
            </span>
          </span>
          {facts.length === 0 ? null : <span>{facts.join(' and ')}, declared {c.year}</span>}
        </>
      )}
      {office.length === 0 ? null : (
        <span>
          Cabinet portfolio: {office.join(', ')} <span className="iei-seat-tag">press claim</span>
        </span>
      )}
    </p>
  );
}

/* ───────────────────────────── a doubt, said as one ───────────────────────────── */

const RULE = 'Rule: same seat, similar name, nobody has decided. Nothing is merged and no line joins them.';

function partyYears(s: SamePerson): string {
  const by = new Map<string, number[]>();
  for (const c of s.candidacies) by.set(c.partyLabel ?? 'party not recorded', [...(by.get(c.partyLabel ?? 'party not recorded') ?? []), c.year]);
  return [...by.entries()].map(([p, ys]) => `${p} ${ys.join(', ')}`).join('; ');
}

export function SameNote({ same }: { same: readonly SamePerson[] }) {
  if (same.length === 0) return null;
  return (
    <div className="iei-pp-same">
      <p>
        {same.length} other {same.length === 1 ? 'record may be' : 'records may be'} the same person:{' '}
        {same.map((s, i) => (
          <span key={s.otherId}>
            {i === 0 ? '' : ', '}
            <PersonLink id={s.otherId} name={s.name} /> ({partyYears(s)})
          </span>
        ))}
        .
      </p>
      <p className="iei-rule">{RULE}</p>
    </div>
  );
}

export function SamePersonList({ same }: { same: readonly SamePerson[] }) {
  if (same.length === 0) return null;
  return (
    <Panel id="same" title="Possibly the same person" question="Which other records might be this one?">
      <ul className="iei-pp-samelist">
        {same.map((s) => (
          <li key={s.otherId}>
            <PersonLink id={s.otherId} name={s.name} /> <span className="iei-of">{partyYears(s)}</span>
            <span className="iei-rule">
              Score {s.score.toFixed(2)}: the same seat in common, names alike; whether they are one person has not been decided.
            </span>
          </li>
        ))}
      </ul>
      <p className="iei-note">
        Nobody has decided whether these are one person, so their results are not counted above and no line joins them. A person who changed party is a separate record in the registry.
      </p>
    </Panel>
  );
}

/* ───────────────────────────── the run ───────────────────────────── */

function Glyph({ g, ink }: { g: 'won' | 'rank' | 'notWinner' | 'stood'; ink: string | null }) {
  return <i className={`iei-pp-glyph iei-pp-glyph-${g}`} style={ink === null ? undefined : { background: g === 'won' ? ink : undefined, borderColor: ink }} aria-hidden="true" />;
}

function Bar({ pm, dir }: { pm: { frac: number; dashed: boolean; key: string | null }; dir: 'up' | 'down' }) {
  const ink = pm.key === null ? undefined : fillFor(pm.key);
  return (
    <span
      className={['iei-pp-mb', `iei-pp-mb-${dir}`, pm.dashed ? 'iei-pp-mb-declared' : ''].filter(Boolean).join(' ')}
      style={{ height: `${pm.frac * 100}%`, ...(pm.dashed ? { borderColor: ink } : { background: ink }) }}
    />
  );
}

const WORD = { won: 'Won', rank: 'Rank', notWinner: 'Not the declared winner', stood: 'Stood' } as const;

export function CareerRun({ columns, name }: { columns: readonly RunColumn[]; name: string }) {
  const placed = marginColumns(marginCols(columns), { signed: true });
  const anyMargin = columns.some((c) => c.mine?.margin !== null && c.mine?.margin !== undefined);
  const anyDown = placed.cols.some((c) => c.dir === 'down');
  const marked = columns.filter((c) => c.mine !== null);
  const one = columns.length === 1 ? columns[0] : undefined;

  if (one?.mine) {
    const m = one.mine;
    return (
      <div className="iei-pp-result">
        <p className="iei-seat-k">The result · {one.label}</p>
        <p className="iei-pp-bigline">
          {m.party === null ? null : <PartyChip partyId={m.party.key} code={m.party.label} />}{' '}
          {m.margin === null ? (
            <span className="iei-absent">no margin on record</span>
          ) : (
            <>
              <b>{IN.format(Math.abs(m.margin.votes))}</b> <span>votes {m.margin.votes >= 0 ? 'ahead' : 'behind'}{m.margin.basis === 'declared' ? ', declared' : ''}</span>
            </>
          )}
        </p>
        <p className="iei-note">No vote count, share or finish order is on record for this election, so no bar is drawn.</p>
      </div>
    );
  }

  return (
    <div className="iei-pp-runwrap">
      <ol className="iei-pp-run" style={{ '--n': columns.length } as CSSProperties} aria-label={`${name}'s run at this seat`}>
        {columns.map((c, i) => {
          const m = c.mine;
          const pm = placed.cols[i];
          return (
            <li key={c.contestId} className="iei-pp-col" style={at(i)} title={m === null ? `${c.label}: no candidacy of ${name}'s is on record` : m.sentence}>
              <div className={c.holder === null ? 'iei-pp-hold iei-pp-hold-none' : 'iei-pp-hold'} style={c.holder === null ? undefined : { background: fillFor(c.holder.key) }}>
                {c.changedHands ? <span className="iei-pp-hand" aria-hidden="true" /> : null}
              </div>
              <p className="iei-pp-yr">{c.label}</p>
              <p className="iei-pp-who">
                {c.holder === null ? <span className="iei-absent">no winner declared</span> : c.holder.label}
                {c.holderName === null ? null : <span className="iei-pp-hn">{displayName(c.holderName)}</span>}
                {m !== null && m.namedAsElected ? <span className="iei-pp-hn">named as elected</span> : null}
              </p>
              <p className="iei-pp-mine">
                {m === null ? (
                  <span className="iei-pp-blank" aria-hidden="true" />
                ) : (
                  <>
                    <Glyph g={m.glyph} ink={m.party === null ? null : fillFor(m.party.key)} />
                    <span>{m.glyph === 'rank' ? `${WORD.rank} ${m.rank}` : WORD[m.glyph]}</span>
                  </>
                )}
              </p>
              {m === null ? <p className="iei-sr">No candidacy of {name}&rsquo;s is on record for {c.label}.</p> : null}
            </li>
          );
        })}
      </ol>
      {!anyMargin ? null : (
        <>
          <p className="iei-seat-k iei-pp-mk">Margin · votes ahead of the runner-up, or behind the winner · one scale</p>
          <ol className="iei-pp-margins" style={{ '--n': columns.length } as CSSProperties} aria-hidden="true">
            {columns.map((c, i) => {
              const pm = placed.cols[i];
              const m = c.mine?.margin ?? null;
              return (
                <li key={c.contestId} className="iei-pp-mcell" style={at(i)}>
                  <span className="iei-pp-up">
                    {pm !== undefined && pm.dir === 'up' ? <Bar pm={pm} dir="up" /> : null}
                  </span>
                  {!anyDown ? null : (
                    <span className="iei-pp-down">{pm !== undefined && pm.dir === 'down' ? <Bar pm={pm} dir="down" /> : null}</span>
                  )}
                  {m === null ? null : (
                    <span className="iei-pp-mv">
                      {m.votes >= 0 ? '▲' : '▼'} {IN.format(Math.abs(m.votes))}
                      {m.basis === 'declared' ? <em> declared</em> : null}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
          <ol className="iei-pp-shares" style={{ '--n': columns.length } as CSSProperties}>
            {columns.map((c) => (
              <li key={c.contestId}>
                {c.mine === null ? null : c.mine.share === null ? <span className="iei-absent">share not reported</span> : `${c.mine.share.toFixed(1)}%`}
              </li>
            ))}
          </ol>
        </>
      )}
      {/* The table under the run is its twin: every figure here is in the record in full, and the title of each column holds its whole sentence. */}
      {marked.length === 0 ? null : (
        <p className="iei-note">
          A blank column is an election with no candidacy of {name}&rsquo;s on record, which is not the same as not having stood: before 2026 the record holds each seat&rsquo;s top five. A rule
          between two seat-holders is where the seat changed hands.
        </p>
      )}
    </div>
  );
}

/* ───────────────────────────── against whom ───────────────────────────── */

/** The existing result bars, only for this person's counted contests, with their own segment marked and the others' names as links. */
export function AgainstWhom({ history, brief }: { history: SeatHistory; brief: PersonBrief }) {
  const mine = new Set(brief.candidacies.filter((c) => c.versionId === brief.candidacies[0]?.versionId).map((c) => c.contestId));
  const results = history.results.filter((r) => mine.has(r.contestId) && r.bar !== null);
  if (results.length === 0) return null;
  return (
    <Panel id="against" title="Against whom" question="Each election's votes, split by candidate">
      <ResultBars history={{ ...history, results }} subjectId={brief.person.id} />
    </Panel>
  );
}

/* ───────────────────────────── who else stood ───────────────────────────── */

export function ContestField({ election, subjectId }: { election: FieldElection; subjectId: string }) {
  if (election.evidence === 'counted' || election.candidates.length < 2) return null;
  return (
    <Panel id="field" title={`The ${election.year} field`} question="Who else was on the ballot?">
      <p className="iei-note">
        Everyone below the winner is simply not the declared winner: no vote, rank or share is on record for them.
      </p>
      <ul className="iei-pp-field">
        {election.candidates.map((c) => (
          <li key={c.candidacyId} className={c.personId === subjectId ? 'iei-pp-self' : undefined}>
            <PartyChip partyId={c.party.key} code={c.party.label} />
            <span>
              <PersonLink id={c.personId} name={c.name} current={c.personId === subjectId} />
              {c.isWinner || c.namedAsElected ? (
                <span className="iei-seat-tag">
                  {c.isWinner ? 'declared winner' : 'named as elected'}
                  {c.isWinner && election.declaredMargin !== null ? `, ahead by ${IN.format(Math.abs(election.declaredMargin))} (declared)` : ''}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* ───────────────────────────── the exact record ───────────────────────────── */

export function RecordTable({ brief }: { brief: PersonBrief }) {
  const cs = brief.candidacies;
  if (cs.length === 0) return null;
  return (
    <Panel id="record" title="The record in full" question="Every contest on record, newest first" sources={brief.sources}>
      <Table
        label="Contests on record"
        caption={`${cs.length === 1 ? '1 contest' : `${inr(cs.length)} contests`} on record. Before 2026 the record holds each seat's top five only, so this is every contest on record, not necessarily every contest fought. The seat links to its page.`}
        captionVisible
        tight={cs.length > 12}
        tall={cs.length > 24}
        head={
          <>
            <th scope="col" className="iei-n">
              Year
            </th>
            <th scope="col">Contest</th>
            <th scope="col">Party</th>
            <th scope="col">Result</th>
            <th scope="col" className="iei-n">
              Votes
            </th>
            <th scope="col" className="iei-n">
              Share
            </th>
            <th scope="col" className="iei-n">
              Margin
            </th>
          </>
        }
      >
        {cs.map((c) => (
          <tr key={`${c.contestId}-${c.electionId}`}>
            <th scope="row">
              <Link href={electionHref(c.electionId)}>{c.year}</Link>
            </th>
            <td>
              {bodyOf(c.placeKind)}: {c.placeHref === null ? c.placeName : <Link href={c.placeHref}>{c.placeName}</Link>}
              {c.placeNumber !== null && <span className="iei-of"> no. {c.placeNumber}</span>}
            </td>
            <td>{c.partyShortName === null ? <span className="iei-absent">party not recorded</span> : <PartyChip partyId={c.partyId ?? c.partyShortName} code={c.partyShortName} />}</td>
            <td className={won(c) ? 'iei-up' : undefined}>
              {won(c) ? (
                'Won'
              ) : lostCounted(c) ? (
                <>
                  Lost{c.rank !== null && <span className="iei-rule">rank {c.rank}</span>}
                </>
              ) : c.wonBy !== null ? (
                <>
                  Not the declared winner
                  <span className="iei-rule">
                    seat won by <PersonLink id={c.wonBy.personId} name={c.wonBy.name} />
                  </span>
                </>
              ) : (
                <span className="iei-absent">no result declared</span>
              )}
            </td>
            <td className="iei-n">
              <Value value={c.votes} absent="not reported" />
            </td>
            <td className="iei-n">
              <Value value={c.voteShare} unit="%" decimals={1} absent="not reported" />
            </td>
            <td className="iei-n">
              {c.margin === null ? (
                <Value value={null} absent="not reported" />
              ) : won(c) ? (
                <MarginFigure votes={c.margin} basis={c.votes === null ? 'declared' : 'counted'} />
              ) : (
                <span className="iei-n">{IN.format(Math.abs(c.margin))} behind</span>
              )}
            </td>
          </tr>
        ))}
      </Table>
    </Panel>
  );
}

/* ───────────────────────────── what they declared ───────────────────────────── */

export function DeclaredFacts({ brief }: { brief: PersonBrief }) {
  const c = brief.candidacies[0];
  if (c === undefined) return null;
  const a = brief.affidavitTrail.at(-1);
  if (a === undefined) {
    return (
      <Panel id="declared" title="Declared in an affidavit" question="What did this person declare?">
        <p className="iei-note">No affidavit is on record for this person. The registry holds 2026 filings only.</p>
      </Panel>
    );
  }
  const lead: { k: string; v: string; note: string | null }[] = [
    { k: 'Declared assets', v: a.assetsTotal === null ? 'not reported' : rupees(a.assetsTotal), note: null },
    {
      k: 'Declared liabilities',
      v: a.liabilitiesTotal === null ? 'not reported' : rupees(a.liabilitiesTotal),
      note: a.liabilitiesTotal === 0 ? 'Rs 0 may be nil or not declared' : null,
    },
    { k: 'Cases declared pending', v: a.pendingCasesDeclared === null ? 'not reported' : String(a.pendingCasesDeclared), note: 'a count only: no stage, court or outcome is on record' },
  ];
  const rest: { k: string; v: string | null }[] = [
    { k: 'Age', v: c.ageDeclared === null ? null : String(c.ageDeclared) },
    { k: 'Education', v: c.educationDeclared === '' ? null : c.educationDeclared },
    { k: 'Occupation', v: brief.declared.occupation },
  ];
  return (
    <Panel id="declared" title={`Declared in the ${a.year} affidavit`} question="What did this person declare, and in what words?">
      <dl className="iei-pp-decl">
        {lead.map((x) => (
          <div key={x.k} className="iei-pp-decl-l">
            <dt>{x.k}</dt>
            <dd>
              {x.v === 'not reported' ? <span className="iei-absent">not reported</span> : <b>{x.v}</b>}
              {x.note === null ? null : <span className="iei-of">{x.note}</span>}
            </dd>
          </div>
        ))}
        {rest.map((x) => (
          <div key={x.k} className="iei-pp-decl-s">
            <dt>{x.k}</dt>
            <dd>{x.v === null ? <span className="iei-absent">not reported</span> : x.v}</dd>
          </div>
        ))}
      </dl>
      <p className="iei-note">
        Self-declared, as filed{a.filedOn === null || a.filedOn === '' ? '' : ` on ${a.filedOn}`}. One filing, so no change between filings can be computed. Movable and immovable assets are not shown: they do not
        reconcile with the total in about half of the filings that give them.
      </p>
    </Panel>
  );
}

/* ───────────────────────────── how the record was assembled ───────────────────────────── */

export function AssemblyDetails({ brief }: { brief: PersonBrief }) {
  if (brief.mergeProvenance.length === 0) return null;
  const n = brief.mergeProvenance.length;
  return (
    <details className="iei-twin iei-pp-assembly">
      <summary>How this record was assembled</summary>
      <p className="iei-note">
        Assembled from {n + 1} source rows, matched on name, seat and party; age could not be checked. The rows absorbed:{' '}
        {brief.mergeProvenance.map((m) => `${m.absorbedId} (${m.decidedAt.slice(0, 10)})`).join(', ')}.
      </p>
    </details>
  );
}
