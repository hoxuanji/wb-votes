// The margin field strip, as numbers: one dot per seat of an election, placed on a LOG axis by the size of its winning margin, and stacked so that no
// two dots overlap. Pure: no I/O, no markup. The component draws what this returns.
//
// WHY A LOG AXIS. West Bengal's 2024 Lok Sabha margins run from 5,567 to 710,930, a factor of 128; its 2026 assembly margins from 309 to 104,265, a
// factor of 337. On a linear axis nine of ten dots would sit in the first tenth of it. A dot, unlike a bar, has no baseline to lie about, so the axis
// may be logarithmic, and it says so: every major tick is ten times the one before it.
//
// WHAT IT MAY SAY, held by the tests: a dot is placed by the logarithm of its margin between two ends that are on the 1-2-5 ladder; a margin that is
// zero or not a number is not a place on a log axis, so it is not drawn and is counted in `unplaced`, never put at the left edge; no two dots overlap,
// in any of the three widths the page lays it out for; the seat the page is about is placed first, on the middle line, with a larger clearance for
// its ring; and the same points always give the same strip.
//
// THREE LAYOUTS. Dots are a fixed size and a track is not a fixed width, so how many rows a swarm needs depends on the width it is drawn at. The
// stack is computed for a narrow, a middle and a wide track, and the stylesheet picks one by viewport width (a dot's `--x` is the same in all
// three; only its row differs). Each width is the NARROWEST track the layout applies to, so a wider one only has more room.

export type LayoutName = "s" | "m" | "l";

/**
 * What each layout is drawn at: the NARROWEST track, in pixels, it is used for (measured in a browser as the swarm's own width at 360, 641 and 1081
 * pixels of viewport; the page test reads the same numbers), and the size of a dot and the distance between two rows. A phone gets smaller dots,
 * because 290 of them at the middle layout's size would need a screen and a half. The stylesheet's `--st-dot` and `--st-step` are these numbers.
 */
export const LAYOUT: Record<LayoutName, { width: number; dot: number; step: number }> = {
  s: { width: 270, dot: 6, step: 7 },
  m: { width: 519, dot: 8, step: 10 },
  l: { width: 950, dot: 8, step: 10 },
};

/** How far apart two dot centres must be: a dot's diameter and a pixel; and, where one is the seat's, six pixels more, for the ring round it. */
const apart = (name: LayoutName, withSelf: boolean): number => LAYOUT[name].dot + (withSelf ? 6 : 1);

export type StripPoint = {
  id: string;
  /** Votes. */
  value: number;
  /** The winner's party key, or null for no party. */
  key: string | null;
  basis: "counted" | "declared";
  /** The seat the page is about. At most one. */
  self: boolean;
  /** The hover text of the dot. */
  tip: string;
};

export type StripDot = StripPoint & {
  /** 0 to 1 along the axis. */
  x: number;
  /** The row, above (negative) or below (positive) the middle line, in each layout. */
  lane: Record<LayoutName, number>;
};

export type StripTick = { value: number; x: number; /** A power of ten: the ticks that are labelled. */ major: boolean };

export type Strip = {
  lo: number;
  hi: number;
  ticks: StripTick[];
  /** In margin order (closest first), the seat the page is about included. */
  dots: StripDot[];
  /** The rows above the middle line (and as many below it) each layout needs. */
  lanes: Record<LayoutName, number>;
  /** Points with a margin that is not a place on a log axis (zero, or not a number): not drawn. */
  unplaced: number;
};

const LADDER = [1, 2, 5];

/** The largest 1, 2 or 5 times a power of ten that is at most `v` (`v` at least 1). */
export function floorNice(v: number): number {
  const mag = 10 ** Math.floor(Math.log10(v));
  const m = v / mag;
  return mag * (m >= 5 ? 5 : m >= 2 ? 2 : 1);
}

/** The smallest 1, 2 or 5 times a power of ten that is at least `v` (`v` at least 1). */
export function ceilNice(v: number): number {
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const m of LADDER) if (m * mag >= v) return m * mag;
  return 10 * mag;
}

/** The axis for these margins: its two ends on the 1-2-5 ladder, and a tick at every ladder value between them. */
function axisOf(values: readonly number[]): { lo: number; hi: number; ticks: StripTick[] } {
  if (values.length === 0) return { lo: 1, hi: 10, ticks: [] };
  const lo = floorNice(Math.min(...values));
  let hi = ceilNice(Math.max(...values));
  // Every margin equal, and on the ladder: the axis still has two ends.
  if (hi <= lo) hi = ceilNice(lo + 1);
  const span = Math.log(hi) - Math.log(lo);
  const ticks: StripTick[] = [];
  for (let k = Math.floor(Math.log10(lo)); 10 ** k <= hi; k++) {
    for (const m of LADDER) {
      const value = m * 10 ** k;
      if (value >= lo && value <= hi) ticks.push({ value, x: (Math.log(value) - Math.log(lo)) / span, major: m === 1 });
    }
  }
  // A span of less than a decade may hold no power of ten: then every tick is labelled, so the axis is never left without a number on it.
  return { lo, hi, ticks: ticks.some((t) => t.major) ? ticks : ticks.map((t) => ({ ...t, major: true })) };
}

/**
 * Stack the points of one layout. The seat the page is about goes first, on row 0; the rest go left to right (then by id) into the nearest row to the
 * middle where they clear every dot already placed: 0, -1, +1, -2, +2 and so on, which grows the swarm evenly above and below its line.
 */
function stack(points: readonly { id: string; x: number; self: boolean }[], name: LayoutName): { lane: Map<string, number>; rows: number } {
  const { width, step } = LAYOUT[name];
  const order = [...points].sort((a, b) => Number(b.self) - Number(a.self) || a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const placed: { px: number; y: number; self: boolean }[] = [];
  const lane = new Map<string, number>();
  let rows = 0;
  for (const p of order) {
    const px = p.x * width;
    for (let k = 0; ; k++) {
      const row = k === 0 ? 0 : k % 2 === 1 ? -Math.ceil(k / 2) : k / 2;
      const y = row * step;
      const free = placed.every((q) => Math.hypot(px - q.px, y - q.y) >= apart(name, p.self || q.self));
      if (free) {
        placed.push({ px, y, self: p.self });
        lane.set(p.id, row);
        rows = Math.max(rows, Math.abs(row));
        break;
      }
    }
  }
  return { lane, rows };
}

export function seatStrip(points: readonly StripPoint[]): Strip {
  const drawn = points.filter((p) => Number.isFinite(p.value) && p.value >= 1);
  const { lo, hi, ticks } = axisOf(drawn.map((p) => p.value));
  const span = Math.log(hi) - Math.log(lo);
  const xs = drawn.map((p) => ({ id: p.id, self: p.self, x: Math.min(1, Math.max(0, (Math.log(p.value) - Math.log(lo)) / span)) }));
  const layouts = (["s", "m", "l"] as const).map((name) => [name, stack(xs, name)] as const);
  const lanes = Object.fromEntries(layouts.map(([name, l]) => [name, l.rows])) as Record<LayoutName, number>;
  const dots = drawn
    .map((p, i): StripDot => ({
      ...p,
      x: (xs[i] as { x: number }).x,
      lane: Object.fromEntries(layouts.map(([name, l]) => [name, l.lane.get(p.id) ?? 0])) as Record<LayoutName, number>,
    }))
    .sort((a, b) => a.value - b.value || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { lo, hi, ticks, dots, lanes, unplaced: points.length - drawn.length };
}
