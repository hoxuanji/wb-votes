// Three charts, server-rendered, as strings. There is no client JS this cycle, so a chart is markup
// plus the rows of its table — and §27 makes the table the primary path, not a fallback: it is what a
// screen reader reads. Both come out of one call because a caller that can forget the table will.
//
// Only `svg` is pre-escaped markup. Every string in `table` and in `fact` is RAW text for JSX to
// escape — do not put them through dangerouslySetInnerHTML.
//
// ponytail: three builders, no shared "ChartFrame", no options for anything that does not vary.
// The Place Analysis floor renders exactly these three. A fourth arrives with its first caller.

import {
  barPath,
  escapeXml,
  hueMap,
  labelIndices,
  linear,
  num,
  spread,
  ticks,
} from "./marks.ts";
import {
  CATEGORICAL,
  DIVERGING,
  HUE_CAP,
  LINE_SUBTLE,
  OTHERS,
  SURFACE,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "./palette.ts";

export type Table = {
  caption: string;
  headers: readonly string[];
  rows: readonly (readonly string[])[];
};

export type Chart = {
  /** Complete <svg>. Empty string when `fact` is set. */
  svg: string;
  /** Non-null when there is nothing to draw: render this one line, never an empty axis frame. */
  fact: string | null;
  table: Table;
};

/** A formatter from packages/mandate/src/semantic — `percent`, `percentagePoints`, `inr`. */
export type Fmt = (value: number | null) => string;

export type BarPoint = { label: string; value: number | null; key?: string };
export type Series = { key: string; label: string; values: readonly (number | null)[] };
export type SlopeRow = { label: string; from: number | null; to: number | null };

// ── shell ────────────────────────────────────────────────────────────────────────────────────────

const W = 640;
/** IBM Plex Mono is the data face (§25); the generic stack is the fallback the page's CSS overrides. */
const NUM = "font-variant-numeric:tabular-nums;font-family:ui-monospace,SFMono-Regular,Menlo,monospace";
/** Mono advance at 12px. "A value that will hold 7 digits reserves 7 digits" is this times 7. */
const CH = 7.2;
const AX = 11; // axis / tick text
const VAL = 11; // direct value labels

/** Proportional text width, good enough to reserve space. Anek Bangla runs wider — hence the clips. */
function wide(s: string, size: number): number {
  return Array.from(s).length * size * 0.58;
}

/** ponytail: codepoint clip, not grapheme-aware — the table row always carries the full label. */
function clip(s: string, n: number): string {
  const cp = Array.from(s);
  return cp.length <= n ? s : `${cp.slice(0, n - 1).join("")}…`;
}

function t(
  x: number,
  y: number,
  fill: string,
  size: number,
  body: string,
  anchor: "start" | "middle" | "end" = "start",
  numeric = false,
): string {
  return (
    `<text x="${num(x)}" y="${num(y)}" fill="${fill}" font-size="${size}"` +
    (anchor === "start" ? "" : ` text-anchor="${anchor}"`) +
    (numeric ? ` style="${NUM}"` : "") +
    `>${escapeXml(body)}</text>`
  );
}

function line(x1: number, y1: number, x2: number, y2: number, stroke: string, w = 1): string {
  return `<line x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}" stroke="${stroke}" stroke-width="${w}"/>`;
}

/** §24.7: a 2px surface ring, so two markers landing on the same point stay two markers. */
function marker(x: number, y: number, fill: string): string {
  return `<circle cx="${num(x)}" cy="${num(y)}" r="4" fill="${fill}" stroke="${SURFACE}" stroke-width="2"/>`;
}

/**
 * §24.7 + §27: a swatch carries identity, the text never wears the series colour. Rendered only for
 * ≥ 2 series; one series is named by the title.
 *
 * Wraps to a second row rather than running off the frame — three Bengali party names do not fit on
 * one 640px line — and reports its height so the plot can start below it.
 */
function legend(items: readonly { colour: string; label: string }[]): { svg: string; height: number } {
  if (items.length < 2) return { svg: "", height: 0 };
  let x = 0;
  let row = 0;
  let svg = "";
  for (const it of items) {
    const shown = clip(it.label, 22);
    const w = 32 + wide(shown, 12);
    if (x > 0 && x + w > W) {
      row += 1;
      x = 0;
    }
    const y = 14 + row * 20;
    svg +=
      `<rect x="${num(x)}" y="${num(y - 9)}" width="10" height="10" rx="2" fill="${it.colour}"/>` +
      t(x + 16, y, TEXT_SECONDARY, 12, shown);
    x += w;
  }
  return { svg, height: (row + 1) * 20 };
}

function shell(height: number, title: string, finding: string, body: string): string {
  const label = finding.trim() ? `${title}. ${finding}` : title;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${num(height)}"` +
    ` preserveAspectRatio="xMinYMin meet" style="width:100%;height:auto;display:block"` +
    ` role="img" aria-label="${escapeXml(label)}">${body}</svg>`
  );
}

function caption(title: string, finding: string): string {
  return finding.trim() ? `${title} — ${finding}` : title;
}

/**
 * No frame, no axes, no apology: one line of fact. The caller's finding IS the fact.
 *
 * The table still carries every row it was handed — a chart with nothing DRAWABLE is not a chart
 * with nothing KNOWN (a swing into an unheld election has one real endpoint), and §27 makes the
 * table the primary path, so dropping the rows here would be actual data loss.
 */
function nothing(
  title: string,
  finding: string,
  headers: readonly string[],
  rows: readonly (readonly string[])[] = [],
): Chart {
  return {
    svg: "",
    fact: finding.trim() || `${title}: nothing recorded.`,
    table: { caption: caption(title, finding), headers, rows },
  };
}

// ── 1. bars: magnitude across a few categories, sorted ───────────────────────────────────────────

/**
 * Horizontal, sorted descending, zero-anchored. One series, so no legend. Points may carry `key` to
 * take entity colour — capped at three hues by `hueMap`, everything past that neutral, with the
 * label still carrying identity (§2 P3).
 *
 * ponytail: values are assumed ≥ 0 (share, margin, count). A signed measure gets `slope`, not this.
 */
export function bars(i: {
  title: string;
  finding: string;
  /** Header for the category column, e.g. "Party" or "Election". */
  dimension: string;
  valueHeader: string;
  points: readonly BarPoint[];
  format: Fmt;
}): Chart {
  const headers = [i.dimension, i.valueHeader];
  const sorted = i.points
    .slice()
    .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity) || (a.label < b.label ? -1 : 1));
  const rows = sorted.map((p) => [p.label, i.format(p.value)] as const);
  const drawn = sorted.filter((p) => p.value !== null);
  if (drawn.length === 0) return nothing(i.title, i.finding, headers, rows.map((r) => [...r]));

  const hues = hueMap(drawn.flatMap((p) => (p.key === undefined ? [] : [p.key])));
  const max = Math.max(...drawn.map((p) => Math.max(0, p.value ?? 0)));
  const tk = ticks(0, max, 4);

  const labels = drawn.map((p) => clip(p.label, 22));
  const labelW = Math.min(190, Math.max(...labels.map((l) => wide(l, 12))) + 8);
  const valueW = Math.max(...rows.map((r) => Array.from(r[1]).length)) * CH + 10;
  const x0 = labelW;
  const x1 = W - valueW;
  const x = linear(0, tk.hi, x0, x1);

  const rowH = 24;
  const top = 6;
  const plotH = drawn.length * rowH;
  const axisY = top + plotH;
  const height = axisY + 20;

  const grid = tk.values
    .map((v) => (v === 0 ? "" : line(x(v), top, x(v), axisY, LINE_SUBTLE)))
    .join("");
  const axis =
    line(x0, top, x0, axisY, TEXT_MUTED) +
    tk.values.map((v) => t(x(v), axisY + 14, TEXT_MUTED, AX, i.format(v), "middle", true)).join("");

  const marks = drawn
    .map((p, n) => {
      const y = top + n * rowH;
      const v = Math.max(0, p.value ?? 0);
      // A row with no entity key is not an entity — it is an aggregate ("Rest of the field") — so it
      // takes the neutral, never hue 1, which the top-ranked party is already wearing (§24.5).
      const fill = p.key === undefined ? OTHERS : (hues.get(p.key) ?? OTHERS);
      const shown = labels[n] ?? "";
      return (
        t(0, y + rowH / 2 + 4, TEXT_SECONDARY, 12, shown) +
        `<path d="${barPath(x0, y + 5, x(v), 14)}" fill="${fill}"/>` +
        t(W - 2, y + rowH / 2 + 4, TEXT_PRIMARY, VAL, i.format(p.value), "end", true)
      );
    })
    .join("");

  return {
    svg: shell(height, i.title, i.finding, grid + axis + marks),
    fact: null,
    table: { caption: caption(i.title, i.finding), headers, rows: rows.map((r) => [...r]) },
  };
}

// ── 2. lines: a small multi-series time series ───────────────────────────────────────────────────

/**
 * §24.5, enforced: past three entity series the tail is SUMMED into one neutral "Others" series.
 * ponytail: the fold sums — correct for the only >3 case the floor has (party share over time, which
 * is additive). A non-additive fourth series must be faceted into a second chart, not folded.
 */
function fold(series: readonly Series[]): Series[] {
  if (series.length <= HUE_CAP) return series.slice();
  // Ranked on each series' PEAK within the window, which is the only figure comparable across
  // series: ranking on "the last value I can find" compares a 2011 share against a 2021 one, and
  // buried the 2011 winner of Mekliganj (48.9%) under a party whose last non-null value was itself
  // from 2011.
  const rank = (s: Series): number =>
    Math.max(-Infinity, ...s.values.filter((v): v is number => v !== null && v !== undefined));
  const ordered = series.slice().sort((a, b) => rank(b) - rank(a) || (a.key < b.key ? -1 : 1));
  const kept = ordered.slice(0, HUE_CAP);
  const tail = ordered.slice(HUE_CAP);
  const n = Math.max(...series.map((s) => s.values.length));
  const values = Array.from({ length: n }, (_, idx) => {
    let sum: number | null = null;
    for (const s of tail) {
      const v = s.values[idx];
      if (v !== null && v !== undefined) sum = (sum ?? 0) + v;
    }
    return sum;
  });
  return [...kept, { key: "others", label: `Others (${tail.length})`, values }];
}

export function lines(i: {
  title: string;
  finding: string;
  /** One label per x position — the four elections. */
  x: readonly string[];
  xHeader: string;
  series: readonly Series[];
  format: Fmt;
}): Chart {
  const drawnSeries = fold(i.series);
  const headers = [i.xHeader, ...drawnSeries.map((s) => s.label)];
  const rows = i.x.map((xl, idx) => [xl, ...drawnSeries.map((s) => i.format(s.values[idx] ?? null))]);
  const live = drawnSeries.flatMap((s) =>
    i.x.map((_, idx) => s.values[idx]).filter((v): v is number => v !== null && v !== undefined),
  );
  if (i.x.length === 0 || live.length === 0) return nothing(i.title, i.finding, headers, rows);

  const tk = ticks(Math.min(...live), Math.max(...live), 4);
  const hues = hueMap(drawnSeries.map((s) => s.key));

  const key = legend(drawnSeries.map((s) => ({ colour: hues.get(s.key) ?? CATEGORICAL[0], label: s.label })));
  // +24 so a direct label on the top tick keeps its ascender inside the viewBox.
  const top = key.height + 24;
  const plotH = 150;
  const bottom = top + plotH;
  const yTickW = Math.max(...tk.values.map((v) => Array.from(i.format(v)).length)) * CH + 8;
  const px0 = yTickW + 12;
  const px1 = W - 12;
  const y = linear(tk.lo, tk.hi, bottom, top);
  const xAt = (idx: number): number =>
    i.x.length === 1 ? (px0 + px1) / 2 : px0 + ((px1 - px0) * idx) / (i.x.length - 1);

  const grid = tk.values
    .map((v) => line(px0, y(v), px1, y(v), LINE_SUBTLE) + t(px0 - 8, y(v) + 4, TEXT_MUTED, AX, i.format(v), "end", true))
    .join("");
  // The end labels are anchored inward: a year centred on the last x position runs past the frame.
  const xAxis =
    line(px0, bottom, px1, bottom, TEXT_MUTED) +
    i.x
      .map((xl, idx) =>
        t(
          xAt(idx),
          bottom + 16,
          TEXT_MUTED,
          AX,
          clip(xl, 16),
          idx === 0 ? "start" : idx === i.x.length - 1 ? "end" : "middle",
          true,
        ),
      )
      .join("");

  const marks = drawnSeries
    .map((s) => {
      const colour = hues.get(s.key) ?? CATEGORICAL[0];
      const pts = i.x.map((_, idx) => {
        const v = s.values[idx];
        return v === null || v === undefined ? null : { x: xAt(idx), y: y(v), v, idx };
      });
      // Nulls break the line rather than bridging a gap the registry does not have.
      const segments: string[] = [];
      let run: { x: number; y: number }[] = [];
      for (const p of [...pts, null]) {
        if (p === null) {
          if (run.length >= 2) {
            segments.push(
              `<polyline points="${run.map((q) => `${num(q.x)},${num(q.y)}`).join(" ")}" fill="none"` +
                ` stroke="${colour}" stroke-width="2" stroke-linejoin="round"/>`,
            );
          }
          run = [];
        } else {
          run.push(p);
        }
      }
      const dots = pts.flatMap((p) => (p === null ? [] : [marker(p.x, p.y, colour)])).join("");
      return segments.join("") + dots;
    })
    .join("");

  // Direct labels are placed per x position across ALL series at once: three near-identical turnout
  // lines would otherwise stack three numerals on the same baseline.
  const wanted = drawnSeries.flatMap((s) => {
    const keep = labelIndices(i.x.map((_, idx) => s.values[idx] ?? null));
    return keep.flatMap((idx) => {
      const v = s.values[idx];
      return v === null || v === undefined ? [] : [{ idx, v, y0: y(v) - 10 }];
    });
  });
  const placedYs: number[] = [];
  const direct = [...new Set(wanted.map((p) => p.idx))]
    .flatMap((idx) => {
      const group = wanted.filter((p) => p.idx === idx);
      const at = spread(group.map((p) => p.y0));
      placedYs.push(...at);
      return group.map((p, n) =>
        t(
          xAt(idx),
          at[n] ?? p.y0,
          TEXT_PRIMARY,
          VAL,
          i.format(p.v),
          idx === 0 ? "start" : idx === i.x.length - 1 ? "end" : "middle",
          true,
        ),
      );
    })
    .join("");

  // spread() pushes down, so the frame grows to contain whatever it pushed.
  const height = Math.max(bottom + 22, ...placedYs.map((v) => v + 8));

  return {
    svg: shell(height, i.title, i.finding, grid + xAxis + marks + direct + key.svg),
    fact: null,
    table: { caption: caption(i.title, i.finding), headers, rows },
  };
}

// ── 3. slope: a two-point comparison ────────────────────────────────────────────────────────────

/**
 * Swing between consecutive elections. Colour encodes POLARITY (§24.6 diverging, grey at zero), not
 * identity — so the three-hue cap does not bind here and the row label carries the entity. The sign
 * is in the value text too: colour repeats direction, it never carries it alone (§27).
 */
export function slope(i: {
  title: string;
  finding: string;
  dimension: string;
  fromLabel: string;
  toLabel: string;
  rows: readonly SlopeRow[];
  format: Fmt;
  /** For the Change column — `percentagePoints`. */
  delta: Fmt;
}): Chart {
  const headers = [i.dimension, i.fromLabel, i.toLabel, "Change"];
  const table = i.rows.map((r) => [
    r.label,
    i.format(r.from),
    i.format(r.to),
    i.delta(r.from === null || r.to === null ? null : r.to - r.from),
  ]);
  const drawn = i.rows.filter((r): r is { label: string; from: number; to: number } =>
    r.from !== null && r.to !== null,
  );
  if (drawn.length === 0) return nothing(i.title, i.finding, headers, table);

  const all = drawn.flatMap((r) => [r.from, r.to]);
  const tk = ticks(Math.min(...all), Math.max(...all), 4);

  const labels = drawn.map((r) => clip(r.label, 20));
  const labelW = Math.min(170, Math.max(...labels.map((l) => wide(l, 12))) + 8);
  const valueW =
    Math.max(...table.flatMap((r) => [Array.from(r[1] ?? "").length, Array.from(r[2] ?? "").length])) * CH + 14;
  const xa = labelW + valueW;
  const xb = W - valueW;

  const dirs = new Set(drawn.map((r) => (r.to > r.from ? "up" : r.to < r.from ? "down" : "zero")));
  const key = legend(
    (["up", "down", "zero"] as const)
      .filter((d) => dirs.has(d))
      .map((d) => ({
        colour: DIVERGING[d],
        label: d === "up" ? "rose" : d === "down" ? "fell" : "unchanged",
      })),
  );
  const top = key.height + 20;
  const plotH = 150;
  const bottom = top + plotH;
  const y = linear(tk.lo, tk.hi, bottom, top);

  const axes =
    line(xa, top, xa, bottom, LINE_SUBTLE) +
    line(xb, top, xb, bottom, LINE_SUBTLE) +
    t(xa, bottom + 16, TEXT_MUTED, AX, clip(i.fromLabel, 16), "middle", true) +
    t(xb, bottom + 16, TEXT_MUTED, AX, clip(i.toLabel, 16), "middle", true);

  // Two parties within a point of each other at 2016 would stack their names and their values on one
  // baseline, so both text columns are de-overlapped independently of the marks they annotate.
  const leftText = spread(drawn.map((r) => y(r.from) + 4));
  const rightText = spread(drawn.map((r) => y(r.to) + 4));

  const marks = drawn
    .map((r, n) => {
      const dir = r.to > r.from ? "up" : r.to < r.from ? "down" : "zero";
      const colour = DIVERGING[dir];
      const ya = y(r.from);
      const yb = y(r.to);
      const la = leftText[n] ?? ya + 4;
      return (
        line(xa, ya, xb, yb, colour, 2) +
        marker(xa, ya, colour) +
        marker(xb, yb, colour) +
        t(0, la, TEXT_SECONDARY, 12, labels[n] ?? "") +
        t(xa - 10, la, TEXT_PRIMARY, VAL, i.format(r.from), "end", true) +
        t(xb + 10, rightText[n] ?? yb + 4, TEXT_PRIMARY, VAL, i.format(r.to), "start", true)
      );
    })
    .join("");

  const height = Math.max(bottom + 22, ...leftText.map((v) => v + 8), ...rightText.map((v) => v + 8));

  return {
    svg: shell(height, i.title, i.finding, axes + marks + key.svg),
    fact: null,
    table: { caption: caption(i.title, i.finding), headers, rows: table },
  };
}
