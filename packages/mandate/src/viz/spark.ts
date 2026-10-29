// The geometry of a small trend line, as numbers and nothing else: where each dot sits, which neighbours a solid line joins, and where a
// dashed stub reaches a figure that was declared and not counted. Pure, no I/O, no markup; the component draws what this returns.
//
// WHAT THE LINE MAY SAY, held by the tests: a solid line joins only COUNTED points that sit next to each other; a DECLARED point is a hollow ring
// reached by a dashed stub, because nothing is counted behind it; a point with NO VALUE is a gap with its label and never a mark on the baseline,
// which would read as zero; nothing is interpolated across a gap; and a line of fewer than MIN_POINTS valued points is not drawn at all, because
// two points are a difference and not a trend.

export const MIN_POINTS = 3;

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
  gaps: { x: number; label: string }[];
  /** Every point's x and label, for the year ticks under the line. */
  ticks: { x: number; label: string }[];
  /** The y of the baseline: the bottom of the plotted area. */
  baseline: number;
};

const PAD_X = 20;
const PAD_TOP = 14;
const PAD_BOTTOM = 22;

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
      gaps.push({ x: x(k), label: p.label });
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
    ticks: points.map((p, k) => ({ x: x(k), label: p.label })),
  };
}
