// Where the lines of the Analysis charts end, and what is printed there: each line is named and valued at its end, in
// a frame as wide as its column, and no two names touch.
//
// WHAT WAS WRONG. Charts were 640 units wide whatever the column, so in a 1008px column they were drawn at 640px; and
// the values at the end of three turnout lines that finish within three points of each other (Mekliganj 2026: 96.6,
// 96.4, 93.0) were printed over one another, with a legend above to say which line was which. Now the name is at the
// end of the line, `viz/plot-labels.ts` places it, and the legend is gone.
//
// The claims below hold of ANY layout, so each is also swept over seeded random charts: every line that has a known
// point has its name and value, no two names (or a name and a point value) overlap, none covers a marker, none leaves
// its frame. The widths are estimates, as the code's are; ops measures the real ones in a browser.

import assert from "node:assert/strict";
import test from "node:test";
import { percent, percentagePoints } from "../semantic/index.ts";
import { lines, slope } from "./charts.ts";
import { CATEGORICAL, LINE_SUBTLE, TEXT_PRIMARY, TEXT_SECONDARY } from "./palette.ts";

const FRAMES = [
  { name: "narrow", w: 380 },
  { name: "mid", w: 640 },
  { name: "wide", w: 920 },
] as const;

/** One frame of a chart's markup, whole. */
function frame(svg: string, name: string): string {
  const m = new RegExp(`<svg [^>]*data-frame="${name}"[\\s\\S]*?</svg>`).exec(svg);
  assert.ok(m !== null, `no ${name} frame`);
  return m[0];
}

const attr = (tag: string, name: string): string | undefined => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];

type Box = { x0: number; y0: number; x1: number; y1: number };
type Tag = { name: string; value: string; text: string; x: number; y: number; anchor: string; box: Box };

/** A name's box, estimated (7.2 per glyph at 12px, 6.8 at 11px: a little under what the code reserves) and a line tall. */
function boxOf(x: number, y: number, anchor: string, width: number, height = 16): Box {
  const x0 = anchor === "end" ? x - width : anchor === "middle" ? x - width / 2 : x;
  return { x0, y0: y - 4 - height / 2, x1: x0 + width, y1: y - 4 + height / 2 };
}

/** The end labels of one frame: the name and the value, whichever way round, and where they sit. */
function tags(svg: string): Tag[] {
  return [...svg.matchAll(/<text ([^>]*class="iei-tag"[^>]*)>(.*?)<\/text>/g)].map((m) => {
    const spans = [...(m[2] as string).matchAll(/<tspan ([^>]*)>([^<]*)<\/tspan>/g)];
    const named = spans.find((s) => (s[1] as string).includes(`fill="${TEXT_SECONDARY}"`));
    const other = spans.find((s) => s !== named);
    const name = named?.[2] as string;
    const value = other?.[2] as string;
    const x = Number(attr(m[1] as string, "x"));
    const y = Number(attr(m[1] as string, "y"));
    const anchor = attr(m[1] as string, "text-anchor") ?? "start";
    return {
      name,
      value,
      text: spans.map((s) => s[2]).join(" "),
      x,
      y,
      anchor,
      box: boxOf(x, y, anchor, [...name].length * 7.2 + 6 + [...value].length * 6.8),
    };
  });
}

/** The point values printed along the lines, which are not end labels: a glyph box from 9 above the baseline to 3 below. */
function pointValues(svg: string): Box[] {
  return [...svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)" fill="#f2f2f7" font-size="11"( text-anchor="(\w+)")?[^>]*>([^<]*)<\/text>/g)].map(
    (m) => {
      const w = [...(m[5] as string)].length * 6.8;
      const x0 = m[4] === "middle" ? Number(m[1]) - w / 2 : Number(m[1]);
      return { x0, y0: Number(m[2]) - 9, x1: x0 + w, y1: Number(m[2]) + 3 };
    },
  );
}

const circles = (svg: string) =>
  [...svg.matchAll(/<circle ([^>]*)>/g)].map((m) => ({
    x: Number(attr(m[1] as string, "cx")),
    y: Number(attr(m[1] as string, "cy")),
    r: Number(attr(m[1] as string, "r")),
    fill: attr(m[1] as string, "fill") as string,
  }));

const leaders = (svg: string) =>
  [...svg.matchAll(/<line ([^>]*class="iei-line-lead"[^>]*)>/g)].map((m) => ({
    x1: Number(attr(m[1] as string, "x1")),
    y1: Number(attr(m[1] as string, "y1")),
    x2: Number(attr(m[1] as string, "x2")),
    y2: Number(attr(m[1] as string, "y2")),
    stroke: attr(m[1] as string, "stroke") as string,
  }));

const groups = (svg: string) => svg.split('<g class="iei-line">').slice(1).map((g) => g.slice(0, g.indexOf("</g>")));

const size = (svg: string) => {
  const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  return { w: Number(m?.[1]), h: Number(m?.[2]) };
};

/** Coordinates are printed to two decimals, so two boxes a line apart may meet by a hundredth. */
const EPS = 0.02;
const apart = (a: Box, b: Box) => a.x1 <= b.x0 + EPS || b.x1 <= a.x0 + EPS || a.y1 <= b.y0 + EPS || b.y1 <= a.y0 + EPS;
const reach = (b: Box, x: number, y: number) => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.y0 - y, 0, y - b.y1));

/** Every claim about where names may be, on one frame of one chart. */
function assertLegible(svg: string, label: string): void {
  const { w, h } = size(svg);
  const named = tags(svg);
  const values = pointValues(svg);
  const dots = circles(svg);
  const all = [...named.map((t) => ({ what: `name "${t.text}"`, box: t.box })), ...values.map((box, n) => ({ what: `value ${n}`, box }))];
  for (const a of all) {
    assert.ok(a.box.x0 >= 0 && a.box.x1 <= w && a.box.y0 >= 0 && a.box.y1 <= h, `${label}: ${a.what} leaves the ${w}x${h} frame`);
    for (const d of dots) assert.ok(reach(a.box, d.x, d.y) >= d.r - 1, `${label}: ${a.what} covers the marker at ${d.x},${d.y}`);
  }
  for (let i = 0; i < all.length; i += 1) {
    for (let j = i + 1; j < all.length; j += 1) {
      assert.ok(apart((all[i] as (typeof all)[number]).box, (all[j] as (typeof all)[number]).box), `${label}: ${(all[i] as (typeof all)[number]).what} and ${(all[j] as (typeof all)[number]).what} overprint`);
    }
  }
}

// ── the case that was broken ─────────────────────────────────────────────────────────────────────

const ELECTIONS = ["2011", "2016", "2021", "2026"];

/** Mekliganj's turnout as the registry has it: the seat, its district and the state finish within three points. */
const TURNOUT = {
  title: "Turnout, seat against district and state",
  finding: "2026: 96.6% here against 96.4% in Cooch Behar (+0.2 pp).",
  x: ELECTIONS,
  xHeader: "Election",
  series: [
    { key: "seat", label: "Mekliganj", values: [86.6, 89.3, 87.8, 96.6] },
    { key: "district", label: "Cooch Behar", values: [86.0, 86.4, 85.6, 96.4] },
    { key: "state", label: "West Bengal", values: [84.7, 83.0, 82.2, 93.0] },
  ],
  format: percent,
};

test("a chart is drawn once per column width: three frames, narrow to wide, each with its own viewBox", () => {
  const svg = lines(TURNOUT).svg;
  assert.deepEqual(
    [...svg.matchAll(/<svg [^>]*data-frame="(\w+)"[^>]*viewBox="0 0 (\d+) [\d.]+"|<svg [^>]*viewBox="0 0 (\d+) [\d.]+"[^>]*data-frame="(\w+)"/g)].map(
      (m) => [m[1] ?? m[4], Number(m[2] ?? m[3])],
    ),
    FRAMES.map((f) => [f.name, f.w]),
  );
  assert.equal((svg.match(/<svg /g) ?? []).length, 3);
  assert.equal((svg.match(/role="img"/g) ?? []).length, 3, "each frame is named, so whichever one shows is");
});

test("Mekliganj turnout: each line is named and valued at its end, in every frame", () => {
  const svg = lines(TURNOUT).svg;
  for (const f of FRAMES) {
    const named = tags(frame(svg, f.name));
    assert.deepEqual(
      named.map((t) => t.text).sort(),
      ["Cooch Behar 96.4%", "Mekliganj 96.6%", "West Bengal 93.0%"],
      `${f.name}: the three names, each with its 2026 value`,
    );
    assertLegible(frame(svg, f.name), f.name);
  }
});

test("Mekliganj turnout: two lines two tenths apart fan out, and a leader joins each name to its own marker", () => {
  const wide = frame(lines(TURNOUT).svg, "wide");
  const named = tags(wide);
  const ys = named.map((t) => t.y).sort((a, b) => a - b);
  for (let n = 1; n < ys.length; n += 1) assert.ok((ys[n] as number) - (ys[n - 1] as number) >= 15.99, "names are a full line apart");
  // 2026 is the last of four positions, so every end marker is at the right edge of the plot
  const ends = circles(wide).filter((c) => c.x === Math.max(...circles(wide).map((d) => d.x)));
  assert.equal(ends.length, 3);
  const lead = leaders(wide);
  assert.ok(lead.length >= 1, "a name that cannot sit beside its marker has a leader line");
  for (const l of lead) {
    const own = ends.find((c) => c.fill === l.stroke);
    assert.ok(own !== undefined, "a leader is drawn in its own line's colour");
    assert.ok(Math.abs(Math.hypot(l.x1 - own.x, l.y1 - own.y) - (own.r + 1 + 1)) < 1.01, "and starts at its own marker's edge");
    assert.ok(
      named.some((t) => reach(t.box, l.x2, l.y2) <= 2),
      "and ends at a name",
    );
  }
});

test("no data point moved: every marker is where the old chart put it, as a fraction of the plot", () => {
  // The ticks for 82.2..96.6 are 80..100 by 5. The old chart put the 2011 point of the seat at 3.3/20 of the way up and
  // 0 of the way across, and the 2026 point at 16.6/20 and all the way across, in whatever frame it drew.
  const want = [
    ...[86.6, 89.3, 87.8, 96.6].map((v, n) => [n / 3, (v - 80) / 20]),
    ...[86.0, 86.4, 85.6, 96.4].map((v, n) => [n / 3, (v - 80) / 20]),
    ...[84.7, 83.0, 82.2, 93.0].map((v, n) => [n / 3, (v - 80) / 20]),
  ];
  for (const f of FRAMES) {
    const svg = frame(lines(TURNOUT).svg, f.name);
    const grid = [...svg.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="[\d.]+" stroke="#1e1e28"/g)].map((m) => ({
      x0: Number(m[1]),
      x1: Number(m[3]),
      y: Number(m[2]),
    }));
    assert.equal(grid.length, 5, `${f.name}: a grid line at each of 80, 85, 90, 95, 100`);
    const [bottom, top] = [grid[0] as (typeof grid)[number], grid[4] as (typeof grid)[number]];
    const got = circles(svg).map((c) => [(c.x - bottom.x0) / (bottom.x1 - bottom.x0), (bottom.y - c.y) / (bottom.y - top.y)]);
    assert.equal(got.length, want.length);
    // The groups are drawn last series first, so compare as sets.
    const key = (p: number[]) => `${(p[0] as number).toFixed(3)},${(p[1] as number).toFixed(3)}`;
    assert.deepEqual(got.map(key).sort(), want.map(key).sort(), `${f.name}: a marker moved`);
  }
});

test("a chart with end names has no legend", () => {
  const svg = lines(TURNOUT).svg;
  assert.ok(!svg.includes("<rect"), "no swatch: the names are on the lines");
  assert.equal(
    [...svg.matchAll(/>West Bengal</g)].length,
    3,
    "and a name is printed once per frame, at its line's end, not again in a key",
  );
});

test("each line, its markers, its leader and its name are one group, so hovering any of them can pick the line out", () => {
  const wide = frame(lines(TURNOUT).svg, "wide");
  const g = groups(wide);
  assert.equal(g.length, 3);
  // the first series is drawn last, so that the seat is never under its comparisons
  assert.ok((g[2] as string).includes(`stroke="${CATEGORICAL[0]}" stroke-width="2"`));
  for (const one of g) {
    assert.equal((one.match(/class="iei-line-ink"/g) ?? []).length, 1, "its line");
    assert.equal((one.match(/class="iei-line-hit"/g) ?? []).length, 1, "and a wider invisible one to hover");
    assert.equal((one.match(/<circle /g) ?? []).length, 4);
    assert.equal((one.match(/class="iei-tag"/g) ?? []).length, 1, "and its one name");
  }
  assert.match(wide, /class="iei-line-hit"[^>]*stroke="transparent"|stroke="transparent"[^>]*class="iei-line-hit"/);
});

test("the point values along a line stay only where they touch no name, marker, line or other value", () => {
  for (const f of FRAMES) {
    const svg = frame(lines(TURNOUT).svg, f.name);
    // 2011 has three values within two points, and every value is on a line: not all of them can be printed.
    const kept = pointValues(svg);
    assert.ok(kept.length >= 1 && kept.length < 9, `${f.name}: some values dropped, some kept (${kept.length})`);
    assertLegible(svg, f.name);
  }
});

// ── the states batch 1 made read well ────────────────────────────────────────────────────────────

test("one election, one point: the name is beside it and inside the frame", () => {
  const one = lines({
    title: "Margin",
    finding: "2024: 8.0% of votes cast.",
    x: ["2024"],
    xHeader: "Election",
    series: [{ key: "margin", label: "Margin", values: [8.0] }],
    format: percent,
  });
  for (const f of FRAMES) {
    const svg = frame(one.svg, f.name);
    assert.deepEqual(tags(svg).map((t) => t.text), ["Margin 8.0%"]);
    assert.equal(circles(svg).length, 1);
    assert.equal(leaders(svg).length, 0, "beside its marker, so nothing to join");
    assertLegible(svg, f.name);
  }
});

test("a chart with no range to draw is a strip, not a frame to fill, in every frame", () => {
  // The margin of a seat with one election on record: one value, so every gridline and the line itself are one height.
  const flat = lines({
    title: "Margin",
    finding: "2026: 14.8%.",
    x: ELECTIONS,
    xHeader: "Election",
    series: [{ key: "margin", label: "Margin", values: [null, null, null, 14.8] }],
    format: percent,
  });
  const ranged = lines({
    title: "Margin",
    finding: "x",
    x: ELECTIONS,
    xHeader: "Election",
    series: [{ key: "margin", label: "Margin", values: [20, 10, 12, 14.8] }],
    format: percent,
  });
  for (const f of FRAMES) {
    const [a, b] = [size(frame(flat.svg, f.name)).h, size(frame(ranged.svg, f.name)).h];
    assert.ok(a < b / 1.5, `${f.name}: ${a} against ${b}`);
    assert.deepEqual(tags(frame(flat.svg, f.name)).map((t) => t.text), ["Margin 14.8%"]);
    assertLegible(frame(flat.svg, f.name), f.name);
  }
});

test("a line that stops before the last election is named where it stops", () => {
  // The share chart of a seat whose newest election has no vote counts: every line ends at 2021, in the third of four
  // places, and the fourth is empty.
  const c = lines({
    title: "Vote share by party",
    finding: "TMC took 50.0% in 2021.",
    x: ELECTIONS,
    xHeader: "Election",
    series: [
      { key: "TMC", label: "TMC", values: [null, 41.3, 50.0, null] },
      { key: "AIFB", label: "AIFB", values: [48.9, 37.7, 3.4, null] },
      { key: "BJP", label: "BJP", values: [null, 12.9, 42.6, null] },
    ],
    format: percent,
  });
  for (const f of FRAMES) {
    const svg = frame(c.svg, f.name);
    const named = tags(svg);
    assert.deepEqual(named.map((t) => t.text).sort(), ["AIFB 3.4%", "BJP 42.6%", "TMC 50.0%"]);
    const third = Math.max(...circles(svg).map((d) => d.x));
    const px1 = Math.max(...[...svg.matchAll(/<line x1="[\d.]+" y1="[\d.]+" x2="([\d.]+)" y2="[\d.]+" stroke="#1e1e28"/g)].map((m) => Number(m[1])));
    assert.ok(third < px1, `${f.name}: the lines end short of the right edge of the plot`);
    for (const t of named) assert.ok(t.box.x0 >= third, `${f.name}: ${t.text} is to the right of where its line ends, not over the lines`);
    assertLegible(svg, f.name);
  }
});

test("a series with nothing to draw has no name on the chart, and its column stays in the table", () => {
  const c = lines({
    title: "Vote share",
    finding: "x",
    x: ["2016", "2021"],
    xHeader: "Election",
    series: [
      { key: "a", label: "AITC", values: [45, 48] },
      { key: "b", label: "NOTA", values: [null, null] },
    ],
    format: percent,
  });
  assert.deepEqual(tags(frame(c.svg, "wide")).map((t) => t.text), ["AITC 48.0%"]);
  assert.deepEqual(c.table.headers, ["Election", "AITC", "NOTA"]);
});

test("a chart with nothing to draw is still one line of fact, with no frame", () => {
  const c = lines({ title: "Turnout", finding: "No turnout on record.", x: ["2024"], xHeader: "Election", series: [{ key: "a", label: "A", values: [null] }], format: percent });
  assert.equal(c.svg, "");
  assert.equal(c.fact, "No turnout on record.");
});

// ── the swing slopegraphs ────────────────────────────────────────────────────────────────────────

const delta = percentagePoints;
/** Mekliganj 2011 to 2016: BJP and BSP both started within two tenths of each other and ended apart. */
const SWING = {
  title: "Vote share, 2011 to 2016",
  finding: "AIFB swung −11.2 pp.",
  dimension: "Party",
  fromLabel: "2011",
  toLabel: "2016",
  rows: [
    { label: "TMC", from: null, to: 41.3 },
    { label: "AIFB", from: 48.9, to: 37.7 },
    { label: "BJP", from: 2.5, to: 12.9 },
    { label: "BSP", from: 2.3, to: 3.1 },
    { label: "SUCI(C)", from: null, to: 1.2 },
  ],
  format: percent,
  delta,
};

test("a swing is named and valued at both its ends, the earlier one to the left of its line and the later to the right", () => {
  const svg = slope(SWING).svg;
  for (const f of FRAMES) {
    const one = frame(svg, f.name);
    const named = tags(one);
    assert.deepEqual(
      named.filter((t) => t.anchor === "end").map((t) => t.text).sort(),
      ["AIFB 48.9%", "BJP 2.5%", "BSP 2.3%"],
      `${f.name}: left ends read name then value`,
    );
    assert.deepEqual(
      named.filter((t) => t.anchor === "start").map((t) => t.text).sort(),
      ["12.9% BJP", "3.1% BSP", "37.7% AIFB"].sort(),
      `${f.name}: right ends read value then name`,
    );
    assertLegible(one, f.name);
    const g = groups(one);
    assert.equal(g.length, 3, "a group per drawn row");
    for (const row of g) {
      assert.equal((row.match(/<circle /g) ?? []).length, 2);
      assert.equal((row.match(/class="iei-tag"/g) ?? []).length, 2, "both its names");
    }
  }
});

test("two parties 0.2 apart at the start have their names fanned out, each with a leader to its own marker", () => {
  const wide = frame(slope(SWING).svg, "wide");
  const left = tags(wide).filter((t) => t.anchor === "end");
  const ys = left.map((t) => t.y).sort((a, b) => a - b);
  for (let n = 1; n < ys.length; n += 1) assert.ok((ys[n] as number) - (ys[n - 1] as number) >= 15.99);
  assert.ok(leaders(wide).length >= 1);
  for (const row of groups(wide)) {
    const dots = circles(row);
    for (const l of leaders(row)) {
      assert.ok(
        dots.some((d) => Math.abs(Math.hypot(l.x1 - d.x, l.y1 - d.y) - (d.r + 2)) < 1.01),
        "a leader starts at a marker of its own row",
      );
    }
  }
});

test("the swing legend of polarities stays: it says what the colours mean, which no name does", () => {
  const wide = frame(slope(SWING).svg, "wide");
  assert.ok(wide.includes(">rose</text>") && wide.includes(">fell</text>"), "BJP and BSP rose and AIFB fell");
  assert.equal((wide.match(/<rect /g) ?? []).length, 2);
});

test("a swing with nothing computable is one line of fact, and still has its rows in the table", () => {
  const c = slope({ ...SWING, rows: [{ label: "BJP", from: 42.6, to: null }] });
  assert.equal(c.svg, "");
  assert.equal(c.table.rows.length, 1);
});

// ── the sweep ────────────────────────────────────────────────────────────────────────────────────

/** mulberry32: a seeded generator, so the sweep is the same sweep every run. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("seeded line charts, 300 of them: every known line is named, and nothing overprints or leaves its frame", () => {
  const rand = rng(20261025);
  for (let n = 0; n < 300; n += 1) {
    const xs = 1 + Math.floor(rand() * 6);
    const k = 1 + Math.floor(rand() * 6);
    const base = rand() * 60;
    // clustered on purpose: most of the trouble is values within a point of each other
    const series = Array.from({ length: k }, (_, s) => ({
      key: `s${s}`,
      label: ["Mekliganj", "Cooch Behar", "West Bengal", "AITC", "BJP", "সর্বভারতীয় তৃণমূল কংগ্রেস", "Rest of the field"][s] as string,
      values: Array.from({ length: xs }, () => (rand() < 0.2 ? null : Math.round((base + rand() * (rand() < 0.5 ? 2 : 30)) * 10) / 10)),
    }));
    const c = lines({ title: "Sweep", finding: "x", x: Array.from({ length: xs }, (_, i) => String(2000 + i * 5)), xHeader: "Election", series, format: percent });
    if (c.fact !== null) continue;
    const known = series.filter((s) => s.values.some((v) => v !== null)).length;
    for (const f of FRAMES) {
      const one = frame(c.svg, f.name);
      assert.equal(tags(one).length, Math.min(known, 4), `case ${n} ${f.name}: a line has no name`);
      assertLegible(one, `case ${n} ${f.name}`);
    }
  }
});

test("seeded swings, 300 of them: both ends of every row are named, and nothing overprints or leaves its frame", () => {
  const rand = rng(1025);
  for (let n = 0; n < 300; n += 1) {
    const rows = Array.from({ length: 1 + Math.floor(rand() * 10) }, (_, r) => ({
      label: ["AITC", "BJP", "CPM", "INC", "IND", "AISF", "BSP", "SUCI(C)", "AIFB", "সর্বভারতীয় তৃণমূল"][r] as string,
      from: rand() < 0.15 ? null : Math.round(rand() * (rand() < 0.5 ? 4 : 50) * 10) / 10,
      to: rand() < 0.15 ? null : Math.round(rand() * (rand() < 0.5 ? 4 : 50) * 10) / 10,
    }));
    const c = slope({ ...SWING, rows });
    if (c.fact !== null) continue;
    const drawn = rows.filter((r) => r.from !== null && r.to !== null).length;
    for (const f of FRAMES) {
      const one = frame(c.svg, f.name);
      assert.equal(tags(one).length, drawn * 2, `case ${n} ${f.name}: a row end has no name`);
      assertLegible(one, `case ${n} ${f.name}`);
    }
  }
});

test("the layout is a function of the data: the same chart twice is the same bytes, and not the order the series came in", () => {
  assert.equal(lines(TURNOUT).svg, lines(TURNOUT).svg);
  const backwards = lines({ ...TURNOUT, series: [...TURNOUT.series].reverse() });
  assert.deepEqual(
    tags(frame(backwards.svg, "wide")).map((t) => t.text).sort(),
    tags(frame(lines(TURNOUT).svg, "wide")).map((t) => t.text).sort(),
  );
});

test("text in the frames never wears a series colour, and a name is the quiet ink with its value in the bright", () => {
  for (const svg of [lines(TURNOUT).svg, slope(SWING).svg]) {
    for (const m of svg.matchAll(/<(?:text|tspan) [^>]*fill="([^"]+)"/g)) {
      assert.ok(!(CATEGORICAL as readonly string[]).includes(m[1] as string), `${m[1]} on text`);
    }
    assert.ok(svg.includes(`fill="${TEXT_SECONDARY}"`) && svg.includes(`fill="${TEXT_PRIMARY}"`));
    assert.ok(svg.includes(`stroke="${LINE_SUBTLE}"`));
  }
});
