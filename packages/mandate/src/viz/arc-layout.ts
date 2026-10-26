// Where the seats of a house sit in a parliament arc.
//
// A house is a half ring of dots, one per seat, in concentric rows, with the seats of one party a wedge of it. The layout is a
// function of the number of seats alone, so it is held on literal numbers (arc-layout.test.ts): one dot per seat, none outside
// the frame, none overlapping another, and an order along the arc from its left end, so that a party's seats are a slice of it.
//
// HOW THE ROWS ARE CHOSEN. Seats per row are proportional to the row's radius, which keeps the spacing along a row about equal
// to the spacing between rows. For each possible number of rows the dot radius is the largest that still leaves a gap of GAP units
// between neighbours in a row and between rows (a binary search: a larger dot only makes both harder), and the number of rows
// with the largest dot wins, fewer rows on a tie. A dot is capped at MAX_R so that a union territory with a handful of seats is
// not drawn as a handful of balloons.
//
// Units are those of the frame ARC_BOX. The picture scales with its column, so on a phone the Lok Sabha's dots are under 4px across;
// the colour of a wedge still reads, and the numbers are in the key and the table beside it.

export const ARC_BOX = { w: 640, h: 340 } as const;

export type ArcDot = {
  x: number;
  y: number;
  r: number;
  /** 0 is the outermost row. */
  row: number;
  /** Radians along the arc from its left end: 0 at the left, PI at the right, PI / 2 at the top. */
  angle: number;
};

/** The surface left between two dots, as the 2px gap that separates every touching mark. */
const GAP = 2;
/** Between a dot and the edge of the frame. */
const MARGIN = 2;
const MAX_R = 14;
/** The innermost row's radius, as a fraction of the outermost's. */
const INNER = 0.35;
const MAX_ROWS = 18;

type Plan = { r: number; radii: number[]; counts: number[] };

/** `total` split over the rows in proportion to their radii, largest remainder first; null if a row would be left empty. */
function apportion(total: number, radii: readonly number[]): number[] | null {
  const sum = radii.reduce((a, b) => a + b, 0);
  const quota = radii.map((q) => (total * q) / sum);
  const counts = quota.map(Math.floor);
  let spare = total - counts.reduce((a, b) => a + b, 0);
  const order = quota.map((q, i) => ({ i, rest: q - Math.floor(q) })).sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const { i } of order) {
    if (spare === 0) break;
    counts[i]! += 1;
    spare -= 1;
  }
  return counts.some((c) => c < 1) ? null : counts;
}

/** The rows for a dot of radius `r`, or null if `r` does not fit. */
function fit(total: number, rows: number, r: number): Plan | null {
  const outer = ARC_BOX.w / 2 - r - MARGIN;
  const inner = rows === 1 ? outer : INNER * outer;
  const radii = Array.from({ length: rows }, (_, i) => (rows === 1 ? outer : outer - (i * (outer - inner)) / (rows - 1)));
  if (rows > 1 && (outer - inner) / (rows - 1) < 2 * r + GAP) return null;
  const counts = apportion(total, radii);
  if (counts === null) return null;
  for (let i = 0; i < rows; i++) {
    const c = counts[i]!;
    // The straight distance between neighbours on the row's circle, not the arc between them.
    if (c > 1 && 2 * radii[i]! * Math.sin(Math.PI / (2 * (c - 1))) < 2 * r + GAP) return null;
  }
  return { r, radii, counts };
}

/** The largest dot that fits `rows` rows, found by halving: a larger dot only makes the fit harder. */
function best(total: number, rows: number): Plan | null {
  let lo = 0.5;
  let hi = MAX_R;
  let found = fit(total, rows, hi);
  if (found !== null) return found;
  if (fit(total, rows, lo) === null) return null;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    found = fit(total, rows, mid);
    if (found === null) hi = mid;
    else lo = mid;
  }
  return fit(total, rows, lo);
}

/** One dot per seat, ordered from the left end of the arc, the outer row first where two dots share an angle. */
export function arcLayout(total: number): ArcDot[] {
  if (total <= 0) return [];
  let chosen: Plan | null = null;
  for (let rows = 1; rows <= Math.min(MAX_ROWS, total); rows++) {
    const plan = best(total, rows);
    if (plan !== null && (chosen === null || plan.r > chosen.r)) chosen = plan;
  }
  // total is at least 1 and one row at the smallest dot always fits.
  const { r, radii, counts } = chosen as Plan;
  const cx = ARC_BOX.w / 2;
  const cy = ARC_BOX.h - r - MARGIN;
  const dots: ArcDot[] = [];
  radii.forEach((radius, row) => {
    const c = counts[row]!;
    for (let k = 0; k < c; k++) {
      const angle = c === 1 ? Math.PI / 2 : (Math.PI * k) / (c - 1);
      dots.push({ x: cx - radius * Math.cos(angle), y: cy - radius * Math.sin(angle), r, row, angle });
    }
  });
  // Rows reach the same angle with a rounding error between them; ordering on the rounded angle keeps the outer row first.
  const key = (d: ArcDot): number => Math.round(d.angle * 1e9);
  return dots.sort((a, b) => key(a) - key(b) || a.row - b.row);
}
