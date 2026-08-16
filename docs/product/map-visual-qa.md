# Phase 2.6 — visual QA

Same harness as Phase 2.5 (`ops/probe/shot/shot.mjs`, real Chromium over `file://`, two captures per width) and
the same limits: no HTTP, no hydration, no hover or focus state, one browser. `docs/product/visual-qa.md`
states those in full and they have not changed.

## What was rendered

| surface | URL states |
| --- | --- |
| India | default, `?layer=loksabha`, `?layer=turnout`, `?party=BJP` |
| West Bengal | default, `?party=BJP`, `?district=wb.cooch-behar`, `?election=wb-assembly-2006` |
| Karnataka | default, `?district=ka.bangalore` |
| Uttar Pradesh, Assam, Jammu & Kashmir | default |

At 1440×900, 1280×800, 1024×768, 768×1024 and 390×844 — 120 images.

## What the passes found

### The map's semantics, at a glance

The thing to check first is the one the phase exists for, and it now reads correctly: **India · Government —
"Which party leads each state's assembly now?"** in the panel header, with district lines as neutral hairlines
inside the state fills rather than divisions of a party's colour. Switching to Lok Sabha gives **"Lok Sabha ·
most seats"**, which says it is an aggregate. A state page gives **"West Bengal · Assembly winners · 2026 —
Which party won each constituency?"** Three different claims, three different sentences, none of them
ambiguous.

### Fixed in these passes

1. **The neutral district containers were invisible.** `.iei-map-state .iei-map-fills path` (three selectors)
   outspecified `.iei-map-neutral path` (two), so every district was stroked in the canvas colour and Karnataka
   rendered as an empty box. The neutral rule is scoped and the constituency rule excludes it with `:not()`.
2. **And fixing that broke the focus pairing** — the `outline: none` selector no longer prefixed its
   replacement, which the CSS test caught. An SVG anchor with no outline and no treatment on its path is a
   control that takes focus and shows nothing.
3. **The swatch and its label broke across lines** in the party landscape at 390px, so the swatch sat on one
   line and "AAAP" on the next, under the numbers it belonged beside. `.iei-mark` holds the pair together.
4. **The district focus did not reframe.** The coordinate regex knew one separator; the geometry asset writes
   `M12.3 45.6L…` and the registry's `place_geometry` writes `M307.5,108.2L…`, so every bounding box came back
   empty and the map silently stayed at state level while the heading said BANGALORE. Cooch Behar now goes from
   `-39.4 -39.4 478.9 658.9` to `264.8 63.4 137.1 79.3`.
5. **Jammu & Kashmir opened on a one-seat by-poll**, because its newest election row is a 2017 by-election. The
   map defaults to a full election now; a by-poll is still selectable.
6. **The muted register was too strong** to read as muted on the national map; 0.22 at state level, 0.18 for
   constituencies.

### Verified by eye, per jurisdiction

* **West Bengal** — 294 constituency polygons, coloured by winner, on the `delim-2008` boundaries those results
  were recorded under. Election selector back to 2015. `?district=` frames Cooch Behar and labels its seats.
* **Karnataka, Uttar Pradesh, Assam** — district containers, neutral, each clickable, with the tally beside
  them. Every row reads "15 of 28 won by BJP", never "Bangalore won by BJP".
* **Jammu & Kashmir** — 2014 assembly, 22 districts in the tally, JKPDP / BJP / JKN / INC each in their own
  colour.
* **`?election=wb-assembly-2006`** — no constituency map, because those results are `delim-1976` and the
  registry holds `delim-2008`. The page says so instead of drawing a map with holes.

## Known limits, not defects

* **Ladakh is missing from the Jammu & Kashmir map.** The 2011 census geometry for "Jammu and Kashmir"
  predates the 2019 reorganisation, so Kargil and Leh appear in the district tally — which comes from results —
  and not on the map, which comes from the geometry. The caption dates the boundaries; the mismatch is the
  epoch showing through, and closing it needs post-2019 geometry rather than code.
* **Karnataka's "BANGALORE" cannot frame itself.** The census geometry calls it Bengaluru Urban and Bengaluru
  Rural. The map says that rather than staying at state level in silence. 548 of 726 district names join; see
  `map-validation.md`.
* **A wide table still scrolls sideways on a phone** rather than dropping columns, which is Phase 2.5's
  decision and unchanged: no figure is lost, and the gesture has to be discovered.
* **Dichromatic separation of the curated palette is not floored.** 21 identity hues cannot be pairwise
  separable under protanopia, deuteranopia and tritanopia; the worst pair is measured, recorded and reported
  by `viz/party-ink.test.ts`, and the mitigations — an abbreviation on every polygon, a legend that names every
  party, an outline on the isolated one — are what carry the reader.

## The brief's final product test

Answered by looking, not by reasoning about the code.

| | |
| --- | --- |
| Look at India. Can I understand who governs each state? | Yes. The header says "Government", the question says "Which party leads each state's assembly now?", every state carries its party's abbreviation, and the legend counts states per party. |
| Click Karnataka. Can I understand who won each Assembly constituency? | **Partly, and it says which.** The tally is per district — "15 of 28 won by BJP" — and every seat is in the table. The constituency *map* needs polygons the registry does not hold for Karnataka, and the caption says so rather than drawing something. |
| Click Bengaluru Urban. Can I understand how its constituencies voted? | Yes — the tally, and the seats. The frame does not follow, because the census geometry names it differently, and the map says that. |
| Click a constituency. Can I see the winner and margin? | Yes, in the hover card and on the seat's page. |
| Change election. Does the map change correctly? | Yes: heading, question, legend, counts and polygons move together, and a historical election that predates the held boundaries refuses to draw. |
| Click a party. Can I see where it won? | Yes. `?party=BJP` isolates it on both maps, mutes the companion table with it, and is shareable. |
| Click evidence. Can I understand where the claim came from? | Yes, through the one `ⓘ` per panel — including the geometry, which is now a source row like any other. |
| Am I being unnecessarily shown source metadata? | No publisher, URL, hash or retrieval date appears outside an evidence drawer. `docs/product/evidence.md` is the sweep. |
