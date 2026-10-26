// The motion rules, as claims about the stylesheet and checked against it.
//
// WHY A TEST FOR CSS. Motion in this product has a ceiling and a purpose (docs/superpowers/specs/2026-10-24-ui-rework-design.md,
// "Direction added 2026-10-25", item 3): it carries information or it does not exist, runs once on load, is over inside 700ms, is
// timed by tokens declared beside the spacing scale, and is off for anyone who asks for reduced motion. None of that is visible to
// `tsc` and none of it is visible in a screenshot, which can only show a first and a last frame. So the stylesheet is parsed.
//
// THE RULES
//   1. Every duration an animation uses is a motion token (`--iei-t-1..3`), and each token is at most 700ms.
//   2. A @keyframes rule names only its starting state (`from`), so an animation always ends at the element's own style and the
//      end state is the state the screenshots judge.
//   3. An animation is only ever declared inside `@media (prefers-reduced-motion: no-preference)`, so the default is no motion.
//   4. The reduced-motion block still switches animation and transition off, whatever else the file does.
//   5. Every animation a rule names has a @keyframes rule, and fills only `backwards`: it holds its start through a delay and leaves
//      nothing behind, so a finished page is exactly the page at rest.
//   6. A stagger is clamped: the delay is `min(calc(var(--i) * step), cap)`, and the cap plus the rule's duration is at most 700ms, so
//      the last wedge of a long row of parties arrives inside the same ceiling as the first.
//
// The checker is written as a function of a string and tried on literal bad CSS below. A rule that cannot fail proves nothing, and
// until the first animation is written there is nothing in the real file for rules 2 and 3 to fail on.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const CSS = readFileSync(new URL("../../../../src/app/iei.css", import.meta.url), "utf8");

const CEILING_MS = 700;
const NO_PREFERENCE = "@media (prefers-reduced-motion: no-preference)";
const REDUCE = "@media (prefers-reduced-motion: reduce)";

const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** The index just past the `}` that closes the `{` at `open`. */
function closeOf(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return i + 1;
  }
  throw new Error("unbalanced braces");
}

/** The spans of the blocks that open with exactly this at-rule header. */
function blocksOf(css: string, header: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  for (let at = css.indexOf(header); at !== -1; at = css.indexOf(header, at + 1)) {
    const open = css.indexOf("{", at);
    out.push({ start: open, end: closeOf(css, open) });
  }
  return out;
}

/** Declarations of one property, not of a longer one that starts with it (`animation` is not `animation-name`). */
function declarations(css: string, prop: string): { value: string; at: number }[] {
  const re = new RegExp(`(?<![\\w-])${prop}\\s*:\\s*([^;}]+)`, "g");
  return [...css.matchAll(re)].map((m) => ({ value: (m[1] as string).trim(), at: m.index as number }));
}

/** Every motion token's value in milliseconds, and whether the easing is declared. */
function motionTokens(css: string): { ms: Record<string, number>; ease: boolean } {
  const ms: Record<string, number> = {};
  for (const m of css.matchAll(/--iei-t-(\d+)\s*:\s*([\d.]+)ms/g)) ms[m[1] as string] = Number(m[2]);
  return { ms, ease: /--iei-ease\s*:/.test(css) };
}

/** Everything wrong with the motion in a stylesheet, one sentence each. Empty is clean. */
export function audit(source: string): string[] {
  const css = stripComments(source);
  const bad: string[] = [];

  const { ms, ease } = motionTokens(css);
  for (const n of ["1", "2", "3"]) {
    if (ms[n] === undefined) bad.push(`the token --iei-t-${n} is not declared in milliseconds`);
    else if ((ms[n] as number) > CEILING_MS) bad.push(`--iei-t-${n} is ${ms[n]}ms, over the ${CEILING_MS}ms ceiling`);
  }
  if (!ease) bad.push("the token --iei-ease is not declared");

  const running = (v: string): boolean => !/^none\b/.test(v);
  const inside = blocksOf(css, NO_PREFERENCE);
  const within = (at: number): boolean => inside.some((b) => at > b.start && at < b.end);

  for (const prop of ["animation", "animation-name", "animation-duration"]) {
    for (const d of declarations(css, prop)) {
      if (!running(d.value)) continue;
      if (!within(d.at)) bad.push(`${prop}: ${d.value} is declared outside ${NO_PREFERENCE}`);
      if (prop === "animation-name") continue;
      const bare = d.value.replace(/var\([^)]*\)/g, "");
      if (/(^|[^\w.-])[\d.]+m?s\b/.test(bare)) bad.push(`${prop}: ${d.value} times itself with a literal, not a motion token`);
      if (!/var\(--iei-t-\d\)/.test(d.value)) bad.push(`${prop}: ${d.value} uses no --iei-t-* token for its duration`);
    }
  }

  const known = new Set([...css.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)].map((m) => m[1] as string));
  for (const d of declarations(css, "animation")) {
    if (!running(d.value)) continue;
    const name = d.value.split(/\s+/)[0] as string;
    if (!known.has(name)) bad.push(`animation: ${d.value} names ${name}, which has no @keyframes`);
    if (!/\bbackwards\b/.test(d.value)) bad.push(`animation: ${d.value} does not fill backwards, so it may leave something behind`);
  }

  // A delay is read with the rule it sits in, because what has to stay under the ceiling is the delay plus that rule's duration.
  for (const d of declarations(css, "animation-delay")) {
    const open = css.lastIndexOf("{", d.at);
    const block = css.slice(open, css.indexOf("}", d.at));
    const cap = /^min\(.*,\s*(\d+)ms\)$/.exec(d.value);
    if (cap === null) {
      bad.push(`animation-delay: ${d.value} is not clamped with min(..., Nms)`);
      continue;
    }
    const token = /animation\s*:[^;]*var\(--iei-t-(\d)\)/.exec(block);
    const duration = token === null ? 0 : (ms[token[1] as string] ?? 0);
    if (Number(cap[1]) + duration > CEILING_MS) {
      bad.push(`animation-delay: ${d.value} plus ${duration}ms ends after ${Number(cap[1]) + duration}ms, over the ${CEILING_MS}ms ceiling`);
    }
  }

  for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
    const open = (m.index as number) + m[0].length - 1;
    const body = css.slice(open + 1, closeOf(css, open) - 1);
    const selectors = [...body.matchAll(/(^|\})\s*([^{}]+?)\s*\{/g)].map((s) => (s[2] as string).trim());
    for (const s of selectors) {
      if (s !== "from" && s !== "0%") bad.push(`@keyframes ${m[1]} names the state "${s}"; only "from" is allowed`);
    }
  }

  const reduce = blocksOf(css, REDUCE).map((b) => css.slice(b.start, b.end)).join("\n");
  if (!/animation\s*:\s*none\s*!important/.test(reduce)) bad.push("the reduced-motion block no longer switches animation off");
  if (!/transition\s*:\s*none\s*!important/.test(reduce)) bad.push("the reduced-motion block no longer switches transition off");

  return bad;
}

const GOOD = `
:root { --iei-t-1: 160ms; --iei-t-2: 360ms; --iei-t-3: 640ms; --iei-ease: cubic-bezier(0.2, 0.7, 0.2, 1); }
${NO_PREFERENCE} {
  .iei-bar { animation: wipe var(--iei-t-2) var(--iei-ease) backwards; animation-delay: min(calc(var(--i) * 60ms), 300ms); }
  @keyframes wipe { from { clip-path: inset(0 100% 0 0); } }
}
${REDUCE} { .iei * { transition: none !important; animation: none !important; } }
`;

test("every duration an animation uses is a motion token of at most 700ms", () => {
  const found = audit(CSS).filter((v) => /token|--iei-t-|literal|duration/.test(v));
  assert.deepEqual(found, []);
  const { ms } = motionTokens(stripComments(CSS));
  assert.deepEqual(Object.keys(ms).sort(), ["1", "2", "3"], "the three motion tokens are declared");
});

test("every @keyframes names only a starting state, so the end of an animation is the element's own style", () => {
  assert.deepEqual(audit(CSS).filter((v) => v.startsWith("@keyframes")), []);
});

test("every animation is declared inside prefers-reduced-motion: no-preference", () => {
  assert.deepEqual(audit(CSS).filter((v) => v.includes("outside")), []);
});

test("the reduced-motion block still switches animation and transition off", () => {
  assert.deepEqual(audit(CSS).filter((v) => v.startsWith("the reduced-motion")), []);
});

test("the stylesheet breaks none of the rules, whatever kind", () => {
  // The four tests above each look at one family of violation by its wording; this is the gate that cannot miss a kind they do not
  // name (a delay that runs past the ceiling, an animation that leaves its end state behind, keyframes nobody defined).
  assert.deepEqual(audit(CSS), []);
});

test("the audit passes a stylesheet that follows the rules", () => {
  assert.deepEqual(audit(GOOD), []);
});

test("the audit catches each way of breaking the rules", () => {
  const swap = (from: string, to: string): string[] => audit(GOOD.replace(from, to));
  assert.match(swap("640ms", "900ms").join("\n"), /--iei-t-3 is 900ms, over the 700ms ceiling/);
  assert.match(swap("var(--iei-t-2)", "300ms").join("\n"), /literal/);
  assert.match(swap("var(--iei-t-2) var(--iei-ease)", "var(--iei-ease)").join("\n"), /no --iei-t-\* token/);
  assert.match(swap("from { clip-path: inset(0 100% 0 0); }", "from { clip-path: inset(0 100% 0 0); } to { clip-path: none; }").join("\n"), /names the state "to"/);
  assert.match(swap("from {", "50% {").join("\n"), /names the state "50%"/);
  assert.match(swap(NO_PREFERENCE, "@media (min-width: 1px)").join("\n"), /outside @media \(prefers-reduced-motion: no-preference\)/);
  assert.match(swap("animation: none !important;", "").join("\n"), /switches animation off/);
  assert.match(swap("transition: none !important;", "").join("\n"), /switches transition off/);
  assert.match(swap("--iei-ease:", "--iei-curve:").join("\n"), /--iei-ease is not declared/);
  assert.match(swap("animation: wipe", "animation: slide").join("\n"), /names slide, which has no @keyframes/);
  assert.match(swap("min(calc(var(--i) * 60ms), 300ms)", "calc(var(--i) * 60ms)").join("\n"), /is not clamped/);
  assert.match(swap("var(--iei-ease) backwards", "var(--iei-ease) forwards").join("\n"), /does not fill backwards/);
  assert.match(swap("var(--iei-ease) backwards", "var(--iei-ease)").join("\n"), /does not fill backwards/);
  assert.match(swap("300ms)", "400ms)").join("\n"), /plus 360ms ends after 760ms, over the 700ms ceiling/);
});

/** The animation a rule gives an element, found by a selector in the rule's list: its keyframes name, or null. */
function animationOf(selector: string): string | null {
  const css = stripComments(CSS);
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = (m[1] as string).split(",").map((x) => x.trim().replace(/^.*\s/, ""));
    if (!selectors.includes(selector)) continue;
    const a = /(?<![\w-])animation\s*:\s*([\w-]+)/.exec(m[2] as string);
    if (a !== null && a[1] !== "none") return a[1] as string;
  }
  return null;
}

test("what is meant to move does: the bars grow, the histogram rises, the wedges arrive, and the seat's outline draws", () => {
  assert.equal(animationOf(".iei-res-bar"), "iei-wipe", "the result bars wipe in from the left");
  assert.equal(animationOf(".iei-dist-bar"), "iei-rise", "the margin histogram's bars rise from their baseline");
  assert.equal(animationOf(".iei-partyrows-seat"), "iei-grow", "the party rows' seat bars grow from the left");
  assert.equal(animationOf(".iei-partyrows-vote"), "iei-grow", "the party rows' vote bars grow from the left");
  assert.equal(animationOf(".iei-arc-p"), "iei-arrive", "the arc's wedges arrive party by party");
  assert.equal(animationOf(".iei-loc-seat"), "iei-arrive", "the located seat arrives");
  assert.equal(animationOf(".iei-loc-ring"), "iei-draw", "the ring round a small seat is drawn");
});

test("nothing loops, and every animation runs once", () => {
  const css = stripComments(CSS);
  assert.deepEqual(declarations(css, "animation-iteration-count").filter((d) => d.value !== "1"), []);
  assert.doesNotMatch(css, /animation\s*:[^;]*\binfinite\b/);
});
