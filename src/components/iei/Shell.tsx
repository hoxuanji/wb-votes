import Link from 'next/link';
import { CommandKey } from './CommandKey.tsx';

/**
 * The product shell: wordmark, one command bar, two destinations, and a live indicator.
 *
 * WHAT IT LOST, AND WHY. It used to carry a search field, a state `<select>`, an election `<select>` and a
 * six-item strip of in-page anchors. That is four controls and six links above the map, and it was the
 * clearest instance of the defect this phase exists to fix:
 *
 *  · The two `<select>`s were search fields that could each reach one kind of thing. A reader had to
 *    classify their own query — is "Chikkodi" a state, an election or a seat? — before they could type it.
 *    One command bar over one grouped result surface answers all five kinds, and `/search` is where the
 *    grouping happens.
 *  · The election `<select>` existed for exactly one consumer: the homepage's Data coverage panel. That
 *    panel is gone (`/coverage` is a page for exactly that question), so the control that drove it went
 *    with it.
 *  · The six anchors were a table of contents for a page with nine sections. The page has four now, each
 *    one screen apart, and a strip that jumps within one document is not navigation.
 *
 * What is left is the honest answer to "where can I go next": the country, the coverage ledger, and a
 * field that reaches everything else. The hierarchy inside a state is carried by breadcrumbs, on the page,
 * beside the thing they are about.
 *
 * STRUCTURAL ONLY — it opens no database and holds no list of states. The same shell serves `/`,
 * `/pl/<path>`, `/p/<person>`, `/search` and `/coverage`.
 *
 * THE LIVE INDICATOR IS CONDITIONAL AND CURRENTLY ABSENT. `election.lifecycle` is 'declared' for all 1,202
 * rows and `election_phase` holds none, so there is no election running and the dot does not appear. A
 * permanently-lit "LIVE" is the decoration this product exists not to be; when the ECI schedule is ingested
 * the same prop lights it.
 */

export type Section = 'india' | 'coverage' | 'search' | 'place' | 'person';

/** Two destinations, both of which are pages. A strip that mixes pages with in-page anchors reads as one
 *  list of six equivalent places and is not one. */
const DESTINATIONS: readonly { key: Section; label: string; href: string }[] = [
  { key: 'india', label: 'India', href: '/' },
  { key: 'coverage', label: 'Coverage', href: '/coverage' },
];

export function Shell({
  here,
  q,
  /** A narrower measure for the surfaces that are prose and one table rather than a map. */
  reading = false,
  live = false,
  children,
}: {
  here: Section;
  /** The current query, so the bar shows what was searched rather than emptying itself. */
  q?: string;
  reading?: boolean;
  /** True only while an election's own lifecycle says it is running. */
  live?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="iei">
      {/* Skip link first in the tab order: the shell has a search field and two links before the content,
          which is less keyboard than it was but still keyboard. */}
      <a className="iei-skip" href="#main">
        Skip to content
      </a>
      <header className="iei-top">
        <Link className="iei-mark" href="/">
          <span className="iei-mark-a">INDIA</span>
          <span className="iei-mark-b">Election Intelligence</span>
        </Link>

        {/* A real <form method="get">, so search works with JavaScript off, is linkable, and is correct
            with the back button. ⌘K focuses it; the shortcut is an enhancement and never the only way in. */}
        <form className="iei-cmd" action="/search" method="get" role="search">
          <label htmlFor="iei-q" className="iei-sr">
            Search India — states, elections, constituencies, people and parties
          </label>
          <input
            id="iei-q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Search states, elections, seats, people, parties"
            autoComplete="off"
          />
          {/* A <kbd>, not placeholder text: it must stay visible once the field has focus, which is
              exactly when someone is deciding whether the shortcut exists. */}
          <kbd aria-hidden="true">⌘K</kbd>
        </form>

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
      <main className={reading ? 'iei-body iei-body-read' : 'iei-body'} id="main">
        {children}
      </main>
    </div>
  );
}
