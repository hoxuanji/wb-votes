// The stylesheet as a set of claims, checked.
//
// WHY A TEST FOR CSS. Two of the things the brief requires are properties of the stylesheet and of nothing
// else: that text clears a contrast floor, and that status is never carried by colour alone. Neither is
// visible to `tsc`, neither is visible in a render, and this sandbox cannot open a browser — so without
// this file they are claims in a comment. The first version of iei.css failed both: `--iei-ink-3` was
// 4.41:1 against the canvas (the floor for small text is 4.5) and a fourth tier at 2.2:1 was rendering the
// word "not reported", which made the least readable text on the page the text whose whole job is to be
// read instead of hidden.
//
// It parses the stylesheet rather than a copy of its values. A test that restated the hexes would pass
// forever while the file drifted.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DIVERGING, LINE_SUBTLE, SURFACE, TEXT_MUTED, TEXT_PRIMARY, TEXT_SECONDARY } from "./palette.ts";
import { NOT_HELD } from "./party-ink.ts";
import { NEUTRAL_RIBBON_INK } from "./ribbon-ink.ts";

const CSS = readFileSync(new URL("../../../../src/app/iei.css", import.meta.url), "utf8");

/** Custom properties, as declared. */
function tokens(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of CSS.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    out[m[1] as string] = (m[2] as string).toLowerCase();
  }
  return out;
}

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * (r as number) + 0.7152 * (g as number) + 0.0722 * (b as number);
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** WCAG AA for text below 18.66px bold / 24px regular — which is every size on this page. */
const TEXT_FLOOR = 4.5;
/** WCAG AA for a non-text mark that has to be distinguishable. */
const MARK_FLOOR = 3;

test("every ink that renders text clears the small-text contrast floor on every surface it sits on", () => {
  const t = tokens();
  const surfaces = ["iei-bg", "iei-panel", "iei-raised"].map((k) => {
    assert.ok(t[k] !== undefined, `${k} is not declared`);
    return [k, t[k] as string] as const;
  });
  // Every ink tier and every semantic hue. `line` and `line-2` are borders and are exempt; they are
  // checked as marks below.
  const inks = Object.keys(t).filter((k) => /^iei-(ink|good|warn|alert|a-)/.test(k));
  assert.ok(inks.length >= 11, `only ${inks.length} text tokens found (5 inks and semantic hues, and the 6 signal hues) — the parser has stopped matching`);
  for (const ink of inks) {
    for (const [name, surface] of surfaces) {
      const c = contrast(t[ink] as string, surface);
      assert.ok(
        c >= TEXT_FLOOR,
        `--${ink} (${t[ink]}) is ${c.toFixed(2)}:1 on --${name} (${surface}) — the floor for text is ${TEXT_FLOOR}`,
      );
    }
  }
});

test("the chrome's signal hues are six, and none of them is read by a rule that draws a data mark", () => {
  // The rule at the top of iei.css: a hue on a seat, a bar, a ribbon, a dot or a legend swatch means a party or a magnitude,
  // and every hue in the band is within a few ΔE of some party (palette.ts), so the signal hues are an edge, a marker, a label
  // or a wash and never a fill that encodes. This reads every rule that uses `--accent`, `--page` or an `--iei-a-*` token and
  // refuses the ones whose selector names a mark.
  const t = tokens();
  assert.deepEqual(
    Object.keys(t).filter((k) => k.startsWith("iei-a-")).sort(),
    ["iei-a-amber", "iei-a-cyan", "iei-a-indigo", "iei-a-rose", "iei-a-teal", "iei-a-violet"],
  );
  const MARK = /\.iei-(map|sw|seat-bar|seat-bullet|res-|held-ink|dist|arc|flow|fig|tile|vs|rk|pf|line|vote|ribbon|chip|dot)\b/;
  const offenders: string[] = [];
  for (const m of CSS.matchAll(/([^{}@][^{}]*)\{([^{}]*)\}/g)) {
    const selector = (m[1] as string).replace(/\/\*[\s\S]*?\*\//g, "").trim();
    const body = m[2] as string;
    if (!/var\(--(accent|page|iei-a-)/.test(body)) continue;
    // A custom-property DECLARATION (`.iei-sec:nth-of-type(2) { --accent: var(--iei-a-cyan) }`) assigns a hue; it draws nothing.
    if (/^\s*--(accent|page)\s*:/.test(body.trim()) && !/(background|border|stroke|fill|box-shadow|color)\s*:/.test(body.replace(/--(accent|page)\s*:[^;]*;?/g, ""))) continue;
    if (MARK.test(selector)) offenders.push(selector);
  }
  assert.deepEqual(offenders, [], "a signal hue is drawn on a data mark");
});

test("every kind of page Shell can name has a hue, so a new one cannot fall back to the front page's without anyone choosing it", () => {
  const shell = readFileSync(new URL("../../../../src/components/iei/Shell.tsx", import.meta.url), "utf8");
  const union = /export type Section = ([^;]+);/.exec(shell)?.[1] ?? "";
  const kinds = [...union.matchAll(/'([a-z]+)'/g)].map((m) => m[1] as string);
  assert.ok(kinds.length >= 7, `read ${kinds.length} kinds from Shell's Section type`);
  for (const k of kinds) {
    // 'india' is the default (`.iei { --page: indigo }`); every other kind says its own.
    if (k === "india") continue;
    assert.ok(CSS.includes(`.iei[data-here='${k}'] { --page:`), `no --page hue for the '${k}' kind of page`);
  }
  assert.match(shell, /data-here=\{here\}/, "Shell no longer puts the kind of page on its wrapper");
});

test("there is no ink tier too dim for text, because everything it rendered carried meaning", () => {
  // The specific regression: a fourth tier existed at 2.2:1 and rendered "not reported", "Unavailable" and
  // the ⌘K hint. Its absence is the fix, so its absence is what is asserted.
  assert.equal(CSS.includes("--iei-ink-4"), false, "a fourth ink tier is back; check what it renders");
});

test("the borders and marks that are not text still clear the mark floor against their surface", () => {
  const t = tokens();
  // A hairline divider is decoration and is deliberately below the mark floor — it must not compete with
  // the data. But it must be VISIBLE, or the page has no structure.
  for (const line of ["iei-line", "iei-line-2"]) {
    const c = contrast(t[line] as string, t["iei-bg"] as string);
    assert.ok(c > 1.15, `--${line} is invisible against the canvas (${c.toFixed(2)}:1)`);
    assert.ok(c < MARK_FLOOR, `--${line} is loud enough to read as a mark (${c.toFixed(2)}:1)`);
  }
});

test("every colour the TypeScript copies from the stylesheet is the stylesheet's, role for role", () => {
  // Charts and seat fills are built as strings and cannot read a CSS variable, so each of these is a copy of a
  // token. Two of them had drifted: the chart axis ink was #818198 after --iei-ink-3 moved to #8b8ba2, and the
  // no-data fill was a grey-violet after --iei-void moved to indigo, so the same absence was two colours on one
  // map. The test reads the stylesheet, so whichever side moves next, the other is told.
  const t = tokens();
  const copies: Record<string, string> = {
    "iei-panel": SURFACE,
    "iei-line": LINE_SUBTLE,
    "iei-ink": TEXT_PRIMARY,
    "iei-ink-2": TEXT_SECONDARY,
    "iei-ink-3": TEXT_MUTED,
    "iei-good": DIVERGING.up,
    "iei-alert": DIVERGING.down,
    "iei-void": NOT_HELD,
  };
  for (const [token, copy] of Object.entries(copies)) {
    assert.ok(t[token] !== undefined, `--${token} is not declared`);
    assert.equal(copy.toLowerCase(), t[token], `the TypeScript copy of --${token} is ${copy}, the stylesheet's is ${t[token]}`);
  }
  assert.equal(NEUTRAL_RIBBON_INK.toLowerCase(), t["iei-ink-3"], "the neutral ribbon is --iei-ink-3, and is not");
});

test("the no-data ink is not a mark: below the mark floor on every surface, and still visible against the canvas", () => {
  // The claim the stylesheet makes in a comment, held where it can fail. party-ink.test.ts holds the same for NOT_HELD.
  const t = tokens();
  for (const surface of ["iei-bg", "iei-panel", "iei-raised"]) {
    const c = contrast(t["iei-void"] as string, t[surface] as string);
    assert.ok(c < MARK_FLOOR, `--iei-void reads as a mark on ${surface} (${c.toFixed(2)}:1)`);
  }
  assert.ok(contrast(t["iei-void"] as string, t["iei-bg"] as string) > 1.05, "--iei-void is invisible against the canvas");
});

test("status is never colour alone — every status class ships a shape or a word", () => {
  // Coverage: three states. Each must have BOTH a colour rule and a shape rule, because a greyscale print,
  // a forced-colors palette and a colourblind reader all lose the hue.
  for (const state of ["complete", "partial", "unavailable"]) {
    const cls = `.iei-cov-${state}`;
    assert.ok(CSS.includes(cls), `${cls} is not defined`);
    const shaped = new RegExp(`${cls.replace(".", "\\.")} \\.iei-cov-mark\\s*\\{[^}]*(background|border-style)`);
    assert.match(CSS, shaped, `${cls} distinguishes itself by colour alone — no fill or border shape`);
  }
  // The provenance chip: four bases, each with its own border treatment as well as its own colour.
  for (const basis of ["measured", "derived", "reference", "absent"]) {
    assert.ok(CSS.includes(`.iei-basis-${basis}`), `.iei-basis-${basis} is not defined`);
  }
  assert.match(CSS, /\.iei-basis-reference\s*\{[^}]*border-bottom-style:\s*dashed/);
  assert.match(CSS, /\.iei-basis-absent\s*\{[^}]*border-bottom-style:\s*dotted/);
});

const TREATMENT = /(border-bottom|border-color|box-shadow|background|color|stroke)/;

test("focus is always visible, and forced-colors gets a real outline", () => {
  // `outline: none` is only safe when something replaces it. Usually that is in the same block; for an SVG
  // `<a>` it cannot be — an anchor in SVG has no box to outline, so the treatment goes on its `path`. Both
  // are accepted; a rule with NEITHER is a control that takes focus and shows nothing.
  const rules = [...CSS.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({
    selector: (m[1] as string).split("\n").pop()?.trim() ?? "",
    body: m[2] as string,
  }));
  const bare = rules.filter((r) => /outline:\s*none/.test(r.body) && !TREATMENT.test(r.body));
  const withTreatment = rules.filter((r) => TREATMENT.test(r.body));
  assert.ok(
    rules.filter((r) => /outline:\s*none/.test(r.body)).length > 5,
    "the focus rules have moved; this test is no longer reading them",
  );
  for (const r of bare) {
    assert.ok(
      withTreatment.some((other) => other.selector.startsWith(`${r.selector} `)),
      `${r.selector} removes the focus outline and nothing — not itself, not a descendant — replaces it`,
    );
  }
  // And the system must own the treatment where it insists on doing so.
  assert.match(CSS, /@media \(forced-colors: active\)/, "no forced-colors block");
  assert.ok(
    (CSS.match(/outline:\s*2px solid CanvasText/g) ?? []).length >= 3,
    "forced-colors does not restore an outline on the focusable things",
  );
});

test("an anchor drawn around a `use` has a focus treatment that names the `use`, because an SVG anchor has no box to outline", () => {
  // The History map draws `<a><use/></a>`, and the rule that styled the other map's anchors named a `path`, so for a while its links took focus and
  // showed nothing. They are out of the tab order now (render.test.ts holds that); this holds the second line of defence, that if one does take focus
  // it shows it, in the ordinary treatment and in forced-colors.
  assert.match(CSS, /\.iei-tm-fig a:focus-visible use\s*\{[^}]*stroke:/, "the History map's links have no focus stroke");
  assert.match(CSS, /\.iei-tm-fig a:focus-visible use,[^{]*\{[^}]*outline:\s*2px solid CanvasText/, "forced-colors does not restore an outline on the History map's links");
});

test("a phone's first screen: the rail fits its six places, the layer strip is one row, and the map's names are hidden with its labels", () => {
  // The rules that put the map on a phone's first screen, held where they can fail. Each was a measured defect at 390px: the rail scrolled so "People"
  // and "Data" were off the edge, six layer chips wrapped to three rows, and map text set in map units is a smudge at that width.
  const phone = [...CSS.matchAll(/@media \(max-width: 640px\) \{([\s\S]*?)\n\}/g)].map((m) => m[1] as string).join("\n");
  assert.match(phone, /\.iei-rail a \{[^}]*flex:\s*1 1 0/, "the rail's items no longer share the phone's width");
  assert.match(phone, /\.iei-tabs-row \{[^}]*flex-wrap:\s*nowrap/, "the map's layer strip wraps on a phone again");
  assert.match(phone, /\.iei-map-labels,\s*\.iei-map-names \{[^}]*display:\s*none/, "the map's names are drawn on a phone, where they are about 6px");
  // Two overflow fixes, each measured: a scroll region is the containing block of its own screen-reader text (the page scrolled sideways by 198px at
  // 390px with nothing visible out there), and a row's long aside wraps under its title (21px at 320px).
  assert.match(phone, /\.iei-tabs-row \{[^}]*position:\s*relative/, "the layer strip is not its own containing block, so its hidden text can widen the page");
  assert.match(phone, /\.iei-row-h \{[^}]*flex-wrap:\s*wrap/, "a row's long aside cannot wrap under its title, and overflows a 320px page");
});

test("every context that can hold a link in prose has the one link treatment", () => {
  // The defect this caught: the treatment covered `.iei-record a` and `.iei-foot a` and nothing else, so a
  // link inside a section note, a caveat, a table caption, a data row's detail or the line under an answer
  // fell through to the browser default — blue and underlined, on a page whose one stated rule is that hue is
  // spent on data alone. Six contexts render prose that may contain a link; all six must be named.
  // Anchored on `.iei-foot a`, which is the first selector in the group. It used to be `.iei-record a` — the
  // dateline — and the final design pass deleted that strip, which would have made this regex match nothing
  // and the loop below assert nothing at all.
  const treated = /\.iei-foot a,([\s\S]*?)\.iei-body-link \{/.exec(CSS)?.[1] ?? "";
  for (const cls of ["iei-note", "iei-caveat", "iei-sub", "iei-empty", "iei-row-d", "iei-t caption"]) {
    assert.ok(treated.includes(`.${cls} a,`), `.${cls} a is not in the link treatment`);
  }
  // And each has a hover and a focus rule, or the treatment is decoration rather than an affordance.
  for (const state of ["hover", "focus-visible"]) {
    assert.match(CSS, new RegExp(`\\.iei-note a:${state}`), `.iei-note a has no :${state}`);
  }
});

test("motion is opt-out, and the reduced-motion rule covers pseudo-elements too", () => {
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\)/);
  const block = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? "";
  assert.match(block, /animation:\s*none/, "reduced motion does not stop animation");
  assert.match(block, /transition:\s*none/, "reduced motion does not stop transitions");
});

test("the layout collapses to one column on a phone rather than shrinking", () => {
  // "Do not simply shrink the desktop dashboard": every multi-column grid must be redeclared as one
  // column — or as fewer columns — inside a narrow breakpoint, not merely scaled by a smaller font.
  //
  // The list of grids is DERIVED rather than written down. The previous version named four classes, and
  // the moment one of them stopped being a grid the test was asserting something about a rule that no
  // longer existed while saying nothing about the grids that had replaced it.
  const narrow = [...CSS.matchAll(/@media \(max-width: (\d+)px\)/g)]
    .filter((m) => Number(m[1]) <= 1080)
    .map((m) => CSS.slice((m.index ?? 0) + (m[0] as string).length))
    .join("\n");
  assert.ok(narrow.length > 0, "no narrow breakpoint at all");

  // Grids declared outside any breakpoint, with more than one column.
  const wide = CSS.slice(0, CSS.indexOf("@media (max-width: 1080px)"));
  const grids = new Set<string>();
  for (const m of wide.matchAll(/\.(iei-[a-z0-9-]+)[^{}]*\{([^}]*grid-template-columns:[^;]*;[^}]*)\}/g)) {
    const cols = (/grid-template-columns:([^;]*);/.exec(m[2] as string)?.[1] ?? "").trim();
    // `repeat(auto-fit, …)` has no fixed count and is responsive by construction, so it is not a grid that
    // needs a breakpoint. Everything else is multi-column if it repeats more than once or names more than
    // one track.
    const fixedRepeat = /repeat\(\s*(\d+)/.exec(cols);
    const tracks = (cols.match(/minmax\(|(?:^|\s)(?:auto|\d+(?:px|fr|%))/g) ?? []).length;
    const multi = fixedRepeat !== null ? Number(fixedRepeat[1]) > 1 : !/auto-fit|auto-fill/.test(cols) && tracks > 1;
    if (multi) grids.add(m[1] as string);
  }
  // Three: the two-column panel row, its wide variant, and the map split. The metric grid is deliberately
  // NOT among them — `repeat(auto-fit, minmax(...))` is responsive by construction and has no column count
  // to redeclare, which is also why it can never render an empty cell.
  assert.ok(grids.size >= 3, `only ${grids.size} multi-column grids found — the parser has stopped matching`);
  assert.ok(
    !grids.has("iei-metrics"),
    "the metric grid has a fixed column count again; auto-fit is what stops it painting an empty cell",
  );
  for (const grid of grids) {
    assert.ok(
      new RegExp(`\\.${grid}[^{]*\\{[^}]*grid-template-columns`).test(narrow),
      `.${grid} keeps its desktop column count on a phone`,
    );
  }
});

/* ────────────────────────────── the token discipline ────────────────────────────── */

test("every length in the stylesheet comes from the scale", () => {
  // Phase 2.5's second rule: a rule that wants 18px has not decided whether it means 16 or 24. The scale
  // is declared once and this test is what keeps it from growing a tenth value by accident — the file it
  // replaced had thirteen font sizes and cell padding at 3, 6, 10 and 12 pixels.
  //
  // Everything outside the :root token block, and outside the exemptions named below, must use a var().
  const root = /:root \{([\s\S]*?)\n\}/.exec(CSS);
  assert.ok(root !== null, ":root token block not found");
  // Comments come out first. This file argues with itself in prose — "6px, 8px, 10px and 12px of cell
  // padding", "25px, not 64px" — and a scanner that reads the argument as a declaration reports the
  // problem being described as the problem existing.
  const body = CSS.replace(root[0] as string, "").replace(/\/\*[\s\S]*?\*\//g, "");

  // Hairlines, sub-pixel strokes and the handful of shapes whose size IS their meaning. Each is listed
  // rather than pattern-matched, so adding one is a decision someone makes here.
  const EXEMPT = new Set([
    "1px", // every hairline border, and there is only one border width
    "2px", // the focus underline and the provenance rule — both are "twice a hairline"
    "0px",
    "6px", // the magnitude bar's height and the scrollbar's width: marks, not spacing
    "7px", // the coverage chip's square
    "9px", // the party swatch
    "16px", // the sparkline's height, and iOS's minimum input size
    "64px", // the sparkline's width
    "56px", // the minimum width of a bar column, so a bar is never a sliver
    "44px", // the minimum width of a magnitude track
    "320px", // the map's minimum column before the split stacks
    "640px", // the authored width of a chart's viewBox, so its type is not scaled up
    "500px", // a window this short (a phone on its side, a laptop at 400% zoom) drops the sticky top bar: it would keep a quarter of the screen for good
    "200px", // the narrowest a metric tile may be before the grid drops a column
    "140px", // the narrowest a district name may be laid out in before the state page's grid drops a column.
             // A mark, not spacing: it is the measure of the longest district name the registry holds
             // ("SOUTH 24 PARGANAS") at the size that list renders, so it is a property of the data.
    "1040px", // the reading measure
    "760px", // the floor under a table whose columns hold prose
    "300px",
    "380px",
    "460px", // the three scroll-region heights, which are viewport decisions
    "900px",
    "1080px", // the two breakpoints
    "1024px", // the width from which the map stays in view beside a list that scrolls
    "21px", // the answer at the narrow breakpoint, declared as a token override
    "420px", // the command bar's maximum width
    "12px", // the result strip's swatch: a mark whose size IS its meaning, beside 24px type
    "34px", // the page title at the 900px breakpoint and below (52px above it), declared as a token override
    "620px", // the map's maximum height elsewhere
  ]);

  const offenders = new Map<string, number>();
  for (const m of body.matchAll(/(?<![-\w])(\d+(?:\.\d+)?px)/g)) {
    const px = m[1] as string;
    if (EXEMPT.has(px)) continue;
    offenders.set(px, (offenders.get(px) ?? 0) + 1);
  }
  assert.deepEqual(
    [...offenders.entries()].sort(),
    [],
    `raw pixel values outside the scale: ${[...offenders.entries()].map(([px, n]) => `${px}×${n}`).join(", ")}`,
  );
});

test("the spacing scale is the one the brief specifies, and there is no eighth step", () => {
  const t = [...CSS.matchAll(/--iei-(\d+):\s*(\d+)px/g)].map((m) => [Number(m[1]), Number(m[2])] as const);
  assert.deepEqual(
    t,
    [
      [1, 4],
      [2, 8],
      [3, 12],
      [4, 16],
      [6, 24],
      [8, 32],
      [12, 48],
    ],
    "the spacing scale is not 4·8·12·16·24·32·48",
  );
  // The step number IS the multiple of 4, so --iei-6 is 24px and there is no arithmetic to remember.
  for (const [step, px] of t) assert.equal(px, step * 4, `--iei-${step} is not ${step * 4}px`);
});

test("there are seven type sizes and every one of them is used", () => {
  // The :root block only. A breakpoint may REDECLARE a token — that is the point of having them — and the
  // override for the answer at 900px is not an eighth size.
  const root = /:root \{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? "";
  const declared = [...root.matchAll(/--iei-f-([a-z]+):\s*([\d.]+)px/g)].map(
    (m) => [m[1] as string, Number(m[2])] as const,
  );
  assert.equal(
    declared.length,
    7,
    `${declared.length} type sizes declared, not 7: ${declared.map(([n]) => n).join(", ")}`,
  );
  for (const [name] of declared) {
    const uses = (CSS.match(new RegExp(`var\\(--iei-f-${name}\\)`, "g")) ?? []).length;
    assert.ok(uses > 0, `--iei-f-${name} is declared and never used`);
  }
  // Monotonic, so the scale is a scale rather than seven names.
  const px = declared.map(([, v]) => v);
  assert.deepEqual(px, [...px].sort((a, b) => a - b), "the type sizes are not declared smallest-first");
});

test("radius is one token and it does not grow", () => {
  assert.match(CSS, /--iei-r:\s*8px/, "the radius token is not 8px");
  // It was 2px until the 2026-10-29 look decision ("this still looks a school project"): a card is a card now. What the test still
  // holds is that there is ONE radius. The exceptions are a circle (the live dot) and the 1px square of the coverage mark.
  const radii = [...CSS.matchAll(/border-radius:\s*([^;]+);/g)]
    .map((m) => (m[1] as string).trim())
    .filter((v) => !v.includes("var(--iei-r)") && v !== "50%" && v !== "1px");
  assert.deepEqual(radii, [], `border-radius values that are not the token: ${radii.join(", ")}`);
});

test("a legend's note may wrap, though its swatch-and-label items may not, so a sentence in a legend cannot widen the page", () => {
  // `.iei-legend li` is nowrap because a swatch must stay with its label. The note in the flips legend is a sentence, not a label, and
  // inherited that: on a phone it was 439px in a 366px list and the page scrolled sideways. The declaration is checked here; the pixels
  // were measured in a browser.
  const rule = /\.iei-legend \.iei-legend-note \{([^}]*)\}/.exec(CSS);
  assert.ok(rule !== null, "the note has no rule of its own that beats `.iei-legend li`");
  assert.match(rule[1] as string, /white-space:\s*normal/);
  assert.match(CSS, /\.iei-legend li \{[^}]*white-space:\s*nowrap/, "the items keep their swatch with their label");
});
