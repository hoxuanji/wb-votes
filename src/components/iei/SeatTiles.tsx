import Link from 'next/link';
import { centroidOf, tileLayout } from '../../../packages/mandate/src/viz/seat-tiles.ts';
import { MODES } from '../../../packages/mandate/src/repo/map-selection.ts';
import type { MapSelection } from '../../../packages/mandate/src/repo/map-selection.ts';
import type { ElectionMapView } from '../../../packages/mandate/src/repo/election-map.ts';
import { seatFill, seatTitle } from './seat-fill.ts';

/**
 * The seats as tiles: every seat the same size, placed near where the seat is.
 *
 * ── WHY ──
 *
 * A map gives a seat the area its boundary has. Kolkata's sixteen seats are specks on it and Cooch Behar's are continents, so the
 * crowded parts, where most of the seats are, are the parts the map shows worst. A tile gives every seat one square and keeps what
 * a map is good for: seats next to each other on the ground mostly stay next to each other on the grid (viz/seat-tiles.ts places
 * them by their centroids, closest first; on West Bengal's real outlines three in four of a seat's two nearest neighbours are the next
 * tile, and the median seat sits about four cells from where its boundary is, so the picture says "roughly"). What it gives up is shape, and so it says so: a tile's size says nothing about the seat.
 *
 * ── THE SAME SEAT, THE SAME COLOUR ──
 *
 * A tile is coloured and worded by `seatFill` and `seatTitle`, the functions the map uses, in every mode, and is dimmed by the
 * selection exactly as a polygon is. A seat with no boundary on record cannot be placed, so it has no tile, and the caption counts
 * them: nothing is placed by guesswork.
 *
 * The tiles are separated by the surface (a 2px gap), never by a stroke; there is no text on a tile, because at 294 seats it would
 * be a wall of numbers and the hover card and the list beside it carry the names.
 */

/** A tile's cell, in the figure's own units, and the tile inside it: the 2 units left over are the gap between tiles. */
const PITCH = 20;
const TILE = 18;

export function SeatTiles({ view, selection }: { view: ElectionMapView; selection: MapSelection }) {
  const { mode, seat: focusSeat } = selection;
  const placed = view.seats.flatMap((s) => {
    const c = s.path === null ? null : centroidOf(s.path);
    return c === null ? [] : [{ seat: s, id: String(s.versionId), x: c[0], y: c[1] }];
  });
  if (placed.length === 0) return null;
  const { tiles, cols, rows } = tileLayout(placed.map(({ id, x, y }) => ({ id, x, y })));
  const bySeat = new Map(placed.map((p) => [p.id, p.seat]));
  const aspect = cols / rows;
  const missing = view.seats.length - placed.length;

  return (
    <div className="iei-map-col" style={{ ['--iei-map-w' as string]: `calc(var(--iei-map-h) * ${aspect.toFixed(3)})` }}>
      <figure className="iei-map iei-map-tiles">
        <svg
          viewBox={`0 0 ${cols * PITCH} ${rows * PITCH}`}
          role="img"
          aria-label={`${view.election?.name ?? 'Election'}. ${MODES.find((m) => m.key === mode)?.question ?? ''} ${placed.length} of ${
            view.seats.length
          } constituencies as equal tiles. The full result for every seat is in the list that follows.`}
          style={{ aspectRatio: aspect }}
        >
          <g className="iei-tiles">
            {/* In reading order, so that tabbing through the links follows the picture and not the order the layout found them in. */}
            {[...tiles].sort((a, b) => a.row - b.row || a.col - b.col).map((t) => {
              const s = bySeat.get(t.id) as NonNullable<ReturnType<typeof bySeat.get>>;
              const tile = (
                <rect
                  x={t.col * PITCH + (PITCH - TILE) / 2}
                  y={t.row * PITCH + (PITCH - TILE) / 2}
                  width={TILE}
                  height={TILE}
                  rx={2}
                  fill={seatFill(s, mode)}
                  opacity={selection.covers(s) ? 1 : 0.18}
                  className={s.placeId === focusSeat ? 'iei-seat-focus' : undefined}
                >
                  <title>{seatTitle(s, mode)}</title>
                </rect>
              );
              return s.href === null ? (
                <g key={t.id}>{tile}</g>
              ) : (
                <Link key={t.id} href={s.href}>
                  {tile}
                </Link>
              );
            })}
          </g>
        </svg>

        <figcaption>
          {missing === 0 ? <>All {view.seats.length} constituencies are tiled</> : <>{placed.length} of {view.seats.length} constituencies are tiled</>}, one
          equal tile each, placed roughly where the seat is (distances are not to scale). A tile&rsquo;s size says nothing about the seat.
          {missing === 0 ? null : (
            <>
              {' '}
              {missing} {missing === 1 ? 'has' : 'have'} no boundary on record, so no tile.
            </>
          )}
          {mode === 'flips' && view.incomparableSeats > 0 ? (
            <>
              {' '}
              {view.incomparableSeats} redrawn since {view.previous?.year ?? 'the previous election'} and left uncoloured — neither held nor
              flipped.
            </>
          ) : null}
        </figcaption>
      </figure>
    </div>
  );
}
