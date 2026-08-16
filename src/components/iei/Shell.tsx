import Link from 'next/link';
import { CommandKey } from './CommandKey.tsx';

/**
 * The product shell: wordmark, one command bar, and a live indicator.
 *
 * WHAT IT LOST IN THIS PASS, AND WHY. It carried two destination links, `INDIA` and `COVERAGE`.
 *
 *  · `INDIA` linked to the page the wordmark already links to. Two controls, one destination.
 *  · `COVERAGE` is the harder one, and it is the reason this file changed. It is a real surface and a good
 *    one — eighteen subject areas, per-election completeness, geography against India's own totals — but it
 *    is INFRASTRUCTURE METADATA, and it was sitting in the two slots a product reserves for what it is FOR.
 *    A reader arriving at an election intelligence platform met "COVERAGE" before they met an election. It is
 *    linked from the footer of every page as `Data & coverage`, keeps its route, and keeps its deep link.
 *
 * That leaves the honest answer to "where can I go next": a field that reaches states, elections,
 * constituencies, people and parties, and a wordmark that goes home. The hierarchy inside a state is carried
 * by breadcrumbs, on the page, beside the thing they are about.
 *
 * There is deliberately no `/elections`, `/parties` or `/people` index. Each would be a new dashboard listing
 * what this field already reaches and what the state pages already own, and the answer to clutter is not
 * another page.
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

export function Shell({
  here,
  q,
  /** A narrower measure for the surfaces that are prose and one table rather than a map. */
  reading = false,
  live = false,
  children,
}: {
  /** Which surface this is. Marks the wordmark as current on `/`; carries no navigation any more. */
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
      {/* Skip link first in the tab order: the shell has a search field before the content, which is less
          keyboard than it was but still keyboard. */}
      <a className="iei-skip" href="#main">
        Skip to content
      </a>
      <header className="iei-top">
        <Link className="iei-mark" href="/" aria-current={here === 'india' ? 'page' : undefined}>
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

        {live ? (
          <span className="iei-live">
            <span className="iei-dot iei-dot-live" aria-hidden="true" />
            Live
          </span>
        ) : null}
      </header>
      <CommandKey target="iei-q" />
      <main className={reading ? 'iei-body iei-body-read' : 'iei-body'} id="main">
        {children}
      </main>
    </div>
  );
}

/**
 * The one line at the foot of every surface, and the only place the data ledger is linked.
 *
 * It replaced five different footers, each of which explained something about the software: what the product
 * is "a registry of", why coverage is honest by construction, what the ⓘ does, why the Analysis floor is
 * per-constituency, and that the registry stores no Indic name strings. All of those were true and none of
 * them was a fact about Indian politics.
 */
export function Foot({ children }: { children?: React.ReactNode }) {
  return (
    <footer className="iei-foot">
      <p>
        {children === undefined ? null : <>{children} · </>}
        <Link href="/coverage">Data &amp; coverage</Link> — what this registry holds, and what it does not.
      </p>
    </footer>
  );
}
