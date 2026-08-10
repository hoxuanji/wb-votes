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

/** A jurisdiction, as the picker needs it. Structural only — the nav does not query the registry itself,
 *  because a component that opens a database cannot be rendered on a page that has already closed it. */
export type JumpTarget = { id: string; name: string; hasData: boolean };

export function Nav({ here, states }: { here: Section; states?: readonly JumpTarget[] }) {

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
      {/* A jurisdiction picker, not a menu of links: 36 destinations do not belong in a nav bar, and a
          native select needs no JavaScript, is keyboard- and screen-reader-native on every platform, and
          submits on its own button. The options come from the registry, so a state appears here the moment
          its data is loaded. */}
      {states === undefined || states.length === 0 ? null : (
        <form className="iei-jump" action="/pl" method="get">
          <label htmlFor="iei-state" className="iei-sr">
            Go to a state or union territory
          </label>
          <select id="iei-state" name="to" defaultValue="">
            <option value="" disabled>
              State / UT
            </option>
            {states.map((s) => (
              <option key={s.id} value={s.id} disabled={!s.hasData}>
                {s.name}
                {s.hasData ? '' : ' — not loaded'}
              </option>
            ))}
          </select>
          <button type="submit">Go</button>
        </form>
      )}
      <form className="iei-cmd" action="/search" method="get" role="search">
        <label htmlFor="iei-q" className="iei-sr">
          Search candidates, seats and parties
        </label>
        {/* The placeholder used to carry three worked examples. Instruction-as-placeholder is the wrong
            place for it: it is unreadably low-contrast by design, vanishes the moment anyone types, and
            reads as clutter in the chrome. One word here; the examples live on /search, where there is room
            to show them properly. */}
        <input id="iei-q" name="q" type="search" placeholder="Search" autoComplete="off" />
      </form>
    </header>
  );
}
