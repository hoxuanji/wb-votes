// Three charts, server-rendered, as strings. There is no client JS this cycle, so a chart is markup
// plus the rows of its table — and §27 makes the table the primary path, not a fallback: it is what a
// screen reader reads. Both come out of one call because a caller that can forget the table will.
//
// A chart's markup is the chart drawn once per FRAME (see FRAMES), and the stylesheet shows the one that fits
// the column. Type is authored at the size it is meant to be read, so a drawing 4× narrower or wider than
// the column would have to be redrawn, not scaled.
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
  ticks,
} from "./marks.ts";
import {
  crosses,
  labelWidth,
  overlaps,
  placeLabels,
  reach,
  type Box,
  type Disc,
  type Leader,
} from "./plot-labels.ts";
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
  /** The chart drawn once per FRAME: complete <svg>s, narrowest first. Empty string when `fact` is set. */
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

/**
 * The widths a chart is drawn at, one <svg> each, and the stylesheet shows the one nearest the figure's column
 * (`.iei-chart` in iei.css: below 460px, from 460px, from 760px). A single viewBox cannot do this: the column
 * runs from 336px on a phone to 1008px on a laptop, and a drawing scaled across that range reads 11px type at 4px
 * or 17px — the failure docs/product/visual-qa.md #15 recorded. Each frame is within about 30% of the width
 * of the column it serves, so its units are close to pixels and its type is close to the size it was written at.
 * `plotH` is the height of the plot area, which grows with the width so the lines keep their slope.
 */
const FRAMES = [
  { name: "narrow", w: 380, plotH: 160 },
  { name: "mid", w: 640, plotH: 180 },
  { name: "wide", w: 920, plotH: 220 },
] as const;
type Frame = (typeof FRAMES)[number];

/** IBM Plex Mono is the data face (§25); the generic stack is the fallback the page's CSS overrides. */
const NUM = "font-variant-numeric:tabular-nums;font-family:ui-monospace,SFMono-Regular,Menlo,monospace";
/** Mono advance at 12px. "A value that will hold 7 digits reserves 7 digits" is this times 7. */
const CH = 7.2;
const AX = 11; // axis / tick text
const VAL = 11; // direct value labels
const NAME = 12; // the series name in an end label
/** One line of an end label, which is what `placeLabels` keeps a name apart by. */
const LINE_H = 16;
/** Air between a marker and its end label (`placeLabels`' own) plus what the width estimate may be short by. */
const END_AIR = 20;
const TAG_GAP = 6;
/**
 * The step `placeLabels` slides a name by: finer than its half line, so names crowded at the foot of a plot can find
 * the gaps between each other.
 */
const SLIDE = 2;

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

function line(x1: number, y1: number, x2: number, y2: number, stroke: string, w = 1, cls = ""): string {
  return (
    `<line x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}" stroke="${stroke}" stroke-width="${w}"` +
    (cls === "" ? "" : ` class="${cls}"`) +
    `/>`
  );
}

/** §24.7: a 2px surface ring, so two markers landing on the same point stay two markers. */
function marker(x: number, y: number, fill: string): string {
  return `<circle cx="${num(x)}" cy="${num(y)}" r="4" fill="${fill}" stroke="${SURFACE}" stroke-width="2"/>`;
}

/**
 * What an end label is given: the name (the quiet 12px ink), a gap, and the value (the bright 11px mono). `labelWidth`
 * is the monospace advance, which is generous for a name in the page's proportional face and about right for the
 * capitals of an acronym; a name that overruns it is still inside the `END_AIR` the plot leaves.
 */
function tagWidth(name: string, value: string): number {
  return labelWidth(name, NAME) + TAG_GAP + labelWidth(value, VAL);
}

/**
 * How many characters of a name an end label may keep so that it, its value and the air round them take no more than
 * `share` of the frame: what is left of the column is the plot. The table carries the whole name.
 */
function nameFit(f: Frame, share: number, values: readonly string[]): number {
  const valueW = Math.max(0, ...values.map((v) => labelWidth(v, VAL)));
  return Math.max(4, Math.floor((share * f.w - END_AIR - TAG_GAP - valueW) / labelWidth("x", NAME)));
}

/**
 * The end of a line, named: the series name in the quiet ink and its value in the bright, text never wearing the series
 * colour (§24.7). `y` is the middle of the line it sits on (`PlacedLabel.y`); `valueFirst` puts the value next to the
 * line when the label is to the right of it. A halo in the surface colour keeps it readable across a rule or a line.
 */
function tag(name: string, value: string, x: number, y: number, anchor: "start" | "middle" | "end", valueFirst = false): string {
  const n = `<tspan fill="${TEXT_SECONDARY}" font-size="${NAME}"${valueFirst ? ` dx="${TAG_GAP}"` : ""}>${escapeXml(name)}</tspan>`;
  const v = `<tspan${valueFirst ? "" : ` dx="${TAG_GAP}"`} style="${NUM}">${escapeXml(value)}</tspan>`;
  return (
    `<text class="iei-tag" x="${num(x)}" y="${num(y + 4)}" fill="${TEXT_PRIMARY}" font-size="${VAL}"` +
    (anchor === "start" ? "" : ` text-anchor="${anchor}"`) +
    ` stroke="${SURFACE}" stroke-width="3" stroke-linejoin="round" paint-order="stroke">` +
    (valueFirst ? v + n : n + v) +
    `</text>`
  );
}

/** The year under an axis as a row of discs the size of its glyphs, so that an end label is not set down on it. */
function yearDiscs(x: number, text: string, anchor: "start" | "middle" | "end", baseline: number): Disc[] {
  const w = labelWidth(text, AX);
  const x0 = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
  const n = Math.ceil(w / 8);
  return Array.from({ length: n }, (_, k) => ({ x: x0 + ((k + 0.5) * w) / n, y: baseline - 4, r: 4.5 }));
}

/**
 * §24.7 + §27: a swatch carries identity, the text never wears the series colour. Rendered only for
 * ≥ 2 series; one series is named by the title.
 *
 * Wraps to a second row rather than running off the frame — three Bengali party names do not fit on
 * one 640px line — and reports its height so the plot can start below it.
 *
 * Only the swing chart has one now. A line chart names each line at its end (`tag`), and a key that said the same
 * would be read twice; a chart whose lines could not all be named there would need this back.
 */
function legend(items: readonly { colour: string; label: string }[], width: number): { svg: string; height: number } {
  if (items.length < 2) return { svg: "", height: 0 };
  let x = 0;
  let row = 0;
  let svg = "";
  for (const it of items) {
    const shown = clip(it.label, 22);
    const w = 32 + wide(shown, 12);
    if (x > 0 && x + w > width) {
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

function shell(f: Frame, height: number, title: string, finding: string, body: string): string {
  const label = finding.trim() ? `${title}. ${finding}` : title;
  // No `display` here: the stylesheet shows one frame and hides the others, and an inline `display` would win.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f.w} ${num(height)}" data-frame="${f.name}"` +
    ` preserveAspectRatio="xMinYMin meet" style="width:100%;height:auto"` +
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
  const draw = (f: Frame): string => {
    const x0 = labelW;
    const x1 = f.w - valueW;
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
          t(f.w - 2, y + rowH / 2 + 4, TEXT_PRIMARY, VAL, i.format(p.value), "end", true)
        );
      })
      .join("");
    return shell(f, height, i.title, i.finding, grid + axis + marks);
  };

  return {
    svg: FRAMES.map(draw).join(""),
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

  return {
    svg: FRAMES.map((f) => drawLines(f, i, drawnSeries, tk, hues)).join(""),
    fact: null,
    table: { caption: caption(i.title, i.finding), headers, rows },
  };
}

/** What a marker takes up: its radius and half of its ring. */
const MARKER_R = 5;
/** The height of the plot when there is no range to draw: room for four names, one to a line. */
const FLAT_H = 80;

/**
 * One frame of a line chart. Every line is named at its END, by `placeLabels`, in the margin the plot leaves on the
 * right; a line that stops before the last election (no vote counts for it) is named beside the place it stops, in
 * the empty part of the plot. Where several lines finish within a name's height of each other, the names fan out and
 * a leader line joins each to its marker. That is the key, so there is none: `fold` leaves at most four series, and
 * four names fit beside their lines at every width. With more than six they would not, and the key would come back.
 *
 * The point values along a line (first and extreme) stay only where they touch no name, marker, line or other value:
 * above the point if that is clear, else below it, else left to the table.
 */
function drawLines(
  f: Frame,
  i: { title: string; finding: string; x: readonly string[]; format: Fmt },
  series: readonly Series[],
  tk: { values: number[]; lo: number; hi: number },
  hues: Map<string, string>,
): string {
  // 24 so a direct label on the top tick keeps its ascender inside the viewBox.
  const top = 24;
  // One value, or all of them equal, is a line with no slope to read, so it gets a strip and not a frame to fill.
  const bottom = top + (tk.hi === tk.lo ? FLAT_H : f.plotH);
  const y = linear(tk.lo, tk.hi, bottom, top);

  // The end of a line is its last known point.
  const ends = series.map((s) => {
    for (let idx = i.x.length - 1; idx >= 0; idx -= 1) {
      const v = s.values[idx];
      if (v !== null && v !== undefined) return { idx, text: i.format(v) };
    }
    return null;
  });
  const keep = nameFit(f, 0.4, ends.flatMap((e) => (e === null ? [] : [e.text])));
  const names = series.map((s) => clip(s.label, keep));
  const widths = ends.map((e, n) => (e === null ? 0 : tagWidth(names[n] ?? "", e.text)));

  const yTickW = Math.max(...tk.values.map((v) => Array.from(i.format(v)).length)) * CH + 8;
  const px0 = yTickW + 12;
  // The plot ends where the widest name begins.
  const px1 = f.w - Math.max(...widths) - END_AIR;
  const xAt = (idx: number): number =>
    i.x.length === 1 ? (px0 + px1) / 2 : px0 + ((px1 - px0) * idx) / (i.x.length - 1);

  const grid = tk.values
    .map((v) => line(px0, y(v), px1, y(v), LINE_SUBTLE) + t(px0 - 8, y(v) + 4, TEXT_MUTED, AX, i.format(v), "end", true))
    .join("");
  // The end labels are anchored inward: a year centred on the last x position runs past the frame.
  const yearAnchor = (idx: number) => (idx === 0 ? "start" : idx === i.x.length - 1 ? "end" : "middle");
  const xAxis =
    line(px0, bottom, px1, bottom, TEXT_MUTED) +
    i.x.map((xl, idx) => t(xAt(idx), bottom + 16, TEXT_MUTED, AX, clip(xl, 16), yearAnchor(idx), true)).join("");

  const pts = series.map((s) =>
    i.x.map((_, idx) => {
      const v = s.values[idx];
      return v === null || v === undefined ? null : { x: xAt(idx), y: y(v), v, idx };
    }),
  );
  // Nulls break the line rather than bridging a gap the registry does not have.
  const runs = pts.map((ps) => {
    const out: { x: number; y: number }[][] = [];
    let run: { x: number; y: number }[] = [];
    for (const p of [...ps, null]) {
      if (p === null) {
        if (run.length >= 2) out.push(run);
        run = [];
      } else {
        run.push(p);
      }
    }
    return out;
  });
  const discs: Disc[] = pts.flatMap((ps) => ps.flatMap((p) => (p === null ? [] : [{ x: p.x, y: p.y, r: MARKER_R }])));
  const rules: Leader[] = runs.flatMap((rs) =>
    rs.flatMap((run) =>
      run.slice(1).map((q, n) => ({ x1: (run[n] as { x: number }).x, y1: (run[n] as { y: number }).y, x2: q.x, y2: q.y })),
    ),
  );

  // The names furthest from the middle of the plot are placed first: a name at the foot of the plot has nowhere to go but
  // up, and placed last it would have to leap over its neighbour's marker. Ties go to the earlier series, the subject.
  const { placed } = placeLabels(
    series.flatMap((s, n) => {
      const end = ends[n]?.idx;
      const p = end === undefined ? undefined : pts[n]?.[end];
      if (p === undefined || p === null) return [];
      const weight = Math.abs(p.y - (top + bottom) / 2) + (series.length - n) / 1000;
      return [{ x: p.x, y: p.y, r: MARKER_R, key: s.key, width: widths[n] ?? 0, weight, side: "start" as const }];
    }),
    [...discs, ...i.x.flatMap((xl, idx) => yearDiscs(xAt(idx), clip(xl, 16), yearAnchor(idx), bottom + 16))],
    { x0: px0, y0: top - 16, x1: f.w - 2, y1: bottom + 14 },
    LINE_H,
    rules,
    SLIDE,
  );

  const taken: Box[] = placed.map((p) => p.box);
  const values = series.map((s, n) => {
    let out = "";
    for (const idx of labelIndices(i.x.map((_, k) => s.values[k] ?? null))) {
      const p = pts[n]?.[idx];
      if (p === undefined || p === null || idx === ends[n]?.idx) continue;
      const text = i.format(p.v);
      const w = labelWidth(text, VAL);
      const x0 = idx === 0 ? p.x : p.x - w / 2;
      for (const base of [p.y - 10, p.y + 18]) {
        const box: Box = { x0, y0: base - 9, x1: x0 + w, y1: base + 3 };
        const clear =
          box.x0 >= 0 &&
          box.x1 <= f.w - 2 &&
          box.y0 >= 2 &&
          box.y1 <= bottom &&
          !taken.some((o) => overlaps(box, o, 4)) &&
          !discs.some((d) => reach(d.x, d.y, box) < d.r + 1) &&
          !rules.some((r) => crosses(r, box));
        if (!clear) continue;
        taken.push(box);
        out += t(p.x, base, TEXT_PRIMARY, VAL, text, idx === 0 ? "start" : "middle", true);
        break;
      }
    }
    return out;
  });

  // One group per line, so that hovering the line or its name (iei.css) can pick it out and dim the rest.
  const groups = series.map((s, n) => {
    const colour = hues.get(s.key) ?? CATEGORICAL[0];
    const own = placed.find((p) => p.key === s.key);
    return (
      `<g class="iei-line">` +
      (runs[n] ?? [])
        .map((run) => {
          const d = run.map((q) => `${num(q.x)},${num(q.y)}`).join(" ");
          return (
            `<polyline points="${d}" fill="none" stroke="transparent" stroke-width="14" class="iei-line-hit"/>` +
            `<polyline points="${d}" fill="none" stroke="${colour}" stroke-width="2" stroke-linejoin="round" class="iei-line-ink"/>`
          );
        })
        .join("") +
      (own?.leader == null ? "" : line(own.leader.x1, own.leader.y1, own.leader.x2, own.leader.y2, colour, 1, "iei-line-lead")) +
      (pts[n] ?? []).flatMap((p) => (p === null ? [] : [marker(p.x, p.y, colour)])).join("") +
      (own === undefined ? "" : tag(names[n] ?? "", ends[n]?.text ?? "", own.x, own.y, own.anchor)) +
      (values[n] ?? "") +
      `</g>`
    );
  });

  // The first series is drawn last, so the seat is never under its comparisons.
  return shell(f, bottom + 22, i.title, i.finding, grid + xAxis + groups.reverse().join(""));
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

  return {
    svg: FRAMES.map((f) => drawSlope(f, i, drawn, tk)).join(""),
    fact: null,
    table: { caption: caption(i.title, i.finding), headers, rows: table },
  };
}

/**
 * One frame of a swing chart. Both ends of every row are named, the earlier to the left of its line (name, then value)
 * and the later to the right (value, then name), each column placed by `placeLabels` on its own: two parties within a
 * point of each other at 2016 would stack their names on one baseline, so they fan out with a leader line instead.
 * The polarity key stays: it says what the colours mean, which no name does.
 */
function drawSlope(
  f: Frame,
  i: { title: string; finding: string; fromLabel: string; toLabel: string; format: Fmt },
  drawn: readonly { label: string; from: number; to: number }[],
  tk: { values: number[]; lo: number; hi: number },
): string {
  const before = drawn.map((r) => i.format(r.from));
  const after = drawn.map((r) => i.format(r.to));
  const keep = nameFit(f, 0.32, [...before, ...after]);
  const names = drawn.map((r) => clip(r.label, keep));
  const leftW = names.map((n, k) => tagWidth(n, before[k] ?? ""));
  const rightW = names.map((n, k) => tagWidth(n, after[k] ?? ""));
  const xa = Math.max(...leftW) + END_AIR;
  const xb = f.w - Math.max(...rightW) - END_AIR;

  const dirs = new Set(drawn.map((r) => (r.to > r.from ? "up" : r.to < r.from ? "down" : "zero")));
  const key = legend(
    (["up", "down", "zero"] as const)
      .filter((d) => dirs.has(d))
      .map((d) => ({
        colour: DIVERGING[d],
        label: d === "up" ? "rose" : d === "down" ? "fell" : "unchanged",
      })),
    f.w,
  );
  const top = key.height + 20;
  // Every name needs a line of its own with some to spare, so a long list of parties makes the plot taller.
  const plotH = Math.max(f.plotH, drawn.length * 24);
  const bottom = top + plotH;
  const y = linear(tk.lo, tk.hi, bottom, top);

  const [from, to] = [clip(i.fromLabel, 16), clip(i.toLabel, 16)];
  const axes =
    line(xa, top, xa, bottom, LINE_SUBTLE) +
    line(xb, top, xb, bottom, LINE_SUBTLE) +
    t(xa, bottom + 16, TEXT_MUTED, AX, from, "middle", true) +
    t(xb, bottom + 16, TEXT_MUTED, AX, to, "middle", true);

  // Each column of names is placed against its own column of markers, the earlier names left of the line and the later
  // right of it, those furthest from the middle first (see `drawLines`).
  const column = (
    x: number,
    side: "start" | "end",
    ys: readonly number[],
    widths: readonly number[],
    year: readonly Disc[],
    frame: Box,
  ) =>
    placeLabels(
      ys.map((yy, k) => {
        const weight = Math.abs(yy - (top + bottom) / 2);
        return { x, y: yy, r: MARKER_R, key: String(k), width: widths[k] ?? 0, weight, side };
      }),
      [...ys.map((yy) => ({ x, y: yy, r: MARKER_R })), ...year],
      frame,
      LINE_H,
      [],
      SLIDE,
    ).placed;
  const [y0, y1] = [top - 16, bottom + 14];
  const left = column(xa, "end", drawn.map((r) => y(r.from)), leftW, yearDiscs(xa, from, "middle", bottom + 16), {
    x0: 2,
    y0,
    x1: xa - 6,
    y1,
  });
  const right = column(xb, "start", drawn.map((r) => y(r.to)), rightW, yearDiscs(xb, to, "middle", bottom + 16), {
    x0: xb + 6,
    y0,
    x1: f.w - 2,
    y1,
  });

  const marks = drawn
    .map((r, n) => {
      const colour = DIVERGING[r.to > r.from ? "up" : r.to < r.from ? "down" : "zero"];
      const ya = y(r.from);
      const yb = y(r.to);
      const l = left.find((p) => p.key === String(n));
      const rt = right.find((p) => p.key === String(n));
      const lead = (p: typeof l) =>
        p?.leader == null ? "" : line(p.leader.x1, p.leader.y1, p.leader.x2, p.leader.y2, colour, 1, "iei-line-lead");
      return (
        `<g class="iei-line">` +
        `<line x1="${num(xa)}" y1="${num(ya)}" x2="${num(xb)}" y2="${num(yb)}" stroke="transparent" stroke-width="14" class="iei-line-hit"/>` +
        line(xa, ya, xb, yb, colour, 2, "iei-line-ink") +
        lead(l) +
        lead(rt) +
        marker(xa, ya, colour) +
        marker(xb, yb, colour) +
        (l === undefined ? "" : tag(names[n] ?? "", before[n] ?? "", l.x, l.y, l.anchor)) +
        (rt === undefined ? "" : tag(names[n] ?? "", after[n] ?? "", rt.x, rt.y, rt.anchor, true)) +
        `</g>`
      );
    })
    .join("");

  return shell(f, bottom + 22, i.title, i.finding, axes + marks + key.svg);
}
