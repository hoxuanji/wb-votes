// §24 as data. Every value is copied from docs/mandate/05-craft.md §24.1–24.6 — none is re-derived,
// because the validator runs in that section are the proof and re-deriving would invalidate them.
//
// Dark only. The Place Analysis floor renders on --canvas/--panel and there is no light-mode surface
// in this cycle's CSS to measure against.
// ponytail: dark-only tokens — add the light column when a light surface actually ships.

/*
 * PHASE 2.5: THESE ARE THE STYLESHEET'S TOKENS, NOT A SECOND SET OF THEM.
 *
 * Every value below is the iei.css custom property of the same role, copied because an SVG attribute cannot
 * read a CSS variable through `dangerouslySetInnerHTML` and a runtime lookup is not available to a string
 * builder. It was a genuinely different palette until this phase: the surfaces named `--panel` and `--muted`
 * from src/app/p/mandate.css, which this phase DELETED, so a chart was drawing itself on a #13111B card that
 * the page no longer paints — and the series hues were a separate three-colour set, so BJP was a muted
 * orange on the national map and a saturated blue on a seat's analysis chart. One product, one palette.
 */

/** --iei-panel. The surface every mark sits on, and the surface every validator run is measured against. */
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
 * §24.4, dark. Eight slots, adjacency-gated. Legal in full only where adjacency is KNOWN — which,
 * of the three charts here, is nowhere: a folded bar row or a folded line can end up beside any
 * other. So `hueMap` below hands out three and never the rest. The eight are kept whole anyway
 * because they are the §24.4 record, and a truncated copy of a validated palette is a lie.
 */
export const CATEGORICAL = [
  // The first three are repo/home.ts's PARTY_HUES, verbatim, and they are the better-validated set: their
  // worst-case OKLab ΔE across normal, protan, deutan and tritan vision is computed in home.test.ts, all
  // pairs, including against the neutral. Nothing measures the eight below that way.
  "#cd702f", // 1 orange
  "#6fa4fc", // 2 blue
  "#e1a6a2", // 3 rose
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
export const OTHERS = "#7b7490";

/**
 * §24.6 diverging, blue ↔ red, grey between. Used by `slope`, where the encoded dimension is
 * POLARITY (a share rose or fell), not identity — so the three-hue cap does not apply and no
 * legend swatch stands for an entity. `zero` is OTHERS for the same visibility reason as above.
 */
/** --iei-good and --iei-alert: the two hues this product already spends on the direction of a change. */
export const DIVERGING = { up: "#7fd4a8", down: "#e8927c", zero: OTHERS } as const;
