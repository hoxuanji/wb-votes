// A bar against one threshold, as numbers: how much of the scale the value fills and where the tick sits. And the one rule for printing a share
// next to it, so that a figure that is 0.02 short of the line is never printed as being on it.

export type Bullet = {
  /** 0..1 of the scale, or null when there is no value (nothing is drawn at zero). */
  fill: number | null;
  /** 0..1 of the scale. */
  tick: number;
};

export function bullet(i: { value: number | null; target: number; scale: number }): Bullet {
  const clamp = (n: number): number => Math.min(1, Math.max(0, n));
  return { fill: i.value === null ? null : clamp(i.value / i.scale), tick: clamp(i.target / i.scale) };
}

/**
 * A share to one decimal, except where one decimal would round onto `line`: 49.98 prints as "49.98", never "50.0", because the whole point of the
 * line is that the figure is under it. More decimals are added only until the printed figure is no longer the line's.
 */
export function shareText(pct: number, line = 50): string {
  for (let d = 1; d <= 4; d++) {
    const s = pct.toFixed(d);
    if (pct === line || Number(s) !== line) return s;
  }
  return pct.toFixed(4);
}
