// The ink of a ribbon, on every party the registry can paint: opaque, the party's own hue, and in three tiers that differ without hue.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { contrastOf, linearOf, oklabOf } from "./colour.ts";
import { SURFACE, SURFACE_LIGHT } from "./palette.ts";
import { CURATED_KEYS, tokenFor } from "./party-ink.ts";
import { NEUTRAL_RIBBON_INK, NEUTRAL_RIBBON_INK_DARK, NEUTRAL_RIBBON_INK_LIGHT, RIBBON_CAP, RIBBON_SHARE, ribbonInk as ribbonPaint, ribbonInkOn } from "./ribbon-ink.ts";
import type { RibbonTier } from "./ribbon-ink.ts";

const TIERS: readonly RibbonTier[] = ["bright", "mid", "faint"];
/** The maths for the dark page, which is what every test below was written against: one plain `#rrggbb` in, one out. `ribbonPaint` is the DOM's. */
const ribbonInk = (ink: string, tier: RibbonTier): string => ribbonInkOn(ink, tier, SURFACE);
/** The same on the light page. */
const ribbonLight = (ink: string, tier: RibbonTier): string => ribbonInkOn(ink, tier, SURFACE_LIGHT);
const CSS = readFileSync(new URL("../../../../src/app/iei.css", import.meta.url), "utf8");

/** Every curated party, and four hundred of the generated register. */
const KEYS = [...CURATED_KEYS, ...Array.from({ length: 400 }, (_, i) => `generated-${i}`)];
const lab = (hex: string): [number, number, number] => oklabOf(linearOf(hex));
const hueOf = (hex: string): number => {
  const [, a, b] = lab(hex);
  return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
};
const chromaOf = (hex: string): number => Math.hypot(lab(hex)[1], lab(hex)[2]);

test("a ribbon's ink is an opaque #rrggbb, so nothing under it shows through and a crossing is never a blend", () => {
  for (const k of KEYS) for (const t of TIERS) assert.match(ribbonInk(tokenFor(k).fill, t), /^#[0-9a-f]{6}$/, `${k} ${t}`);
});

test("each tier is its share of the brightest tier's contrast against the card, and the brightest is the ink calmed to the cap", () => {
  for (const k of KEYS) {
    const ink = tokenFor(k).fill;
    const brightest = Math.min(RIBBON_CAP, contrastOf(ink, SURFACE));
    for (const t of TIERS) {
      const want = 1 + RIBBON_SHARE[t] * (brightest - 1);
      assert.ok(Math.abs(contrastOf(ribbonInk(ink, t), SURFACE) - want) < 0.1, `${k} ${t}: ${contrastOf(ribbonInk(ink, t), SURFACE)} against ${want}`);
    }
  }
});

test("the brightest tier of every party clears the 3:1 a mark has to, and the faintest is not lost against the card", () => {
  for (const k of KEYS) {
    const ink = tokenFor(k).fill;
    assert.ok(contrastOf(ribbonInk(ink, "bright"), SURFACE) >= 3.1, `${k} bright`);
    assert.ok(contrastOf(ribbonInk(ink, "faint"), SURFACE) >= 1.9, `${k} faint is ${contrastOf(ribbonInk(ink, "faint"), SURFACE)}`);
  }
});

test("the three tiers differ in lightness, so brighter and fainter are told apart without hue", () => {
  for (const k of KEYS) {
    const [b, m, f] = TIERS.map((t) => lab(ribbonInk(tokenFor(k).fill, t))[0]) as [number, number, number];
    assert.ok(b - m >= 0.04 && m - f >= 0.04, `${k}: ${b.toFixed(3)} ${m.toFixed(3)} ${f.toFixed(3)}`);
    assert.ok(b - f >= 0.1, `${k}: bright and faint are ${(b - f).toFixed(3)} apart in lightness`);
  }
});

test("a tint keeps its party's hue: within two degrees of the ink's, for every ink with colour to speak of", () => {
  for (const k of KEYS) {
    const ink = tokenFor(k).fill;
    if (chromaOf(ink) < 0.05) continue;
    for (const t of TIERS) {
      const d = Math.abs(hueOf(ribbonInk(ink, t)) - hueOf(ink));
      assert.ok(Math.min(d, 360 - d) < 2, `${k} ${t} moved ${d} degrees`);
    }
  }
});

test("a party whose ink is dark keeps that ink as its brightest tier and is not lifted toward the lighter parties of its hue", () => {
  // CPI (#a94e4e, 3.6:1) and CPM (#e66f62, 6.3:1) are both red, and party-ink.ts separates them on lightness; a fixed contrast would bring both to one tier.
  const [cpi, cpm] = ["CPI", "CPM"].map((k) => lab(ribbonInk(tokenFor(k).fill, "bright"))[0]) as [number, number];
  assert.ok(cpm - cpi > 0.1, `CPI ${cpi.toFixed(3)} and CPM ${cpm.toFixed(3)} have been brought together`);
  assert.ok(Math.abs(contrastOf(ribbonInk(tokenFor("CPI").fill, "bright"), SURFACE) - contrastOf(tokenFor("CPI").fill, SURFACE)) < 0.1, "CPI's brightest tier is not its ink");
});

test("the neutral ribbon is the stylesheet's third ink, and the card is the stylesheet's panel", () => {
  // The dark half: a token that differs by theme is `light-dark(LIGHT, DARK)`, and the TypeScript copies are the dark page's.
  const token = (name: string): string =>
    new RegExp(`${name}:\\s*(?:light-dark\\(\\s*#[0-9a-fA-F]{6}\\s*,\\s*)?(#[0-9a-fA-F]{6})`).exec(CSS)?.[1]?.toLowerCase() ?? "";
  assert.equal(NEUTRAL_RIBBON_INK_DARK, token("--iei-ink-3"));
  assert.equal(SURFACE, token("--iei-panel"));
  assert.ok(chromaOf(NEUTRAL_RIBBON_INK_DARK) < 0.04, "the neutral ribbon has a hue, so it reads as a party's");
});

test("the stylesheet does not make a ribbon fainter with an opacity, and a gap line in the card's colour separates ribbons that touch", () => {
  // The tint is in the fill (viz/ribbon-ink.ts). An opacity under 1 on a ribbon would blend it with whatever it crosses.
  const block = CSS.slice(CSS.indexOf("/* legibility: ribbons and sparkline labels */"));
  assert.ok(block.length > 0, "the legibility block is not in the stylesheet");
  const rule = (sel: string): string => new RegExp(`${sel.replace(/[.[\]()*+?:]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(block)?.[1] ?? "";
  assert.match(rule(".iei-flow-held,\n.iei-flow-moved,\n.iei-flow-mixed"), /opacity:\s*1;/);
  const gap = rule(".iei-flow-ribbons path,\n.iei-an-rib polygon");
  assert.match(gap, /stroke:\s*var\(--iei-panel\)/);
  assert.match(gap, /paint-order:\s*stroke/, "the line is over the fill and eats a one-seat ribbon");
  assert.match(gap, /vector-effect:\s*non-scaling-stroke/);
});

/* ────────────────────────────── the light page ──────────────────────────────
   On a light surface contrast FALLS as a ribbon gets lighter, so the search runs the other way; the tiers mean the same (bright is the most contrast,
   which is now the darkest), and the same floors hold against the light panel. */

test("on the light page each tier is its share of the brightest tier's contrast against the card, and the brightest is a mark", () => {
  for (const k of KEYS) {
    const ink = tokenFor(k).fillLight;
    const brightest = Math.min(RIBBON_CAP, contrastOf(ink, SURFACE_LIGHT));
    for (const t of TIERS) {
      const want = 1 + RIBBON_SHARE[t] * (brightest - 1);
      const got = contrastOf(ribbonLight(ink, t), SURFACE_LIGHT);
      assert.ok(Math.abs(got - want) < 0.1, `${k} ${t}: ${got.toFixed(2)} against ${want.toFixed(2)}`);
    }
    assert.ok(contrastOf(ribbonLight(ink, "bright"), SURFACE_LIGHT) >= 3.1, `${k} bright`);
    assert.ok(contrastOf(ribbonLight(ink, "faint"), SURFACE_LIGHT) >= 1.9, `${k} faint is ${contrastOf(ribbonLight(ink, "faint"), SURFACE_LIGHT).toFixed(2)}`);
  }
});

test("on the light page the three tiers differ in lightness (the brightest is the darkest), and a tint keeps its party's hue", () => {
  for (const k of KEYS) {
    const ink = tokenFor(k).fillLight;
    const [b, m, f] = TIERS.map((t) => lab(ribbonLight(ink, t))[0]) as [number, number, number];
    assert.ok(f - m >= 0.04 && m - b >= 0.04, `${k}: ${b.toFixed(3)} ${m.toFixed(3)} ${f.toFixed(3)}`);
    assert.ok(f - b >= 0.1, `${k}: bright and faint are ${(f - b).toFixed(3)} apart in lightness`);
    if (chromaOf(ink) < 0.05) continue;
    for (const t of TIERS) {
      const d = Math.abs(hueOf(ribbonLight(ink, t)) - hueOf(ink));
      assert.ok(Math.min(d, 360 - d) < 2, `${k} ${t} moved ${d} degrees on the light page`);
    }
  }
});

test("what the DOM is given for a ribbon is the two halves, each worked out on its own page's card", () => {
  for (const k of KEYS) {
    const t = tokenFor(k);
    for (const tier of TIERS) {
      const paint = ribbonPaint(t.paint, tier);
      assert.equal(paint, `light-dark(${ribbonLight(t.fillLight, tier)}, ${ribbonInk(t.fill, tier)})`, `${k} ${tier}`);
    }
  }
  assert.equal(NEUTRAL_RIBBON_INK, `light-dark(${NEUTRAL_RIBBON_INK_LIGHT}, ${NEUTRAL_RIBBON_INK_DARK})`);
  // The neutral ribbon is a ribbon like another: both halves of it come out as plain hex.
  assert.match(ribbonPaint(NEUTRAL_RIBBON_INK, "mid"), /^light-dark\(#[0-9a-f]{6}, #[0-9a-f]{6}\)$/);
  assert.equal(chromaOf(NEUTRAL_RIBBON_INK_LIGHT) < 0.04, true, "the light neutral ribbon has a hue, so it reads as a party's");
});
