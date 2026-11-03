// The categorical set is for series that are not parties. Two things are held here, because a chart colour that
// breaks either is a bug nobody sees: that the three hues `hueMap` hands out, and the fold grey beside them, can be
// told apart by every kind of eye; and that none of them is a party's own colour.
import assert from "node:assert/strict";
import test from "node:test";
import { contrastOf, deltaE, VISIONS } from "./colour.ts";
import { CATEGORICAL, HUE_CAP, OTHERS } from "./palette.ts";
import { fillFor } from "./party-ink.ts";
import CONFIG from "../../../../data/party-ink.json" with { type: "json" };

const DRAWN = [...CATEGORICAL.slice(0, HUE_CAP), OTHERS];

test("the hues a chart hands out, and the fold grey, differ under protan, deutan and tritan eyes as well", () => {
  // 14 is where the set stands (the closest pair is 14.8 under tritan), and it is a floor: the BJP/AITC pair is held
  // at 15 in party-ink.test.ts, and these four are drawn beside each other the same way.
  for (let i = 0; i < DRAWN.length; i += 1) {
    for (let j = i + 1; j < DRAWN.length; j += 1) {
      for (const mode of VISIONS) {
        const d = deltaE(DRAWN[i] as string, DRAWN[j] as string, mode);
        assert.ok(d >= 14, `${DRAWN[i]} and ${DRAWN[j]} are ΔE ${d.toFixed(1)} apart under ${mode}`);
      }
    }
  }
});

test("no hue a chart hands out is a party's colour: each stays ΔE 5 from every curated party fill", () => {
  // THIS IS A FLOOR, NOT A CLAIM OF DISTANCE. Every hue in the band is near some party, and the best a hue can do is
  // about ΔE 10 (see palette.ts). 5 is where the set stands now (blue is 5.3 from INC's), so a swap to a colour
  // that is a party's, as the old slot 1 was Shiv Sena's (2.5), fails here.
  const fills = [...new Set(Object.keys(CONFIG.parties).map((k) => fillFor(k)))];
  for (const hue of CATEGORICAL.slice(0, HUE_CAP)) {
    const near = fills.map((f) => ({ f, d: deltaE(hue, f) })).sort((a, b) => a.d - b.d)[0] as { f: string; d: number };
    assert.ok(near.d >= 5, `${hue} is ΔE ${near.d.toFixed(1)} from the party fill ${near.f}`);
  }
});

test("a chart hue is a mark on all three surfaces the stylesheet draws on, not only the panel", () => {
  for (const hue of DRAWN) {
    for (const surface of ["#07070b", "#0d0d13", "#14141c"]) {
      assert.ok(contrastOf(hue, surface) >= 3, `${hue} on ${surface}`);
    }
  }
});
