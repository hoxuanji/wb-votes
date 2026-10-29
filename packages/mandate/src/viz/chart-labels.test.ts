// The two figures with their labels: what the vote-against-seat plot and the margin histogram print, and that printing
// it moved no mark.
//
// The figures are `.tsx`, which `node --test` cannot import, so they are rendered in a child process through the same
// Babel hook the page renderer uses, as empty-charts.test.ts does. The data is written out here: what a figure labels
// is a property of the figure, and no registry is needed to say it. The geometry of the marks is asserted against the
// plot's own formula written out again, not against the component's output, so a change that nudged a marker would
// fail here whatever else it did.

import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { labelWidth } from "./plot-labels.ts";

const ROOT = new URL("../../../../", import.meta.url).pathname;
const DISTRIBUTION = pathToFileURL(`${ROOT}src/components/iei/Distribution.tsx`).href;

type Case = { component: string; props: Record<string, unknown> };

/** Render each case in ONE child process (the hook costs a second to start) and return the markup, in order. */
function renderAll(cases: readonly Case[]): string[] {
  const script = `
    import { createElement } from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { readFileSync } from 'node:fs';
    const D = await import(${JSON.stringify(DISTRIBUTION)});
    const href = (x) => '/pick?' + x;
    const out = JSON.parse(readFileSync(0, 'utf8')).map(({ component, props }) =>
      renderToStaticMarkup(createElement(D[component], { hrefFor: href, selected: null, ...props })));
    process.stdout.write(JSON.stringify(out));
  `;
  const stdout = execFileSync(
    process.execPath,
    ["--import", "./ops/probe/render/register.mjs", "--input-type=module", "-e", script],
    { cwd: ROOT, encoding: "utf8", input: JSON.stringify(cases), maxBuffer: 16 * 1024 * 1024 },
  );
  return JSON.parse(stdout) as string[];
}

const vs = (key: string, votePct: number | null, seatPct: number, seats = 1) => ({
  type: "vote_seat_efficiency",
  party: { key, label: key },
  votePct,
  seatPct,
  deltaPp: votePct === null ? null : seatPct - votePct,
  seats,
  contested: 100,
  counted: 100,
  seatsPerPoint: null,
});

/** West Bengal 2021 as the registry gives it: two parties, then four that overprinted each other at the origin. */
const WB2021 = [
  vs("AITC", 48.88, 71.43, 210),
  vs("BJP", 38.72, 25.85, 76),
  vs("CPM", 4.83, 0, 0),
  vs("INC", 2.98, 0, 0),
  vs("IND", 1.54, 0.34),
  vs("AISF", 1.38, 0.34),
];

/** Karnataka-shaped: three real parties and four with one seat or none and under 1% of the vote. */
const WITH_MINOR = [
  vs("INC", 43.2, 60.3, 135),
  vs("BJP", 36.1, 29, 65),
  vs("JD(S)", 13.3, 9, 19),
  vs("KRPP", 0.6, 0.45),
  vs("SKP", 0.2, 0.45),
  vs("IND", 0.3, 0.45),
  vs("CPM", 0.4, 0.45),
];

const bins = (inBin: Record<number, number>) => {
  const out = [];
  for (let lo = 0; lo < 40; lo += 2) out.push({ lo, hi: lo + 2, n: inBin[lo] ?? 0, overflow: false });
  out.push({ lo: 40, hi: null, n: inBin[40] ?? 0, overflow: true });
  return out;
};

/** The plot's own scale, written out again: 400 units, 38 of margin, and a ceiling of 1.05 x the larger of 60 and any share. */
function scale(rows: readonly ReturnType<typeof vs>[], max = 60) {
  const ceiling = Math.max(max, ...rows.map((r) => Math.max(r.votePct ?? 0, r.seatPct))) * 1.05;
  return { x: (v: number) => 38 + (v / ceiling) * 324, y: (v: number) => 362 - (v / ceiling) * 324, ceiling };
}

const attr = (tag: string, name: string) => new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1];
const circles = (html: string) =>
  [...html.matchAll(/<circle [^>]*>/g)].map((m) => ({ cx: Number(attr(m[0], "cx")), cy: Number(attr(m[0], "cy")), r: Number(attr(m[0], "r")) }));
const tags = (html: string) =>
  [...html.matchAll(/<text ([^>]*class="iei-vs-tag[^"]*"[^>]*)>([^<]*)<\/text>/g)].map((m) => ({
    x: Number(attr(m[1] as string, "x")),
    y: Number(attr(m[1] as string, "y")),
    anchor: attr(m[1] as string, "text-anchor"),
    text: m[2] as string,
  }));

/* ───────────────────────────── the vote-against-seat plot ───────────────────────────── */

test("no marker moves: each circle is where the plot's own scale puts its party", () => {
  const [html, selected] = renderAll([
    { component: "VoteSeatPlot", props: { rows: WB2021 } },
    { component: "VoteSeatPlot", props: { rows: WB2021, selected: "BJP" } },
  ]) as [string, string];
  const { x, y } = scale(WB2021);
  const want = WB2021.map((r) => ({ cx: x(r.votePct as number), cy: y(r.seatPct) }));
  const got = circles(html);
  assert.equal(got.length, WB2021.length);
  got.forEach((c, i) => {
    assert.ok(Math.abs(c.cx - (want[i] as { cx: number }).cx) < 1e-9, `circle ${i} cx`);
    assert.ok(Math.abs(c.cy - (want[i] as { cy: number }).cy) < 1e-9, `circle ${i} cy`);
    assert.equal(c.r, 5);
  });
  assert.deepEqual(
    circles(selected).map((c) => [c.cx, c.cy]),
    got.map((c) => [c.cx, c.cy]),
    "choosing a party moves no marker",
  );
  assert.deepEqual(
    tags(selected),
    tags(html),
    "choosing a party moves no name",
  );
});

test("both axes are numbered at round values, from zero, with a tick at each", () => {
  const [html] = renderAll([{ component: "VoteSeatPlot", props: { rows: WB2021 } }]) as [string];
  const { x, y } = scale(WB2021);
  const labels = [...html.matchAll(/<text ([^>]*class="iei-vs-tick-label"[^>]*)>(\d+)%<\/text>/g)].map((m) => ({
    x: Number(attr(m[1] as string, "x")),
    y: Number(attr(m[1] as string, "y")),
    v: Number(m[2]),
  }));
  // The ceiling is 1.05 x 71.43 = 75, so the ticks are 0, 20, 40, 60: four along the bottom, three up the side (the origin once).
  assert.deepEqual(labels.filter((l) => l.y > 362).map((l) => l.v), [0, 20, 40, 60]);
  assert.deepEqual(labels.filter((l) => l.y <= 362).map((l) => l.v), [20, 40, 60]);
  for (const l of labels.filter((l) => l.y > 362)) assert.ok(Math.abs(l.x - x(l.v)) < 1e-9, `the ${l.v}% label is under its tick`);
  for (const l of labels.filter((l) => l.y <= 362)) assert.ok(Math.abs(l.y - y(l.v)) < 1e-9, `the ${l.v}% label is level with its tick`);
  const ticks = [...html.matchAll(/<line [^>]*class="iei-vs-tick"[^>]*>/g)];
  assert.equal(ticks.length, 8, "a tick on each axis at each of the four values");
  assert.match(html, />vote share →<\/text>/);
  assert.match(html, />seat share ↑<\/text>/);
});

test("the parity line is named where it ends, above the frame", () => {
  const [html] = renderAll([{ component: "VoteSeatPlot", props: { rows: WB2021 } }]) as [string];
  const { x, ceiling } = scale(WB2021);
  const m = /<text ([^>]*class="iei-vs-parity-label"[^>]*)>seats = votes<\/text>/.exec(html);
  assert.ok(m !== null, "the parity line has no name");
  assert.ok(Math.abs(Number(attr(m[1] as string, "x")) - x(ceiling)) < 1e-9, "named at the line's far end");
  assert.ok(Number(attr(m[1] as string, "y")) < 38, "in the margin above the plot, where no marker can be");
  assert.equal(attr(m[1] as string, "text-anchor"), "end");
});

/** West Bengal 2016: nine parties, five of them under 3% of the vote and printed within a dozen units of each other. */
const WB2016 = [
  vs("TMC", 45.97, 66.67, 196),
  vs("CPM", 19.87, 8.84, 26),
  vs("INC", 12.76, 13.61, 40),
  vs("BJP", 10.46, 1.02, 3),
  vs("AIFB", 2.96, 0.68, 2),
  vs("IND", 2.95, 0.34, 1),
  vs("RSP", 1.72, 1.02, 3),
  vs("CPI", 1.58, 0.34, 1),
  vs("BGPM", 0.5, 1.02, 3),
];

test("West Bengal 2016: nine names, none across a party's drop to the diagonal, none over a marker or another name", () => {
  const [html] = renderAll([{ component: "VoteSeatPlot", props: { rows: WB2016 } }]) as [string];
  const names = tags(html);
  assert.deepEqual(names.map((n) => n.text).sort(), WB2016.map((r) => r.party.label).sort());
  const dots = circles(html);
  const boxes = names.map((n) => {
    const w = labelWidth(n.text);
    const x0 = n.anchor === "end" ? n.x - w : n.anchor === "middle" ? n.x - w / 2 : n.x;
    return { text: n.text, x0, x1: x0 + w, y0: n.y - 8, y1: n.y + 8 };
  });
  for (const b of boxes) {
    for (const d of dots) {
      // The drop runs from the marker straight to the diagonal, where y = 400 - x in this frame.
      const [top, bottom] = [Math.min(d.cy, 400 - d.cx), Math.max(d.cy, 400 - d.cx)];
      assert.ok(!(b.x0 < d.cx && d.cx < b.x1 && b.y0 < bottom && top < b.y1), `${b.text} is across the drop from the marker at ${d.cx.toFixed(0)},${d.cy.toFixed(0)}`);
      assert.ok(Math.hypot(Math.max(b.x0 - d.cx, 0, d.cx - b.x1), Math.max(b.y0 - d.cy, 0, d.cy - b.y1)) > d.r, `${b.text} covers a marker`);
    }
    assert.ok(b.x0 >= 42 && b.x1 <= 358 && b.y0 >= 42 && b.y1 <= 358, `${b.text} is outside the plot`);
  }
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const [a, b] = [boxes[i], boxes[j]] as [(typeof boxes)[number], (typeof boxes)[number]];
      assert.ok(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0, `${a.text} and ${b.text} overprint`);
    }
  }
  assert.equal((html.match(/class="iei-vs-lead"/g) ?? []).length, 5, "the five names from the blob at the origin each have a leader");
});

test("every name is beside its own marker, or joined to it by a leader line that starts there and ends at the name", () => {
  const [html] = renderAll([{ component: "VoteSeatPlot", props: { rows: WB2021 } }]) as [string];
  const links = [...html.matchAll(/<a [^>]*>(.*?)<\/a>/g)].map((m) => m[1] as string);
  assert.equal(links.length, WB2021.length);
  for (const link of links) {
    const [c] = circles(link);
    const [t] = tags(link);
    const { cx, cy } = c as { cx: number; cy: number };
    const w = labelWidth((t as { text: string }).text);
    const name = t as { x: number; y: number; anchor: string | undefined; text: string };
    const x0 = name.anchor === "end" ? name.x - w : name.anchor === "middle" ? name.x - w / 2 : name.x;
    const box = { x0, x1: x0 + w, y0: name.y - 8, y1: name.y + 8 };
    const nearest = (px: number, py: number) => Math.hypot(Math.max(box.x0 - px, 0, px - box.x1), Math.max(box.y0 - py, 0, py - box.y1));
    const lead = /<line x1="([^"]*)" y1="([^"]*)" x2="([^"]*)" y2="([^"]*)" class="iei-vs-lead">/.exec(link);
    if (nearest(cx, cy) <= 7 + 5) {
      assert.equal(lead, null, `${name.text} is beside its marker and needs no leader`);
    } else {
      assert.ok(lead !== null, `${name.text} is away from its marker with no leader line`);
      const [x1, y1, x2, y2] = lead.slice(1).map(Number) as [number, number, number, number];
      assert.ok(Math.abs(Math.hypot(x1 - cx, y1 - cy) - 8) < 1e-6, `${name.text}'s leader does not start at its own marker's edge`);
      assert.ok(nearest(x2, y2) <= 2, `${name.text}'s leader does not reach its name`);
    }
  }
});

test("West Bengal 2021: every party has its own name and no name touches another or a marker", () => {
  const [html] = renderAll([{ component: "VoteSeatPlot", props: { rows: WB2021 } }]) as [string];
  const names = tags(html);
  assert.deepEqual(names.map((n) => n.text).sort(), ["AISF", "AITC", "BJP", "CPM", "IND", "INC"].sort());
  const boxes = names.map((n) => {
    const w = labelWidth(n.text);
    const x0 = n.anchor === "end" ? n.x - w : n.anchor === "middle" ? n.x - w / 2 : n.x;
    return { text: n.text, x0, x1: x0 + w, y0: n.y - 8, y1: n.y + 8 };
  });
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i] as (typeof boxes)[number];
      const b = boxes[j] as (typeof boxes)[number];
      const apart = a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0;
      assert.ok(apart, `${a.text} and ${b.text} overprint`);
    }
    const a = boxes[i] as (typeof boxes)[number];
    for (const c of circles(html)) {
      const dx = Math.max(a.x0 - c.cx, 0, c.cx - a.x1);
      const dy = Math.max(a.y0 - c.cy, 0, c.cy - a.y1);
      assert.ok(Math.hypot(dx, dy) > c.r, `${a.text} covers a marker`);
    }
    assert.ok(a.x0 >= 42 && a.x1 <= 358 && a.y0 >= 42 && a.y1 <= 358, `${a.text} is outside the plot`);
  }
  assert.ok(!/Others:/.test(html), "none of these is under 1% of both shares, so there is no group");
  assert.ok(/class="iei-vs-lead"/.test(html), "names that had to move away from a shared spot are joined to it");
});

test("parties under 1% of both shares are one group, named once, and their markers stay", () => {
  const [html, chosen, other] = renderAll([
    { component: "VoteSeatPlot", props: { rows: WITH_MINOR } },
    { component: "VoteSeatPlot", props: { rows: WITH_MINOR, selected: "SKP" } },
    { component: "VoteSeatPlot", props: { rows: WITH_MINOR, selected: "BJP" } },
  ]) as [string, string, string];
  assert.deepEqual(tags(html).map((n) => n.text).sort(), ["BJP", "INC", "JD(S)", "Others: KRPP, SKP, IND, CPM"].sort());
  assert.equal(circles(html).length, WITH_MINOR.length, "every party still has its marker");
  assert.equal((html.match(/<title>(KRPP|SKP|IND|CPM):/g) ?? []).length, 4, "and its tooltip, which names it in full");
  assert.match(html, /class="iei-vs-tag iei-vs-tag-group"/);
  assert.doesNotMatch(html.slice(html.indexOf("Others:") - 200, html.indexOf("Others:")), /<a /, "the group's name is not a link");
  assert.match(chosen, /<g opacity="1" aria-hidden="true">(<line [^>]*><\/line>)?<text [^>]*iei-vs-tag-group/, "choosing a party in the group leaves its name lit");
  assert.match(other, /<g opacity="0.3" aria-hidden="true">(<line [^>]*><\/line>)?<text [^>]*iei-vs-tag-group/, "choosing another party dims it with the rest");
});

test("one small party is named on its own, not as a group of one", () => {
  const [html] = renderAll([
    { component: "VoteSeatPlot", props: { rows: [vs("TMC", 48, 71, 70), vs("BJP", 38, 26, 25), vs("IND", 0.4, 0.34)] } },
  ]) as [string];
  assert.deepEqual(tags(html).map((n) => n.text).sort(), ["BJP", "IND", "TMC"]);
});

test("the plot with a single known party is still drawn, with its name and no leader", () => {
  const [html] = renderAll([{ component: "VoteSeatPlot", props: { rows: [vs("TMC", 40, 50, 5), vs("BJP", null, 50, 5)] } }]) as [string];
  assert.equal(circles(html).length, 1);
  assert.deepEqual(tags(html).map((n) => n.text), ["TMC"]);
  assert.doesNotMatch(html, /iei-vs-lead/);
});

/* ───────────────────────────── the margin histogram ───────────────────────────── */

test("the tallest bar's count is printed, with half of it and a hairline at half", () => {
  const [html] = renderAll([
    { component: "MarginDistribution", props: { bins: bins({ 0: 27, 2: 26, 4: 30, 6: 28, 40: 12 }), total: 123 } },
  ]) as [string];
  assert.match(html, /<span class="iei-dist-count iei-dist-count-top" aria-hidden="true">30<\/span>/);
  assert.match(html, /<span class="iei-dist-count iei-dist-count-half" aria-hidden="true">15<\/span>/);
  assert.match(html, /<span class="iei-dist-unit" aria-hidden="true">seats<\/span>/);
  const line = /<line x1="0" y1="17" x2="100" y2="17" class="iei-dist-half"><\/line>/.exec(html);
  assert.ok(line !== null, "a hairline at half of the 34-unit band");
  assert.ok(line.index < html.indexOf("<a "), "behind the bars, not over them");
});

test("an odd peak prints its exact half, and a peak of one has no half to print", () => {
  const [odd, one] = renderAll([
    { component: "MarginDistribution", props: { bins: bins({ 4: 31, 6: 2 }), total: 33 } },
    { component: "MarginDistribution", props: { bins: bins({ 4: 1 }), total: 1 } },
  ]) as [string, string];
  assert.match(odd, />31<\/span>/);
  assert.match(odd, /iei-dist-count-half" aria-hidden="true">15\.5<\/span>/);
  assert.match(one, /iei-dist-count-top" aria-hidden="true">1<\/span>/);
  assert.doesNotMatch(one, /iei-dist-half|iei-dist-count-half/);
  assert.equal(one.match(/<title>/g)?.length, 21, "the single bar is still the whole histogram");
});

test("no bar moves, and each bar's tooltip carries its range and its count", () => {
  const inBin = { 0: 27, 2: 26, 4: 30, 6: 28, 40: 12 };
  const [html] = renderAll([{ component: "MarginDistribution", props: { bins: bins(inBin), total: 123 } }]) as [string];
  const rects = [...html.matchAll(/<rect [^>]*fill="(?!transparent)[^"]*"[^>]*>/g)].map((m) => m[0]);
  assert.equal(rects.length, 21);
  rects.forEach((tag, i) => {
    const n = (i === 20 ? inBin[40] : inBin[(i * 2) as keyof typeof inBin]) ?? 0;
    const h = Math.max((n / 30) * 34, n > 0 ? 0.6 : 0);
    const slot = 100 / 21;
    assert.ok(Math.abs(Number(attr(tag, "x")) - (i * slot + (slot * 0.16) / 2)) < 1e-9, `bar ${i} x`);
    assert.ok(Math.abs(Number(attr(tag, "height")) - h) < 1e-9, `bar ${i} height`);
    assert.ok(Math.abs(Number(attr(tag, "y")) - (34 - h)) < 1e-9, `bar ${i} y`);
  });
  assert.match(html, /<title>4–6% — 30 seats<\/title>/);
  assert.match(html, /<title>2–4% — 26 seats<\/title>/);
  assert.match(html, /<title>40% and wider — 12 seats<\/title>/);
  assert.match(html, /<title>38–40% — 0 seats<\/title>/);
});

test("the caption of a selected bin says its range, and the open-ended one says it has no top", () => {
  const props = { bins: bins({ 4: 5, 40: 3 }), total: 8 };
  const [two, last] = renderAll([
    { component: "MarginDistribution", props: { ...props, selected: 4 } },
    { component: "MarginDistribution", props: { ...props, selected: 40 } },
  ]) as [string, string];
  assert.match(two, /Showing seats decided by 4–6%\./);
  assert.match(last, /Showing seats decided by 40% and wider\./);
  assert.doesNotMatch(last, /40–42%/);
});

test("the middle tick sits on the edge of the bar that starts at 20%", () => {
  const [html] = renderAll([{ component: "MarginDistribution", props: { bins: bins({ 4: 5 }), total: 5 } }]) as [string];
  const m = /<span style="left:([0-9.]+)%">20%<\/span>/.exec(html);
  assert.ok(m !== null, "the 20% tick is placed");
  assert.ok(Math.abs(Number(m[1]) - (10 / 21) * 100) < 1e-6, `at ${m[1]}%, not at the middle of the band`);
  assert.match(html, /<span>0%<\/span>/);
  assert.match(html, /<span>40%\+<\/span>/);
});
