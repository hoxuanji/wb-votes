import Link from 'next/link';
import { openRead } from '../../../packages/mandate/src/db/open.ts';
import { searchPersons } from '../../../packages/mandate/src/repo/person.ts';
import type { PersonRow } from '../../../packages/mandate/src/repo/person.ts';
import { detectScript, toLatin } from '../../../packages/mandate/src/core/indic/index.ts';
import '../p/mandate.css';
import '../situation.css';

/**
 * `/search?q=` — the primary IA (§4 "search as IA"), as a plain GET form.
 *
 * No client JS: a `<form method="get">` and a server component do everything a combobox would, the
 * result is linkable and back-button-correct, and the query survives a reload. The ⌘K command bar
 * in §5 is a real upgrade over this and it is also the moment this app stops being 0 KB, so it is a
 * separate decision, not a side effect of adding search.
 *
 * The transliteration is the point. `blockingKeys` inside searchPersons folds মমতা, ममता, Mamata and
 * Momota onto shared keys, so a Bengali query finds Latin-only records. Worth stating plainly: the
 * registry currently holds no Bengali name strings at all — the source's nameBn field is empty for
 * all 2,920 candidates — so this works in one direction only, query-side, and the page says so.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Search people' };

const LIMIT = 40;
const IN = new Intl.NumberFormat('en-IN');

function first<T>(v: T | T[] | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function Row({ p }: { p: PersonRow }) {
  const where =
    p.latestPlaceName === null
      ? 'no recorded contest'
      : `${p.latestPlaceName}${p.latestYear === null ? '' : ` ${p.latestYear}`}`;
  return (
    <tr>
      <td>
        <Link href={`/p/${p.id}`}>{p.canonicalName}</Link>
      </td>
      <td className="sr-place">{where}</td>
      <td className="n">{p.latestPartyShortName ?? <span className="sr-na">not reported</span>}</td>
      <td className="n">
        {p.latestStatus === null ? (
          <span className="sr-na">—</span>
        ) : p.isWinner ? (
          'won'
        ) : (
          p.latestStatus
        )}
      </td>
      <td className="n sr-drop">{p.candidacyCount}</td>
    </tr>
  );
}

function ResultTable({ rows }: { rows: readonly PersonRow[] }) {
  return (
    <table className="sr-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Most recent contest</th>
          <th className="n">Party</th>
          <th className="n">Outcome</th>
          <th className="n sr-drop">Contests</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <Row key={p.id} p={p} />
        ))}
      </tbody>
    </table>
  );
}

export default function SearchPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const q = (first(searchParams?.['q']) ?? '').trim();

  let rows: PersonRow[] = [];
  let unavailable = false;
  if (q !== '') {
    try {
      rows = searchPersons(openRead(), q, LIMIT);
    } catch {
      unavailable = true;
    }
  }

  // The two tiers are shown separately and counted separately. A phonetic hit is a suggestion, not a
  // result: the blocking index that produces it over-collides on purpose, so "zzzznobody" keys to the
  // same bucket as "Jhunu Baidya" and a single combined count read as "1 person matches".
  const named = rows.filter((p) => p.match !== 'sounds-like');
  const alike = rows.filter((p) => p.match === 'sounds-like');

  const script = q === '' ? 'zyyy' : detectScript(q);
  const transliterated = script === 'beng' || script === 'deva' ? toLatin(q) : null;

  const answer =
    q === ''
      ? 'Search the registry by name, in any script.'
      : named.length > 0
        ? `${named.length === LIMIT ? `The first ${LIMIT}` : named.length} ${
            named.length === 1 ? 'person is' : 'people are'
          } recorded under “${q}”.`
        : alike.length > 0
          ? `No name in the registry is “${q}”. ${alike.length} sound${alike.length === 1 ? 's' : ''} like it.`
          : `Nothing in the registry matches “${q}”.`;

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
          <Link href="/coverage">Coverage</Link>
        </nav>

        <p className="sr-eyebrow">People</p>
        <h1 className="sr-answer">{answer}</h1>

        <form className="sr-find" action="/search" method="get" role="search">
          <label htmlFor="q" style={{ position: 'absolute', left: '-9999px' }}>
            Search people
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="মমতা, Mamata, Momota — all three find the same person"
            autoComplete="off"
          />
          <button type="submit">Search</button>
        </form>
        <p className="sr-hint">
          {transliterated === null
            ? 'A name is matched as text first, then on how it sounds, so Biswas finds Bishwas and Md. Salim finds Mohammed Salim.'
            : `Read as ${script === 'beng' ? 'Bengali' : 'Devanagari'} and matched as “${transliterated}”.`}
        </p>

        {unavailable && (
          <p className="sr-corpus">
            The registry cannot be read right now. Build it with{' '}
            <code>npm run registry:migrate &amp;&amp; npm run registry:ingest</code>.
          </p>
        )}

        {named.length > 0 && (
          <section className="sr-sec">
            <ResultTable rows={named} />
            {named.length === LIMIT && (
              <p className="sr-rule">
                Capped at {LIMIT}. Narrow the name — there is no paging here yet, and a page-2 link
                that reruns the whole match is worse than saying so.
              </p>
            )}
          </section>
        )}

        {alike.length > 0 && (
          <section className="sr-sec">
            <h2 className="sr-h">Sounds like “{q}”</h2>
            <p className="sr-note">
              No recorded name contains what you typed; these share a phonetic key with it. The key
              is deliberately coarse — it exists to catch Biswas against Bishwas — so a match here is
              a suggestion to check, not a person found.
            </p>
            <ResultTable rows={alike} />
          </section>
        )}

        {q !== '' && rows.length === 0 && !unavailable && (
          <p className="sr-corpus">
            The registry holds West Bengal only: assembly candidates for 2011, 2016, 2021 and 2026,
            and the 42 members this state sends to the Lok Sabha. Someone who has never contested one of
            those is genuinely not here, and this page will not guess.
          </p>
        )}

        <p className="sr-foot">
          Names are matched phonetically across scripts. The registry itself stores no Bengali name
          strings — the affidavit source leaves that field empty for all {IN.format(2920)}{' '}
          candidates — so a Bengali query works, while a Bengali <em>record</em> does not yet exist to
          be found. <Link href="/coverage">What is loaded</Link>.
        </p>
      </div>
    </main>
  );
}
