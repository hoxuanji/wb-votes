import Link from 'next/link';
import { openRead } from '../../../packages/mandate/src/db/open.ts';
import { PER_GROUP, searchAll } from '../../../packages/mandate/src/repo/search.ts';
import type { Hit, Results } from '../../../packages/mandate/src/repo/search.ts';
import type { PersonRow } from '../../../packages/mandate/src/repo/person.ts';
import { Foot, Shell } from '../../components/iei/Shell.tsx';
import { DataList, DataRow, EmptyState, Panel, RegistryMissing } from '../../components/iei/parts.tsx';
import '../iei.css';

/**
 * `/search?q=` — the one place the command bar lands, and the product's whole navigation surface.
 *
 * IT ANSWERS FOR EVERY KIND OF THING. States, elections, constituencies, people and parties, grouped, from
 * one field. Before this phase there were five ways in and each reached one kind: this field (people only),
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
 * direction only — query-side — and the other four groups see the transliterated form.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Search' };

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** A group of hits, or nothing at all. An empty group is not rendered: a heading over no rows is noise. */
function Group({
  title,
  question,
  hits,
  note,
}: {
  title: string;
  question: string;
  hits: readonly Hit[];
  note?: React.ReactNode;
}) {
  if (hits.length === 0) return null;
  return (
    <Panel title={title} question={question} note={note}>
      <DataList label={title}>
        {hits.map((h) => (
          <DataRow key={h.id} title={h.label} href={h.href} detail={h.detail} />
        ))}
      </DataList>
      {hits.length < PER_GROUP ? null : (
        <p className="iei-note">
          The first {PER_GROUP}. Narrow the query — there is no paging here, and a page-2 link that reruns
          the whole match is worse than saying so.
        </p>
      )}
    </Panel>
  );
}

/** A person's row, with where they last stood and how it went. */
function Person({ p }: { p: PersonRow }) {
  const where =
    p.latestPlaceName === null
      ? 'no recorded contest'
      : `${p.latestPlaceName}${p.latestYear === null ? '' : ` ${p.latestYear}`}`;
  const outcome = p.isWinner ? 'won' : (p.latestStatus ?? 'outcome not recorded');
  return (
    <DataRow
      title={p.canonicalName}
      href={`/p/${p.id}`}
      detail={`${where} · ${p.latestPartyShortName ?? 'party not recorded'} · ${outcome} · ${p.candidacyCount} contest${p.candidacyCount === 1 ? '' : 's'}`}
    />
  );
}

/** What the page says it found, in one sentence, before any of it. */
function answer(r: Results): string {
  if (r.q === '') return 'Search India — states, elections, constituencies, people and parties.';
  if (r.total > 0) {
    const kinds = [
      r.states.length > 0 ? 'states' : null,
      r.elections.length > 0 ? 'elections' : null,
      r.constituencies.length > 0 ? 'constituencies' : null,
      r.people.length > 0 ? 'people' : null,
      r.parties.length > 0 ? 'parties' : null,
    ].filter((x): x is string => x !== null);
    return `${r.total} match${r.total === 1 ? '' : 'es'} for “${r.q}” across ${kinds.join(', ')}.`;
  }
  if (r.alike.length > 0) {
    return `Nothing in the registry is named “${r.q}”. ${r.alike.length} name${r.alike.length === 1 ? '' : 's'} sound${r.alike.length === 1 ? 's' : ''} like it.`;
  }
  return `Nothing in the registry matches “${r.q}”.`;
}

export default function SearchPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const q = (first(searchParams?.['q']) ?? '').trim();

  let r: Results | null = null;
  let unavailable = false;
  let db: ReturnType<typeof openRead> | null = null;
  try {
    db = openRead();
    r = searchAll(db, q);
  } catch {
    unavailable = true;
  } finally {
    db?.close();
  }

  if (r === null || unavailable) {
    return (
      <Shell here="search" q={q} reading>
        <RegistryMissing />
      </Shell>
    );
  }

  return (
    <Shell here="search" q={q} reading>
      <div className="iei-head">
        <p className="iei-eyebrow">Search</p>
        <h1 className="iei-answer">{answer(r)}</h1>
        <p className="iei-sub">
          {r.transliterated === null
            ? 'A name is matched as text first, then on how it sounds, so Biswas finds Bishwas and Md. Salim finds Mohammed Salim.'
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
              detail="By the jurisdiction's name or the election's own. An election opens its coverage record — how much of it is loaded, and what is missing."
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
              detail="By full name or abbreviation — searching “Trinamool” finds AITC. A party has no page of its own yet, so a hit carries its measured reach and opens the national party landscape."
            />
          </DataList>
        </Panel>
      ) : null}

      <Group title="States" question="Which jurisdiction?" hits={r.states} />
      <Group title="Elections" question="Which election?" hits={r.elections} />
      <Group title="Constituencies" question="Which seat?" hits={r.constituencies} />

      {r.people.length === 0 ? null : (
        <Panel title="People" question="Who?">
          <DataList label="People">
            {r.people.map((p) => (
              <Person key={p.id} p={p} />
            ))}
          </DataList>
        </Panel>
      )}

      {r.alike.length === 0 ? null : (
        <Panel
          title={`Sounds like “${r.q}”`}
          question="Names that share a phonetic key with the query"
          note={
            <>
              No recorded name contains what you typed; these share a phonetic key with it. The key is
              deliberately coarse — it exists to catch Biswas against Bishwas — so a match here is{' '}
              <b>a suggestion to check, not a person found</b>.
            </>
          }
        >
          <DataList label="Phonetic matches">
            {r.alike.map((p) => (
              <Person key={p.id} p={p} />
            ))}
          </DataList>
        </Panel>
      )}

      <Group
        title="Parties"
        question="Which party?"
        hits={r.parties}
        note="A party has no page of its own in this registry. Each row carries what is counted about it, and opens the national party landscape."
      />

      {q !== '' && r.total === 0 && r.alike.length === 0 ? (
        <EmptyState
          title="Nothing here matches that."
          detail={
            <>
              What is loaded is on <Link href="/coverage">/coverage</Link>, counted rather than described: 36
              states and union territories, and the elections each has on record. Someone or somewhere that
              has never appeared in one of those is genuinely not here, and this page will not guess.
            </>
          }
        />
      ) : null}

      <Foot>One field, five kinds of thing</Foot>
    </Shell>
  );
}
