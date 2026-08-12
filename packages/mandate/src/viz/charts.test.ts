import assert from "node:assert/strict";
import test from "node:test";
import { percent, percentagePoints } from "../semantic/index.ts";
import { bars, lines, slope } from "./charts.ts";
import { barPath, escapeXml, hueMap, labelIndices, spread, ticks } from "./marks.ts";
import { CATEGORICAL, DIVERGING, LINE_SUBTLE, OTHERS, SURFACE, TEXT_MUTED, TEXT_PRIMARY } from "./palette.ts";

const ELECTIONS = ["2011", "2016", "2021", "2026"] as const;

function share(label: string, value: number | null, key = label) {
  return { label, value, key };
}

// ── determinism ──────────────────────────────────────────────────────────────────────────────────

test("identical input produces a byte-identical string", () => {
  const input = {
    title: "Vote share, 2021",
    finding: "AITC took 48.1% against BJP's 38.0%",
    dimension: "Party",
    valueHeader: "Vote share",
    points: [share("AITC", 48.1), share("BJP", 38.0), share("CPI(M)", 5.6), share("INC", 2.9)],
    format: percent,
  };
  assert.equal(bars(input).svg, bars(input).svg);
  assert.deepEqual(bars(input).table, bars(input).table);
  // and across the other two, since each has its own coordinate maths
  const l = {
    title: "Turnout",
    finding: "Turnout ran above the state in every cycle",
    x: [...ELECTIONS],
    xHeader: "Election",
    series: [
      { key: "ac", label: "This seat", values: [86.1, 84.4, 83.2, null] },
      { key: "state", label: "West Bengal", values: [85.3, 82.7, 81.7, null] },
    ],
    format: percent,
  };
  assert.equal(lines(l).svg, lines(l).svg);
  const s = {
    title: "Swing 2016 to 2021",
    finding: "BJP gained 28.4 points",
    dimension: "Party",
    fromLabel: "2016",
    toLabel: "2021",
    rows: [
      { label: "BJP", from: 9.6, to: 38.0 },
      { label: "AITC", from: 45.2, to: 48.1 },
      { label: "CPI(M)", from: 26.3, to: 5.6 },
    ],
    format: percent,
    delta: percentagePoints,
  };
  assert.equal(slope(s).svg, slope(s).svg);
});

// ── the trust boundary ───────────────────────────────────────────────────────────────────────────

test("escapeXml handles every character that can break markup", () => {
  assert.equal(escapeXml(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;");
  assert.equal(escapeXml("A & B"), "A &amp; B");
});

test("a hostile party name cannot inject markup, and Bengali survives verbatim", () => {
  const hostile = `A & B <i>"x"</i>`; // short enough to survive the label clip whole
  const bengali = "সর্বভারতীয় তৃণমূল কংগ্রেস";
  const c = bars({
    title: `Vote share & "turnout"`,
    finding: `<b>48.1%</b> for ${bengali}`,
    dimension: "Party",
    valueHeader: "Vote share",
    points: [share(hostile, 48.1), share(bengali, 38.0)],
    format: percent,
  });
  assert.ok(!/<(script|i|b)\b/.test(c.svg), "no injected element");
  assert.ok(c.svg.includes("A &amp; B &lt;i&gt;&quot;x&quot;&lt;/i&gt;"), "text escaped in element context");
  // the aria-label is attribute context: its quotes must be escaped too, or the attribute closes early
  assert.ok(c.svg.includes(`aria-label="Vote share &amp; &quot;turnout&quot;.`), "attribute escaped");
  assert.equal(c.svg.match(/aria-label="/g)?.length, 1, "exactly one aria-label attribute");
  assert.ok(c.svg.includes(bengali), "Bengali passes through unmangled");
  // a long hostile name is clipped for the mark but never for the table
  const long = bars({
    title: "t",
    finding: "f",
    dimension: "Party",
    valueHeader: "Vote share",
    points: [share(`Front & Left <script>alert("x")</script> Alliance`, 48.1)],
    format: percent,
  });
  assert.ok(!long.svg.includes("<script"), "clipping never re-opens the injection");
  assert.ok(long.svg.includes("Front &amp; Left &lt;script&gt;"));
  // the table is raw text for JSX, not markup
  assert.deepEqual(c.table.rows[0], [hostile, "48.1%"]);
});

test("no <script>, <style> or event handler is ever emitted", () => {
  const c = lines({
    title: "Turnout",
    finding: "up",
    x: [...ELECTIONS],
    xHeader: "Election",
    series: [{ key: "ac", label: "This seat", values: [80, 81, 82, 83] }],
    format: percent,
  });
  for (const bad of ["<script", "<style", " on", "javascript:"]) {
    assert.ok(!c.svg.includes(bad), `emits ${bad}`);
  }
});

// ── the three-hue cap ────────────────────────────────────────────────────────────────────────────

test("hueMap refuses a fourth hue: past three, every key gets the neutral", () => {
  const m = hueMap(["a", "b", "c", "d", "e"]);
  assert.deepEqual(
    [...m.values()],
    [CATEGORICAL[0], CATEGORICAL[1], CATEGORICAL[2], OTHERS, OTHERS],
  );
  // twenty parties still yield three hues
  const many = hueMap(Array.from({ length: 20 }, (_, n) => `p${n}`));
  assert.equal(new Set([...many.values()]).size, 4); // 3 hues + the neutral
});

test("a fourth line series is folded into a summed, neutral Others", () => {
  const c = lines({
    title: "Party share over time",
    finding: "AITC held its plurality throughout",
    x: [...ELECTIONS],
    xHeader: "Election",
    series: [
      { key: "aitc", label: "AITC", values: [45, 45, 48, null] },
      { key: "bjp", label: "BJP", values: [5, 10, 38, null] },
      { key: "cpm", label: "CPI(M)", values: [30, 26, 6, null] },
      { key: "inc", label: "INC", values: [8, 6, 3, null] },
      { key: "oth", label: "Others", values: [2, 2, 1, null] },
    ],
    format: percent,
  });
  assert.deepEqual(c.table.headers, ["Election", "AITC", "BJP", "CPI(M)", "Others (2)"]);
  // 8 + 6 = 14 in 2016, summed rather than dropped
  assert.deepEqual(c.table.rows[1], ["2016", "45.0%", "10.0%", "26.0%", "8.0%"]);
  assert.deepEqual(c.table.rows[0], ["2011", "45.0%", "5.0%", "30.0%", "10.0%"]);
  // exactly three categorical hues in the markup, plus the neutral
  for (const hue of CATEGORICAL.slice(0, 3)) assert.ok(c.svg.includes(hue), `${hue} missing`);
  for (const hue of CATEGORICAL.slice(3)) assert.ok(!c.svg.includes(hue), `${hue} leaked past the cap`);
  assert.ok(c.svg.includes(OTHERS));
});

test("the line fold ranks on each series' peak, so a party that won an early election keeps its column", () => {
  // Mekliganj's real shape: AIFB won 2011 with 48.9% and collapsed to 3.4% by 2021, while INC's only
  // recorded share is 26.7% in 2011. Ranking on "the last value I can find" compared INC's 2011
  // against AIFB's 2021 and folded the 2011 WINNER into an unlabelled grey line.
  const c = lines({
    title: "Vote share by party",
    finding: "TMC took 50.0% in 2021",
    x: [...ELECTIONS],
    xHeader: "Election",
    series: [
      { key: "TMC", label: "TMC", values: [null, 41.3, 50, null] },
      { key: "AIFB", label: "AIFB", values: [48.9, 37.7, 3.4, null] },
      { key: "BJP", label: "BJP", values: [null, 12.9, 42.6, null] },
      { key: "INC", label: "INC", values: [26.7, null, null, null] },
    ],
    format: percent,
  });
  assert.deepEqual(c.table.headers, ["Election", "TMC", "AIFB", "BJP", "Others (1)"]);
  assert.deepEqual(c.table.rows[0], ["2011", "—", "48.9%", "—", "26.7%"]);
});

test("bars caps entity colour at three hues without folding any row away", () => {
  const c = bars({
    title: "Vote share, 2021",
    finding: "five contestants",
    dimension: "Party",
    valueHeader: "Vote share",
    points: [share("A", 40), share("B", 30), share("C", 15), share("D", 10), share("E", 5)],
    format: percent,
  });
  assert.equal(c.table.rows.length, 5, "every contestant keeps its own row and label");
  for (const hue of CATEGORICAL.slice(3)) assert.ok(!c.svg.includes(hue), `${hue} leaked past the cap`);
  assert.ok(c.svg.includes(OTHERS), "the fourth and fifth bars wear the neutral");
});

test("bars paints a keyless aggregate row with the neutral, never the top party's hue", () => {
  const fills = (svg: string): string[] =>
    [...svg.matchAll(/<path d="[^"]*" fill="(#[0-9a-fA-F]{6})"/g)].flatMap((m) => (m[1] ? [m[1]] : []));
  const c = bars({
    title: "Votes polled, 2021",
    finding: "three parties and the rest of the field",
    dimension: "Party",
    valueHeader: "Votes",
    points: [
      share("TMC", 99_338),
      share("BJP", 84_653),
      share("AIFB", 6_853),
      // the folded residual: an aggregate, so it carries no entity key
      { label: "Rest of the field (2)", value: 2_793 },
    ],
    format: (v) => (v === null ? "—" : String(v)),
  });
  assert.deepEqual(fills(c.svg), [CATEGORICAL[0], CATEGORICAL[1], CATEGORICAL[2], OTHERS]);
});

// ── mark specs ───────────────────────────────────────────────────────────────────────────────────

test("the 4px radius is on the data end only; the baseline is square", () => {
  const d = barPath(100, 10, 300, 14);
  assert.equal(d, "M100 10H296A4 4 0 0 1 300 14V20A4 4 0 0 1 296 24H100Z");
  assert.equal(barPath(100, 10, 300, 14), d, "and deterministically so");
  assert.equal(d.match(/A4 4/g)?.length, 2, "exactly two arcs, both at the data end");
  assert.ok(d.startsWith("M100 10H"), "baseline corner is a straight move, not an arc");
  assert.ok(d.endsWith("H100Z"), "closes square on the baseline");
  // a bar shorter than the radius is not rounded at all — rounding it would round its zero
  assert.equal(barPath(100, 10, 102, 14), "M100 10H102V24H100Z");
});

test("bars emits the rounded data end and a square zero in real markup", () => {
  const c = bars({
    title: "Margin by election",
    finding: "widest in 2021",
    dimension: "Election",
    valueHeader: "Margin",
    points: [{ label: "2021", value: 10.1 }, { label: "2016", value: 4.2 }],
    format: percent,
  });
  const paths = [...c.svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1] ?? "");
  assert.equal(paths.length, 2);
  for (const d of paths) {
    assert.equal(d.match(/A4 4/g)?.length, 2);
    assert.ok(/H[\d.]+Z$/.test(d));
  }
});

test("line markers are >= 8px and carry a 2px surface ring", () => {
  const c = lines({
    title: "Turnout",
    finding: "steady",
    x: [...ELECTIONS],
    xHeader: "Election",
    series: [{ key: "ac", label: "This seat", values: [80, 81, 82, 83] }],
    format: percent,
  });
  assert.equal([...c.svg.matchAll(/<circle /g)].length, 4);
  // SURFACE, not a literal: the halo around a data point is the page's own panel colour, and hard-coding it
  // is how a chart kept drawing itself on a surface the stylesheet had stopped painting.
  assert.ok(c.svg.includes(`r="4" fill="${CATEGORICAL[0]}" stroke="${SURFACE}" stroke-width="2"`));
  assert.ok(c.svg.includes(`stroke="${CATEGORICAL[0]}" stroke-width="2"`), "2px line");
});

test("text never wears a series colour", () => {
  const c = lines({
    title: "Party share over time",
    finding: "AITC held its plurality",
    x: [...ELECTIONS],
    xHeader: "Election",
    series: [
      { key: "aitc", label: "AITC", values: [45, 45, 48, null] },
      { key: "bjp", label: "BJP", values: [5, 10, 38, null] },
    ],
    format: percent,
  });
  const fills = [...c.svg.matchAll(/<text[^>]*fill="([^"]+)"/g)].map((m) => m[1] ?? "");
  assert.ok(fills.length > 0);
  for (const f of fills) {
    assert.ok(!(CATEGORICAL as readonly string[]).includes(f), `${f} is a series colour on text`);
    assert.ok(!(Object.values(DIVERGING) as readonly string[]).includes(f), `${f} is a polarity colour on text`);
  }
  // and every numeral is tabular
  assert.ok(c.svg.includes("font-variant-numeric:tabular-nums"));
});

test("direct labels land on the first, last and extreme values only", () => {
  assert.deepEqual(labelIndices([10, 40, 5, 20]), [0, 1, 2, 3]);
  assert.deepEqual(labelIndices([10, 20, 30, 40, 25, 15]), [0, 3, 5]);
  assert.deepEqual(labelIndices([null, 20, 30, null]), [1, 2]);
  assert.deepEqual(labelIndices([null, null]), []);
  // six points, three labels — not a number on every point
  const c = lines({
    title: "Turnout",
    finding: "peaked mid-decade",
    x: ["1", "2", "3", "4", "5", "6"],
    xHeader: "Cycle",
    series: [{ key: "ac", label: "This seat", values: [10, 20, 30, 40, 25, 15] }],
    format: percent,
  });
  assert.equal([...c.svg.matchAll(/<circle /g)].length, 6);
  // The TOKEN, not its value. Three of these assertions restated the hexes, so they failed the moment the
  // palette was pointed at the stylesheet's own tokens — which is the palette being right, not wrong.
  assert.equal([...c.svg.matchAll(new RegExp(`fill="${TEXT_PRIMARY}"`, "g"))].length, 3, "three direct value labels");
});

test("grid lines are line-subtle and drawn before the marks", () => {
  const c = lines({
    title: "Turnout",
    finding: "steady",
    x: [...ELECTIONS],
    xHeader: "Election",
    series: [{ key: "ac", label: "This seat", values: [80, 81, 82, 83] }],
    format: percent,
  });
  assert.ok(c.svg.includes(`stroke="${LINE_SUBTLE}"`), "grid in line-subtle");
  assert.ok(c.svg.indexOf(`stroke="${LINE_SUBTLE}"`) < c.svg.indexOf("<circle"), "grid is under the marks");
  assert.ok(c.svg.includes(`fill="${TEXT_MUTED}"`), "axis text recessive");
});

test("direct labels never stack on one baseline", () => {
  assert.deepEqual(spread([100, 100, 100]), [100, 112, 124]);
  assert.deepEqual(spread([50, 10]), [50, 10], "already clear, so untouched");
  assert.deepEqual(spread([10, 12, 50]), [10, 22, 50]);
  // a seat, its district and the state sit within half a point of each other
  const c = lines({
    title: "Turnout",
    finding: "the seat ran above both baselines",
    x: [...ELECTIONS],
    xHeader: "Election",
    series: [
      { key: "ac", label: "Dinhata", values: [86.1, 84.4, 83.2, null] },
      { key: "d", label: "Cooch Behar", values: [85.9, 84.0, 82.9, null] },
      { key: "wb", label: "West Bengal", values: [85.3, 82.7, 81.7, null] },
    ],
    format: percent,
  });
  const valueYs = [
    ...c.svg.matchAll(new RegExp(`<text x="56" y="([\\d.]+)" fill="${TEXT_PRIMARY}"`, "g")),
  ].map((m) => Number(m[1]));
  assert.equal(valueYs.length, 3, "three 2011 values, one per series");
  const sortedYs = valueYs.slice().sort((a, b) => a - b);
  for (let n = 1; n < sortedYs.length; n += 1) {
    assert.ok((sortedYs[n] ?? 0) - (sortedYs[n - 1] ?? 0) >= 12, `labels ${n - 1} and ${n} collide`);
  }
});

// ── legend ───────────────────────────────────────────────────────────────────────────────────────

test("one series emits no legend; two do", () => {
  const base = { title: "Turnout", finding: "steady", x: [...ELECTIONS], xHeader: "Election", format: percent };
  const one = lines({ ...base, series: [{ key: "ac", label: "This seat", values: [80, 81, 82, 83] }] });
  assert.ok(!one.svg.includes("<rect"), "no swatch, so no legend");
  const two = lines({
    ...base,
    series: [
      { key: "ac", label: "This seat", values: [80, 81, 82, 83] },
      { key: "wb", label: "West Bengal", values: [79, 80, 81, 82] },
    ],
  });
  assert.equal([...two.svg.matchAll(/<rect /g)].length, 2);
  assert.ok(two.svg.includes(">West Bengal</text>"));
});

test("bars never emits a legend: it is one series and its labels are direct", () => {
  const c = bars({
    title: "Vote share, 2021",
    finding: "AITC 48.1%",
    dimension: "Party",
    valueHeader: "Vote share",
    points: [share("AITC", 48.1), share("BJP", 38.0), share("CPI(M)", 5.6), share("INC", 2.9)],
    format: percent,
  });
  assert.ok(!c.svg.includes("<rect"));
  for (const label of ["AITC", "BJP", "CPI(M)", "INC"]) assert.ok(c.svg.includes(`>${label}</text>`));
});

test("slope legends the polarities present, not the entities", () => {
  const s = {
    title: "Swing 2016 to 2021",
    finding: "BJP gained 28.4 points",
    dimension: "Party",
    fromLabel: "2016",
    toLabel: "2021",
    format: percent,
    delta: percentagePoints,
  };
  const mixed = slope({
    ...s,
    rows: [{ label: "BJP", from: 9.6, to: 38.0 }, { label: "CPI(M)", from: 26.3, to: 5.6 }],
  });
  assert.equal([...mixed.svg.matchAll(/<rect /g)].length, 2);
  assert.ok(mixed.svg.includes(">rose</text>") && mixed.svg.includes(">fell</text>"));
  assert.ok(mixed.svg.includes(DIVERGING.up) && mixed.svg.includes(DIVERGING.down));
  const oneWay = slope({ ...s, rows: [{ label: "BJP", from: 9.6, to: 38.0 }] });
  assert.ok(!oneWay.svg.includes("<rect"), "one polarity needs no legend");
});

// ── the frame contains everything it draws ──────────────────────────────────────────────────────

/** Every coordinate and every estimated text extent, against the viewBox. */
function outOfFrame(svg: string): string[] {
  const box = svg.match(/viewBox="0 0 (\d+) ([\d.]+)"/);
  const w = Number(box?.[1] ?? 0);
  const h = Number(box?.[2] ?? 0);
  const bad: string[] = [];
  const check = (label: string, x: number, y: number) => {
    if (x < -0.5 || x > w + 0.5) bad.push(`${label} x=${x} outside 0..${w}`);
    if (y < -0.5 || y > h + 0.5) bad.push(`${label} y=${y} outside 0..${h}`);
  };
  for (const m of svg.matchAll(/<line x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"/g)) {
    check("line a", Number(m[1]), Number(m[2]));
    check("line b", Number(m[3]), Number(m[4]));
  }
  for (const m of svg.matchAll(/<circle cx="([\d.-]+)" cy="([\d.-]+)"/g)) {
    check("marker", Number(m[1]) - 5, Number(m[2]) - 5);
    check("marker", Number(m[1]) + 5, Number(m[2]) + 5);
  }
  for (const m of svg.matchAll(/<rect x="([\d.-]+)" y="([\d.-]+)" width="(\d+)" height="(\d+)"/g)) {
    check("swatch", Number(m[1]), Number(m[2]));
    check("swatch", Number(m[1]) + Number(m[3]), Number(m[2]) + Number(m[4]));
  }
  for (const m of svg.matchAll(/M([\d.-]+) ([\d.-]+)H([\d.-]+)/g)) {
    check("bar start", Number(m[1]), Number(m[2]));
    check("bar end", Number(m[3]) + 4, Number(m[2]));
  }
  for (const m of svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)"([^>]*)>([^<]*)<\/text>/g)) {
    const x = Number(m[1]);
    const y = Number(m[2]);
    const run = [...(m[4] ?? "")].length * 7.4; // generous per-glyph estimate
    const anchor = (m[3] ?? "").match(/text-anchor="(\w+)"/)?.[1] ?? "start";
    const x0 = anchor === "end" ? x - run : anchor === "middle" ? x - run / 2 : x;
    check(`text "${m[4]}"`, x0, y - 9);
    check(`text "${m[4]}"`, x0 + run, y + 4);
  }
  return bad;
}

test("nothing a chart draws escapes its own viewBox", () => {
  // long Bengali labels (the legend-overflow case) and clustered values (the spread case)
  const bengali = ["সর্বভারতীয় তৃণমূল কংগ্রেস", "ভারতীয় জনতা পার্টি", "সিপিআই(এম)"];
  assert.deepEqual(
    outOfFrame(
      lines({
        title: "Turnout",
        finding: "clustered",
        x: [...ELECTIONS],
        xHeader: "Election",
        series: bengali.map((label, n) => ({ key: `s${n}`, label, values: [86.1 - n * 0.2, 84.4, 83.2, null] })),
        format: percent,
      }).svg,
    ),
    [],
  );
  // a single series has no legend, so its top label has no legend row to hide under
  assert.deepEqual(
    outOfFrame(
      lines({
        title: "Turnout",
        finding: "flat then down",
        x: [...ELECTIONS],
        xHeader: "Election",
        series: [{ key: "ac", label: "This seat", values: [86.1, 86.0, 85.9, 60.2] }],
        format: percent,
      }).svg,
    ),
    [],
  );
  assert.deepEqual(
    outOfFrame(
      bars({
        title: "Vote share, 2021",
        finding: "long names",
        dimension: "Party",
        valueHeader: "Vote share",
        points: bengali.map((label, n) => ({ label, value: 48.1 - n * 10, key: `s${n}` })),
        format: percent,
      }).svg,
    ),
    [],
  );
  // four parties inside one point of each other at both ends — spread() pushes hard here
  assert.deepEqual(
    outOfFrame(
      slope({
        title: "Swing 2016 to 2021",
        finding: "clustered at the floor",
        dimension: "Party",
        fromLabel: "2016",
        toLabel: "2021",
        rows: bengali
          .concat("নির্দল")
          .map((label, n) => ({ label, from: 2.1 + n * 0.1, to: 1.4 + n * 0.1 })),
        format: percent,
        delta: percentagePoints,
      }).svg,
    ),
    [],
  );
});

// ── accessibility ────────────────────────────────────────────────────────────────────────────────

test("every chart is role=img with title-plus-finding, never 'chart'", () => {
  const made = [
    bars({
      title: "Vote share, 2021",
      finding: "AITC took 48.1%",
      dimension: "Party",
      valueHeader: "Vote share",
      points: [share("AITC", 48.1)],
      format: percent,
    }),
    lines({
      title: "Turnout",
      finding: "above the state every cycle",
      x: [...ELECTIONS],
      xHeader: "Election",
      series: [{ key: "ac", label: "This seat", values: [80, 81, 82, 83] }],
      format: percent,
    }),
    slope({
      title: "Swing 2016 to 2021",
      finding: "BJP gained 28.4 points",
      dimension: "Party",
      fromLabel: "2016",
      toLabel: "2021",
      rows: [{ label: "BJP", from: 9.6, to: 38.0 }],
      format: percent,
      delta: percentagePoints,
    }),
  ];
  for (const c of made) {
    const m = c.svg.match(/aria-label="([^"]+)"/);
    assert.ok(m, "role=img needs a label");
    assert.ok(c.svg.includes('role="img"'));
    assert.ok(!/\bchart\b/i.test(m?.[1] ?? ""), "the label is the finding, not the word chart");
    assert.ok((m?.[1] ?? "").includes("."), "title. finding");
    assert.ok(c.table.caption.length > 0, "the table carries a caption");
    assert.ok(c.table.headers.length >= 2);
  }
});

// ── tables ───────────────────────────────────────────────────────────────────────────────────────

test("the table row count matches the data point count", () => {
  const b = bars({
    title: "Vote share, 2021",
    finding: "five contestants",
    dimension: "Party",
    valueHeader: "Vote share",
    points: [share("A", 40), share("B", 30), share("C", 15), share("D", 10), share("E", null)],
    format: percent,
  });
  assert.equal(b.table.rows.length, 5, "a null value keeps its row");
  assert.deepEqual(b.table.rows[4], ["E", "—"]);
  assert.deepEqual(b.table.rows.map((r) => r[0]), ["A", "B", "C", "D", "E"], "sorted descending");

  const l = lines({
    title: "Turnout",
    finding: "steady",
    x: [...ELECTIONS],
    xHeader: "Election",
    series: [{ key: "ac", label: "This seat", values: [86.1, 84.4, 83.2, null] }],
    format: percent,
  });
  assert.equal(l.table.rows.length, 4, "one row per x position");
  assert.deepEqual(l.table.rows[3], ["2026", "—"], "the unheld election is stated, not dropped");

  const s = slope({
    title: "Swing 2016 to 2021",
    finding: "BJP gained",
    dimension: "Party",
    fromLabel: "2016",
    toLabel: "2021",
    rows: [
      { label: "BJP", from: 9.6, to: 38.0 },
      { label: "CPI(M)", from: 26.3, to: 5.6 },
      { label: "New entrant", from: null, to: 4.1 },
    ],
    format: percent,
    delta: percentagePoints,
  });
  assert.equal(s.table.rows.length, 3, "a half-null row is table-only, never dropped");
  assert.deepEqual(s.table.rows[0], ["BJP", "9.6%", "38.0%", "+28.4 pp"]);
  assert.deepEqual(s.table.rows[2], ["New entrant", "—", "4.1%", "—"]);
  assert.equal([...s.svg.matchAll(/<line /g)].filter((m) => m.index !== undefined).length, 4, "2 axes + 2 slopes");
});

// ── nothing to say ───────────────────────────────────────────────────────────────────────────────

test("an empty series states a fact instead of framing an empty axis", () => {
  const b = bars({
    title: "Vote share, 2026",
    finding: "The 2026 election has no results in the registry yet.",
    dimension: "Party",
    valueHeader: "Vote share",
    points: [],
    format: percent,
  });
  assert.equal(b.svg, "");
  assert.equal(b.fact, "The 2026 election has no results in the registry yet.");
  assert.deepEqual(b.table.rows, []);
  assert.ok(b.table.caption.includes("Vote share, 2026"));

  // all-null is the same case: no axis frame
  const l = lines({
    title: "Turnout",
    finding: "",
    x: [...ELECTIONS],
    xHeader: "Election",
    series: [{ key: "ac", label: "This seat", values: [null, null, null, null] }],
    format: percent,
  });
  assert.equal(l.svg, "");
  assert.equal(l.fact, "Turnout: nothing recorded.");
  assert.equal(l.table.rows.length, 4, "the rows survive even when nothing is drawable");

  const s = slope({
    title: "Swing 2021 to 2026",
    finding: "2026 has not been held.",
    dimension: "Party",
    fromLabel: "2021",
    toLabel: "2026",
    rows: [{ label: "AITC", from: 48.1, to: null }],
    format: percent,
    delta: percentagePoints,
  });
  assert.equal(s.svg, "");
  assert.equal(s.fact, "2026 has not been held.");
  assert.deepEqual(s.table.rows, [["AITC", "48.1%", "—", "—"]], "the one known figure still reaches the table");
});

// ── colour, as a test rather than a document (§24.8) ────────────────────────────────────────────

/** WCAG relative luminance contrast — the one claim in palette.ts that is a deviation from §24.6. */
function contrast(a: string, b: string): number {
  const lum = (hex: string): number => {
    const ch = [1, 3, 5].map((n) => Number.parseInt(hex.slice(n, n + 2), 16) / 255);
    const lin = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * (lin[0] ?? 0) + 0.7152 * (lin[1] ?? 0) + 0.0722 * (lin[2] ?? 0);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

test("the Others neutral clears the 3:1 mark floor; §24.6's ramp midpoint does not", () => {
  assert.ok(contrast(OTHERS, SURFACE) >= 3, `OTHERS is ${contrast(OTHERS, SURFACE).toFixed(2)}:1`);
  // this is why the diverging midpoint is not reused as a fill, measured rather than argued
  assert.ok(contrast("#383835", SURFACE) < 3, "the ramp midpoint is invisible as a mark");
  for (const hue of CATEGORICAL) assert.ok(contrast(hue, SURFACE) >= 3, `${hue} below 3:1`);
});

// ── scales ───────────────────────────────────────────────────────────────────────────────────────

test("ticks cover the data and agree with the scale that draws it", () => {
  assert.deepEqual(ticks(0, 48.1, 4).values, [0, 10, 20, 30, 40, 50]);
  assert.equal(ticks(0, 48.1, 4).hi, 50, "48.1 gets a 0–50 axis, not 0–60");
  assert.deepEqual(ticks(78, 87, 4).values, [78, 80, 82, 84, 86, 88]);
  assert.deepEqual(ticks(5, 5, 4).values, [5], "a degenerate domain does not loop");
});
