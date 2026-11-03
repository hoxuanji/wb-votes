import Link from 'next/link';
import { Children, isValidElement } from 'react';
import type { CSSProperties } from 'react';
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
 *    linked from the footer of the content pages as `Data & coverage`, keeps its route, and keeps its deep link.
 *
 * That leaves the honest answer to "where can I go next": a field that reaches states, elections,
 * constituencies, people and parties, and a wordmark that goes home. The hierarchy inside a state is carried
 * by breadcrumbs, on the page, beside the thing they are about.
 *
 * There is deliberately no `/elections`, `/parties` or `/people` index. Each would be a new dashboard listing
 * what this field already reaches and what the state pages already own, and the answer to clutter is not
 * another page.
 *
 * STRUCTURAL ONLY — it opens no database and holds no list of states. Every page mounts it itself, the 404 and the
 * registry-is-missing notice included; the root layout does not.
 *
 * THE RAIL (2026-11-03, docs/superpowers/specs/2026-11-03-situation-room-home-design.md). A narrow column of six places, on a laptop,
 * and a row under the bar on a phone. It is what made the product feel like a document and not a tool that there was nowhere to
 * look for "where else can I go"; it is NOT an index of states, elections or people, which stay out for the reason above. Four of
 * its six destinations are sections of the front page (they are anchors, so they work from any page and with script off), and two
 * are pages that already exist. It is static and holds no list of anything the registry owns.
 *
 * THE LIVE INDICATOR IS CONDITIONAL AND CURRENTLY ABSENT. `election.lifecycle` is 'declared' for all 1,202
 * rows and `election_phase` holds none, so there is no election running and the dot does not appear. A
 * permanently-lit "LIVE" is the decoration this product exists not to be; when the ECI schedule is ingested
 * the same prop lights it.
 */

export type Section = 'india' | 'coverage' | 'search' | 'place' | 'person' | 'election' | 'review';

/** One drawing per place, 24 units square, stroke only, so the rail's icons are one family and cost no request. */
const ICONS: Record<string, React.ReactNode> = {
  now: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  landscape: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c3.2 3 3.2 15 0 18" />
      <path d="M12 3c-3.2 3-3.2 15 0 18" />
    </>
  ),
  next: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  history: <path d="M3 17l5-6 4 3 5-8 4 4" />,
  people: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-4 3-6 6-6s6 2 6 6" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16 14c3 0 5 2 5 5" />
    </>
  ),
  data: (
    <>
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
      <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </>
  ),
};

/** The six places. `at` is the surface that makes an item the current one; the anchors are never "current" because the page they are on is. */
const RAIL: { key: keyof typeof ICONS; label: string; href: string; at: Section | null }[] = [
  { key: 'now', label: 'Overview', href: '/', at: 'india' },
  { key: 'landscape', label: 'Landscape', href: '/#landscape', at: null },
  { key: 'next', label: 'Next up', href: '/#next', at: null },
  { key: 'history', label: 'History', href: '/#history', at: null },
  { key: 'people', label: 'People', href: '/candidates', at: 'person' },
  { key: 'data', label: 'Data', href: '/coverage', at: 'coverage' },
];

export function Shell({
  here,
  q,
  /** A narrower measure for the surfaces that are prose and one table rather than a map. */
  reading = false,
  live = false,
  liveLabel = null,
  glow = null,
  children,
}: {
  /** Which surface this is. Only the front page's, `india`, does anything: it marks the wordmark as current, on the page it links to. */
  here: Section;
  /** The current query, so the bar shows what was searched rather than emptying itself. */
  q?: string;
  reading?: boolean;
  /** True only while an election's own lifecycle says it is running, or a live feed says one is. */
  live?: boolean;
  /** What is live, in words ("Kerala assembly · counting"), so the bar says which election and not just that one exists. */
  liveLabel?: string | null;
  /**
   * The colour of the light along the top of the page, as a CSS colour (`--iei-glow`); null keeps the neutral one. Decoration and
   * nothing else: only a seat's page and its Analysis pass one, and the party it stands for is named in words on the same page
   * (repo/seat-glow.ts says when a seat has one).
   */
  glow?: string | null;
  children: React.ReactNode;
}) {
  // THE FOOTER IS NOT INSIDE <main>. A <footer> that is a descendant of main is not the page's contentinfo landmark,
  // and every page handed it over as the last child of the shell. They still do, and it is set apart here, in the
  // same frame as main so that it keeps the column it had. A footer wrapped in another component stays where it is.
  const parts = Children.toArray(children);
  const isFoot = (c: React.ReactNode): boolean => isValidElement(c) && (c.type === Foot || c.type === 'footer');
  return (
    <div className="iei" style={glow === null ? undefined : ({ '--iei-glow': glow } as CSSProperties)}>
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
          <a className="iei-live" href="/#live">
            <span className="iei-dot iei-dot-live" aria-hidden="true" />
            Live{liveLabel === null ? null : <span className="iei-live-what"> · {liveLabel}</span>}
          </a>
        ) : null}
      </header>
      <CommandKey target="iei-q" />
      <div className="iei-frame">
        <nav className="iei-rail" aria-label="Places">
          {RAIL.map((r) => (
            <Link key={r.key} href={r.href} aria-current={r.at !== null && r.at === here ? 'page' : undefined}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {ICONS[r.key]}
              </svg>
              <span>{r.label}</span>
            </Link>
          ))}
        </nav>
        <div className={reading ? 'iei-body iei-body-read' : 'iei-body'}>
          <main id="main">{parts.filter((c) => !isFoot(c))}</main>
          {parts.filter(isFoot)}
        </div>
      </div>
    </div>
  );
}

/**
 * The one line at the foot of a content page, and the way from any of them to the data ledger. A page that has
 * a reason to point at `/coverage` says so where it does (the search page's empty state, an evidence drawer that
 * holds more sources than it lists); this is the one that is always there.
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
