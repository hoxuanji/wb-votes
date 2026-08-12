# Phase 3 — visual QA

Same harness as Phase 2.5 and 2.6 (`ops/probe/shot/shot.mjs`: real Chromium over `file://`, two captures per
width) and the same limits, stated in full in [`../product/visual-qa.md`](../product/visual-qa.md): no HTTP,
no hydration, no hover or focus state, one browser. Nothing about those has changed.

## What was rendered

| surface | URL states |
| --- | --- |
| India | default (`Government`), `?layer=loksabha` |
| Karnataka | default, `?district=ka.bangalore`, `?party=JD(S)` |
| West Bengal | default, `?election=ls-2024` |
| Uttar Pradesh, Maharashtra, Assam, Jammu & Kashmir | default |
| Sikkim, Meghalaya | default — a small state and a north-eastern one, which the brief asks for by name |
| Jharkhand | default — the jurisdiction whose current epoch has NO geometry, on purpose |

At 1440×900, 1280×800, 1024×768, 768×1024 and 390×844 — 154 images in `.data/shots/`.

## What the passes found

### The thing the phase exists for, at a glance

Karnataka draws **224 constituency polygons coloured by the party that won each one**, framed on Karnataka,
captioned "224 of 224 constituencies drawn, on the delim-2008 boundaries these results were recorded under".
Assam draws 126. Uttar Pradesh 391 of 403. West Bengal's Lok Sabha map draws 41 of 42 and says "Lok Sabha
winners · 2024" in its heading. Before this phase every one of those was a district tally with a sentence
explaining why there was no map.

### Fixed in these passes

1. **A label's font size was a constant in user units, and zoom is a viewBox.** The map renders into a box
   of fixed pixel height whatever the frame says, so `fontSize={7}` is 7px across the country and **340px
   inside one district** — the district level had no labels at all because none could fit. Labels are now
   1/85th of the frame width, which is the same 7px at every level, and the halo behind the glyphs scales
   with them through a custom property rather than a fixed `stroke-width: 2.2` that would have swallowed
   them.
2. **Karnataka's third party rendered as though it were unshaded.** JD(S) won 23 seats in 2023 and was not
   curated, so it fell to the generated register at chroma 0.055 — a pale wash a reader reads as absence.
   Sixty parties are curated now, chosen by measurement rather than by taste: every party that won four or
   more seats in the newest election of any jurisdiction. See below for what that cost.
3. **The map column was sized by a fraction and letterboxed every state.** India is wider than it is tall
   and all thirty-six jurisdictions are taller than they are wide, so Karnataka drew 330px of polygon inside
   a 680px column and the 350px left over was nothing at all. The column now takes its width from the
   frame's own aspect ratio, and the companion table gets the rest — which is why Assam's legend fits on one
   line and Karnataka's on two rather than four.
4. **A district focus with nothing drawable fell back to the whole country.** An empty bounding box returned
   null and the viewBox fell through to the national frame, so clicking Sikkim's SANGHA — whose single
   constituency is in the staged list — zoomed *out* to India. It stays at state level and says which.
5. **Two coordinate spaces in one map.** West Bengal holds 276 constituencies from the published boundary set
   and 31 left over from the old repo module in the old 400×580 frame. Drawing them together puts 31
   polygons somewhere they are not; the map keeps the frame most of them are in and withholds the rest.

### What the colour work cost, stated

Curating sixty identities is not free, and the honest accounting is in the tests:

* **The global separation floor came down from ΔE 5 to "no two identities are the same colour".** Sixty
  colours cannot be pairwise 5 apart inside a band bounded by two contrast floors; 38 pairs measured under
  5.5, the closest at 0.42.
* **The floor moved to where a reader meets it.** For every jurisdiction's newest assembly and Lok Sabha
  election, and for the national map's legend, any pair involving a curated party separates at **ΔE ≥ 4.5**
  — asserted against the registry in `repo/render.test.ts`, and the worst pair today is SHSUBT/SP at 4.84 in
  the 2024 Lok Sabha. Lowering one number without adding the other would have been a weakened test.
* **Two generated colours may still collide.** The quiet register is a hash, and at its chroma sRGB cannot
  tell 3,600 hues apart, so it holds about five thousand colours rather than the arithmetic's ten thousand.
  Two of Maharashtra 2019's one-seat parties landed on the same one. Both polygons carry their party's
  abbreviation and both parties are in the legend by name; no context-free hash can promise otherwise, and
  making it context-dependent would break the stability the whole system exists for.
* **The lightnesses were chosen by `ops/geo/tune-lightness.mjs`, which may not move a hue.** The hue is the
  editorial association; lightness is not. It iterates to a fixed point against the parties each party
  actually appears beside, including the generated ones.

## Known limits, not defects

* **A parliamentary constituency has no page of its own.** Its polygon is not a link. A two-segment place
  path resolves to a district and "Cooch Behar" is both a district and a parliamentary constituency in West
  Bengal, so addressing PCs by name needs a new URL space rather than a widened query. The hover card and
  the constituency table carry the winner, the party and the margin.
* **Jharkhand's current map is unavailable and the page says so.** The registry holds its pre-2008
  boundaries and DPACO 2008 redrew them, so there is nothing its 2019 result may be drawn on. That is the
  refusal working, not a gap in it.
* **Ladakh does not appear on Jammu & Kashmir's map.** Two of its assembly constituencies were refused by
  the containment check against a post-2019 basemap in which Ladakh is its own jurisdiction. Correct, and
  visible.
* **A wide table still scrolls sideways on a phone** rather than dropping columns — Phase 2.5's decision,
  unchanged: no figure is lost, and the gesture has to be discovered.

## The brief's final product test

Answered by looking at the images, not by reasoning about the code.

| | |
| --- | --- |
| They see India | 36 jurisdictions, coloured by the party leading each assembly, district lines neutral, legend counting states per party. |
| They select a state | Karnataka draws its own 224 constituencies. Assam 126. Uttar Pradesh 391 of 403, and the caption gives both numbers. |
| They select an election | The heading, the question, the legend, the counts and the polygons move together. A historical election whose boundaries the registry does not hold refuses to draw and says why. |
| They select a district | `?district=ka.bangalore` frames Bengaluru's 28 constituencies and labels each with its winner's party. |
| They select a constituency | An assembly seat has its own page. A parliamentary one has a hover card and a table row — the limit above. |
| They select a party | `?party=JD(S)` keeps its 23 polygons at full strength, mutes the rest, mutes the table with them, and is shareable. |
| They click evidence | One `ⓘ` per panel. The boundary set is a source row like any other, with its publisher, URL, licence and sha256. |
| They never see source metadata unless they want it | No publisher, URL, hash or retrieval date outside an evidence drawer. |
