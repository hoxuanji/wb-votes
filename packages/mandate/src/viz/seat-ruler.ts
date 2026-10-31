// The photo finish, as numbers: two totals drawn as bars on ONE zero-based scale, so that they are visibly the same length, and a ruler that
// magnifies the gap between them, so that the gap can be seen at all. Pure: no I/O, no markup, no strings of SVG. The component draws what this
// returns.
//
// WHY TWO FORMS. A bar has to start at zero or it lies about proportion, and at zero a gap of 57 in 1.16 lakh is 0.38px at 770px wide: invisible.
// A ruler is allowed to start away from zero, because it does not claim a proportion, only a position; and it must say so, which the figure's
// caption does ("it is a ruler and not a bar, so it does not start at zero"). `startsAtZero` is how the caption knows when that sentence would be
// false (two tiny totals), and is the one place a window that reaches zero is noticed.
//
// WHAT THE RULER MAY SAY, held by the tests: the window contains both totals with at least one grid step of room on each side; the grid is the
// largest of 1, 2 and 5 times a power of ten that is no more than the gap, so the gap is between one and two and a half grid steps and the dots are
// never crowded; the ticks are every grid step from the window's lower end to its upper end; and the same two totals always give the same window.
// `a` and `b` are the two totals in the order the caller names them (the winner's first); a position is where that total is, whichever is larger.

import { ticks as niceTicks } from "./marks.ts";

export type Ruler = {
  /** The window's lower and upper ends, in votes: both are multiples of `step`. */
  lo: number;
  hi: number;
  /** The grid, in votes, and the ticks on it from `lo` to `hi`. */
  step: number;
  ticks: number[];
  /** Where each total sits in the window, 0 to 1. */
  posA: number;
  posB: number;
  /** The larger total less the smaller. */
  gap: number;
  /** The window reaches zero, so the caption may not say that it does not start there. */
  startsAtZero: boolean;
};

export type Finish = {
  bars: {
    /** The scale's upper end, a multiple of the tick step at or above the larger total; the bars start at zero. */
    max: number;
    ticks: number[];
    /** How much of the scale each bar fills, 0 to 1. */
    fracA: number;
    fracB: number;
  };
  ruler: Ruler;
  /** The ruler's window on the bars' scale, 0 to 1: the span a funnel from the bars to the ruler opens from. */
  zoom: { from: number; to: number };
};

/** The largest of 1, 2 and 5 times a power of ten that is no more than `n`; 1 for anything under one. */
export function gridFor(n: number): number {
  if (!(n >= 1)) return 1;
  const mag = 10 ** Math.floor(Math.log10(n));
  const m = n / mag;
  return mag * (m >= 5 ? 5 : m >= 2 ? 2 : 1);
}

/** A window on the line of votes that holds `a` and `b` with room, on a grid chosen from the gap between them. */
export function ruler(a: number, b: number): Ruler {
  const high = Math.max(a, b);
  const low = Math.min(a, b);
  const gap = high - low;
  const step = gridFor(gap);
  const lo = Math.max(0, Math.floor((low - step) / step) * step);
  const hi = Math.ceil((high + step) / step) * step;
  const marks: number[] = [];
  for (let v = lo; v <= hi; v += step) marks.push(v);
  const at = (v: number): number => (v - lo) / (hi - lo);
  return { lo, hi, step, ticks: marks, posA: at(a), posB: at(b), gap, startsAtZero: lo === 0 };
}

/** The whole figure: the bars from zero, the ruler, and where the ruler's window sits on the bars. */
export function photoFinish(a: number, b: number): Finish {
  const r = ruler(a, b);
  const bar = niceTicks(0, Math.max(a, b, 1), 4);
  const max = bar.hi;
  return {
    bars: { max, ticks: bar.values, fracA: a / max, fracB: b / max },
    ruler: r,
    zoom: { from: Math.min(1, r.lo / max), to: Math.min(1, r.hi / max) },
  };
}
