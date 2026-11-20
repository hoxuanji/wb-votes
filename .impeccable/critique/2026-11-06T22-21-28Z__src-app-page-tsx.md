---
target: src/app/page.tsx
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:src/app/page.tsx"
target_fingerprint: "sha256:fcf3790a649a3b005fd86bdfa25b6f6d4af61f5cbc656f08eb9deb675c03df8a"
target_path: src/app/page.tsx
timestamp: 2026-11-06T22-21-28Z
slug: src-app-page-tsx
---
Method: dual-agent (A: design-review sub-agent · B: detector and browser-evidence sub-agent), run in isolation. The real detector ran (exit 2, 15 findings, 6 false positives). No visual overlay: the sandbox refuses a local server and the live helper writes into the project. Measured on the seed (1 of 36 states lit) and the uncommitted working tree.

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Coverage bars and "Expected" are clear. The rail never tracks scroll; a layer switch reloads the page. |
| 2 | Match system / real world | 2 | "Not loaded" x35 and "partly loaded" read as database words. The tab "Government" names an assembly leader. |
| 3 | User control and freedom | 3 | URL state, Back and play/pause work. A map click reloads to #map. |
| 4 | Consistency and standards | 3 | One component family, but hue follows DOM position and rank contradicts the bold figure. |
| 5 | Error prevention | 3 | Dead layers are refused; the party parameter is validated. |
| 6 | Recognition rather than recall | 3 | Rail names differ from panel names (Landscape leads to "India · Government"). |
| 7 | Flexibility and efficiency | 2 | Command-K is a Mac glyph. The state page is two navigations away. No cite or copy action. |
| 8 | Aesthetic and minimalist | 2 | About 3,700px for roughly 20 facts, with voids and repeated chrome. |
| 9 | Recognize, diagnose, recover | 3 | Absences are in words. The Closest contests empty copy is convoluted. |
| 10 | Help and documentation | 2 | The measured/derived/reference legend is explained nowhere on the page. |
| **Total** | | **26/40** | **Acceptable (65%)** |

## Design Specificity Verdict

Design review (A): half specific. Specific: the hero leads with coverage and true denominators; unlit states are named on the map and folded into one disclosure; layers the registry cannot fill are refused; Next up bars carry words. Generic: blue-black canvas, 8px cards with a lit top edge, tracked uppercase mono labels, a six-colour icon rail and a gradient headline; swap the map and the word "India" and it fits any metrics product. The provenance marker the design system calls its signature renders nowhere on the page (zero .iei-basis elements). DESIGN.md's Bounded Glow Rule lists four gradients and the headline gradient is a fifth.

Deterministic scan (B): 15 findings. Six false positives (four low-contrast, two gray-on-color) from the 1px rainbow hairline under the top bar; measured header text is at least 5.14:1. Real: .iei-story-lead line-height 1.25, the "India" kicker above the H1, the H1 gradient text. Not real: cramped-padding (computed border is 0px) and the stripes advisory (nothing on the route uses it).

## Overall Impression

The floors hold: no contrast failures, no overflow from 320 to 1440, a visible focus indicator on every tab stop, and the map is on the first screen at 1440 and 768. What is weak is the top of the page: it states coverage before the finding, and the provenance this product exists for sits in three small links, not on a figure.

## What's Working

1. Honest scope as composition: reach cards, a hero sentence naming the one state, and a folded "35 not loaded" list turn sparsity into a statement of scope; every numeral sits beside its denominator.
2. The measured floors: 0 text failures at 1440, 768 and 390 (lowest 5.09:1; unlit names 6.40:1); all 74 tab stops show a focus indicator and the History map has none; motion is inside prefers-reduced-motion; the rail fits at 390 and the layer strip is one row.
3. One linked instrument with no JavaScript: map, table and card share a selection through the URL, and the only saturated colour on screen is the data.

## Priority Issues

1. [P1] The top of the page is not answer-first, and its headline figures carry no marker. The H1 "The electoral landscape" names a topic; the lead sentence answers a coverage question; the result itself ("BJP 192 of 294 · majority") is 13.5px in a side card, about 1,000px down at 390. The hero's denominators are reference data and are not marked as such; "majority" is computed and the words explaining it are inside the drawer, not beside it. PRODUCT.md says a page states its answer first and journalists win ties. Fix: put the finding in the lead; mark denominators as reference and "majority" as counted, in place. Command: /impeccable clarify

2. [P1] Inferred dates do not carry their inference on the card. "EXPECTED 2029" and "EXPECTED 2031" are term expiries in plain ink; the only qualifier is a sentence under the cards, lost when one card is screenshotted. The README's rule is that a date nobody announced is marked derived wherever it appears. A render test bans the word "Derived" from this page, so the fix must use other words. Fix: "inferred" in each card, e.g. "Expected 2029 · inferred from the 2021 election". Command: /impeccable harden

3. [P2] Hue is assigned by DOM position, not by place (the user's earlier "make hue say where you are" decision, still open). The six panels get indigo, cyan, indigo, indigo, cyan, cyan; the rail icons never match their panels (Landscape cyan vs indigo panel, Next up amber vs cyan, History violet vs indigo). 67 chromatic uses of chrome hue; the top hairline carries all six. Fix: one page hue for sections, keep the current-place marker, drop the hairline. Command: /impeccable quieter

4. [P2] The page does not scale down to sparse data: about 350px of void beside the table, about 190px beside Closest contests, two Next up cards in a 1,300px panel, a 620px map for one lit polygon, and a History ribbon scaled to 36 states (a one-state result is a 3px foot). Three layer tabs are dead, and the code's own rule is that an unavailable choice is shown, not hidden; that and the India-first decision limit the fix. Wire cost is small (21 KB brotli, 71 KB gzip), so this is composition, not bytes. Command: /impeccable distill

5. [P2] Selecting a state is a decoy, and phones cannot name most states. Polygon, tile, table row and card name all link to ?state=wb, which only swaps the card; the state page is two navigations away. At 390, 27 unlit states have no visible name or code (map text is hidden; names live in title and a closed disclosure). Fix: link straight to the state page when the state is already chosen, or always show "Open X"; on a phone put the answer card first. Command: /impeccable adapt

## Persona Red Flags

Ranked by PRODUCT.md: journalists and researchers win ties, so issues 1 and 2 outweigh 5.

- Journalist on deadline: "majority" is computed with its caveat hidden; "Expected 2029" has no inline marker; the 2024 West Bengal results cite Wikipedia ("hash over the URL only"); no cite action.
- Alex (power user): Command-K shown as a Mac glyph; the map is still 36 tab stops before the table; layer switches reload; no path from the map to a state page.
- Sam (accessibility): the unlit ink is about 1.2:1 on the card (deliberate, but faint to low vision); the reason a layer is dead is screen-reader-only text; real AT behaviour for 36 links inside a role="img" map is untested.
- Voter on a phone: the first screen says whether the site covers them, and the answer is no for 35 states, with no next step; "not loaded" reads as a bug; "Search by name" points at a field about 40px above it.

## Minor Observations

- The two hero eyebrow chips sit about 46px apart vertically (align-items: end).
- "partly loaded" appears on every Recent results row, so it no longer discriminates.
- Party landscape still numbers "IND" as a party (left as a data call).
- Text links 16 to 23.5px tall: Data & coverage, the table link, the legend link and four summary elements.
- Next up scrolls sideways at 768 and below.
- The history map's "level" hatch is defined but referenced by nothing in this render.
- Hover cards are native title tooltips, absent on touch and keyboard focus.

## Questions to Consider

1. If the moat is provenance, why does the front page show it as three small links, not on a figure?
2. Does a registry holding one state deserve a 620px national map as its centrepiece, or should the page reshape around the data it has?
3. Is "The electoral landscape" a title the record would write, or the product's slogan?
4. Should six wayfinding hues exist at all, if none of them tells you where you are?

Not measured: client-side behaviour (no hydration ran), hover and touch states, Safari, Firefox, real devices and a real screen reader.
