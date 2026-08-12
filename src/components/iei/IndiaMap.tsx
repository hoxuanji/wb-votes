import Link from 'next/link';
import {
  INDIA_SHAPES,
  INDIA_SOURCE,
  INDIA_VIEWBOX,
  everyDistrictPath,
} from '../../lib/india-geo.ts';
import { labelFits } from '../../../packages/mandate/src/viz/anchors.ts';
import type { Cell, Layer } from '../../../packages/mandate/src/repo/home.ts';

/**
 * The map of India — the product's primary analytical instrument, and its primary navigation.
 *
 * SERVER-RENDERED SVG WITH NO CLIENT JAVASCRIPT. Every jurisdiction is an `<a>`, so the map is
 * keyboard-navigable, works in a text browser, and can be opened in a new tab like any other link.
 *
 * ── THREE LAYERS, AND THE ORDER IS THE ARGUMENT ──
 *
 * This is the fix for the defect Phase 2.6 exists for. The map used to draw ONE path per state: every district
 * ring concatenated, filled with the state's colour and stroked. The fill hid the shared edges; the stroke did
 * not. So a party-coloured state arrived divided into party-coloured districts, and the only reading available
 * was "this district elected this party" — which the data does not say. It says "this party leads this state's
 * most recent assembly election".
 *
 *   1. STATE FILLS, from the layer. No stroke, so nothing inside a state is drawn in the party's colour.
 *   2. DISTRICT HAIRLINES, in a neutral ink, over the fills and under everything else. Administrative
 *      texture: they show where the districts are without claiming any of them voted for anything.
 *   3. STATE BORDERS, in the canvas colour and heavier, from the states' own outline geometry — which the
 *      source ships as its own features, so this is a real boundary rather than a by-product of the fill.
 *
 * That is the border hierarchy: a state border reads as a border, a district border reads as a subdivision,
 * and neither carries a party.
 *
 * ── WHAT ELSE IS NOT DECORATION ──
 *
 *  · DIRECT LABELS. Every polygon large enough carries its leading party's abbreviation at the area-weighted
 *    centroid of its largest ring (viz/anchors.ts). This is what makes the fills legible rather than a
 *    colour-matching exercise, and it is why colour is never the only channel.
 *  · A TILE ROW FOR THE ONES THAT CANNOT. Chandigarh's polygon is three viewBox units across; a label does
 *    not fit and neither does a cursor. Which ones is COMPUTED by `labelFits`, never listed.
 *  · A BIDIRECTIONAL HIGHLIGHT, in CSS. Hovering a polygon lights its row in the table beside it, and hovering
 *    a row outlines the polygon. `:has()` and one generated rule per jurisdiction.
 *  · PARTY HIGHLIGHT, from the URL. `?party=BJP` keeps that party's polygons at full strength and mutes the
 *    rest. URL state rather than a click handler, so a highlighted map is shareable and costs no JavaScript.
 */

const LABEL_PX = 7.5;

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
    // Too small for a label is too small for a cursor. It goes to the tile row instead.
    if (a !== null && !labelFits(a, 3, LABEL_PX)) tiles.push(cell);
    return (
      <Link key={name} href={cell.href} id={`iei-j-${cell.jurisdictionId}`} aria-label={title(cell)}>
        <path d={d} fill={cell.fill} opacity={muted ? 0.22 : 1}>
          <title>{title(cell)}</title>
        </path>
      </Link>
    );
  });

  return (
    <div className="iei-map-col">
      <style dangerouslySetInnerHTML={{ __html: linkRules(layer.cells) }} />
      <figure className="iei-map">
        <svg viewBox={INDIA_VIEWBOX} role="img" aria-label={`India. ${layer.question} ${describe(layer)}`}>
          {/* 1 — the fills. No stroke: nothing inside a state may be drawn in the party's colour. */}
          <g className="iei-map-fills">{fills}</g>
          {/* 2 — district hairlines, neutral, over the fills. Administrative texture and nothing more:
                 a district's colour here is the state's government, which is not a claim about the district,
                 so the district is outlined rather than filled. */}
          <path className="iei-map-districts" d={everyDistrictPath()} aria-hidden="true" />
          {/* 3 — state borders, from the states' own outline features, heavier than the district lines. */}
          <g className="iei-map-borders" aria-hidden="true">
            {INDIA_SHAPES.map((s) => (
              <path key={s.name} d={s.path} />
            ))}
          </g>
          {/* Labels last so no polygon paints over them, and aria-hidden because every one of them is already
              in its polygon's <title> — a screen reader should not hear the abbreviation twice. */}
          {marks.length === 0 ? null : (
            <g className="iei-map-labels" aria-hidden="true">
              {marks.map((l) => (
                <text key={`${l.x}-${l.y}-${l.text}`} x={l.x} y={l.y} fontSize={LABEL_PX}>
                  {l.text}
                </text>
              ))}
            </g>
          )}
        </svg>
        <figcaption>
          Boundaries: {INDIA_SOURCE.publisher}, {INDIA_SOURCE.epoch} — a dated administrative snapshot, not
          today&rsquo;s districts. District outlines are neutral: the fill is a state&rsquo;s government, which
          is not a claim about any district in it.
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
 * carried a source, a hash and a retrieval date would be the scattering this phase is removing.
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
 */
function linkRules(cells: readonly Cell[]): string {
  return cells
    .filter((c) => /^[a-z]{2}$/.test(c.jurisdictionId))
    .flatMap((c) => {
      const j = c.jurisdictionId;
      return [
        `.iei-linked:has(#iei-j-${j}:hover) [data-j="${j}"],.iei-linked:has(#iei-j-${j}:focus-visible) [data-j="${j}"]{background:var(--iei-raised);}`,
        `.iei-linked:has([data-j="${j}"]:hover) #iei-j-${j} path{stroke:var(--iei-ink);stroke-width:1.8;}`,
      ];
    })
    .join('');
}
