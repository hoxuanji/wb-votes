import Link from 'next/link';
import { openRead } from '../../../packages/mandate/src/db/open.ts';
import { fillFor, getMap, seatTitle } from '../../../packages/mandate/src/repo/map.ts';
import type { MapMode, MapView } from '../../../packages/mandate/src/repo/map.ts';
import '../p/mandate.css';
import '../situation.css';
import './map.css';

/**
 * `/map` — 294 constituencies as one SVG.
 *
 * The outlines were in data/seed/ from the first commit and unreachable until migration 008. This draws
 * them server-side: 0 KB of client JS, every shape an <a> to its Place Brief, mode switching by plain
 * link. A pan-and-zoom canvas is a real upgrade and also the moment this page stops being 0 KB, so it is
 * a separate decision.
 *
 * Reading order is finding, then legend, then map — the same as every other surface here. The map is the
 * evidence for the sentence above it, not a decoration in search of a caption.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Map' };

const MODES: { key: MapMode; label: string; blurb: string }[] = [
  { key: 'party', label: 'Who won', blurb: 'Winning party in the latest assembly election' },
  { key: 'margin', label: 'How close', blurb: 'Winning margin as a share of votes cast' },
  { key: 'turnout', label: 'Turnout', blurb: 'Votes cast as a share of electors' },
];

function Choropleth({ view }: { view: MapView }) {
  return (
    <svg
      className="mp-svg"
      viewBox={view.viewBox}
      role="img"
      aria-label={`${MODES.find((m) => m.key === view.mode)?.blurb ?? 'Map'}. ${view.finding}`}
    >
      {view.seats.map((s) => (
        // A link around a path: navigable, keyboard-reachable and hoverable with no script. The title
        // is what a screen reader and a native tooltip both read, because colour is not available to
        // either.
        <a key={s.placeId} href={s.href}>
          <title>{seatTitle(view, s)}</title>
          <path
            d={s.path}
            fill={fillFor(view, s)}
            /* A 0.6px stroke in the surface colour is the 2px inter-mark gap at this scale: without it
               294 adjacent fills read as one blob. */
            stroke="#0c0a11"
            strokeWidth={0.6}
          />
        </a>
      ))}
    </svg>
  );
}

export default function MapPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const raw = searchParams?.['by'];
  const asked = Array.isArray(raw) ? raw[0] : raw;
  const mode: MapMode = MODES.some((m) => m.key === asked) ? (asked as MapMode) : 'party';

  let view: MapView | null = null;
  try {
    view = getMap(openRead(), mode);
  } catch {
    view = null;
  }

  const current = MODES.find((m) => m.key === mode);

  return (
    <main className="mandate">
      <div className="sr">
        <nav className="sr-nav">
          <span className="sr-mark">
            <Link href="/" style={{ color: 'inherit', textDecoration: 'none' }}>
              MANDATE
            </Link>
          </span>
          <Link href="/map">Map</Link>
          <Link href="/pl/wb">Places</Link>
          <Link href="/search">People</Link>
          <Link href="/coverage">Coverage</Link>
          <Link href="/classic">WB Votes</Link>
        </nav>

        {view === null ? (
          <>
            <p className="sr-eyebrow">Map</p>
            <h1 className="sr-answer">No constituency outlines are stored in this checkout.</h1>
            <p className="sr-sub">
              Build the registry with{' '}
              <code>npm run registry:migrate &amp;&amp; npm run registry:ingest</code> — the shapes come
              from <code>data/seed/wb-ac-paths.json</code>.
            </p>
          </>
        ) : (
          <>
            <p className="sr-eyebrow">
              West Bengal · {view.year} assembly · {view.seats.length} seats
            </p>
            <h1 className="sr-answer">{view.finding}</h1>

            <div className="mp-modes">
              {MODES.map((m) => (
                <Link
                  key={m.key}
                  href={`/map?by=${m.key}`}
                  className={m.key === mode ? 'mp-on' : undefined}
                  aria-current={m.key === mode ? 'true' : undefined}
                >
                  {m.label}
                </Link>
              ))}
            </div>

            <div className="mp-wrap">
              <Choropleth view={view} />
              <div className="mp-legend">
                <p className="mp-legend-h">{current?.blurb}</p>
                <ul>
                  {view.legend.map((l) => (
                    <li key={l.label}>
                      <span className="mp-sw" style={{ background: l.fill }} aria-hidden="true" />
                      <span>
                        {l.label}
                        {l.note === undefined ? null : <em>{l.note}</em>}
                      </span>
                    </li>
                  ))}
                </ul>
                {view.unknown > 0 && (
                  <p className="mp-note">
                    {view.unknown} seat{view.unknown === 1 ? '' : 's'} unshaded: the source reports no
                    figure, which is not the same as a figure of zero.
                  </p>
                )}
              </div>
            </div>

            <p className="sr-foot">
              Every shape links to its seat. Outlines are projected SVG with no recorded projection —
              usable as a map, not as geography. Same data as a table:{' '}
              <Link href="/pl/wb">West Bengal by district</Link>.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
