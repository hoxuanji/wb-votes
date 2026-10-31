// The ink of a ribbon: a party's colour, brought down to a stated contrast against the surface it is drawn on, and OPAQUE.
//
// WHY NOT AN OPACITY. A ribbon used to be the party's ink at 14% to 70% opacity. Translucent ink over a card goes grey-brown (an orange
// at 30% over near-black is a dull brown, and the colour of a crossing is the mixture of two parties, which belongs to neither), and
// how faint "faint" was depended on the party: the same 30% is a legible green and an invisible blue. So a ribbon's fill is computed
// instead, once, from the ink and the surface: the ink's own hue and chroma, at the lightness whose contrast against the surface is the
// tier's. Opaque, so that a crossing has an order (the brighter ribbon over the fainter) and not a blend.
//
// THE TIERS ARE A SHARE OF THE INK'S OWN CONTRAST, NOT A FIXED NUMBER. The brightest tier is the ink itself, calmed to at most RIBBON_CAP:1
// (a saffron at 8.7:1 is a wall of colour at the width of a page, and 6:1 is still bright). The other two are a share of the contrast above
// 1 that the brightest has, so "fainter" means the same fraction of fainter for every party. A fixed target would have flattened the parties
// whose inks are dark (14 of the 60 curated are under 4.3:1) into one tier, and lifted them toward the lighter parties of their hue family,
// which party-ink.ts separates on lightness on purpose: CPI would have been brought up to CPM's red.
//
// WHAT THE TIERS MEAN is the caller's: in the seat-flow picture bright is seats that changed hands, mid is a ribbon that holds some of each
// and faint is seats held; on the vote ladder bright is the party being followed, faint the others. Hue is not the only channel in either:
// the tiers differ in lightness, every ribbon sits between two boxes or bars that carry the party's code, and the picture has a table twin.
//
// THE FLOORS, held by ribbon-ink.test.ts: the brightest tier clears 3:1 against the surface (as every party's ink does), the faintest at least 1.9:1
// and at least 40% of the way from the surface to the brightest, and the three are in order by at least a tenth of OKLab lightness, so the tiers
// differ without hue. No text is drawn over a ribbon (names are in columns beside the picture, the ladder's codes are on the bars), so nothing
// here has to clear the 4.5:1 a label does.

import { contrastOf, linearOf, oklabOf, oklch } from "./colour.ts";
import { SURFACE } from "./palette.ts";

export type RibbonTier = "bright" | "mid" | "faint";

/** The most contrast a ribbon is given, however bright the party's ink is. */
export const RIBBON_CAP = 6;

/** How much of the brightest tier's contrast above 1 each tier keeps. */
export const RIBBON_SHARE: Readonly<Record<RibbonTier, number>> = { bright: 1, mid: 0.7, faint: 0.42 };

/** --iei-ink-3: the ribbon of "smaller parties together", and of seats that were held and changed hands in one. Not a party's ink. */
export const NEUTRAL_RIBBON_INK = "#8b8ba2";

const cache = new Map<string, string>();

/** The opaque fill of a ribbon in `ink` (a `#rrggbb`) on `surface`, at the tier's contrast. */
export function ribbonInk(ink: string, tier: RibbonTier, surface: string = SURFACE): string {
  const id = `${ink}|${tier}|${surface}`;
  const hit = cache.get(id);
  if (hit !== undefined) return hit;
  const brightest = Math.min(RIBBON_CAP, contrastOf(ink, surface));
  const target = 1 + RIBBON_SHARE[tier] * (brightest - 1);
  const [, a, b] = oklabOf(linearOf(ink));
  const chroma = Math.hypot(a, b);
  const hue = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  // Contrast rises with lightness at a fixed hue and chroma, so the lightness that reaches the target is found by halving.
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (contrastOf(oklch(mid, chroma, hue), surface) < target) lo = mid;
    else hi = mid;
  }
  const out = oklch(hi, chroma, hue);
  cache.set(id, out);
  return out;
}
