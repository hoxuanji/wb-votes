import Link from 'next/link';

/**
 * §24 — top-level navigation organised around user intent, not database tables.
 *
 * The brief names ten destinations: HOME, EXPLORE, ELECTIONS, BATTLEGROUNDS, CANDIDATES, PARTIES, MAP,
 * SIGNALS, RESULTS, RESEARCH. All ten are shown, because the IA is the product's shape and hiding the
 * unbuilt half misrepresents what this is meant to be. What is NOT done is dress an unbuilt destination
 * as a working one: a section with no surface behind it renders as text with `aria-disabled`, links
 * nowhere, and carries the reason on hover. §48 forbids fake features; it does not require pretending
 * the plan is smaller than it is.
 *
 * `here` is the current section so the strip can mark it — §38 wants the current location available to
 * a screen reader, not just visible.
 */

export type Section =
  | 'home'
  | 'explore'
  | 'elections'
  | 'battlegrounds'
  | 'candidates'
  | 'parties'
  | 'map'
  | 'signals'
  | 'results'
  | 'research';

type Dest = { key: Section; label: string; href: string | null; why?: string };

const DESTINATIONS: readonly Dest[] = [
  { key: 'home', label: 'Home', href: '/' },
  { key: 'explore', label: 'Explore', href: '/pl/wb' },
  { key: 'elections', label: 'Elections', href: '/#calendar' },
  { key: 'battlegrounds', label: 'Battlegrounds', href: '/#battlegrounds' },
  { key: 'candidates', label: 'Candidates', href: '/search' },
  {
    key: 'parties',
    label: 'Parties',
    href: null,
    why: 'No party surface yet. 63 parties and 16 symbols are in the registry; the pages are not built.',
  },
  { key: 'map', label: 'Map', href: '/map' },
  { key: 'signals', label: 'Signals', href: '/#signals' },
  { key: 'results', label: 'Results', href: '/pl/wb' },
  { key: 'research', label: 'Research', href: '/coverage' },
];

export function Nav({ here }: { here: Section }) {
  return (
    <header className="iei-top">
      <Link className="iei-mark" href="/">
        <span className="iei-mark-a">INDIA</span>
        <span className="iei-mark-b">ELECTION INTELLIGENCE</span>
      </Link>
      <nav className="iei-nav" aria-label="Sections">
        {DESTINATIONS.map((d) =>
          d.href === null ? (
            <span key={d.key} className="iei-off" aria-disabled="true" title={d.why}>
              {d.label}
            </span>
          ) : (
            <Link
              key={d.key}
              href={d.href}
              className={d.key === here ? 'iei-on' : undefined}
              aria-current={d.key === here ? 'page' : undefined}
            >
              {d.label}
            </Link>
          ),
        )}
      </nav>
      {/* §19 wants a command bar on CMD+K. This is the honest placeholder for it: a real form that
          works with no JavaScript, labelled with the shortcut it does not yet implement. */}
      <form className="iei-cmd" action="/search" method="get" role="search">
        <label htmlFor="iei-q" className="iei-sr">
          Search candidates, seats and parties
        </label>
        <input id="iei-q" name="q" type="search" placeholder="Search  মমতা · Mamata · Mekliganj" autoComplete="off" />
      </form>
    </header>
  );
}
