// The categorical set is for series that are not parties. Two things are held here, in BOTH themes, because a chart colour that
// breaks either is a bug nobody sees: that the three hues `hueMap` hands out, and the fold grey beside them, can be
// told apart by every kind of eye; and that none of them is a party's own colour.
import assert from "node:assert/strict";
import test from "node:test";
import { contrastOf, deltaE, VISIONS } from "./colour.ts";
import { CATEGORICAL_DARK, CATEGORICAL_LIGHT, HUE_CAP, OTHERS_DARK, OTHERS_LIGHT } from "./palette.ts";
import { LIGHT_SURFACES, tokenFor } from "./party-ink.ts";
import CONFIG from "../../../../data/party-ink.json" with { type: "json" };

const DARK = { drawn: [...CATEGORICAL_DARK.slice(0, HUE_CAP), OTHERS_DARK], surfaces: ["#07070b", "#0d0d13", "#14141c"] };
const LIGHT = { drawn: [...CATEGORICAL_LIGHT.slice(0, HUE_CAP), OTHERS_LIGHT], surfaces: Object.values(LIGHT_SURFACES) };
const THEMES = { dark: DARK, light: LIGHT } as const;

test("the hues a chart hands out, and the fold grey, differ under protan, deutan and tritan eyes as well, in both themes", () => {
  // 14 is the floor in both. The dark set's closest pair is 14.8 (tritan); the light set's is 14.3, found by a search because simply
  // darkening the dark set left the rose ΔE 7.7 from the grey under protanopia (palette.ts says so). The BJP/AITC pair is held at 15
  // in party-ink.test.ts, and these four are drawn beside each other the same way.
  for (const [theme, { drawn }] of Object.entries(THEMES)) {
    for (let i = 0; i < drawn.length; i += 1) {
      for (let j = i + 1; j < drawn.length; j += 1) {
        for (const mode of VISIONS) {
          const d = deltaE(drawn[i] as string, drawn[j] as string, mode);
          assert.ok(d >= 14, `${theme}: ${drawn[i]} and ${drawn[j]} are ΔE ${d.toFixed(1)} apart under ${mode}`);
        }
      }
    }
  }
});

test("no hue a chart hands out is a party's colour: it keeps a stated distance from every curated party fill, per theme", () => {
  // THIS IS A FLOOR, NOT A CLAIM OF DISTANCE. Every hue in the band is near some party. DARK: the best a hue can do is about ΔE 10 (see
  // palette.ts) and 5 is where the set stands (blue is 5.3 from INC's), so a swap to a colour that is a party's, as the old slot 1 was
  // Shiv Sena's (2.5), fails here. LIGHT: the set that separates to ΔE 14 under every vision is a search result, and the best distance any
  // such set had from the party fills was 2.3 (orange), so 2 is the floor here, MEASURED. The two floors are different on purpose: the light
  // one trades distance from a party for separation between the series, and says so.
  const floors = { dark: 5, light: 2 } as const;
  const fillOf = { dark: (k: string) => tokenFor(k).fill, light: (k: string) => tokenFor(k).fillLight } as const;
  for (const theme of ["dark", "light"] as const) {
    const fills = [...new Set(Object.keys(CONFIG.parties).map((k) => fillOf[theme](k)))];
    for (const hue of THEMES[theme].drawn.slice(0, HUE_CAP)) {
      const near = fills.map((f) => ({ f, d: deltaE(hue, f) })).sort((a, b) => a.d - b.d)[0] as { f: string; d: number };
      assert.ok(near.d >= floors[theme], `${theme}: ${hue} is ΔE ${near.d.toFixed(1)} from the party fill ${near.f}`);
    }
  }
});

test("a chart hue is a mark on all three surfaces the stylesheet draws on, not only the panel, in both themes", () => {
  for (const [theme, { drawn, surfaces }] of Object.entries(THEMES)) {
    for (const hue of drawn) {
      for (const surface of surfaces) {
        assert.ok(contrastOf(hue, surface) >= 3, `${theme}: ${hue} on ${surface} is ${contrastOf(hue, surface).toFixed(2)}:1`);
      }
    }
  }
});
