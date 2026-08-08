// Geometry, scales and the one trust boundary. Pure: no JSX, no strings of SVG, no palette
// decisions beyond handing out capped hues. charts.ts is the only caller.

import { CATEGORICAL, HUE_CAP, OTHERS } from "./palette.ts";

/**
 * The trust boundary. Party names, place names and candidate names come out of the registry and go
 * straight into markup; `&` and `<` in a name must not be able to close a tag or inject one.
 * Quotes are escaped too because interpolated text also lands in aria-label attributes.
 */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Coordinates, deterministically. Two decimals is well under a device pixel at these sizes, and a
 * fixed decimal count is what makes byte-identical output possible at all. Trailing zeros are
 * dropped (`Number(...).toString()` is spec'd, so this stays deterministic) and -0 folds to 0.
 */
export function num(v: number): string {
  if (!Number.isFinite(v)) return "0";
  return Math.abs(v) < 0.005 ? "0" : Number(v.toFixed(2)).toString();
}

/** A linear scale. Degenerate domain (min === max) pins to the range midpoint. */
export function linear(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  if (d1 === d0) return () => (r0 + r1) / 2;
  const k = (r1 - r0) / (d1 - d0);
  return (v) => r0 + (v - d0) * k;
}

/**
 * Nice ticks covering [min, max]. Step is chosen from the 1/2/5/10 ladder by d3's error thresholds
 * (√2, √10, √50) rather than by "first rung ≥ raw" — the naive rule turns a 48.1% axis into 0–60
 * instead of 0–50. Returns the domain to scale against as well as the values, because the axis and
 * the scale must agree exactly or a mark lands off its own grid line.
 */
export function ticks(min: number, max: number, count = 4): { values: number[]; lo: number; hi: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max === min) {
    return { values: [min], lo: min, hi: min };
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const err = raw / mag;
  const step = mag * (err >= Math.sqrt(50) ? 10 : err >= Math.sqrt(10) ? 5 : err >= Math.SQRT2 ? 2 : 1);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const values: number[] = [];
  for (let i = 0; lo + i * step <= hi + step / 1e6; i += 1) {
    values.push(Number((lo + i * step).toFixed(6)));
  }
  return { values, lo, hi };
}

/**
 * A horizontal bar: square at the baseline, 4px radius on the DATA END only (§24.7). A bar shorter
 * than the radius is drawn square — rounding it would round its zero.
 */
export function barPath(x0: number, y: number, x1: number, h: number, r = 4): string {
  const w = x1 - x0;
  if (w <= r || h <= r * 2) {
    return `M${num(x0)} ${num(y)}H${num(x1)}V${num(y + h)}H${num(x0)}Z`;
  }
  return (
    `M${num(x0)} ${num(y)}` +
    `H${num(x1 - r)}` +
    `A${r} ${r} 0 0 1 ${num(x1)} ${num(y + r)}` +
    `V${num(y + h - r)}` +
    `A${r} ${r} 0 0 1 ${num(x1 - r)} ${num(y + h)}` +
    `H${num(x0)}Z`
  );
}

/**
 * §24.7: direct labels on the first, last and extreme values only — never a number on every point.
 * Indices are over non-null values; the set is returned sorted so output order is stable.
 */
export function labelIndices(values: readonly (number | null)[]): number[] {
  const live = values.flatMap((v, i) => (v === null ? [] : [{ v, i }]));
  const first = live[0];
  const last = live[live.length - 1];
  if (first === undefined || last === undefined) return [];
  let hi = first;
  let lo = first;
  for (const p of live) {
    if (p.v > hi.v) hi = p;
    if (p.v < lo.v) lo = p;
  }
  return [...new Set([first.i, last.i, hi.i, lo.i])].sort((a, b) => a - b);
}

/**
 * De-overlap a column of text baselines. Turnout for a seat, its district and the state sit within
 * half a point of each other, so their direct labels land on top of one another and become
 * unreadable — which defeats the whole reason §24.7 asks for direct labels. Returns adjusted
 * baselines in the input's index order.
 *
 * ponytail: pushes down only, so a dense column drifts downward — centre-balance it if a column ever
 * carries more than the three series the cap allows.
 */
export function spread(ys: readonly number[], gap = 12): number[] {
  const out = ys.slice();
  let prev = -Infinity;
  for (const o of ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y || a.i - b.i)) {
    const y = Math.max(o.y, prev + gap);
    out[o.i] = y;
    prev = y;
  }
  return out;
}

/**
 * §24.5, enforced rather than documented: the first three distinct keys get hues 1–3 in order, and
 * every key after that gets the neutral. Hand it twenty parties and you get three hues and a grey —
 * never a fourth hue, never a repeated hue, and never silently.
 *
 * Order is the caller's ranking (bars sort by magnitude first), so the three hues always land on
 * the three largest entities.
 */
export function hueMap(keys: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const k of keys) {
    if (out.has(k)) continue;
    const slot = out.size < HUE_CAP ? CATEGORICAL[out.size] : undefined;
    out.set(k, slot ?? OTHERS);
  }
  return out;
}
