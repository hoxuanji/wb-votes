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
  .iei-bar { animation: wipe var(--iei-t-2) var(--iei-ease) backwards; }
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
});
