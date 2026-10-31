// The geometry of a small trend line, as numbers and nothing else: where each dot sits, which neighbours a solid line joins, and where a
// dashed stub reaches a figure that was declared and not counted. Pure, no I/O, no markup; the component draws what this returns.
//
// WHAT THE LINE MAY SAY, held by the tests: a solid line joins only COUNTED points that sit next to each other; a DECLARED point is a hollow ring
// reached by a dashed stub, because nothing is counted behind it; a point with NO VALUE is a gap with its label and never a mark on the baseline,
// which would read as zero; nothing is interpolated across a gap; and a line of fewer than MIN_POINTS valued points is not drawn at all, because
// two points are a difference and not a trend.
//
// THE LABELS ARE NOT DRAWN IN THE SVG. The line is drawn in a frame of `width` units that scales with its tile, so type set inside it scales
// too: at 11px in the frame it rendered at 7.5px to 11.5px at 1440 and 8.2px at 390. The component puts the labels in HTML over the picture,
// at the percentages this gives, so they keep the type token's size; and since type that keeps its size does not shrink with the picture, this
// decides which labels fit: a year label that would touch its neighbour at the narrowest the line is drawn is dropped (the newest is kept,
// then every second or third before it), and so is the word "no figure" where it would run over the neighbouring dots. Every point keeps its dot,
// its title and its place in the table beside the line; only the label is dropped.

export const MIN_POINTS = 3;

/** The narrowest a line is drawn, in CSS px: a phone about 330px wide, less the padding of its card and its tile. Labels are fitted to this. */
export const NARROWEST_PX = 240;
/** What an 11px mono label needs: four digits of a year, nine characters of "no figure", and the air between two labels. */
export const YEAR_PX = 27;
export const WORD_PX = 60;
export const AIR_PX = 8;

export type SparkPoint = {
  label: string;
  value: number | null;
  /** How the value was arrived at: counted from votes, or declared by the source with nothing behind it. */
  basis: "counted" | "declared";
  /** The key the dot is inked by (a party's key), or null for the neutral ink. */
  key: string | null;
  /** The hover text and the accessible name of the dot. */
  tip: string;
};

export type SparkDot = { x: number; y: number; basis: "counted" | "declared"; key: string | null; tip: string; label: string; value: number };

export type Spark = {
  width: number;
  height: number;
  /** False when fewer than MIN_POINTS have a value: `fact` then says so and nothing is drawn. */
  enough: boolean;
  fact: string | null;
  /** SVG path data of each solid run (two or more counted points, adjacent). */
  runs: string[];
  /** SVG path data of each dashed stub, from the valued point just before a declared one to it. */
  stubs: string[];
  dots: SparkDot[];
  gaps: { x: number; label: string; /** The word "no figure" fits beside the gap's line. */ word: boolean }[];
  /** Every point's x and label, for the year ticks under the line; `show` is false for a label that would touch its neighbour. */
  ticks: { x: number; label: string; show: boolean }[];
  /** The y of the baseline: the bottom of the plotted area. */
  baseline: number;
};

const PAD_X = 20;
const PAD_TOP = 14;
// The year row under the baseline is 28 units tall (it was 22 for 11-unit type that scaled with the frame). The years are 11px type now and the
// frame is drawn at 0.6 to 1.05 of its units, so at 0.6 the row is 16.8px: 11px of label and about 6px between it and the baseline.
const PAD_BOTTOM = 28;

const r1 = (n: number): number => Math.round(n * 10) / 10;

export function sparkline(i: { width: number; height: number; zero: boolean; points: readonly SparkPoint[] }): Spark {
  const { width, height, points } = i;
  const valued = points.filter((p) => p.value !== null);
  const base = { width, height, runs: [], stubs: [], dots: [], gaps: [], ticks: [], baseline: height - PAD_BOTTOM };
  if (valued.length < MIN_POINTS) {
    return { ...base, enough: false, fact: `${valued.length} of ${points.length} elections have a figure, so no trend is drawn.` };
  }
  const values = valued.map((p) => p.value as number);
  const lo = i.zero ? Math.min(0, ...values) : Math.min(...values);
  const hi = Math.max(...values);
  const top = PAD_TOP;
  const bottom = height - PAD_BOTTOM;
  const y = (v: number): number => (hi === lo ? (top + bottom) / 2 : r1(bottom - ((v - lo) / (hi - lo)) * (bottom - top)));
  const step = points.length > 1 ? (width - 2 * PAD_X) / (points.length - 1) : 0;
  const x = (k: number): number => r1(PAD_X + k * step);
  // How far apart two neighbouring points are at the narrowest the line is drawn, in CSS px, and so which labels fit.
  const pitch = (step * NARROWEST_PX) / width;
  const stride = pitch > 0 ? Math.max(1, Math.ceil((YEAR_PX + AIR_PX) / pitch)) : 1;
  const wordFits = pitch >= WORD_PX + AIR_PX;

  const dots: SparkDot[] = [];
  const gaps: Spark["gaps"] = [];
  const runs: string[] = [];
  const stubs: string[] = [];
  let run: string[] = [];
  const flush = (): void => {
    if (run.length >= 2) runs.push(`M${run.join("L")}`);
    run = [];
  };
  points.forEach((p, k) => {
    if (p.value === null) {
      flush();
      gaps.push({ x: x(k), label: p.label, word: wordFits });
      return;
    }
    const px = x(k);
    const py = y(p.value);
    dots.push({ x: px, y: py, basis: p.basis, key: p.key, tip: p.tip, label: p.label, value: p.value });
    if (p.basis === "counted") {
      run.push(`${px} ${py}`);
      return;
    }
    // A declared point ends any solid run, and is reached by a dashed stub from the point just before it when that one has a value.
    flush();
    const before = points[k - 1];
    if (before !== undefined && before.value !== null) stubs.push(`M${x(k - 1)} ${y(before.value)}L${px} ${py}`);
  });
  flush();
  return {
    ...base,
    enough: true,
    fact: null,
    runs,
    stubs,
    dots,
    gaps,
    ticks: points.map((p, k) => ({ x: x(k), label: p.label, show: (points.length - 1 - k) % stride === 0 })),
  };
}
