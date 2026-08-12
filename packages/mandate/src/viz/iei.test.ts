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
  const inks = Object.keys(t).filter((k) => /^iei-(ink|good|warn|alert)/.test(k));
  assert.ok(inks.length >= 5, `only ${inks.length} text tokens found — the parser has stopped matching`);
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
    const cols = /grid-template-columns:([^;]*);/.exec(m[2] as string)?.[1] ?? "";
    const n = (cols.match(/minmax|repeat\((\d+)/) ?? []).length;
    const repeat = /repeat\((\d+)/.exec(cols);
    const multi = repeat !== null ? Number(repeat[1]) > 1 : (cols.match(/minmax/g) ?? []).length > 1 || n > 1;
    if (multi) grids.add(m[1] as string);
  }
  assert.ok(grids.size >= 4, `only ${grids.size} multi-column grids found — the parser has stopped matching`);
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
    "1040px", // the reading measure
    "300px",
    "380px",
    "460px", // the three scroll-region heights, which are viewport decisions
    "640px", // the map's maximum height on a laptop
    "900px",
    "1080px", // the two breakpoints
    "21px", // the answer at the narrow breakpoint, declared as a token override
    "420px", // the command bar's maximum width
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
  assert.match(CSS, /--iei-r:\s*2px/, "the radius token is not 2px");
  // A rounded-card dashboard reads as a marketing page with data in it. The exceptions are a circle (the
  // live dot) and the 1px square of the coverage mark.
  const radii = [...CSS.matchAll(/border-radius:\s*([^;]+);/g)]
    .map((m) => (m[1] as string).trim())
    .filter((v) => !v.includes("var(--iei-r)") && v !== "50%" && v !== "1px");
  assert.deepEqual(radii, [], `border-radius values that are not the token: ${radii.join(", ")}`);
});
