// §24 as data. Every value is copied from docs/mandate/05-craft.md §24.1–24.6 — none is re-derived,
// because the validator runs in that section are the proof and re-deriving would invalidate them.
//
// Dark only. The Place Analysis floor renders on --canvas/--panel and there is no light-mode surface
// in this cycle's CSS to measure against.
// ponytail: dark-only tokens — add the light column when a light surface actually ships.

/** The surface every mark sits on, and the surface every validator run is measured against. */
export const SURFACE = "#13111B";

/** Grid lines. Never drawn over a mark (§24.7). */
export const LINE_SUBTLE = "#201C2B";

/** Values. Never a series colour (§24.7). */
export const TEXT_PRIMARY = "#F2F0F7";

/** Legend text and series names beside a swatch. */
export const TEXT_SECONDARY = "#A7A2B8";

/**
 * Axes, units, tick labels. This is src/app/p/mandate.css's `--muted` (#8a8399, 4.6:1 on --panel),
 * NOT §24.2's #6E687F (3.51:1). Cycle 2 lifted the tier precisely so small axis text clears 4.5:1;
 * charts follow the CSS the page is already wearing.
 */
export const TEXT_MUTED = "#8A8399";

/**
 * §24.4, dark. Eight slots, adjacency-gated. Legal in full only where adjacency is KNOWN — which,
 * of the three charts here, is nowhere: a folded bar row or a folded line can end up beside any
 * other. So `hueMap` below hands out three and never the rest. The eight are kept whole anyway
 * because they are the §24.4 record, and a truncated copy of a validated palette is a lie.
 */
export const CATEGORICAL = [
  "#3987e5", // 1 blue    INC
  "#d95926", // 2 orange  BJP
  "#199e70", // 3 aqua    AITC
  "#c98500", // 4 yellow
  "#d55181", // 5 magenta
  "#008300", // 6 green
  "#9085e9", // 7 violet
  "#e66767", // 8 red
] as const;

/** §24.5. Three, because 4 all-pairs fails at ΔE 1.9 protan (#9085e9 ↔ #3987e5) on this surface. */
export const HUE_CAP = 3;

/**
 * The fold target — everything past the cap. Deliberately chroma-poor so it never reads as a
 * fourth party.
 *
 * §24.6 names #383835 as the diverging midpoint, and that value is NOT used here: as a MARK on
 * #13111B it measures 1.59:1, i.e. invisible. A ramp midpoint that recedes toward the surface is
 * correct for a ramp and wrong for a fill. #6E687F is §24.2's text-muted grey, 3.51:1 on the
 * surface, which is the floor a mark has to clear. Both figures are asserted in charts.test.ts —
 * §24.8's "the colour system is a test, not a document".
 */
export const OTHERS = "#6E687F";

/**
 * §24.6 diverging, blue ↔ red, grey between. Used by `slope`, where the encoded dimension is
 * POLARITY (a share rose or fell), not identity — so the three-hue cap does not apply and no
 * legend swatch stands for an entity. `zero` is OTHERS for the same visibility reason as above.
 */
export const DIVERGING = { up: "#3987e5", down: "#e66767", zero: OTHERS } as const;
