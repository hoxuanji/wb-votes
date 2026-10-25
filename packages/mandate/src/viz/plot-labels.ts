// Where the names on the vote-against-seat plot go, and which parties are too small to have one.
//
// Pure: numbers in, numbers out, no JSX and no DOM. The figure draws in a 400-unit frame whose units are about a
// pixel, so a layout here is a table of literal coordinates in a test rather than a screenshot. Distribution.tsx is
// the only caller. A name is a box one line tall and as wide as its characters; a marker is a disc.

import { ticks } from "./marks.ts";

export type Box = { x0: number; y0: number; x1: number; y1: number };
export type Disc = { x: number; y: number; r: number };
/** A name to place: the marker it belongs to, how wide it prints, and how much it matters (bigger is placed first). */
export type LabelRequest = Disc & { key: string; width: number; weight: number };
export type Leader = { x1: number; y1: number; x2: number; y2: number };
export type PlacedLabel = {
  key: string;
  /** Where the text is anchored along the line: its start, its middle or its end, per `anchor`. */
  x: number;
  /** The middle of the line the text sits on. */
  y: number;
  anchor: "start" | "middle" | "end";
  box: Box;
  /** From the edge of the marker to the label, only where the label is not beside it. */
  leader: Leader | null;
};

/** Air between a marker's edge and its name. */
const GAP = 4;
/** What a marker takes up beyond its radius: half its stroke, and a little air. */
const CLEAR = 1.5;
/** A name further than this from its marker's edge, which is more than one line of drift, gets a leader line. */
const LEAD_AFTER = GAP + 1;
/**
 * What a leader line that misleads costs, in units of distance (eight lines): one through a name or another party's
 * marker, or across another leader, says the wrong party's name. Dearer than a name across one of the figure's rules
 * (four lines), which only has to be read over a thin line.
 */
const MISLEADING = 120;
const RULED = 60;
/** The horizontal run-out between candidate positions. */
const RUN = 12;
/** How many times every name is offered a better place once all of them are down. */
const PASSES = 2;

/**
 * Parties below this share of BOTH the vote and the seats are listed as one group instead of named one by one.
 * The registry's own plot rows hold a party only if it won a seat or took 1% of the vote, so a party under 1% of
 * both won a few seats (under 1% of the house) on almost no votes.
 */
export const MINOR_SHARE = 1;

/**
 * The width of a name, estimated rather than measured: the server cannot ask a browser, and the face is whichever
 * monospace the reader's system has. 0.62em is Chrome's measured advance for the macOS mono stack (0.612) with a
 * little slack for the faces that are wider, so a box is never narrower than its text.
 */
export function labelWidth(text: string, fontSize = 14): number {
  return text.length * fontSize * 0.62;
}

/** The nearest distance from a point to a box, zero inside it. */
function reach(x: number, y: number, b: Box): number {
  return Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.y0 - y, 0, y - b.y1));
}

/** Whether a box overlaps another once the first is widened by `pad` either side, so two names on one row stay `pad` apart. */
function overlaps(a: Box, b: Box, pad: number): boolean {
  return a.x0 - pad < b.x1 && b.x0 < a.x1 + pad && a.y0 < b.y1 && b.y0 < a.y1;
}

/** Whether the segment comes within the disc's radius of its centre. */
function touches(s: Leader, d: Disc): boolean {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const t = Math.max(0, Math.min(1, ((d.x - s.x1) * dx + (d.y - s.y1) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(s.x1 + t * dx - d.x, s.y1 + t * dy - d.y) < d.r;
}

/** Whether two segments cross each other (properly: touching at an end does not count). */
function meets(a: Leader, b: Leader): boolean {
  const side = (s: Leader, x: number, y: number) => Math.sign((s.x2 - s.x1) * (y - s.y1) - (s.y2 - s.y1) * (x - s.x1));
  return side(a, b.x1, b.y1) * side(a, b.x2, b.y2) < 0 && side(b, a.x1, a.y1) * side(b, a.x2, a.y2) < 0;
}

/** Whether the segment passes through the inside of the box (Liang–Barsky). */
function crosses(s: Leader, b: Box): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  for (const [p, q] of [
    [-dx, s.x1 - b.x0],
    [dx, b.x1 - s.x1],
    [-dy, s.y1 - b.y0],
    [dy, b.y1 - s.y1],
  ] as const) {
    if (p === 0) {
      if (q <= 0) return false;
    } else {
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      if (t0 >= t1) return false;
    }
  }
  return true;
}

/**
 * Put each name on a line of its own, beside its marker if there is room and as near as there is room if not.
 *
 * GREEDY, IN ORDER OF WEIGHT. The party that matters most is placed first and so gets the place beside its marker;
 * ties break on key, so the same parties give the same layout whatever order a query returned them in. Each name
 * takes the cheapest of a lattice of positions round its marker (to the right, to the left, or centred above and
 * below, in half-line steps and then further out), where cost is the distance from the marker's centre to the box
 * and a position to the left or above costs a little more than one to the right. A position is refused if it leaves
 * the frame, touches any marker, or is not a full line clear of a name already placed (a line above or below it, or
 * a line's width of air beside it, so two names on one row do not read as one phrase). A leader line that would run
 * through a name already placed (or a name a leader already placed runs through), through another party's marker or
 * across a leader already placed is allowed but costs eight lines, so it is chosen only when the crowd leaves nothing
 * better. A name over one of the `avoid` lines, which are the figure's own rules (the parity diagonal and each party's
 * drop to it), costs four: it may sit across one, but only when nowhere near is free.
 *
 * Then every name is offered a better place, twice over, now that all the others are down (see `PASSES`).
 *
 * A name with no position at all comes back in `unplaced` instead of being printed over something. Results are in
 * the order the requests came in.
 */
export function placeLabels(
  requests: readonly LabelRequest[],
  obstacles: readonly Disc[],
  frame: Box,
  lineHeight: number,
  avoid: readonly Leader[] = [],
): { placed: PlacedLabel[]; unplaced: string[] } {
  const half = lineHeight / 2;
  const runs = Math.ceil((frame.x1 - frame.x0) / RUN);
  const rows = Math.ceil((frame.y1 - frame.y0) / half);
  const order = requests
    .map((q, i) => ({ q, i }))
    .sort((a, b) => b.q.weight - a.q.weight || (a.q.key < b.q.key ? -1 : a.q.key > b.q.key ? 1 : 0) || a.i - b.i);
  /** The cheapest place for one name, given where every other name already is. */
  const choose = (q: LabelRequest, others: readonly PlacedLabel[]): PlacedLabel | null => {
    const near = q.r + GAP;
    let best: PlacedLabel | null = null;
    let bestCost = Infinity;
    for (const side of ["start", "end", "middle"] as const) {
      const bias = side === "start" ? 0 : side === "end" ? 3 : 6;
      for (let t = 0; t <= (side === "middle" ? 0 : runs); t += 1) {
        for (let m = 0; m <= rows; m += 1) {
          for (const sign of m === 0 ? [1] : [-1, 1]) {
            const yc = q.y + sign * m * half;
            const x0 =
              side === "start" ? q.x + near + t * RUN : side === "end" ? q.x - near - t * RUN - q.width : q.x - q.width / 2;
            const box: Box = { x0, y0: yc - half, x1: x0 + q.width, y1: yc + half };
            const away = reach(q.x, q.y, box);
            const cost = away + bias;
            if (cost >= bestCost) continue;
            if (box.x0 < frame.x0 || box.x1 > frame.x1 || box.y0 < frame.y0 || box.y1 > frame.y1) continue;
            if (obstacles.some((d) => reach(d.x, d.y, box) < d.r + CLEAR)) continue;
            if (others.some((o) => overlaps(box, o.box, lineHeight))) continue;
            let leader: Leader | null = null;
            let misleads = others.filter((o) => o.leader !== null && crosses(o.leader, box)).length;
            if (away > q.r + LEAD_AFTER) {
              const px = Math.min(Math.max(q.x, box.x0), box.x1);
              const py = Math.min(Math.max(q.y, box.y0), box.y1);
              const ux = (px - q.x) / away;
              const uy = (py - q.y) / away;
              leader = { x1: q.x + ux * (q.r + 1), y1: q.y + uy * (q.r + 1), x2: px - ux, y2: py - uy };
              misleads +=
                others.filter((o) => crosses(leader as Leader, o.box)).length +
                obstacles.filter((d) => touches(leader as Leader, d)).length +
                others.filter((o) => o.leader !== null && meets(o.leader, leader as Leader)).length;
            }
            const price = cost + misleads * MISLEADING + avoid.filter((l) => crosses(l, box)).length * RULED;
            if (price >= bestCost) continue;
            best = {
              key: q.key,
              x: side === "start" ? box.x0 : side === "end" ? box.x1 : q.x,
              y: yc,
              anchor: side,
              box,
              leader,
            };
            bestCost = price;
          }
        }
      }
    }
    return best;
  };

  const done = new Map<string, PlacedLabel>();
  for (const { q } of order) {
    const p = choose(q, [...done.values()]);
    if (p !== null) done.set(q.key, p);
  }
  // A SECOND LOOK, with every name down. A heavy party placed first takes the place beside its marker even when that
  // is the corridor a small party's leader line must pass through; once the small party is placed, the heavy one can
  // see that and step aside. A name moves only to a place no dearer than its own, so the layout never gets worse.
  for (let pass = 0; pass < PASSES; pass += 1) {
    for (const { q } of order) {
      const p = done.has(q.key) ? choose(q, [...done.values()].filter((o) => o.key !== q.key)) : null;
      if (p !== null) done.set(q.key, p);
    }
  }

  return {
    placed: requests.flatMap((q) => done.get(q.key) ?? []),
    unplaced: requests.filter((q) => !done.has(q.key)).map((q) => q.key),
  };
}

/**
 * Split the parties on the plot into those that get a name of their own and those too small to: below
 * `MINOR_SHARE` of both the vote and the seats. Two or more are a group; one on its own is named, because a group of
 * one is just a label with a prefix. Order is kept in both halves.
 */
export function splitMinor<T extends { votePct: number | null; seatPct: number }>(
  rows: readonly T[],
  floor = MINOR_SHARE,
): { named: T[]; minor: T[] } {
  const small = rows.filter((r) => r.votePct !== null && r.votePct < floor && r.seatPct < floor);
  if (small.length < 2) return { named: [...rows], minor: [] };
  const set = new Set(small);
  return { named: rows.filter((r) => !set.has(r)), minor: small };
}

/**
 * "Others: IND, AISF, CPM, INC": the group's one name. When the list would run past `maxChars` it keeps as many names
 * as fit and counts the rest ("Others: IND, AISF, +2"); the first name is always kept. The full list stays on each
 * marker's tooltip.
 */
export function othersLabel(names: readonly string[], maxChars: number): string {
  const text = (k: number) =>
    `Others: ${names.slice(0, k).join(", ")}${k < names.length ? `, +${names.length - k}` : ""}`;
  let k = names.length;
  while (k > 1 && text(k).length > maxChars) k -= 1;
  return text(k);
}

/** A disc round a set of discs, centred on their mean: what a group of markers looks like to a name. */
export function encloseDiscs(ds: readonly Disc[]): Disc {
  const x = ds.reduce((s, d) => s + d.x, 0) / ds.length;
  const y = ds.reduce((s, d) => s + d.y, 0) / ds.length;
  return { x, y, r: Math.max(...ds.map((d) => Math.hypot(d.x - x, d.y - y) + d.r)) };
}

/** Tick values for an axis that runs from zero to `ceiling`: round numbers, none past the end. */
export function axisTicks(ceiling: number): number[] {
  return ticks(0, ceiling, 4).values.filter((v) => v <= ceiling);
}
