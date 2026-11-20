// Party visual identity: one colour per party, the same colour everywhere, for all 3,330 of them.
//
// WHAT THIS REPLACES. `repo/home.ts` handed out three hues BY RANK — the party leading the most jurisdictions
// took slot one — and folded everything else into a single grey. Two consequences, and both are defects
// rather than compromises: a party's colour changed when its rank did, so the same party could be two colours
// on two pages of one product; and 427 of the 430 parties that have ever won a seat shared one grey, so on a
// Karnataka map JD(S) with 19 seats looked exactly like a party with one.
//
// THE RULE: a colour belongs to a party IDENTITY, and nothing about the context it is drawn in may change it.
// Not rank, not seat count, not the order of a query's result set, not which page it is on, not what it is
// next to. That last one is a real cost — two parties whose colours are close stay close when they are
// adjacent on a map — and it is paid deliberately: a colour that shifted to separate itself from its
// neighbour would not be an identity, and the boundary stroke and the label are what separate adjacent marks.
//
// TWO REGISTERS, AND THE DIFFERENCE IS INFORMATION.
//
//  · CURATED. A party a reader recognises gets the hue they associate with it, declared in
//    `data/party-ink.json` as OKLCH rather than as a hex — so the config states the identity (the hue family)
//    and this module guarantees the rendering is legible (lightness and chroma inside a band whose contrast is
//    measured). Same-family parties — and Indian politics has a lot of red and a lot of green — separate on
//    LIGHTNESS, which is the axis a dichromat keeps.
//  · DERIVED. Everyone else gets a hue from a hash of their party id, at a visibly lower chroma. That is not
//    a fallback pretending to be an identity; the muted register means "this party's own colour is not
//    recorded here", which is true, and it keeps 2,900 parties from competing with the ones a reader knows.
//
// Colour is NEVER the only channel. Every mark this feeds carries the party's abbreviation, and the legend
// names every party it shows.

// IMPORTED AS A MODULE, not read from disk, and that is a deployment fact rather than a style choice.
// `readFileSync(new URL(...))` works under Node and fails under webpack, whose `fs` shim rejects a URL
// instance — the production build died on exactly that, at "Collecting page data for /coverage". An import
// also gets the config traced into the server bundle, so the colours ship with the code that needs them.
import config from "../../../../data/party-ink.json" with { type: "json" };
import { contrastOf, lightDark, oklch, oklabOf, linearOf } from "./colour.ts";

/** A party's visual token. Everything a mark needs, and nothing about where the mark is. */
export type PartyToken = {
  /** The party's id in the registry — `party.id`, or the raw string a source printed. */
  key: string;
  /** The fill on the DARK page, wherever this party appears. Plain hex, and what every piece of colour maths reads. */
  fill: string;
  /** The fill on the LIGHT page: the same hue and chroma, lightness brought down until it is a mark there (see `lightFillOf`). */
  fillLight: string;
  /** What the DOM is given: `light-dark(fillLight, fill)`. A string-built SVG cannot read a CSS variable, and this is how it follows the theme. */
  paint: string;
  /** Text drawn ON the dark-page fill, chosen so it clears the small-text contrast floor against it. */
  on: string;
  /** Text drawn on the light-page fill. */
  onLight: string;
  /** What the DOM is given for text on the fill: `light-dark(onLight, on)`, or the one colour when they agree. */
  onPaint: string;
  /** A hairline for a mark that needs an edge against its own fill — a swatch on a panel, say. */
  border: string;
  /** How this colour was arrived at. */
  basis: "curated" | "derived";
  /** For a curated colour, where the association comes from. For a derived one, the rule. */
  source: string;
  /** When the curated association took effect, where that is known. */
  effectiveFrom: string | null;
  /** `editorial` for a curated association; `deterministic` for a generated one. */
  confidence: "editorial" | "deterministic";
};

/** One curated entry, as the config declares it. */
type Curated = {
  name: string;
  /** OKLCH lightness, chroma and hue. Declared rather than a hex, so the band is enforced here. */
  l: number;
  c: number;
  h: number;
  /** Why this hue: the association a reader would recognise. */
  note: string;
  effectiveFrom?: string;
};

type Config = {
  source: { publisher: string; retrievedAt: string; note: string };
  /** The band every curated colour is required to sit inside. */
  band: { lMin: number; lMax: number; cMin: number; cMax: number };
  /** The register generated colours use. Lower chroma, on purpose. */
  derived: { chroma: number; lightnesses: number[] };
  /** Text drawn on a fill: the two candidates, and the floor one of them has to clear. */
  ink: { light: string; dark: string; floor: number };
  parties: Record<string, Curated>;
};

const CONFIG = config as unknown as Config;

export const BAND = CONFIG.band;
export const DERIVED = CONFIG.derived;
export const CURATED_KEYS: readonly string[] = Object.keys(CONFIG.parties);

/**
 * FNV-1a over the party key.
 *
 * Any stable hash would do; what matters is that it is stable ACROSS PROCESSES and across versions of Node,
 * which rules out anything built in. Thirty-two bits over at most a few thousand keys.
 */
function hash(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Which of the two inks clears the floor on this fill; the better of the two if neither does. */
function inkOn(fill: string): string {
  const { light, dark, floor } = CONFIG.ink;
  const cl = contrastOf(fill, light);
  const cd = contrastOf(fill, dark);
  if (cd >= floor && cd >= cl) return dark;
  if (cl >= floor) return light;
  return cd > cl ? dark : light;
}

/**
 * THE LIGHT PAGE'S SURFACES, copied from iei.css (`light-dark(LIGHT, …)` of --iei-bg, --iei-panel, --iei-raised); iei.test.ts holds them equal.
 * A fill has to be a mark on the DARKEST of them, the canvas, and so is a mark on the other two.
 */
export const LIGHT_SURFACES = { bg: "#eef0f6", panel: "#f8f9fc", raised: "#ffffff" } as const;

/** The mark floor (WCAG 1.4.11), with a hair of headroom, because the hex is rounded. */
const LIGHT_MARK = 3.05;

/** A fill is legal on the light page when it is a mark on the canvas and one of the two inks clears the text floor on it. */
function legalOnLight(hex: string): boolean {
  const { light, dark, floor } = CONFIG.ink;
  return contrastOf(hex, LIGHT_SURFACES.bg) >= LIGHT_MARK && Math.max(contrastOf(hex, light), contrastOf(hex, dark)) >= floor + 0.02;
}

/**
 * The light page's version of a party's colour: the SAME HUE and chroma, with lightness brought down.
 *
 * Every curated fill sits at OKLCH L 0.5-0.86, tuned to a near-black page, and 31 of the 60 fail the 3:1 mark floor on white (BJP 2.2:1, INC
 * 2.6:1). On the light canvas a mark has to be about L 0.62 or darker, so the band is compressed into 0.42-0.62 by a MONOTONE map
 * (lightness is the axis a dichromat keeps, and the code separates same-family parties on it: BJP and AITC, CPI and CPM), and the result is
 * moved to the nearest lightness that is legal, because there is a dead band around L 0.55-0.58 where neither ink clears 4.5:1 and no fill may
 * sit. The slope was the largest that keeps the saffron saffron: at 0.64 it was a brown.
 */
function lightFillOf(l: number, c: number, h: number): string {
  const target = Math.max(0.3, Math.min(0.62, 0.42 + (l - 0.5) * 0.75));
  for (let d = 0; d <= 0.3; d += 0.0025) {
    for (const sign of [-1, 1]) {
      const L = target + sign * d;
      if (L < 0.28 || L > 0.64) continue;
      const hex = oklch(L, c, h);
      if (legalOnLight(hex)) return hex;
    }
  }
  return oklch(target, c, h);
}

/** A hairline a shade of its own fill, so a swatch has an edge without spending a second colour. */
function edgeOf(l: number, c: number, h: number): string {
  return oklch(Math.max(0.3, l - 0.16), c, h);
}

/** The party key a token is looked up by: trimmed, and never empty. */
export function partyKey(raw: string | null | undefined): string {
  const k = String(raw ?? "").trim();
  if (k === "") return "unattached";
  // CASE IS NOT IDENTITY. The registry holds `NCP` and `ncp`, and `CPI` and `cpi`, as separate party rows —
  // two sources spelling one id differently — so the Nationalist Congress Party arrived on the 2024 map in
  // its own colour and in a generated one, three ΔE apart. Case-folding to a curated key is a VISUAL
  // normalisation and nothing more: the party rows are untouched, `partyKey` still returns the id it was
  // given when no curated entry matches, and the duplication is reported in docs/release/RC-1.md rather than
  // quietly resolved here.
  if (CONFIG.parties[k] !== undefined) return k;
  const folded = Object.keys(CONFIG.parties).find((c) => c.toLowerCase() === k.toLowerCase());
  return folded ?? k;
}

const cache = new Map<string, PartyToken>();

/**
 * The token for a party. Pure, cached, and identical for the same key forever.
 *
 * A key with no curated entry is DERIVED, not defaulted: it gets its own hue from its own id, so two
 * unrecognised parties on one map are two colours rather than one grey.
 */
export function tokenFor(raw: string | null | undefined): PartyToken {
  const key = partyKey(raw);
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const curated = CONFIG.parties[key];
  let token: PartyToken;
  if (curated !== undefined) {
    const fill = oklch(curated.l, curated.c, curated.h);
    const fillLight = lightFillOf(curated.l, curated.c, curated.h);
    token = {
      key,
      fill,
      fillLight,
      paint: lightDark(fillLight, fill),
      on: inkOn(fill),
      onLight: inkOn(fillLight),
      onPaint: lightDark(inkOn(fillLight), inkOn(fill)),
      border: edgeOf(curated.l, curated.c, curated.h),
      basis: "curated",
      source: curated.note,
      effectiveFrom: curated.effectiveFrom ?? null,
      confidence: "editorial",
    };
  } else {
    const n = hash(key);
    // Hue at a tenth of a degree, and lightness from a different slice of the same hash so the two are not
    // correlated — a straight modulo of one number gives hue and lightness that march together.
    const h = ((n >>> 8) % 3600) / 10;
    const ls = DERIVED.lightnesses;
    const l = ls[n % ls.length] as number;
    const fill = oklch(l, DERIVED.chroma, h);
    const fillLight = lightFillOf(l, DERIVED.chroma, h);
    token = {
      key,
      fill,
      fillLight,
      paint: lightDark(fillLight, fill),
      on: inkOn(fill),
      onLight: inkOn(fillLight),
      onPaint: lightDark(inkOn(fillLight), inkOn(fill)),
      border: edgeOf(l, DERIVED.chroma, h),
      basis: "derived",
      source: `hue from a hash of the party id, at chroma ${DERIVED.chroma} — this party's own colour is not recorded`,
      effectiveFrom: null,
      confidence: "deterministic",
    };
  }
  cache.set(key, token);
  return token;
}

/**
 * Just the fill, for the many callers that need nothing else, AS THE DOM WANTS IT: `light-dark(light, dark)`. Anything that does colour
 * maths on a party's colour reads `tokenFor(k).fill` (the dark hex) or `.fillLight` instead, never this.
 */
export function fillFor(raw: string | null | undefined): string {
  return tokenFor(raw).paint;
}

/**
 * The ink for "no election of this kind is loaded here".
 *
 * Not a party: an unlit polygon must not read as a mark, so it deliberately sits below the 3:1 floor a real
 * mark has to clear. It is the one colour on a map that means absence, and it is `--iei-void`, a deep indigo,
 * copied because an SVG fill built as a string cannot read a CSS variable. It was a grey-violet (#1d1b26) until
 * the stylesheet's void moved to indigo and this did not, so a legend's "none" swatch and an unlit state were one
 * colour while an unlit seat, the arc's empty seats and the time machine's frames were another; iei.test.ts now
 * holds the two equal.
 */
export const NOT_HELD_DARK = "#1c203b";

/** The light page's no-data ink: `--iei-void`'s light half. Below the mark floor on every light surface, and visible against the canvas. */
export const NOT_HELD_LIGHT = "#dfe3f2";

/** What the DOM is given for "not held": `light-dark(NOT_HELD_LIGHT, NOT_HELD_DARK)`. */
export const NOT_HELD = lightDark(NOT_HELD_LIGHT, NOT_HELD_DARK);

/** The OKLab chroma of a colour — what separates the curated register from the derived one. */
export function chromaOf(hex: string): number {
  const [, a, b] = oklabOf(linearOf(hex));
  return Math.hypot(a, b);
}
