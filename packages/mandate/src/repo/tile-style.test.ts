// How a number tile and a link LOOK, as claims the markup and the stylesheet can be held to.
//
// WHY THIS FILE EXISTS. Both defects it guards were invisible to every other check in the repo. A flip list's
// party names rendered in the browser's default link blue, underlined, on the near-black page (2.1:1), because
// the anchors carried no class and sat in no container the link rule names. And a tile whose value was words
// ("verification pending") was set in the 24px numeral style and wrapped to four lines. `tsc` has no opinion on
// either, and iei.test.ts checks the inks, not which elements wear them. What can be asserted without a browser
// is asserted here: the markup carries the class, and the stylesheet gives the class a rule made of tokens.
// What a browser does with them is judged from screenshots (ops/probe/shot), not claimed here.

import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { DEV_DB_PATH } from "../db/open.ts";

const ROOT = new URL("../../../../", import.meta.url).pathname;
const CSS = readFileSync(new URL("../../../../src/app/iei.css", import.meta.url), "utf8");
const HAVE_DB = existsSync(process.env["MANDATE_DB_PATH"] ?? DEV_DB_PATH);
const live = { skip: HAVE_DB ? false : "no .data/registry.db — run npm run registry:ingest" };

/** Render JSX in a child process through the harness that compiles .tsx, and return what each element printed. */
function renderAll(jsx: readonly string[]): string[] {
  const script = `
    import React from "react";
    import { renderToStaticMarkup } from "react-dom/server";
    const { Metric } = await import(${JSON.stringify(`file://${ROOT}src/components/iei/parts.tsx`)});
    const { FlipMatrix } = await import(${JSON.stringify(`file://${ROOT}src/components/iei/Distribution.tsx`)});
    const out = [${jsx.join(",")}].map((el) => renderToStaticMarkup(el));
    process.stdout.write(JSON.stringify(out));
  `;
  return JSON.parse(
    execFileSync(process.execPath, ["--import", "./ops/probe/render/register.mjs", "--input-type=module", "-e", script], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    }),
  ) as string[];
}

const metric = (props: string): string => `React.createElement(Metric, { label: "L", ${props} })`;

/** The attributes on a tile's <dd>, or null when it has none. */
function ddClass(html: string): string | null {
  const m = html.match(/<dd(?: class="([^"]*)")?>/);
  assert.ok(m !== null, `no <dd> in ${html}`);
  return m[1] ?? null;
}

test("a tile value that is words is set as words, and a number keeps the numeral style", () => {
  const cases: Array<[string, string, string | null]> = [
    // Figures, and the counts the semantic layer writes as words: the numeral line carries all of them.
    [metric(`text: "29,584", unit: "votes"`), "29,584", null],
    [metric(`text: "twice"`), "twice", null],
    [metric(`text: "once"`), "once", null],
    [metric(`text: "never"`), "never", null],
    [metric(`text: "Rs 12.5 lakh"`), "Rs 12.5 lakh", null],
    [metric(`text: "1,234 of 1,500"`), "1,234 of 1,500", null],
    // The semantic layer's absence token has its own treatment, and a long absent label is not words.
    [metric(`text: "—", absent: "not reported by the source"`), "ABSENT", null],
    // A number from `value` is a figure whatever its unit.
    [metric(`value: 224, unit: "seats in the house", absent: "none"`), "value", null],
    // 14 glyphs is the longest string the numeral line carries; 15 is a sentence.
    [metric(`text: "12345678901234"`), "14 glyphs", null],
    [metric(`text: "123456789012345"`), "15 glyphs", "iei-metric-words"],
    [metric(`text: "verification pending", unit: "not reconciled against votes cast"`), "the seat page's tile", "iei-metric-words"],
  ];
  const html = renderAll(cases.map(([j]) => j));
  cases.forEach(([, what, want], i) => assert.equal(ddClass(html[i] as string), want, `${what}: ${html[i]}`));
});

test("a unit of several words is kept whole, and a one-word unit is left exactly as it was", () => {
  const cases: Array<[string, string, string | null]> = [
    [metric(`text: "2,24,413", unit: "roll of 2026"`), "a phrase beside a figure", "iei-metric-phrase"],
    [metric(`text: "60.0%", unit: "of 3,000 electors"`), "the reported-turnout unit", "iei-metric-phrase"],
    [metric(`text: "99,338", unit: "votes"`), "one word", null],
    [metric(`text: "28,19,086", unit: "persons"`), "one word", null],
    [metric(`text: "2.19", unit: "2021"`), "a year", null],
    [metric(`text: "29,584"`), "no unit", null],
    [metric(`text: "29,584", unit: " "`), "a blank unit", null],
    // Absent: no unit is printed, so there is nothing to keep whole.
    [metric(`text: "—", unit: "roll of 2026"`), "absent", null],
    // Words win: a sentence value always puts its unit under it.
    [metric(`text: "verification pending", unit: "not reconciled against votes cast"`), "words and a phrase", "iei-metric-words"],
  ];
  const html = renderAll(cases.map(([j]) => j));
  cases.forEach(([, what, want], i) => assert.equal(ddClass(html[i] as string), want, `${what}: ${html[i]}`));
});

test("the classes add no element and no word: a tile's text and structure are what they were", () => {
  const [words, phrase] = renderAll([
    metric(`text: "verification pending", unit: "not reconciled against votes cast", hint: "no vote counts"`),
    metric(`text: "2,24,413", unit: "roll of 2026", hint: "up 31.9%"`),
  ]) as [string, string];
  assert.equal(
    words,
    '<div class="iei-metric"><dt>L</dt><dd class="iei-metric-words">verification pending<span class="iei-of"> not reconciled against votes cast</span><small>no vote counts</small></dd></div>',
  );
  assert.equal(
    phrase,
    '<div class="iei-metric"><dt>L</dt><dd class="iei-metric-phrase">2,24,413<span class="iei-of"> roll of 2026</span><small>up 31.9%</small></dd></div>',
  );
});

test("every party name in a flip list is a link in the product's link treatment", () => {
  const [html] = renderAll([
    `React.createElement(FlipMatrix, {
       pairs: [
         { from: { key: "tmc", label: "TMC" }, to: { key: "bjp", label: "BJP" }, count: 117 },
         { from: { key: "ind", label: "IND" }, to: { key: "bjp", label: "BJP" }, count: 1 },
       ],
       hrefFor: (p) => "/x?party=" + p,
     })`,
  ]) as [string];
  const anchors = [...html.matchAll(/<a [^>]*>[^<]*<\/a>/g)].map((m) => m[0]);
  assert.equal(anchors.length, 4, "two pairs link both of their parties");
  for (const a of anchors) assert.match(a, /^<a class="iei-body-link" href="/, `a flip-list link has no link class: ${a}`);
  assert.deepEqual(
    anchors.map((a) => a.replace(/<[^>]*>/g, "")),
    ["TMC", "BJP", "IND", "BJP"],
    "the labels are the same words as before",
  );
});

/** The selector lists of every rule whose head names `members` exactly (one selector per comma). */
function selectorListsWith(...members: string[]): string[][] {
  const bare = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...bare.matchAll(/([^{}]+)\{/g)]
    .map((m) => (m[1] as string).split(",").map((x) => x.trim()))
    .filter((list) => members.every((x) => list.includes(x)));
}

test("the prose-link treatment names the year strip and the flip-list class in every state it styles", () => {
  // The rule is an exhaustive list on purpose (see the comment above it in iei.css): a link in a container the
  // list does not name falls back to the browser's blue underline. The year strip was missing from it.
  for (const state of ["", ":hover", ":focus-visible"]) {
    const lists = selectorListsWith(`.iei-foot a${state}`, `.iei-body-link${state}`);
    assert.ok(lists.length >= 1, `no rule styles the prose links in state "${state}"`);
    for (const list of lists) assert.ok(list.includes(`.iei-sibs a${state}`), `.iei-sibs a${state} is missing from the link treatment`);
  }
  // forced-colors replaces the focus treatment with a real outline, so it is a second list with the same members.
  const outlined = selectorListsWith(".iei-foot a:focus-visible", ".iei-body-link:focus-visible");
  assert.equal(outlined.length, 2, "the focus treatment and its forced-colors outline are two lists");
  for (const list of outlined) assert.ok(list.includes(".iei-sibs a:focus-visible"), "a focus list is missing the year strip");
});

test("the skip link does not fall back to the browser's underline when it takes focus", () => {
  const bare = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = bare.match(/\.iei-skip:focus\s*\{([^}]*)\}/);
  assert.ok(rule !== null, "no .iei-skip:focus rule");
  assert.match(rule[1] as string, /text-decoration:\s*none/);
});

/** A rule's declarations, by selector, with comments removed. */
function declarationsOf(selector: string): string {
  const bare = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = bare.match(new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`));
  assert.ok(m !== null, `no rule for ${selector}`);
  return m[1] as string;
}

test("a words tile is set smaller than a numeral, from the type scale, with its unit on its own line", () => {
  const size = (name: string): number => {
    const m = CSS.match(new RegExp(`--iei-f-${name}:\\s*([0-9.]+)px`));
    assert.ok(m !== null, `--iei-f-${name} is not declared in px`);
    return Number(m[1]);
  };
  const words = declarationsOf(".iei-metric .iei-metric-words");
  assert.match(words, /font-size:\s*var\(--iei-f-title\)/, "a words value takes a token, not a length");
  assert.ok(size("title") < size("lead"), "a words value is not smaller than a numeral");
  // It must out-rank `.iei-metric dd`, or it is silently a numeral again: that is what the first draft did.
  assert.match(CSS, /\.iei-metric dd \{/);
  const unit = declarationsOf(".iei-metric-words .iei-of");
  assert.match(unit, /display:\s*block/, "the unit of a words value shares a line with it");
  assert.match(unit, /font-size:\s*var\(--iei-f-meta\)/, "0.66em of a title-size value is under the smallest type size");
});

test("the rules that set words and phrase tiles use no colour of their own", () => {
  // The only colour either may use is the one the tile already had: ink for the value, ink-3 for the unit.
  for (const selector of [".iei-metric .iei-metric-words", ".iei-metric-words .iei-of", ".iei-metric-phrase", ".iei-metric-phrase .iei-of", ".iei-metric-phrase small"]) {
    const d = declarationsOf(selector);
    assert.ok(!/color|background|#[0-9a-f]{3,8}|rgb/i.test(d), `${selector} sets a colour: ${d}`);
  }
});

test("a seat page puts the words class on exactly the tiles whose value is too long for a numeral", live, () => {
  const render = (segments: string): string =>
    execFileSync(
      process.execPath,
      ["--import", "./ops/probe/render/register.mjs", "./ops/probe/render/render.mjs", "/constituency", "", segments],
      { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
    );
  let seen = 0;
  for (const segments of ["wb/assembly/mekliganj", "wb/lok-sabha/baharampur"]) {
    const html = render(segments);
    for (const m of html.matchAll(/<dd( class="[^"]*")?>([^<]*)/g)) {
      const long = (m[2] as string).length > 14;
      assert.equal(
        (m[1] ?? "").includes("iei-metric-words"),
        long,
        `${segments}: tile value "${m[2]}" is ${long ? "" : "not "}longer than a numeral line, and its class is "${m[1] ?? ""}"`,
      );
      seen++;
    }
  }
  assert.ok(seen >= 6, `only ${seen} tiles were checked — the pattern has stopped matching`);
});
