// Escape closes an open evidence drawer, as progressive enhancement (src/components/iei/DrawerKey.tsx, mounted by Shell like CommandKey).
//
// A source scan, because the component is client JavaScript in a .tsx file and this suite has no DOM; the behaviour itself (open a drawer, press
// Escape, read document.activeElement) was checked in the real browser when it was made. What the scan holds is the contract: the drawer is still a
// native <details> that works without script, Shell mounts the enhancement, and the handler closes the open drawer and focuses its summary.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (file: string): string => readFileSync(new URL(`../../../../${file}`, import.meta.url), "utf8");
const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, "");

test("the evidence drawer is a native <details>, so it opens and closes with no script at all", () => {
  const parts = strip(read("src/components/iei/parts.tsx"));
  assert.match(parts, /<details className=\{inline \? 'iei-ev iei-ev-inline' : 'iei-ev'\}/, "the evidence drawer is no longer a native <details class=iei-ev>");
  assert.match(parts, /<summary/, "the drawer has no <summary>");
});

test("Shell mounts the Escape enhancement beside the search shortcut", () => {
  const shell = strip(read("src/components/iei/Shell.tsx"));
  assert.match(shell, /import \{ DrawerKey \} from '\.\/DrawerKey\.tsx'/);
  assert.match(shell, /<DrawerKey \/>/, "Shell does not mount DrawerKey");
  assert.match(shell, /<CommandKey /, "the search shortcut is gone from Shell");
});

test("DrawerKey closes the open drawer on Escape and returns the keyboard to its summary, and cleans up after itself", () => {
  const src = strip(read("src/components/iei/DrawerKey.tsx"));
  assert.match(src, /^\s*'use client';/, "DrawerKey is not a client component");
  assert.match(src, /e\.key !== 'Escape'/, "it does not look for Escape");
  assert.match(src, /details\.iei-ev\[open\]/, "it does not find an open evidence drawer");
  assert.match(src, /\.open = false/, "it does not close the drawer");
  assert.match(src, /querySelector\('summary'\)/);
  assert.match(src, /summary\.focus\(\)/, "it does not return focus to the summary");
  assert.match(src, /e\.defaultPrevented/, "it takes an Escape another handler already used");
  assert.match(src, /removeEventListener\('keydown', onKey\)/, "the listener is never removed");
});
