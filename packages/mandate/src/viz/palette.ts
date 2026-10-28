// The Analysis charts' colours: the stylesheet's surface and inks, and a categorical set for series. The
// series set is NOT party ink. A chart here gives the Nth key of its ranked list the Nth hue (`hueMap`), so a
// party's hue on an Analysis chart is not its colour on a map, which is party ink by key (`fillFor`).
//
// Dark only: every value is measured against SURFACE, and the stylesheet has no light surface to measure
// against.
// ponytail: dark-only tokens — add the light column when a light surface actually ships.

/*
 * THE SURFACE, THE INKS AND THE DIVERGING PAIR ARE THE STYLESHEET'S TOKENS, NOT A SECOND SET OF THEM.
 *
 * Each is the iei.css custom property of the same role, copied because an SVG attribute cannot read a CSS
 * variable through `dangerouslySetInnerHTML` and a runtime lookup is not available to a string builder.
 */

/** --iei-panel. The surface every mark sits on, and the surface every contrast below is measured against. */
export const SURFACE = "#0d0d13";

/** --iei-line. Grid lines. Never drawn over a mark (§24.7). */
export const LINE_SUBTLE = "#1e1e28";

/** --iei-ink. Values. Never a series colour (§24.7). */
export const TEXT_PRIMARY = "#f2f2f7";

/** --iei-ink-2. Legend text and series names beside a swatch. */
export const TEXT_SECONDARY = "#a3a3b3";

/**
 * --iei-ink-3. Axes, units, tick labels.
 *
 * 4.82:1 on the worst surface it is drawn on, which is the floor small text has to clear. §24.2's #6E687F
 * is 3.51:1 and is NOT used: charts follow the CSS the page is wearing, and that tier was lifted precisely
 * so axis text clears 4.5:1.
 */
export const TEXT_MUTED = "#818198";

/**
 * Eight slots, dark. Slots 4-8 are docs/mandate/05-craft.md §24.4's, which are adjacency-gated: legal in full
 * only where adjacency is KNOWN — which, of the charts here, is nowhere, because a folded bar row or a folded
 * line can end up beside any other. So `hueMap` below hands out three and never the rest. The eight are kept
 * whole anyway, because a truncated copy of a validated palette is a lie.
 *
 * Slots 1-3 are not §24.4's (#3987e5, #d95926, #199e70). The only gate on any of the eight is the 3:1 mark
 * floor in charts.test.ts: no colour-vision check runs over them.
 */
export const CATEGORICAL = [
  "#cd702f", // 1 orange
  "#6fa4fc", // 2 blue
  "#e1a6a2", // 3 rose
  "#c98500", // 4 yellow
  "#d55181", // 5 magenta
  "#008300", // 6 green
  "#9085e9", // 7 violet
  "#e66767", // 8 red
] as const;

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
export const OTHERS = "#7b7490";

/**
 * Diverging, used by `slope`, where the encoded dimension is POLARITY (a share rose or fell), not identity — so
 * the three-hue cap does not apply and no legend swatch stands for an entity. `up` and `down` are --iei-good
 * and --iei-alert, the two hues this product already spends on the direction of a change. `zero` is OTHERS for
 * the same visibility reason as above.
 */
export const DIVERGING = { up: "#7fd4a8", down: "#e8927c", zero: OTHERS } as const;
