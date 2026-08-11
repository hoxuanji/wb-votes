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
  // "Do not simply shrink the desktop dashboard": the multi-column grids must each be redeclared as one
  // column inside a narrow breakpoint, not merely scaled by a smaller font.
  const narrow = [...CSS.matchAll(/@media \(max-width: (\d+)px\) \{([\s\S]*?)\n\}/g)]
    .filter((m) => Number(m[1]) <= 1080)
    .map((m) => m[2] as string)
    .join("\n");
  assert.ok(narrow.length > 0, "no narrow breakpoint at all");
  for (const grid of ["iei-hero", "iei-two", "iei-map-split", "iei-metrics"]) {
    assert.ok(
      new RegExp(`\\.${grid}[^{]*\\{[^}]*grid-template-columns`).test(narrow),
      `.${grid} keeps its desktop column count on a phone`,
    );
  }
});
