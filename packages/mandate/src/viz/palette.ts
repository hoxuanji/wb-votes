// The Analysis charts' colours: the stylesheet's surface and inks, and a categorical set for series.
//
// WHICH SERIES WEAR WHICH. A series that IS a party wears that party's ink (`fillFor`), passed as `colour`, so a
// party is one colour on a map, in the vote-share lines and in the votes bars. The set below is for the series that
// are not parties — the seat, its district and its state on a turnout chart — and `hueMap` gives the Nth of those the
// Nth hue. Every line is also named at its end, so the hue is never what says which series it is.
//
// TWO THEMES. Every value here exists in a dark half and a light half, and the one the DOM gets is `light-dark(LIGHT, DARK)` (colour.ts
// `lightDark`), which a string-built SVG attribute can carry where it cannot carry a CSS variable. The `_DARK` and `_LIGHT` exports are the
// plain hex of each half, and are what colour maths and tests read; SURFACE stays the dark panel hex because the maths that measures against
// it (ribbon-ink.ts, the tests) was written for it, and SURFACE_LIGHT is the other.

import { lightDark } from "./colour.ts";

/*
 * THE SURFACE, THE INKS AND THE DIVERGING PAIR ARE THE STYLESHEET'S TOKENS, NOT A SECOND SET OF THEM.
 *
 * Each is the iei.css custom property of the same role, copied because an SVG attribute cannot read a CSS
 * variable through `dangerouslySetInnerHTML` and a runtime lookup is not available to a string builder.
 */

/** --iei-panel. The surface every mark sits on, and the surface every contrast below is measured against. */
export const SURFACE = "#0d0d13";

/** The light page's --iei-panel. */
export const SURFACE_LIGHT = "#f8f9fc";

/** What a chart's halo around a point or a label is drawn in: the card it sits on, in whichever theme it is. */
export const SURFACE_PAINT = lightDark(SURFACE_LIGHT, SURFACE);

/** --iei-line. Grid lines. Never drawn over a mark (§24.7). */
export const LINE_SUBTLE_DARK = "#1e1e28";
export const LINE_SUBTLE_LIGHT = "#dcdfea";
export const LINE_SUBTLE = lightDark(LINE_SUBTLE_LIGHT, LINE_SUBTLE_DARK);

/** --iei-ink. Values. Never a series colour (§24.7). */
export const TEXT_PRIMARY_DARK = "#f2f2f7";
export const TEXT_PRIMARY_LIGHT = "#12131c";
export const TEXT_PRIMARY = lightDark(TEXT_PRIMARY_LIGHT, TEXT_PRIMARY_DARK);

/** --iei-ink-2. Legend text and series names beside a swatch. */
export const TEXT_SECONDARY_DARK = "#a3a3b3";
export const TEXT_SECONDARY_LIGHT = "#454859";
export const TEXT_SECONDARY = lightDark(TEXT_SECONDARY_LIGHT, TEXT_SECONDARY_DARK);

/**
 * --iei-ink-3. Axes, units, tick labels.
 *
 * 5.82:1 on SURFACE, where the charts draw, and 5.51:1 on the raised surface, the worst one it can sit on; the
 * floor small text has to clear is 4.5:1. §24.2's #6E687F is 3.51:1 and is NOT used: charts follow the CSS the
 * page is wearing, and that tier was lifted precisely so axis text clears 4.5:1. It was #818198 here after the
 * stylesheet moved to #8b8ba2 (a card's lit top edge is lighter than any token, and a label needs the headroom),
 * and iei.test.ts now holds every colour in this file that copies a token equal to it.
 */
export const TEXT_MUTED_DARK = "#8b8ba2";
export const TEXT_MUTED_LIGHT = "#585b70";
export const TEXT_MUTED = lightDark(TEXT_MUTED_LIGHT, TEXT_MUTED_DARK);

/**
 * Eight slots, dark. Slots 4-8 are docs/mandate/05-craft.md §24.4's, which are adjacency-gated: legal in full
 * only where adjacency is KNOWN — which, of the charts here, is nowhere, because a folded bar row or a folded
 * line can end up beside any other. So `hueMap` below hands out three and never the rest. The eight are kept
 * whole anyway, because a truncated copy of a validated palette is a lie.
 *
 * Slots 1-3 are not §24.4's (#3987e5, #d95926, #199e70). palette.test.ts gates them, and the fold grey, for
 * colour-vision separation and for distance from the colours parties wear. Slots 4-8 are not gated beyond the 3:1
 * mark floor in charts.test.ts, because nothing draws them.
 *
 * NO HUE IS FREE OF A PARTY. 58 distinct party fills leave no colour in the band more than ΔE 10.6 from the nearest
 * one (an olive yellow), and a search over the band found no trio, 6+ from every party, that is also separable under
 * protan, deutan and tritan and from the fold grey. So the set stays where it is, with one move: slot 1 was #cd702f, ΔE 2.5 from Shiv Sena's
 * orange, and is the vermilion #d05320, ΔE 5.9 from the nearest party fill. That is nearer than ideal, and said so.
 */
export const CATEGORICAL_DARK = [
  "#d05320", // 1 vermilion
  "#6fa4fc", // 2 blue
  "#e1a6a2", // 3 rose
  "#c98500", // 4 yellow
  "#d55181", // 5 magenta
  "#008300", // 6 green
  "#9085e9", // 7 violet
  "#e66767", // 8 red
] as const;

/**
 * The same eight on the LIGHT page, where a mark has to be about L 0.62 or darker (3:1 on #eef0f6). Slots 4-8 are the dark ones brought down only as
 * far as that needs. Slots 1-3 are NOT: darkening the dark three left the rose ΔE 7.7 from the fold grey under protanopia, so they were searched
 * for (hue, lightness and chroma, with the grey free too) and the best set whose worst pair, over all four visions, clears ΔE 14 is the one below:
 * 14.3. THE COST, MEASURED: those hues sit ΔE 2.3 (orange), 2.9 (blue) and 6.2 (plum) from the nearest party's light fill, where the dark set
 * had 5.9 for its nearest. No set that separates to 14 does better (the search maximised it: 2.3), and the alternative, separating less, would
 * put two of a chart's three series within reach of each other for a colour-blind reader; every line is also named at its end, so the
 * choice is for the reader who is told by colour first. palette.test.ts holds both numbers.
 */
export const CATEGORICAL_LIGHT = [
  "#cc6004", // 1 orange
  "#385db8", // 2 blue
  "#784756", // 3 plum
  "#bb7c02", // 4 yellow
  "#d55181", // 5 magenta
  "#008300", // 6 green
  "#877cdf", // 7 violet
  "#df6161", // 8 red
] as const;

/** What the DOM is given for each slot. */
export const CATEGORICAL = CATEGORICAL_DARK.map((d, i) => lightDark(CATEGORICAL_LIGHT[i] as string, d)) as unknown as readonly [
  string, string, string, string, string, string, string, string,
];

/** §24.5. Three, because the doc's own set fails all-pairs once a fourth is added (ΔE 1.9 protan, #9085e9 ↔ #3987e5). */
export const HUE_CAP = 3;

/**
 * The fold target — everything past the cap. Deliberately chroma-poor so it never reads as a
 * fourth party.
 *
 * §24.6 names #383835 as the diverging midpoint, and that value is NOT used here: as a MARK on SURFACE it
 * measures 1.65:1, i.e. invisible. A ramp midpoint that recedes toward the surface is correct for a ramp and
 * wrong for a fill. This grey is 4.38:1 on SURFACE, above the 3:1 floor a mark has to clear. charts.test.ts
 * asserts both sides of that, as thresholds — §24.8's "the colour system is a test, not a document".
 */
export const OTHERS_DARK = "#7b7490";
/** 3.37:1 on the light canvas, the worst of the three light surfaces; the CVD-separation search above chose it with the three hues. */
export const OTHERS_LIGHT = "#828094";
export const OTHERS = lightDark(OTHERS_LIGHT, OTHERS_DARK);

/**
 * Diverging, used by `slope`, where the encoded dimension is POLARITY (a share rose or fell), not identity — so
 * the three-hue cap does not apply and no legend swatch stands for an entity. `up` and `down` are --iei-good
 * and --iei-alert, the two hues this product already spends on the direction of a change. `zero` is OTHERS for
 * the same visibility reason as above.
 */
export const DIVERGING_DARK = { up: "#7fd4a8", down: "#e8927c", zero: OTHERS_DARK } as const;
/** --iei-good and --iei-alert, light halves. */
export const DIVERGING_LIGHT = { up: "#0b6b3f", down: "#a8341c", zero: OTHERS_LIGHT } as const;
export const DIVERGING = {
  up: lightDark(DIVERGING_LIGHT.up, DIVERGING_DARK.up),
  down: lightDark(DIVERGING_LIGHT.down, DIVERGING_DARK.down),
  zero: OTHERS,
} as const;
