/**
 * THE PRODUCT'S ICONS, one family. Every drawing is 24 units square, stroke only, 1.5 wide, round caps and joins,
 * in `currentColor`, so an icon is the colour of the text beside it and cannot be a second colour on the page.
 * They are inline SVG, so they cost no request and print.
 *
 * An icon is never the only thing that says something: each one sits beside words ("3 sources", "open", a signed
 * number), so it is `aria-hidden` and carries no label of its own. Where a glyph used to stand in (`ⓘ`, `▲ ▼ ■`,
 * a trailing `→`) it was a character from whichever font the reader's device picked, at a size and weight that
 * differed from one platform to the next; these do not.
 *
 * The disclosure chevron of `.iei-twin` is the one place an icon is drawn by the stylesheet (a mask in iei.css),
 * because that marker is a pseudo-element on a `<summary>` in ten components. It is this chevron's path.
 */

export const ICONS = {
  // The rail.
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
  // The sources drawer: a circle, a dot, a stem.
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <path d="M12 7.6v.01" />
    </>
  ),
  // A link that goes somewhere.
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  // A change: up, down, or none. Beside a signed number, never instead of it.
  up: <path d="M12 19V5M6 11l6-6 6 6" />,
  down: <path d="M12 5v14M6 13l6 6 6-6" />,
  flat: <path d="M5 12h14" />,
} as const;

export type IconName = keyof typeof ICONS;

/** The direction of a signed change, as the icon that shows it. Zero is `flat`, not a sign it does not have. */
export const trend = (n: number): IconName => (n > 0 ? 'up' : n < 0 ? 'down' : 'flat');

export function Icon({ name, side }: { name: IconName; /** Which side of its words it sits on, which sets the gap. */ side?: 'before' | 'after' }) {
  return (
    <svg
      className={side === undefined ? 'iei-ic' : `iei-ic iei-ic-${side}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[name]}
    </svg>
  );
}
