import Link from 'next/link';
import type { Metadata } from 'next';
import { PER_GROUP, outcomeWords, searchAll } from '../../../packages/mandate/src/repo/search.ts';
import type { Hit, PartyHit, Results } from '../../../packages/mandate/src/repo/search.ts';
import { personHref } from '../../../packages/mandate/src/repo/routes.ts';
import { readAsk } from '../../../packages/mandate/src/repo/map-selection.ts';
import { readRegistry } from '../../../packages/mandate/src/repo/session.ts';
import type { PersonRow } from '../../../packages/mandate/src/repo/person.ts';
import { Foot, Shell } from '../../components/iei/Shell.tsx';
import { DataList, DataRow, EmptyState, Panel, RegistryMissing } from '../../components/iei/parts.tsx';
import '../iei.css';

/**
 * `/search?q=` — the one place the command bar lands, and the product's whole navigation surface.
 *
 * IT ANSWERS FOR EVERY KIND OF THING. States, elections, districts, constituencies, people and parties, grouped,
 * from one field. Before this phase there were five ways in and each reached one kind: this field (people only),
 * a `<select>` of states, a `<select>` of elections, a client-side palette on the deleted dashboard, and a
 * SECOND copy of this same field on this same page, twelve pixels below the first. A reader had to decide
 * what kind of thing they were looking for before they could look for it.
 *
 * NO CLIENT JAVASCRIPT. A `<form method="get">` in the shell and a server component here do everything a
 * combobox would: the result is linkable, correct with the back button, and survives a reload. ⌘K focuses
 * the field, which is an enhancement over a control that already works rather than a replacement for one.
 *
 * The transliteration is the point of the people tier. `blockingKeys` inside `searchPersons` folds মমতা,
 * ममता, Mamata and Momota onto shared keys, so a Bengali query finds Latin-only records. Worth stating
 * plainly, and the page does: the registry holds no Indic name strings at all, so this works in one
 * direction only — query-side — and the other groups see the transliterated form.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A result page is a page for whatever anyone typed, an unbounded set of thin pages, so it is titled for the query
 * and left out of search engines; the empty search is the one that is indexed.
 */
export function generateMetadata({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}): Metadata {
  const q = (readAsk(searchParams).get('q') ?? '').trim();
  return q === '' ? { title: 'Search' } : { title: `Search: ${q}`, robots: { index: false, follow: true } };
}

const IN = new Intl.NumberFormat('en-IN');

/** The line under a list that holds only the first PER_GROUP of what matched, and nothing under one that holds all. */
function Cut({ shown, of, atLeast = false }: { shown: number; of: number; atLeast?: boolean }) {
  if (of <= shown) return null;
  return (
    <p className="iei-note">
      Showing the first {shown} of {atLeast ? 'at least ' : ''}
      {IN.format(of)}. Narrow the query to see the rest.
    </p>
  );
}

/** A group of hits, or nothing at all. An empty group is not rendered: a heading over no rows is noise. */
function Group({
  title,
  question,
  hits,
  of,
  note,
}: {
  title: string;
  question: string;
  hits: readonly (Hit | PartyHit)[];
  /** How many matched in all, of which `hits` holds the first PER_GROUP. */
  of: number;
  note?: React.ReactNode;
}) {
  if (hits.length === 0) return null;
  return (
    <Panel title={title} question={question} note={note}>
      <DataList label={title}>
        {hits.map((h) => (
          <DataRow key={h.id} title={h.label} href={h.href ?? undefined} detail={h.detail} />
        ))}
      </DataList>
      <Cut shown={hits.length} of={of} />
    </Panel>
  );
}

/** A person's row, with where they last stood and how it went. */
function Person({ p }: { p: PersonRow }) {
  const where =
    p.latestPlaceName === null
      ? 'no recorded contest'
      : `${p.latestPlaceName}${p.latestYear === null ? '' : ` ${p.latestYear}`}`;
  // A nomination in a seat already declared for someone else is not 'no result declared'; say who has it, as the person page does.
  const outcome =
    !p.isWinner && p.latestStatus === 'contesting' && p.latestWonBy !== null
      ? `seat won by ${p.latestWonBy}`
      : outcomeWords(p);
  return (
    <DataRow
      title={p.canonicalName}
      href={personHref(p.id)}
      detail={`${where} · ${p.latestPartyShortName ?? 'party not recorded'} · ${outcome} · ${p.candidacyCount} contest${p.candidacyCount === 1 ? '' : 's'}`}
    />
  );
}

/** What the page says it found, in one sentence, before any of it. */
function answer(r: Results): string {
  if (r.q === '') return 'Search India — states, elections, districts, constituencies, people and parties.';
  if (r.total > 0) {
    const kinds = [
      r.states.length > 0 ? 'states' : null,
      r.elections.length > 0 ? 'elections' : null,
      r.districts.length > 0 ? 'districts' : null,
      r.constituencies.length > 0 ? 'constituencies' : null,
      r.people.length > 0 ? 'people' : null,
      r.parties.length > 0 ? 'parties' : null,
    ].filter((x): x is string => x !== null);
    const listed =
      r.states.length + r.elections.length + r.districts.length + r.constituencies.length + r.people.length + r.parties.length;
    return (
      `${r.capped ? 'At least ' : ''}${IN.format(r.total)} match${r.total === 1 ? '' : 'es'} for “${r.q}” across ${kinds.join(', ')}` +
      (r.total > listed ? `, listing the first ${PER_GROUP} of each.` : '.')
    );
  }
  if (r.alike.length > 0) {
    const n = r.counts.alike;
    return `Nothing in the registry is named “${r.q}”. ${r.capped ? 'At least ' : ''}${IN.format(n)} name${n === 1 ? '' : 's'} sound${n === 1 ? 's' : ''} like it.`;
  }
  return `Nothing in the registry matches “${r.q}”.`;
}

export default function SearchPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const q = (readAsk(searchParams).get('q') ?? '').trim();

  // An outage reads as "registry not built". A defect in the search is thrown: it used to be caught here and
  // shown as the same page, so a broken query looked like a fresh clone.
  const read = readRegistry((db) => searchAll(db, q));
  if (!read.ok) {
    return (
      <Shell here="search" q={q} reading>
        <RegistryMissing />
      </Shell>
    );
  }
  const r = read.value;

  return (
    <Shell here="search" q={q} reading>
      <div className="iei-head">
        <p className="iei-eyebrow">Search</p>
        <h1 className="iei-answer iei-answer-long">{answer(r)}</h1>
        <p className="iei-sub">
          {r.transliterated === null
            ? 'A name is matched as text first, then on how it sounds, so Bishwas also lists Biswas and Mohammed Salim finds Md. Salim.'
            : `Read as ${r.script === 'beng' ? 'Bengali' : 'Devanagari'} and matched as “${r.transliterated}”.`}
        </p>
      </div>

      {q === '' ? (
        <Panel title="What is searchable" question="Every kind of thing this registry can navigate to">
          <DataList label="Searchable kinds">
            <DataRow
              title="States and union territories"
              detail="All 36, whether or not an election is loaded for them. A state opens its districts and its elections."
            />
            <DataRow
              title="Elections"
              detail="By jurisdiction, body, year or the election's own name: West Bengal 2021 and LS 2024 each find their election. An election opens its seat map and how it went."
            />
            <DataRow
              title="Districts"
              detail="By name. A district opens its assembly seats and who won them."
            />
            <DataRow
              title="Constituencies"
              detail="Assembly and parliamentary seats, under the name each carries now. A seat opens its brief and its analysis."
            />
            <DataRow
              title="People"
              detail="Matched as text, then phonetically, across scripts: মমতা, ममता, Mamata and Momota fold onto the same keys."
            />
            <DataRow
              title="Parties"
              detail="By full name or abbreviation — searching “Trinamool” finds TMC. A party has no page of its own yet, so a hit carries its measured reach and, where the national party landscape lists the party, opens its line there."
            />
          </DataList>
        </Panel>
      ) : null}

      <Group title="States" question="Which jurisdiction?" hits={r.states} of={r.counts.states} />
      <Group title="Elections" question="Which election?" hits={r.elections} of={r.counts.elections} />
      <Group title="Districts" question="Which district?" hits={r.districts} of={r.counts.districts} />
      <Group title="Constituencies" question="Which seat?" hits={r.constituencies} of={r.counts.constituencies} />

      {r.people.length === 0 ? null : (
        <Panel title="People" question="Who?">
          <DataList label="People">
            {r.people.map((p) => (
              <Person key={p.id} p={p} />
            ))}
          </DataList>
          <Cut shown={r.people.length} of={r.counts.people} atLeast={r.capped} />
        </Panel>
      )}

      {r.alike.length === 0 ? null : (
        <Panel
          title={`Sounds like “${r.q}”`}
          question="Names that share a phonetic key with the query"
          note={
            <>
              {r.people.length === 0 ? 'No recorded name contains what you typed; these share a phonetic key with it. ' : null}
              The key is deliberately coarse — it exists to catch Biswas against Bishwas — so a match here is{' '}
              <b>a suggestion to check, not a person found</b>.
            </>
          }
        >
          <DataList label="Phonetic matches">
            {r.alike.map((p) => (
              <Person key={p.id} p={p} />
            ))}
          </DataList>
          <Cut shown={r.alike.length} of={r.counts.alike} atLeast={r.capped} />
        </Panel>
      )}

      <Group
        title="Parties"
        question="Which party?"
        hits={r.parties}
        of={r.counts.parties}
        note="A party has no page of its own in this registry. Each row carries what is counted about it, and one the national party landscape lists opens its line there."
      />

      {q !== '' && r.total === 0 && r.alike.length === 0 ? (
        <EmptyState
          detail={
            <>
              What is loaded is on <Link href="/coverage">/coverage</Link>, counted rather than described: the
              states and union territories that have an election, the seats of each house and what each election
              holds. Someone or somewhere that has never appeared in one of those is genuinely not here, and
              this page will not guess.
            </>
          }
        />
      ) : null}

      <Foot>One field, six kinds of thing</Foot>
    </Shell>
  );
}
