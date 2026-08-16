import Link from 'next/link';
import { INDIA_SHAPES, INDIA_SOURCE, INDIA_VIEWBOX } from '../../lib/india-geo.ts';
import { labelFits } from '../../../packages/mandate/src/viz/anchors.ts';
import type { Cell, Layer } from '../../../packages/mandate/src/repo/home.ts';

/**
 * The map of India — the product's primary analytical instrument, and its primary navigation.
 *
 * SERVER-RENDERED SVG WITH NO CLIENT JAVASCRIPT. Every jurisdiction is an `<a>`, so the map is
 * keyboard-navigable, works in a text browser, and can be opened in a new tab like any other link.
 *
 * ── TWO LAYERS, AND THE THIRD ONE WAS DELETED ──
 *
 *   1. STATE FILLS, from the layer. No stroke, so nothing inside a state is drawn in the party's colour.
 *   2. STATE BORDERS, in the canvas colour, from the states' own outline geometry — which the source ships as
 *      its own features, so this is a real boundary rather than a by-product of the fill.
 *
 * There used to be a layer between them: 726 district hairlines, drawn as one 60 kB path over the whole
 * country. Its intent was administrative texture and its effect was interference across every polygon, at the
 * one zoom level where a district is not the unit of anything a reader can select, compare or navigate to.
 * PROGRESSIVE GEOGRAPHIC DISCLOSURE is the rule now — states here, districts when a state is open,
 * constituencies where the registry holds them — and the geometry did not go anywhere: `districtsOf()` still
 * serves the state map's district level, which is where a district frames, links and carries a tally.
 *
 * The disclaimer went with the lines, and that is not a loss of honesty. It read "district outlines are
 * neutral: the fill is a state's government, which is not a claim about any district in it" — a sentence
 * whose whole job was to undo an impression the district lines created. Nothing on this map now draws a
 * district, so nothing invites the reading.
 *
 * ── WHAT ELSE IS NOT DECORATION ──
 *
 *  · DIRECT LABELS. Every polygon large enough carries its leading party's abbreviation at the area-weighted
 *    centroid of its largest ring (viz/anchors.ts). This is what makes the fills legible rather than a
 *    colour-matching exercise, and it is why colour is never the only channel. They are BIGGER and therefore
 *    FEWER than before — a label sized in viewBox units rendered at about 6px on this frame, which is below
 *    reading size, and `labelFits` refuses the ones that no longer have room rather than shrinking them.
 *  · A TILE ROW FOR THE ONES THAT CANNOT. Chandigarh's polygon is three viewBox units across; a label does
 *    not fit and neither does a cursor. Which ones is COMPUTED by `labelFits`, never listed.
 *  · A BIDIRECTIONAL HIGHLIGHT, in CSS. Hovering a polygon lights its row in the table beside it, and hovering
 *    a row outlines the polygon. `:has()` and one generated rule per jurisdiction.
 *  · PARTY HIGHLIGHT, from the URL. `?party=BJP` keeps that party's polygons at full strength and mutes the
 *    rest. URL state rather than a click handler, so a highlighted map is shareable and costs no JavaScript.
 */

/**
 * The label's size, as a fraction of the frame — the same rule `StateMap` applies, and for the same reason.
 *
 * A font size inside an SVG is in USER units, so it means a different number of PIXELS at every frame. The
 * national frame is 597 units wide and renders at about 550px, so the old constant of 7.5 units drew at
 * about 6.9px: under reading size, on the product's primary instrument. A frame-relative size holds the
 * rendered size steady instead — 1/58th of the width is about 9px here and stays about 9px whatever the frame.
 */
const LABEL_FRACTION = 1 / 58;

/**
 * The size a polygon must have room for to be SELECTABLE, which is a different question from whether it can
 * hold a label — and conflating the two was a small bug this pass introduced and then removed.
 *
 * The tile row exists because Chandigarh's polygon is three viewBox units across: too small for a cursor.
 * That threshold is about the POINTER, so it must not move when the label size does. It was measured against
 * a three-character label at the old 7.5-unit size, and this reproduces that measurement independently of
 * `LABEL_FRACTION` — otherwise making labels legible quietly moved two more states off the map.
 */
const CLICKABLE_FRACTION = 1 / 80;

/** The frame's own proportions, so the figure claims the width its shape needs and no more. */
const [, , FRAME_W, FRAME_H] = INDIA_VIEWBOX.split(' ').map(Number) as [number, number, number, number];
const LABEL_PX = FRAME_W * LABEL_FRACTION;
const CLICKABLE_PX = FRAME_W * CLICKABLE_FRACTION;
const ASPECT = FRAME_H > 0 ? FRAME_W / FRAME_H : 1;

export function IndiaMap({
  layer,
  nameOf,
  highlight = null,
  labels = true,
}: {
  layer: Layer;
  /** Registry name for a jurisdiction id, so this component never holds a list of state names. */
  nameOf: (id: string) => string;
  /** A party key whose polygons stay saturated while the others mute. Null highlights nothing. */
  highlight?: string | null;
  labels?: boolean;
}) {
  // Keyed by the geometry's own state name, which is the only join between the two datasets.
  const byName = new Map<string, Cell>();
  for (const c of layer.cells) byName.set(nameOf(c.jurisdictionId).toLowerCase(), c);

  const tiles: Cell[] = [];
  const marks: { x: number; y: number; text: string }[] = [];

  const fills = INDIA_SHAPES.map(({ name, path: d, anchor: a }) => {
    const cell = byName.get(name.toLowerCase());
    if (cell === undefined) {
      // Geometry with no jurisdiction behind it. Drawn, never labelled, never linked.
      return (
        <path key={name} d={d} className="iei-map-off">
          <title>{`${name} — not in the jurisdiction table`}</title>
        </path>
      );
    }
    const muted = highlight !== null && cell.partyKey !== highlight;
    const fits = a !== null && cell.label !== null && labelFits(a, cell.label.length, LABEL_PX);
    if (labels && fits && a !== null && cell.label !== null && !muted) {
      marks.push({ x: a.x, y: a.y, text: cell.label });
    }
    // Too small for a label is too small for a cursor — but measured at the POINTER threshold, not the label
    // one, so a change to how big labels are cannot move a state off the map. See CLICKABLE_FRACTION.
    if (a !== null && !labelFits(a, 3, CLICKABLE_PX)) tiles.push(cell);
    return (
      <Link key={name} href={cell.href} id={`iei-j-${cell.jurisdictionId}`} aria-label={title(cell)}>
        <path d={d} fill={cell.fill} opacity={muted ? 0.22 : 1}>
          <title>{title(cell)}</title>
        </path>
      </Link>
    );
  });

  return (
    // The width a figure of these proportions needs to use the height it is allowed. `--iei-map-h` is a
    // PIXEL token: it was `70vh` here and on the state map, which made an `auto` grid track depend on the
    // window's height and collapsed the column beside it. See the token's own note in iei.css.
    <div className="iei-map-col" style={{ ['--iei-map-w' as string]: `calc(var(--iei-map-h) * ${ASPECT.toFixed(3)})` }}>
      <style dangerouslySetInnerHTML={{ __html: linkRules(layer.cells) }} />
      <figure className="iei-map">
        <svg
          viewBox={INDIA_VIEWBOX}
          role="img"
          aria-label={`India. ${layer.question} ${describe(layer)}`}
          style={{ aspectRatio: `${FRAME_W} / ${FRAME_H}` }}
        >
          {/* 1 — the fills. No stroke: nothing inside a state may be drawn in the party's colour. */}
          <g className="iei-map-fills">{fills}</g>
          {/* 2 — state borders, from the states' own outline features. The only line on this map. */}
          <g className="iei-map-borders" aria-hidden="true">
            {INDIA_SHAPES.map((s) => (
              <path key={s.name} d={s.path} />
            ))}
          </g>
          {/* Labels last so no polygon paints over them, and aria-hidden because every one of them is already
              in its polygon's <title> — a screen reader should not hear the abbreviation twice. */}
          {marks.length === 0 ? null : (
            <g
              className="iei-map-labels"
              aria-hidden="true"
              style={{ ['--iei-label-stroke' as string]: `${(LABEL_PX * 0.3).toFixed(2)}` }}
            >
              {marks.map((l) => (
                <text key={`${l.x}-${l.y}-${l.text}`} x={l.x} y={l.y} fontSize={LABEL_PX.toFixed(2)}>
                  {l.text}
                </text>
              ))}
            </g>
          )}
        </svg>
        {/* THE EPOCH, AND WHAT THE MAP CANNOT COLOUR. Nothing else. The publisher, the URL and the hash are in
            the panel's evidence drawer (GEOMETRY_SOURCE); the district disclaimer left with the district
            lines. What a reader has to know while looking at these polygons is which snapshot the boundaries
            are, and which of them stand for no result. */}
        <figcaption>
          Boundaries: {INDIA_SOURCE.epoch} — a dated snapshot.
          {layer.unknown === 0 ? null : (
            <>
              {' '}
              {layer.unknown} of {layer.cells.length} unshaded — {layer.unknownWhy}.
            </>
          )}
        </figcaption>
      </figure>
      {tiles.length === 0 ? null : (
        <ul className="iei-tiles" aria-label="Jurisdictions too small to select on the map">
          {tiles.map((c) => (
            <li key={c.jurisdictionId}>
              <Link href={c.href} data-j={c.jurisdictionId}>
                <span className="iei-sw" style={{ background: c.fill }} aria-hidden="true" />
                <b>{c.jurisdictionId.toUpperCase()}</b>
                <span className="iei-tile-v">{c.label ?? <span className="iei-absent">not held</span>}</span>
                <span className="iei-sr">{c.jurisdictionName}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The hover card, as a multi-line `<title>`.
 *
 * A native title is what a mouse tooltip and a screen reader BOTH read, which is why it carries the whole card
 * rather than a name. `detail` is built in repo/home.ts, so what a reader sees here is the same text the data
 * layer would hand an API — and a jurisdiction with nothing loaded says so instead of showing an empty card.
 *
 * NO PROVENANCE IN A TOOLTIP. Where the figure came from is in the panel's evidence drawer; a tooltip that
 * carried a source, a hash and a retrieval date would be the scattering this product removed.
 */
function title(c: Cell): string {
  return [
    c.jurisdictionName.toUpperCase(),
    ...(c.detail.length > 0 ? c.detail : ['no election of this kind is loaded']),
  ].join('\n');
}

function describe(layer: Layer): string {
  return layer.legend.map((l) => `${l.label}${l.note === undefined ? '' : ` (${l.note})`}`).join('; ');
}

/**
 * One rule per jurisdiction, joining the map to the table in both directions.
 *
 * Generated from the cells rather than written, so it cannot fall out of step with the jurisdictions that
 * exist. Ids are `[a-z]{2}` from the registry's own place ids and are re-checked here anyway: this string is
 * injected into a `<style>`, and an id is the only part of it that is not a literal.
 *
 * The polygon side lifts the fill and draws a thin edge — the focus treatment the whole map uses — rather than
 * the heavy dark outline it used to draw, which read as one more boundary in a picture made of boundaries.
 */
function linkRules(cells: readonly Cell[]): string {
  return cells
    .filter((c) => /^[a-z]{2}$/.test(c.jurisdictionId))
    .flatMap((c) => {
      const j = c.jurisdictionId;
      return [
        `.iei-linked:has(#iei-j-${j}:hover) [data-j="${j}"],.iei-linked:has(#iei-j-${j}:focus-visible) [data-j="${j}"]{background:var(--iei-raised);}`,
        `.iei-linked:has([data-j="${j}"]:hover) #iei-j-${j} path{stroke:var(--iei-ink);stroke-width:1.25;filter:brightness(1.14);}`,
      ];
    })
    .join('');
}
