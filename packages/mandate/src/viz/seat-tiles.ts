// Where each seat sits when every seat is the same size.
//
// A map gives a seat the area its boundary has: Kolkata's sixteen seats are specks and Cooch Behar's are continents. A tile map gives
// every seat one equal tile and keeps what a map is good for, MOSTLY: seats next to each other on the ground usually stay next to each
// other on the grid (on West Bengal's real outlines, 75% of a seat's two nearest neighbours are its adjacent tiles, the median seat sits
// about four cells from where its boundary is, and 11 neighbour pairs end up more than three cells apart). A rectangle cannot hold a
// state that is not one without moving seats, and a uniform cloud, which the tests use, is the easy case. It is a layout of the seats' CENTROIDS alone (centroidOf reads one from an outline), held on literal numbers in
// seat-tiles.test.ts: every seat has its own cell, the grid is compact, a seat does not move far from where it is, and the same seats
// give the same grid however they arrive.
//
// THE GRID FITS THE SEATS' BOX. Its columns and rows are chosen so a cell is about square when stretched over the box the centroids
// span, with at least one cell per seat and under two. The box is never thinner than an eighth of its length, so seats on a line are
// a wide grid of a few rows and not a single row of a hundred.
//
// SEATS TAKE CELLS BY CLOSEST FIRST. Every seat names its nearest cells; the pairs are taken in order of distance, a cell going to the
// first seat that asks for it, so a lone seat keeps its place and a crowd spreads outward from where it stood, which is the only
// thing a crowd can do. A seat whose nearest cells are all taken by then is not sent to whichever cell happens to be free (the free
// cells are scattered, and the first version of this sent a seat from the top edge to row 18): it takes its nearest cell, and the seats
// in the way each shift one step along the shortest chain of cells to the nearest free one, so every seat that gives way moves a single
// cell. Ties break by the seat's id and the cell's index, so the layout does not depend on the order the seats are given in.

import { parse } from "./simplify.ts";

/** The area-weighted centre of the largest ring of an outline, or the middle of its box if it has no area; null if it cannot be read. */
export function centroidOf(path: string): [number, number] | null {
  const { subpaths, unsupported } = parse(path);
  if (unsupported || subpaths.length === 0) return null;
  let best: { area: number; x: number; y: number } | null = null;
  for (const ring of subpaths) {
    let twice = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < ring.length; i++) {
      const [x0, y0] = ring[i]!;
      const [x1, y1] = ring[(i + 1) % ring.length]!;
      const cross = x0 * y1 - x1 * y0;
      twice += cross;
      cx += (x0 + x1) * cross;
      cy += (y0 + y1) * cross;
    }
    if (best === null || Math.abs(twice) > Math.abs(best.area) * 2) best = { area: twice / 2, x: twice === 0 ? 0 : cx / (3 * twice), y: twice === 0 ? 0 : cy / (3 * twice) };
  }
  if (best !== null && Math.abs(best.area) > 1e-12) return [best.x, best.y];
  const pts = subpaths.flat();
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

export type TileSeat = { id: string; x: number; y: number };
export type Tile = { id: string; col: number; row: number };

/** How many of its nearest cells a seat bids for before falling back to the nearest free one. */
const NEAREST = 24;
/** The most passes of swapping seats that are nearer each other's cells. Two or three settle it. */
const PASSES = 8;

const byId = (a: TileSeat, b: TileSeat): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function tileLayout(seats: readonly TileSeat[]): { tiles: Tile[]; cols: number; rows: number } {
  const n = seats.length;
  if (n === 0) return { tiles: [], cols: 0, rows: 0 };
  const sorted = [...seats].sort(byId);

  const xs = sorted.map((s) => s.x);
  const ys = sorted.map((s) => s.y);
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
  const [w, h] = [Math.max(...xs) - x0, Math.max(...ys) - y0];
  // The frame the grid is stretched over: the seats' box, no thinner than an eighth of its length.
  const W = Math.max(w, h / 8, 1e-9);
  const H = Math.max(h, w / 8, 1e-9);
  const cols = Math.min(n, Math.max(1, Math.ceil(Math.sqrt((n * W) / H))));
  const rows = Math.ceil(n / cols);
  const cells = cols * rows;
  const left = x0 - (W - w) / 2;
  const top = y0 - (H - h) / 2;
  const cx = (c: number): number => left + ((c + 0.5) * W) / cols;
  const cy = (r: number): number => top + ((r + 0.5) * H) / rows;
  const dist2 = (s: TileSeat, cell: number): number => (cx(cell % cols) - s.x) ** 2 + (cy(Math.floor(cell / cols)) - s.y) ** 2;

  const bids: { d: number; seat: number; cell: number }[] = [];
  sorted.forEach((s, seat) => {
    const near = Array.from({ length: cells }, (_, cell) => ({ d: dist2(s, cell), cell }))
      .sort((a, b) => a.d - b.d || a.cell - b.cell)
      .slice(0, NEAREST);
    for (const { d, cell } of near) bids.push({ d, seat, cell });
  });
  bids.sort((a, b) => a.d - b.d || a.seat - b.seat || a.cell - b.cell);

  const cellOf = new Array<number>(n).fill(-1);
  const taken = new Array<boolean>(cells).fill(false);
  for (const b of bids) {
    if (cellOf[b.seat] !== -1 || taken[b.cell]) continue;
    cellOf[b.seat] = b.cell;
    taken[b.cell] = true;
  }
  // The seats no bid reached. Each takes its nearest cell, and whoever is there steps aside along the shortest chain to a free cell.
  const occupant = new Array<number>(cells).fill(-1);
  cellOf.forEach((cell, seat) => cell !== -1 && (occupant[cell] = seat));
  const steps = [-cols, -1, 1, cols]; // up, left, right, down
  const neighbours = (cell: number): number[] =>
    steps
      .map((d) => cell + d)
      .filter((to, i) => to >= 0 && to < cells && !(i === 1 && cell % cols === 0) && !(i === 2 && cell % cols === cols - 1));
  sorted.forEach((s, seat) => {
    if (cellOf[seat] !== -1) return;
    let start = 0;
    for (let cell = 1; cell < cells; cell++) if (dist2(s, cell) < dist2(s, start)) start = cell;
    const via = new Map<number, number>([[start, -1]]);
    const queue = [start];
    let free = occupant[start] === -1 ? start : -1;
    for (let head = 0; free === -1 && head < queue.length; head++) {
      for (const to of neighbours(queue[head]!)) {
        if (via.has(to)) continue;
        via.set(to, queue[head]!);
        if (occupant[to] === -1) {
          free = to;
          break;
        }
        queue.push(to);
      }
    }
    // There are at least as many cells as seats, so a seat without a cell means a free cell exists and the grid is connected.
    if (free === -1) throw new Error(`no free cell for seat ${s.id}`);
    // Walk back from the free cell, moving each occupant one step onto the cell after it.
    for (let to = free; via.get(to) !== -1; to = via.get(to)!) {
      const from = via.get(to)!;
      const moved = occupant[from]!;
      occupant[to] = moved;
      cellOf[moved] = to;
    }
    occupant[start] = seat;
    cellOf[seat] = start;
  });

  // Settle: swap any two seats, or move a seat to a free cell, when that brings them nearer to where they were. A few passes are enough.
  for (let pass = 0; pass < PASSES; pass++) {
    let changed = false;
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        const [ca, cb] = [cellOf[a]!, cellOf[b]!];
        if (dist2(sorted[a]!, cb) + dist2(sorted[b]!, ca) < dist2(sorted[a]!, ca) + dist2(sorted[b]!, cb) - 1e-9) {
          [cellOf[a], cellOf[b]] = [cb, ca];
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  return { tiles: sorted.map((s, seat) => ({ id: s.id, col: cellOf[seat]! % cols, row: Math.floor(cellOf[seat]! / cols) })), cols, rows };
}
