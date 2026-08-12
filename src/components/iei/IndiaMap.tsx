import Link from 'next/link';
import { INDIA_SHAPES, INDIA_SOURCE, INDIA_VIEWBOX } from '../../lib/india-geo.ts';
import { labelFits } from '../../../packages/mandate/src/viz/anchors.ts';
import type { Cell, Layer } from '../../../packages/mandate/src/repo/home.ts';

/**
 * The map of India — the page's primary navigation surface.
 *
 * SERVER-RENDERED SVG WITH NO CLIENT JAVASCRIPT. Every jurisdiction is an `<a>`, so the map is
 * keyboard-navigable, works in a text browser, and can be opened in a new tab like any other link. Hover
 * and focus change the STROKE, never the fill: changing a choropleth's fill on hover destroys the one
 * thing the reader is comparing.
 *
 * THREE THINGS THAT ARE NOT DECORATION:
 *
 *  · DIRECT LABELS. Every polygon large enough to hold one carries its leading party's abbreviation at the
 *    area-weighted centroid of its largest ring (viz/anchors.ts). This is what makes the fills legible
 *    rather than a colour-matching exercise, and it is the secondary encoding that lets the palette use
 *    four fills at all.
 *  · A TILE ROW FOR THE SIX THAT CANNOT. Chandigarh's polygon is three viewBox units across; a label does
 *    not fit and neither does a cursor. Which six is COMPUTED by `labelFits`, never listed — so a future
 *    geometry set with a bigger Delhi moves it onto the map by itself.
 *  · A BIDIRECTIONAL HIGHLIGHT, in CSS. Hovering a polygon lights its row in the table beside it, and
 *    hovering a row outlines the polygon. `:has()` and one generated rule per jurisdiction; browsers
 *    without it simply do not highlight, which costs nothing, because the `<title>` and the table carry
 *    the same information already.
 *
 * The geometry comes from data/geo/india-states.json, whose own URL and sha256 are recorded inside it.
 * Nothing here is hand-drawn and nothing is hard-coded: a jurisdiction with no election loaded renders in
 * the no-data ink — an ink that deliberately fails the contrast floor a real mark has to clear — and still
 * links to its page, which is the honest way to show a gap on a map.
 */

const LABEL_PX = 7.5;

export function IndiaMap({
  layer,
  nameOf,
}: {
  layer: Layer;
  /** Registry name for a jurisdiction id, so this component never holds a list of state names. */
  nameOf: (id: string) => string;
}) {
  // Keyed by the geometry's own state name, which is the only join between the two datasets.
  const byName = new Map<string, Cell>();
  for (const c of layer.cells) byName.set(nameOf(c.jurisdictionId).toLowerCase(), c);

  const tiles: Cell[] = [];
  const labels: { x: number; y: number; text: string }[] = [];

  const shapes = INDIA_SHAPES.map(({ name, path: d, anchor: a }) => {
    const cell = byName.get(name.toLowerCase());
    if (cell === undefined) {
      // Geometry with no jurisdiction behind it. Drawn, never labelled, never linked.
      return (
        <path key={name} d={d} fill={layer.cells[0] === undefined ? 'none' : '#12111a'} className="iei-map-off">
          <title>{`${name} — not in the jurisdiction table`}</title>
        </path>
      );
    }
    const fits = a !== null && cell.label !== null && labelFits(a, cell.label.length, LABEL_PX);
    if (fits && a !== null && cell.label !== null) labels.push({ x: a.x, y: a.y, text: cell.label });
    // Too small for a label is too small for a cursor. It goes to the tile row instead.
    if (a !== null && !labelFits(a, 3, LABEL_PX)) tiles.push(cell);
    return (
      <Link key={name} href={cell.href} id={`iei-j-${cell.jurisdictionId}`}>
        <path d={d} fill={cell.fill}>
          <title>{title(cell)}</title>
        </path>
      </Link>
    );
  });

  return (
    // ONE ELEMENT, and that is a fix rather than a tidy-up. This used to return a fragment of three
    // children — a <style>, the <figure>, and the tile row — and the page mounts it as the first child of a
    // two-column grid. A fragment does not create a box, so the grid saw three items instead of one: the
    // map took column 1, THE TILE ROW TOOK COLUMN 2, and the legend and the 36-row table that belong there
    // wrapped to a third cell underneath. The right-hand half of the front page was empty and its table was
    // under the map, at every width, and no markup assertion could see it. The first real screenshot did.
    <div className="iei-map-col">
      <style dangerouslySetInnerHTML={{ __html: linkRules(layer.cells) }} />
      <figure className="iei-map">
        <svg
          viewBox={INDIA_VIEWBOX}
          role="img"
          aria-label={`India. ${layer.question} ${describe(layer)}`}
        >
          {shapes}
          {/* Labels last so no polygon paints over them, and aria-hidden because every one of them is
              already in its polygon's <title> — a screen reader should not hear the abbreviation twice. */}
          <g className="iei-map-labels" aria-hidden="true">
            {labels.map((l) => (
              <text key={`${l.x}-${l.y}-${l.text}`} x={l.x} y={l.y} fontSize={LABEL_PX}>
                {l.text}
              </text>
            ))}
          </g>
        </svg>
        <figcaption>
          Boundaries: {INDIA_SOURCE.publisher}. {layer.unknown === 0 ? null : (
            <>
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
 * A native title is what a mouse tooltip and a screen reader BOTH read, which is why it carries the whole
 * card rather than a name. `detail` is built in repo/home.ts, so what a reader sees here is the same text
 * the data layer would hand an API — and a jurisdiction with nothing loaded says so instead of showing an
 * empty card.
 */
function title(c: Cell): string {
  return [c.jurisdictionName.toUpperCase(), ...(c.detail.length > 0 ? c.detail : ['no election of this kind is loaded'])].join(
    '\n',
  );
}

function describe(layer: Layer): string {
  return layer.legend.map((l) => `${l.label}${l.note === undefined ? '' : ` (${l.note})`}`).join('; ');
}

/**
 * One rule per jurisdiction, joining the map to the table in both directions.
 *
 * Generated from the cells rather than written, so it cannot fall out of step with the jurisdictions that
 * exist. Ids are `[a-z]{2}` from the registry's own place ids and are re-checked here anyway: this string
 * is injected into a `<style>`, and an id is the only part of it that is not a literal.
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
