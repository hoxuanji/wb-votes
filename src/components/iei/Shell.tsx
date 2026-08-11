import Link from 'next/link';
import { CommandKey } from './CommandKey.tsx';

/**
 * The product shell: wordmark, command bar, two selectors, a live indicator, and the section strip.
 *
 * STRUCTURAL ONLY — it opens no database and holds no list of states. Everything it renders arrives as a
 * prop, because a component that queries the registry cannot be mounted on a page that has already closed
 * its handle, and because the same shell has to serve `/`, `/pl/<state>` and `/coverage`.
 *
 * THE LIVE INDICATOR IS CONDITIONAL AND CURRENTLY ABSENT. `election.lifecycle` is 'declared' for all 1,202
 * rows and `election_phase` holds none, so there is no election running and the dot does not appear. A
 * permanently-lit "LIVE" is the decoration this product exists not to be; when the ECI schedule is ingested
 * the same prop lights it.
 */

export type Section = 'overview' | 'elections' | 'states' | 'map' | 'watch' | 'data';

/** A jurisdiction as the picker needs it. `hasData` disables rather than hides: the 36 are the country. */
export type JumpTarget = { id: string; name: string; hasData: boolean };

/** An election as the picker needs it. */
export type ElectionChoice = { id: string; name: string; year: number };

type Dest = { key: Section; label: string; href: string };

/**
 * Six destinations, all of which resolve to something that exists. The previous strip listed ten and
 * rendered four of them as inert text with a tooltip explaining the absence — an honest gesture that in
 * practice put six dead words in the most valuable row on the page. The unbuilt surfaces are disclosed on
 * /coverage, which is a page for exactly that, rather than in the navigation.
 */
const DESTINATIONS: readonly Dest[] = [
  { key: 'overview', label: 'Overview', href: '/' },
  { key: 'elections', label: 'Elections', href: '/#elections' },
  { key: 'states', label: 'States', href: '/#states' },
  { key: 'map', label: 'Map', href: '/#map' },
  { key: 'watch', label: 'Watch', href: '/#watch' },
  { key: 'data', label: 'Data', href: '/coverage' },
];

export function Shell({
  here,
  states,
  elections,
  live = false,
  children,
}: {
  here: Section;
  states?: readonly JumpTarget[];
  elections?: readonly ElectionChoice[];
  /** True only while an election's own lifecycle says it is running. */
  live?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="iei">
      {/* Skip link first in the tab order: the shell has a search field, two selects and six links before
          the content, which is a lot of keyboard between the top of the page and the map. */}
      <a className="iei-skip" href="#main">
        Skip to content
      </a>
      <header className="iei-top">
        <Link className="iei-mark" href="/">
          <span className="iei-mark-a">INDIA</span>
          <span className="iei-mark-b">Election Intelligence</span>
        </Link>

        <div className="iei-controls">
          <form className="iei-cmd" action="/search" method="get" role="search">
            <label htmlFor="iei-q" className="iei-sr">
              Search people, seats and parties
            </label>
            <input id="iei-q" name="q" type="search" placeholder="Search" autoComplete="off" />
            {/* The hint is a <kbd>, not placeholder text: it must stay visible once the field has focus,
                which is exactly when someone is deciding whether the shortcut exists. */}
            <kbd aria-hidden="true">⌘K</kbd>
          </form>

          {states === undefined || states.length === 0 ? null : (
            <form className="iei-pick" action="/pl" method="get">
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

          {elections === undefined || elections.length === 0 ? null : (
            // A GET back to this page: the election is URL state, so the choice survives a reload and can
            // be sent to someone. `?election=` is read by the coverage panel.
            <form className="iei-pick" action="/" method="get">
              <label htmlFor="iei-election" className="iei-sr">
                Report coverage for an election
              </label>
              <select id="iei-election" name="election" defaultValue="">
                <option value="" disabled>
                  Election
                </option>
                {elections.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              <button type="submit">Go</button>
            </form>
          )}
        </div>

        <nav className="iei-nav" aria-label="Sections">
          {DESTINATIONS.map((d) => (
            <Link
              key={d.key}
              href={d.href}
              className={d.key === here ? 'iei-on' : undefined}
              aria-current={d.key === here ? 'page' : undefined}
            >
              {d.label}
            </Link>
          ))}
          {live ? (
            <span className="iei-live">
              <span className="iei-dot iei-dot-live" aria-hidden="true" />
              Live
            </span>
          ) : null}
        </nav>
      </header>
      <CommandKey target="iei-q" />
      <main className="iei-body" id="main">
        {children}
      </main>
    </div>
  );
}
