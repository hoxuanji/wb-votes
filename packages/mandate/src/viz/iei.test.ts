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
import {
  DIVERGING_DARK,
  DIVERGING_LIGHT,
  LINE_SUBTLE_DARK,
  LINE_SUBTLE_LIGHT,
  SURFACE,
  SURFACE_LIGHT,
  TEXT_MUTED_DARK,
  TEXT_MUTED_LIGHT,
  TEXT_PRIMARY_DARK,
  TEXT_PRIMARY_LIGHT,
  TEXT_SECONDARY_DARK,
  TEXT_SECONDARY_LIGHT,
} from "./palette.ts";
import { LIGHT_SURFACES, NOT_HELD_DARK, NOT_HELD_LIGHT } from "./party-ink.ts";
import { NEUTRAL_RIBBON_INK_DARK, NEUTRAL_RIBBON_INK_LIGHT } from "./ribbon-ink.ts";

const CSS = readFileSync(new URL("../../../../src/app/iei.css", import.meta.url), "utf8");

type Theme = "light" | "dark";
const THEMES: readonly Theme[] = ["light", "dark"];

/**
 * Custom properties, as declared, for one theme. A token that differs between themes is `light-dark(LIGHT, DARK)` and is declared once;
 * a token that does not is a bare hex. Defaults to dark, which the TypeScript copies (palette.ts, party-ink.ts) are held equal to.
 */
function tokens(theme: Theme = "dark"): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /--([a-z0-9-]+):\s*(?:light-dark\(\s*(#[0-9a-fA-F]{6})\s*,\s*(#[0-9a-fA-F]{6})\s*\)|(#[0-9a-fA-F]{6}))/g;
  for (const m of CSS.matchAll(re)) {
    const hex = m[4] ?? (theme === "light" ? m[2] : m[3]);
    out[m[1] as string] = (hex as string).toLowerCase();
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

test("every ink that renders text clears the small-text contrast floor on every surface it sits on, in both themes", () => {
  for (const theme of THEMES) inksClearTheFloor(theme);
});

function inksClearTheFloor(theme: Theme): void {
  const t = tokens(theme);
  const surfaces = ["iei-bg", "iei-panel", "iei-raised"].map((k) => {
    assert.ok(t[k] !== undefined, `${k} is not declared`);
    return [k, t[k] as string] as const;
  });
  // Every ink tier and every semantic hue. `line` and `line-2` are borders and are exempt; they are
  // checked as marks below.
  const inks = Object.keys(t).filter((k) => /^iei-(ink|good|warn|alert|a-)/.test(k));
  assert.ok(inks.length >= 7, `only ${inks.length} text tokens found (3 inks, 3 semantic hues and the one accent) — the parser has stopped matching`);
  assert.ok(inks.includes("iei-a-indigo"), "the accent is not among the inks that are checked as text");
  for (const ink of inks) {
    for (const [name, surface] of surfaces) {
      const c = contrast(t[ink] as string, surface);
      assert.ok(
        c >= TEXT_FLOOR,
        `${theme}: --${ink} (${t[ink]}) is ${c.toFixed(2)}:1 on --${name} (${surface}) — the floor for text is ${TEXT_FLOOR}`,
      );
    }
  }
}

test("the chrome has ONE accent, and none of the rules that read it draws a data mark", () => {
  // The rule at the top of iei.css: a hue on a seat, a bar, a ribbon, a dot or a legend swatch means a party or a magnitude, and the accent's hue is
  // within a few ΔE of some party (palette.ts), so it is an edge, a marker, a label, a focus ring or a fill that carries a word, never a fill that
  // encodes. This reads every rule that uses `--accent`, `--page`, `--iei-wash` or the accent token and refuses the ones whose selector names a mark.
  // (It used to hold six signal hues, one per kind of page; the per-page cycle is gone and the next test holds that.)
  const t = tokens();
  assert.deepEqual(
    Object.keys(t).filter((k) => k.startsWith("iei-a-")),
    ["iei-a-indigo"],
    "the chrome has more than one accent hue",
  );
  const MARK = /\.iei-(map|sw|seat-bar|seat-bullet|res-|held-ink|dist|arc|flow|fig|tile|vs|rk|pf|line|vote|ribbon|chip|dot)\b/;
  const offenders: string[] = [];
  let readers = 0;
  for (const m of CSS.matchAll(/([^{}@][^{}]*)\{([^{}]*)\}/g)) {
    const selector = (m[1] as string).replace(/\/\*[\s\S]*?\*\//g, "").trim();
    const body = m[2] as string;
    if (!/var\(--(accent|page|iei-a-|iei-wash)/.test(body)) continue;
    // A custom-property DECLARATION assigns the accent to a name; it draws nothing.
    if (/^\s*--(accent|page)\s*:/.test(body.trim()) && !/(background|border|stroke|fill|box-shadow|color)\s*:/.test(body.replace(/--(accent|page)\s*:[^;]*;?/g, ""))) continue;
    readers++;
    // A selector LIST is read one selector at a time, and a text link (`.iei-fig figcaption a`) is a link in a caption, not a mark.
    for (const one of selector.split(",").map((x) => x.trim())) {
      if (/(^|\s)a(:[\w-]+)?$/.test(one)) continue;
      // A focus ring is the accent as an AFFORDANCE round a control, wherever that control is; it is not a fill, so it cannot be mistaken for a mark.
      if (/:focus-(visible|within)$/.test(one)) continue;
      if (MARK.test(one)) offenders.push(one);
    }
  }
  assert.ok(readers >= 10, `only ${readers} rules read the accent — the parser has stopped matching`);
  assert.deepEqual(offenders, [], "the accent is drawn on a data mark");
});

test("there is one accent for every kind of page: no per-page hue, and --accent and --page resolve to the one token", () => {
  const shell = readFileSync(new URL("../../../../src/components/iei/Shell.tsx", import.meta.url), "utf8");
  // A kind of page may still be named (Shell puts it on its wrapper, for a rule that wants it), but none may choose a hue.
  assert.match(shell, /data-here=\{here\}/, "Shell no longer puts the kind of page on its wrapper");
  assert.doesNotMatch(CSS, /\[data-here[^\]]*\]\s*\{[^}]*--(page|accent)/, "a kind of page sets its own hue again");
  assert.doesNotMatch(CSS, /\.iei-sec:nth-(of-type|child)\([^)]*\)\s*\{[^}]*--(page|accent)/, "a section takes its own hue again");
  assert.match(CSS, /--accent:\s*var\(--iei-a-indigo\)/, "--accent is not the indigo token");
  assert.match(CSS, /--page:\s*var\(--accent\)/, "--page is not the accent");
  // And nothing else assigns either name: a single declaration each, in :root.
  assert.equal((CSS.match(/(?<![\w-])--accent\s*:/g) ?? []).length, 1, "--accent is declared more than once");
  assert.equal((CSS.match(/(?<![\w-])--page\s*:/g) ?? []).length, 1, "--page is declared more than once");
});

test("text on an accent fill clears the small-text floor, and the accent's wash under the rail's current place does too, in both themes", () => {
  for (const theme of THEMES) {
    const t = tokens(theme);
    assert.ok(t["iei-on-accent"] !== undefined, `${theme}: --iei-on-accent is not declared`);
    const fill = contrast(t["iei-on-accent"] as string, t["iei-a-indigo"] as string);
    assert.ok(fill >= TEXT_FLOOR, `${theme}: the ink on an accent fill (a chosen segment, a primary button) is ${fill.toFixed(2)}:1, under ${TEXT_FLOOR}`);
    // The current rail place is the accent's text on a 12% wash of the accent over the canvas (--iei-wash), mixed here in sRGB, which is within a
    // few hundredths of the browser's oklab mix at this strength.
    const mix = (a: string, b: string, k: number): string =>
      `#${[1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * k + parseInt(b.slice(i, i + 2), 16) * (1 - k)).toString(16).padStart(2, "0")).join("")}`;
    for (const surface of ["iei-bg", "iei-panel"]) {
      const wash = mix(t["iei-a-indigo"] as string, t[surface] as string, 0.12);
      const c = contrast(t["iei-a-indigo"] as string, wash);
      assert.ok(c >= TEXT_FLOOR, `${theme}: the accent on its own wash over --${surface} is ${c.toFixed(2)}:1, under ${TEXT_FLOOR}`);
    }
  }
});

test("there is no ink tier too dim for text, because everything it rendered carried meaning", () => {
  // The specific regression: a fourth tier existed at 2.2:1 and rendered "not reported", "Unavailable" and
  // the ⌘K hint. Its absence is the fix, so its absence is what is asserted.
  assert.equal(CSS.includes("--iei-ink-4"), false, "a fourth ink tier is back; check what it renders");
});

test("the borders and marks that are not text still clear the mark floor against their surface, in both themes", () => {
 for (const theme of THEMES) {
  const t = tokens(theme);
  // A hairline divider is decoration and is deliberately below the mark floor — it must not compete with
  // the data. But it must be VISIBLE, or the page has no structure.
  for (const line of ["iei-line", "iei-line-2"]) {
    const c = contrast(t[line] as string, t["iei-bg"] as string);
    assert.ok(c > 1.15, `${theme}: --${line} is invisible against the canvas (${c.toFixed(2)}:1)`);
    assert.ok(c < MARK_FLOOR, `${theme}: --${line} is loud enough to read as a mark (${c.toFixed(2)}:1)`);
  }
 }
});

test("every colour the TypeScript copies from the stylesheet is the stylesheet's, role for role, in both themes", () => {
  // Charts and seat fills are built as strings and cannot read a CSS variable, so each of these is a copy of a
  // token (a theme-following pair of them, `light-dark(LIGHT, DARK)`, is what the DOM gets: palette.ts, party-ink.ts). Two of them had
  // drifted: the chart axis ink was #818198 after --iei-ink-3 moved to #8b8ba2, and the no-data fill was a grey-violet after
  // --iei-void moved to indigo, so the same absence was two colours on one map. The test reads the stylesheet, so whichever side
  // moves next, the other is told. The dark copies are the dark half of each token; the light copies are the light half.
  const copies: Record<Theme, Record<string, string>> = {
    dark: {
      "iei-panel": SURFACE,
      "iei-line": LINE_SUBTLE_DARK,
      "iei-ink": TEXT_PRIMARY_DARK,
      "iei-ink-2": TEXT_SECONDARY_DARK,
      "iei-ink-3": TEXT_MUTED_DARK,
      "iei-good": DIVERGING_DARK.up,
      "iei-alert": DIVERGING_DARK.down,
      "iei-void": NOT_HELD_DARK,
    },
    light: {
      "iei-bg": LIGHT_SURFACES.bg,
      "iei-panel": SURFACE_LIGHT,
      "iei-raised": LIGHT_SURFACES.raised,
      "iei-line": LINE_SUBTLE_LIGHT,
      "iei-ink": TEXT_PRIMARY_LIGHT,
      "iei-ink-2": TEXT_SECONDARY_LIGHT,
      "iei-ink-3": TEXT_MUTED_LIGHT,
      "iei-good": DIVERGING_LIGHT.up,
      "iei-alert": DIVERGING_LIGHT.down,
      "iei-void": NOT_HELD_LIGHT,
    },
  };
  for (const theme of THEMES) {
    const t = tokens(theme);
    for (const [token, copy] of Object.entries(copies[theme])) {
      assert.ok(t[token] !== undefined, `--${token} is not declared`);
      assert.equal(copy.toLowerCase(), t[token], `${theme}: the TypeScript copy of --${token} is ${copy}, the stylesheet's is ${t[token]}`);
    }
  }
  assert.equal(NEUTRAL_RIBBON_INK_DARK.toLowerCase(), tokens("dark")["iei-ink-3"], "the neutral ribbon is --iei-ink-3, and is not");
  assert.equal(NEUTRAL_RIBBON_INK_LIGHT.toLowerCase(), tokens("light")["iei-ink-3"], "the light neutral ribbon is --iei-ink-3, and is not");
  assert.equal(SURFACE.toLowerCase(), tokens("dark")["iei-panel"]);
});

test("the no-data ink is not a mark: below the mark floor on every surface, and still visible against the canvas", () => {
  // The claim the stylesheet makes in a comment, held where it can fail. party-ink.test.ts holds the same for NOT_HELD.
  for (const theme of THEMES) {
    const t = tokens(theme);
    for (const surface of ["iei-bg", "iei-panel", "iei-raised"]) {
      const c = contrast(t["iei-void"] as string, t[surface] as string);
      assert.ok(c < MARK_FLOOR, `${theme}: --iei-void reads as a mark on ${surface} (${c.toFixed(2)}:1)`);
    }
    assert.ok(contrast(t["iei-void"] as string, t["iei-bg"] as string) > 1.05, `${theme}: --iei-void is invisible against the canvas`);
  }
});

test("the browser chrome's theme-color is the canvas, in each theme", () => {
  const layout = readFileSync(new URL("../../../../src/app/layout.tsx", import.meta.url), "utf8");
  for (const theme of THEMES) {
    const m = new RegExp(`prefers-color-scheme: ${theme}\\)', color: '(#[0-9a-fA-F]{6})'`).exec(layout);
    assert.ok(m !== null, `layout.tsx has no ${theme} themeColor`);
    assert.equal((m[1] as string).toLowerCase(), tokens(theme)["iei-bg"], `the ${theme} themeColor is not --iei-bg`);
  }
  assert.match(layout, /colorScheme: 'light dark'/, "the page no longer declares both colour schemes");
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
  // Focus is ONE treatment now: a 2px outline in the accent, offset from the control (inside it where the box clips). The old test accepted any of
  // an underline, a border or an inset shadow in ink; this one holds the new decision at least as strictly: every :focus-visible rule names a real
  // outline, or a stroke for an SVG anchor (which has no box to outline), or is only an offset tweak for a rule that does. `outline: none` is
  // still only safe where something replaces it (a group that draws the focus for its field, the skip link's own pill).
  const rules = [...CSS.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({
    selector: (m[1] as string).replace(/\/\*[\s\S]*?\*\//g, "").trim().split("\n").slice(-1)[0]?.trim() ?? "",
    full: (m[1] as string).replace(/\/\*[\s\S]*?\*\//g, "").trim(),
    body: m[2] as string,
  }));
  const focusRules = rules.filter((r) => /:focus-visible/.test(r.full));
  const accentOutline = /outline:\s*2px solid var\(--accent\);[\s\S]*outline-offset:\s*-?2px/;
  assert.ok(focusRules.filter((r) => accentOutline.test(r.body)).length >= 20, "the focus rules have moved; fewer than 20 draw the accent outline");
  const shows = (body: string): boolean =>
    accentOutline.test(body) || /outline:\s*2px solid (CanvasText|var\(--iei-ink\))/.test(body) || /stroke:/.test(body) || /^\s*outline-offset:\s*-?\d+px;\s*$/.test(body) || /outline:\s*none/.test(body);
  // A selector that shares a rule with :hover (`a:hover, a:focus-visible { colour }`) is shown by the rule that gives it its outline; the check is per selector.
  const shown = new Set(focusRules.filter((r) => shows(r.body)).flatMap((r) => r.full.split(",").map((x) => x.trim())));
  const unseen = focusRules.filter((r) => !shows(r.body)).flatMap((r) => r.full.split(",").map((x) => x.trim())).filter((x) => /:focus-visible/.test(x) && !shown.has(x));
  assert.deepEqual(unseen, [], "a :focus-visible selector shows no focus");
  // `outline: none` anywhere is replaced by something: the same rule's own treatment, or a descendant's.
  const bare = rules.filter((r) => /outline:\s*none/.test(r.body) && !TREATMENT.test(r.body));
  const withTreatment = rules.filter((r) => TREATMENT.test(r.body));
  for (const r of bare) {
    assert.ok(
      withTreatment.some((other) => other.selector.startsWith(`${r.selector} `)),
      `${r.selector} removes the focus outline and nothing — not itself, not a descendant — replaces it`,
    );
  }
  // The compound field draws the accent outline round the whole group, on :focus-within, so the input inside it may draw none.
  assert.match(CSS, /\.iei-cmd:focus-within \{[^}]*outline:\s*2px solid var\(--accent\)/, "the command bar's group draws no focus");
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

test("a phone's first screen: the rail is a fixed bottom tab bar of three 44px places, the layer strip is one row, and the map's names are hidden with its labels", () => {
  // The rules that put the map on a phone's first screen, held where they can fail. Each was a measured defect at 390px: the rail's places were off the
  // edge, six layer chips wrapped to three rows, and map text set in map units is a smudge at that width.
  const phone = [...CSS.matchAll(/@media \(max-width: 640px\) \{([\s\S]*?)\n\}/g)].map((m) => m[1] as string).join("\n");
  assert.match(phone, /\.iei-rail a \{[^}]*flex:\s*1 1 0/, "the rail's items no longer share the phone's width");
  assert.match(phone, /\.iei-rail a \{[^}]*min-height:\s*44px/, "a rail place is under a 44px target on a phone");
  assert.match(phone, /\.iei-rail \{[^}]*position:\s*fixed/, "the rail is not a fixed bottom bar on a phone");
  assert.match(phone, /\.iei-rail \{[^}]*bottom:\s*0/, "the rail is not at the foot of the window on a phone");
  assert.match(phone, /\.iei-rail \{[^}]*env\(safe-area-inset-bottom/, "the bottom bar ignores the home indicator's safe area");
  assert.match(phone, /\.iei-frame \{[^}]*padding-bottom:[^;]*env\(safe-area-inset-bottom/, "the content is not padded clear of the bottom bar");
  const shell = readFileSync(new URL("../../../../src/components/iei/Shell.tsx", import.meta.url), "utf8");
  const rail = /const RAIL[^=]*= \[([\s\S]*?)\n\];/.exec(shell)?.[1] ?? "";
  assert.equal((rail.match(/label:/g) ?? []).length, 3, "the rail has not three places");
  for (const place of ["Overview", "People", "Data"]) assert.ok(rail.includes(`label: '${place}'`), `the rail has no ${place}`);
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
    "1360px", // the width from which the rail is a labelled sidebar (its width is a rem token)
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

/** The smallest and the largest a type token can be: a plain `Npx` is both, a `clamp(Apx, preferred, Bpx)` is A and B. */
function sizeRange(value: string): [number, number] {
  const fixed = /^([\d.]+)px$/.exec(value);
  if (fixed !== null) return [Number(fixed[1]), Number(fixed[1])];
  const fluid = /^clamp\(\s*([\d.]+)px\s*,[^,]+,\s*([\d.]+)px\s*\)$/.exec(value);
  assert.ok(fluid !== null, `a type token is neither Npx nor clamp(Apx, preferred, Bpx): ${value}`);
  return [Number(fluid[1]), Number(fluid[2])];
}

test("there are seven type sizes, each used, smallest first at both ends of their range, and the hierarchy tiers are fluid", () => {
  // The :root block only. A breakpoint may REDECLARE a token — that is the point of having them. A size is `Npx` or a clamp() whose bounds are px,
  // so the scale is still seven named steps and a token can be fluid without becoming a continuum.
  const root = /:root \{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? "";
  const declared = [...root.matchAll(/--iei-f-([a-z]+):\s*([^;]+);/g)].map((m) => [m[1] as string, (m[2] as string).trim()] as const);
  assert.equal(
    declared.length,
    7,
    `${declared.length} type sizes declared, not 7: ${declared.map(([n]) => n).join(", ")}`,
  );
  for (const [name] of declared) {
    const uses = (CSS.match(new RegExp(`var\\(--iei-f-${name}\\)`, "g")) ?? []).length;
    assert.ok(uses > 0, `--iei-f-${name} is declared and never used`);
  }
  // Monotonic at the bottom of every range and at the top, so the scale is a scale rather than seven names, on a phone and on a wide laptop.
  const ranges = declared.map(([, v]) => sizeRange(v));
  const lows = ranges.map(([lo]) => lo);
  const highs = ranges.map(([, hi]) => hi);
  assert.deepEqual(lows, [...lows].sort((a, b) => a - b), "the type sizes are not declared smallest-first (at the phone's end)");
  assert.deepEqual(highs, [...highs].sort((a, b) => a - b), "the type sizes are not declared smallest-first (at the laptop's end)");
  assert.equal(new Set(highs).size, 7, "two type sizes are the same size on a wide laptop");
  // The answer, the lead and the title are fluid; a label, a cell and a paragraph are not necessarily.
  const byName = Object.fromEntries(declared);
  for (const name of ["answer", "lead", "title"]) assert.match(byName[name] as string, /^clamp\(/, `--iei-f-${name} is not fluid`);
  // The labels are 12-13px, which the brief fixes.
  assert.ok(lows[0] === 12 && lows[1] === 13, `the label tiers are ${lows[0]}px and ${lows[1]}px, not 12 and 13`);
});

test("radius is two tokens, and nothing but those two (and a circle, and a 1px square) rounds a corner", () => {
  assert.match(CSS, /--iei-r:\s*12px/, "the card radius token is not 12px");
  assert.match(CSS, /--iei-r-sm:\s*8px/, "the control radius token is not 8px");
  // The exceptions are a circle (the live dot), a 1px square (the coverage mark) and the 50% of a pie. A radius written as a length is a third radius.
  const radii = [...CSS.matchAll(/border-radius:\s*([^;]+);/g)]
    .map((m) => (m[1] as string).trim())
    .filter((v) => !/^(0|var\(--iei-r(-sm)?\))(\s+(0|var\(--iei-r(-sm)?\)))*$/.test(v) && v !== "50%" && v !== "1px");
  assert.deepEqual(radii, [], `border-radius values that are not the tokens: ${radii.join(", ")}`);
  assert.equal((CSS.match(/--iei-r(-sm)?:\s*[\d.]+px/g) ?? []).length, 2, "there is a third radius token");
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
