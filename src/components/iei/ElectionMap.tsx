import Link from 'next/link';
import { INDIA_SHAPES } from '../../lib/india-geo.ts';
import { NOT_HELD } from '../../../packages/mandate/src/viz/party-ink.ts';
import { NATIONAL, simplified } from '../../../packages/mandate/src/viz/simplify.ts';
import { canTile, frameOf } from '../../../packages/mandate/src/repo/election-map.ts';
import { MODES, SHAPES } from '../../../packages/mandate/src/repo/map-selection.ts';
import type { MapMode, MapSelection } from '../../../packages/mandate/src/repo/map-selection.ts';
import type { ElectionMapView, ElectionSeat } from '../../../packages/mandate/src/repo/election-map.ts';
import { seatFill, seatTitle } from './seat-fill.ts';
import { SeatTiles, Unmapped } from './SeatTiles.tsx';
import { Evidence, Tabs } from './parts.tsx';

/**
 * The election map: one polygon per constituency, and four ways of reading the same 500 shapes.
 *
 * ── ONE MAP, FOUR ENCODINGS, ONE RENDERED AT A TIME ──
 *
 * WINNERS   fill is the winning party.                     "Who won each seat?"
 * FLIPS     fill is the GAINING party where a seat changed hands; a hold is the canvas; a seat whose
 *           boundary was redrawn is neither and is drawn as absent.  "Where did power move?"
 * MARGIN    fill is a sequential ramp, BRIGHTEST at the knife edge — the tight seats are the signal, so
 *           they are the loud ones.                        "How close was it?"
 * RUNNER-UP fill is the party that came second.            "Who is next, and where?"
 *
 * The modes are not layers. Only the selected one is in the markup, because four encodings of 492 polygons
 * is four times the bytes for three pictures nobody is looking at. Mode is URL state, so a reading is
 * shareable and costs no client JavaScript.
 *
 * ── WHY THE ACCESSIBLE TEXT IS SHORT ──
 *
 * The first version of this map carried the whole hover card twice per seat: once in `<title>` and again in
 * `aria-label` on the anchor. 492 seats of that is about 150 KB of duplicated prose, and it is the reason the
 * front page measured 934 KB against a 340 KB budget. A native `<title>` is what a mouse tooltip and a screen
 * reader BOTH read, so the second copy bought nothing. What is here now is one concise line per seat, and the
 * seat's full result is one link away, on the seat's own page; the list beside the map gives it for the twelve or so seats
 * it shows (its heading says how many), never for all 492.
 *
 * ── WHAT IS DRAWN, IN ORDER ──
 *
 *   1. the country in the canvas ink, so an undrawable seat reads as a gap in India and not in the page
 *   2. the seats that did not vote, for a partial election — geography, never a result
 *   3. the focused district's silhouette, under the fills so they mask everything but its outer edge
 *   4. the seats, in the active encoding
 *   5. state borders on top, so the country stays legible through 492 small polygons
 *
 * No per-seat labels: 492 abbreviations at 9 px is a wall of text. Colour is never the only channel, because
 * every seat is named in its hover card and is a link to its own page.
 */

// The modes are the selection's: it reads one out of the URL. Re-exported so a page imports the map and its modes together.
export { MODES };

function aspectOf(viewBox: string): number {
  const [, , w, h] = viewBox.split(' ').map(Number) as [number, number, number, number];
  return h > 0 ? w / h : 1;
}

/** A frame's `x y w h`, as the corners [x0, y0, x1, y1]. */
function cornersOf(frame: string): readonly [number, number, number, number] {
  const [x, y, w, h] = frame.split(' ').map(Number) as [number, number, number, number];
  return [x, y, x + w, y + h];
}

/**
 * The basemap, simplified once per process.
 *
 * The 36 state outlines are 52.5 kB of path text through the simplifier the seats use (58.4 kB at source detail: they are
 * coastline, which the simplifier can do little with), and a national frame wants them twice, as the canvas under the seats and
 * as the borders over them. So the page writes each one once and both layers refer to it, and leaves out the outlines that lie
 * outside the frame (`inFrame`), which for a state's frame is most of them.
 *
 * Module scope, not per render: the paths never change, so the work belongs to the process.
 */
const BASEMAP: readonly { id: string; path: string; box: readonly [number, number, number, number] }[] = INDIA_SHAPES.map((s, i) => {
  const path = simplified(s.path, NATIONAL);
  return { id: `iei-state-${i}`, path, box: cornersOf(frameOf([path], 0)) };
});

/** The outlines a frame can show: a stroke is a pixel or two wide, so an outline within a unit of the frame counts as in it. */
function inFrame(frame: string): typeof BASEMAP {
  const [x0, y0, x1, y1] = cornersOf(frame);
  return BASEMAP.filter((s) => s.box[0] <= x1 + 1 && s.box[2] >= x0 - 1 && s.box[1] <= y1 + 1 && s.box[3] >= y0 - 1);
}

/**
 * WHY THERE IS NO MAP, where there is none — stated once, beside the thing it is about, and only when it is true.
 *
 * `ElectionMap` draws nothing when no seat has an outline, and the view says which of two things that is
 * (`geometry.status`). Assam's and J&K's 2024 parliamentary seats were drawn by delimitations the registry holds no
 * boundaries for: those were redrawn, and only that case may say so. West Bengal's four assembly elections are all under
 * the 2008 order and nothing about them was redrawn: the registry simply holds no outline for it, and blaming a redraw
 * there was false. An election with no seats has nothing to explain.
 *
 * It says why and nothing about where the results are. It used to add "Every result is in the list below", which was false on
 * both pages: each lists twelve seats unless the reader narrows it (its heading says "12 of 294").
 */
export function NoMap({ view }: { view: ElectionMapView }) {
  const { status } = view.geometry;
  const n = view.seats.length;
  if (status === 'drawn' || n === 0) return null;
  // A by-election can fill a single seat.
  const one = n === 1;
  return (
    <p className="iei-absent">
      {status === 'redrawn'
        ? one
          ? 'No boundary map is available for this constituency — it was redrawn and the new boundary is not on record.'
          : `No boundary map is available for these ${n} constituencies — they were redrawn and the new boundaries are not on record.`
        : one
          ? 'No boundary map is loaded for this constituency.'
          : `No boundary map is loaded for these ${n} constituencies.`}
    </p>
  );
}

/**
 * WHY THERE IS NO COMPARISON, where an election has no earlier one of its house to make it with: the first on record. Said by
 * both pages in the same words. It is not a redraw, which is what a pile of seats with no counterpart means once an earlier
 * election exists (`incomparableSeats`), and a by-election is another case still: it is compared with nothing by design.
 */
export const NO_EARLIER_ELECTION = 'No earlier election of this house is on record, so there is nothing to compare this one with.';

/**
 * THE HEADER OF A MAP PAGE, as one band: the eyebrow with the page's evidence drawer at the other end of its line, then
 * whatever the page leads with.
 *
 * The drawer used to sit in a section heading of its own, under the page's name and over the controls, which said the
 * name a second time and pushed the map down by a heading's height. The sources back the whole page, so they sit with
 * its name now; the turnout caveat that rides in the drawer reaches a reader who opens it exactly as before.
 */
export function MapHead({
  eyebrow,
  sources,
  label,
  caveat,
  children,
}: {
  eyebrow: React.ReactNode;
  sources: ElectionMapView['sources'];
  /** What the sources are evidence FOR, for the screen reader: the drawer's visible text has no room for it. */
  label: string;
  /** A known problem with the figures these sources back, stated first inside the drawer. */
  caveat?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="iei-head iei-head-map">
      <div className="iei-head-top">
        <p className="iei-eyebrow">{eyebrow}</p>
        {sources.length === 0 ? null : <Evidence sources={sources} label={label} caveat={caveat} />}
      </div>
      {children}
    </div>
  );
}

/**
 * THE SECTION UNDER THE HEADER: one control row, then whatever atlas the page lays out in it.
 *
 * The heading is there for a screen reader and for nobody else. The page's own name is the heading a sighted reader
 * has, and a second one that repeated it ("West Bengal · Winners" under "West Bengal") is what put the controls a
 * heading's height further from the top. Dropping it from the outline too would leave the section without a name, so
 * it stays, hidden, and the outline is the one the page had.
 *
 * `controls` are the strips of choices (the elections, then the modes): the section lays them on a single row.
 */
export function MapSection({
  title,
  controls,
  children,
}: {
  title: string;
  controls: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="iei-sec iei-sec-atlas" id="map" aria-labelledby="map-h">
      <h2 id="map-h" className="iei-sr">
        {title}
      </h2>
      <div className="iei-controls">{controls}</div>
      {children}
    </section>
  );
}

/**
 * Map or tiles: how the seats are drawn, offered only where enough of them have a boundary to place tiles by. It is a control of
 * its own and not a mode, because any mode can be read in either shape, and every link on the page keeps the one chosen.
 */
export function ShapeTabs({ view, selection }: { view: ElectionMapView; selection: MapSelection }) {
  if (!canTile(view.seats)) return null;
  return (
    <Tabs
      label="How the seats are drawn"
      current={selection.shape}
      choices={SHAPES.map((x) => ({ key: x.key, label: x.label, href: selection.href({ shape: x.key }) }))}
    />
  );
}

/**
 * The map, or the tiles, with the way past them for a keyboard: a link to the end of the column, which comes before it.
 *
 * BESIDE THE COLUMN AND NOT IN IT. The column sticks below the page bar from 1024px up, and a sticky box is its own stacking
 * context, so a skip link inside it took focus underneath the bar. Out of flow (the stylesheet's `iei-skip`), the link takes no
 * cell of the grid the column is in.
 */
export function ElectionMap(props: { view: ElectionMapView; selection: MapSelection }) {
  const column = mapColumn(props);
  if (column === null) return null;
  return (
    <>
      <a className="iei-skip" href="#after-map">
        {`Skip the ${props.selection.shape === 'tiles' ? 'tiles' : 'map'}`}
      </a>
      {column}
    </>
  );
}

function mapColumn({
  view,
  selection,
}: {
  view: ElectionMapView;
  /** What the reader has narrowed the map to: the mode, the seats to mute, the district to reframe on, the seat to outline. */
  selection: MapSelection;
}): React.ReactElement | null {
  /**
   * The selection's district REFRAMES the map. Never drawn: a district elects nobody, and the registry holds outlines
   * for one state only, in another projection. The frame comes from the district's OWN SEATS, which needs no district
   * geometry at all and cannot be out of date with the constituencies. The seat is the one outlined, set from the list
   * so a row can point at the map.
   */
  const { mode, district, seat: focusSeat } = selection;
  const drawable = view.seats.filter((s) => s.path !== null);
  // The country is drawn under the seats only for an UNSCOPED national view. A state-scoped Lok Sabha
  // map is framed to that state, so 35 other states' outlines would be clipped away or, worse, visible.
  const national = view.election?.body === 'lok-sabha' && view.scope === null;
  // A district focus reframes to its own seats. Falling back to the whole election when a district has
  // nothing drawable is deliberate: an empty frame would zoom to nothing.
  const inFocus = district === null ? [] : drawable.filter((s) => s.districtId === district);
  // 45% MARGIN ON A DISTRICT, against 4% on a state. A district is being located as much as it is being
  // read, so its neighbours have to be in frame; at the default the viewport held nothing but the district
  // and the reader lost the state. The muting and the silhouette are what single it out — not the crop.
  const viewBox =
    inFocus.length > 0 ? frameOf(inFocus.map((s) => s.path as string), 0.45) : view.geometry.viewBox;
  const aspect = aspectOf(viewBox);
  // The state outlines this frame can show, for the canvas and the borders.
  const states = national ? inFrame(viewBox) : [];

  /**
   * NOTHING TO DRAW IS NOT AN EMPTY MAP.
   *
   * Assam's and Jammu & Kashmir's 2024 parliamentary seats sit under boundaries the registry holds no
   * geometry for, so a scoped view of them has zero polygons. Rendering the figure anyway framed to the
   * whole country — which is what `frameOf([])` falls back to — put an empty outline of India on a page
   * about fourteen Assamese seats. The caller says why instead (`NoMap`).
   */
  if (drawable.length === 0) return null;

  // The same seats, the same colours and the same selection, drawn as equal tiles instead of as boundaries.
  if (selection.shape === 'tiles') return SeatTiles({ view, selection });

  /**
   * Whether a seat is dimmed by the active selection: the seats it does not cover.
   *
   * ONE PRECEDENCE ORDER, the selection's, shared with the page's derived subset so the map and the list can never
   * disagree about what is selected: a district narrows first (geographic), then an isolation filters within it.
   */
  const muted = (s: ElectionSeat): boolean => !selection.covers(s);

  return (
    <div className="iei-map-col" style={{ ['--iei-map-w' as string]: `calc(var(--iei-map-h) * ${aspect.toFixed(3)})` }}>
      <figure className="iei-map iei-map-national">
        {/* A GROUP, NOT AN IMAGE: the seats are links, and an `img` makes its descendants presentational while the keyboard
            still stops on every one of them. The group keeps them exposed under the same name, and the skip link before the
            column is the way past them for a reader who does not want 288 stops. */}
        <svg
          viewBox={viewBox}
          role="group"
          aria-label={`${view.election?.name ?? 'Election'}. ${
            MODES.find((m) => m.key === mode)?.question ?? ''
          } ${drawable.length} of ${view.seats.length} constituencies drawn. Each seat links to its own page.`}
          style={{ aspectRatio: aspect }}
        >
          {/* 1 — the country, so a seat with no boundary is a gap in India rather than in the page. Only for
                 a national frame: a state map framed to its own box would draw 35 other states' shapes
                 across the viewport. Each outline is written once, here, and step 5 draws the same ones again by
                 reference; `vector-effect` is an attribute because a stylesheet rule does not reach what a `use`
                 draws, and a stroke in a map is in device pixels. */}
          {national ? (
            <>
              <defs>
                {states.map((s) => (
                  <path key={s.id} id={s.id} d={s.path} vectorEffect="non-scaling-stroke" />
                ))}
              </defs>
              <g className="iei-map-canvas" aria-hidden="true" fill={NOT_HELD}>
                {states.map((s) => (
                  <use key={s.id} href={`#${s.id}`} />
                ))}
              </g>
            </>
          ) : null}

          {/* 2 — THE SEATS THAT DID NOT VOTE, for a partial election.
                 Neutral geography, no fill from any party, no hover card, because they carry no result. A
                 by-election's four contested seats used to float in an empty frame and a reader completed
                 the picture by assuming the emptiness was political. This is the picture. */}
          {view.context.length === 0 ? null : (
            <g className="iei-map-uncontested" aria-hidden="true">
              {view.context.map((c) => (
                <path key={c.versionId} d={c.path} />
              ))}
            </g>
          )}

          {/* 3 — THE FOCUSED DISTRICT'S OUTLINE, under the seats so the fills mask its interior.
                 Concatenating the district's own seat paths and stroking the result gives the union's outer
                 edge for free; the half of the stroke that falls inside gets painted over by step 4. No
                 district geometry is involved, so this can never disagree with the constituencies. */}
          {inFocus.length === 0 ? null : (
            <g className="iei-map-district" aria-hidden="true">
              <path d={inFocus.map((s) => s.path as string).join(' ')} />
            </g>
          )}

          {/* 4 — the seats, in the ACTIVE encoding only. */}
          <g className="iei-map-fills">
            {drawable.map((s) => {
              const shape = (
                <path
                  d={s.path as string}
                  fill={seatFill(s, mode)}
                  opacity={muted(s) ? 0.18 : 1}
                  className={s.placeId === focusSeat ? 'iei-seat-focus' : undefined}
                >
                  <title>{seatTitle(s, mode)}</title>
                </path>
              );
              return s.href === null ? (
                <g key={s.versionId}>{shape}</g>
              ) : (
                <Link key={s.versionId} href={s.href}>
                  {shape}
                </Link>
              );
            })}
          </g>

          {/* 5 — state borders last, so the country reads through the seats. NATIONAL ONLY: a state map is
                 framed to its own bounding box, so 35 other states' outlines would be 36 paths clipped
                 entirely out of view, and the state's own shape is already described by its seats. */}
          {national ? (
            <g className="iei-map-borders" aria-hidden="true">
              {states.map((s) => (
                <use key={s.id} href={`#${s.id}`} />
              ))}
            </g>
          ) : null}
        </svg>

        {/* THE ONLY CAPTION: what the map cannot draw, and — in flip mode — what it may not compare. Both are
            facts a reader needs while looking at the polygons; everything else is in the evidence drawer. */}
        <figcaption>
          {drawable.length === view.seats.length ? (
            <>All {view.seats.length} constituencies drawn.</>
          ) : (
            <>
              {drawable.length} of {view.seats.length} drawn — no boundary on record for the other{' '}
              {view.seats.length - drawable.length}
              <Unmapped seats={view.seats.filter((s) => s.path === null)} />.
            </>
          )}
          {mode === 'flips' && view.incomparableSeats > 0 ? (
            <>
              {' '}
              {view.incomparableSeats} redrawn since {view.previous?.year ?? 'the previous election'} and left
              uncoloured — neither held nor flipped.
            </>
          ) : null}
        </figcaption>
      </figure>
      <div id="after-map" />
    </div>
  );
}
