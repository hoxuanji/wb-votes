# Final UI pass — visual QA

**Date** 2026-08-13. What was rendered, in what, at what sizes, what it found, and — because this matters more
than the list of fixes — what these images do **not** prove.

## The harness

`ops/probe/shot/shot.mjs`, unchanged from Phase 2.5. It renders a route through `ops/probe/render`, wraps the
markup in the document the root layout produces, inlines `src/app/iei.css`, writes it to `.data/shots/`, and
screenshots it with real Chromium at five widths.

`listen()` is refused in this sandbox — with the sandbox off as well, so it is an OS policy rather than a
setting — which means there is no `next dev`, no `next start`, and nothing to point a browser at over HTTP.
What is permitted is a browser reading a file, so these are `file://` documents. The layout, the type metrics,
the wrapping, the overflow, the clipping and the grid are all genuinely computed by a browser engine.

**Two captures per width.** `chrome-headless-shell` ignores `--screenshot-full-page`, so a whole document needs
a tall window — and a tall window changes what `vh` means. `-fold` is the real viewport, where hierarchy and
`vh`-dependent sizing are judged; `-doc` is the same **width** in a 3,600px window, where rhythm and alignment
down the page are judged. Media queries key on width, so the layout in `-doc` is the layout.

### What these images do not prove

* **No HTTP.** Caching, streaming, `next/image` — absent.
* **No hydration.** The product ships one client component (`CommandKey`, which binds ⌘K and paints nothing).
* **No `position: sticky`.** The header has nothing to stick to in a static capture.
* **No interaction.** Hover, focus, `:focus-visible`, an open `<details>` and a scrolled region are
  unexercised. Those are covered by `viz/iei.test.ts`, which parses the stylesheet and asserts that every rule
  removing an outline replaces it, that `forced-colors` restores real outlines, and that no status is carried by
  colour alone.
* **One browser.** Chromium. No Safari, no Firefox, no real device.

## Surfaces and sizes

23 captures × 5 viewports × 2 windows = **230 images**, at 1440×900, 1280×800, 1024×768, 768×1024 and 390×844.

| surface | route |
| --- | --- |
| India | `/`, plus the turnout and margin layers and `?party=BJP` |
| State | `/pl/ka`, `/pl/wb`, `/pl/up`, `/pl/as`, `/pl/jk`, `/pl/jh`, `/pl/sk`, `/pl/mh` |
| State, other geographies | `/pl/wb?election=ls-2024` (parliamentary), `/pl/wb?election=wb-assembly-2006` (no polygons held) |
| District zoom | `/pl/ka?district=ka.bangalore` |
| District, seat, analysis | `/pl/wb/cooch-behar`, `…/mekliganj`, `…/mekliganj/analysis` |
| Person | `/p/mamata-banerjee-4a681f` |
| Search | `/search?q=ram`, and the empty state |
| Data | `/coverage`, and `/coverage?election=ls-2024` |

The eight jurisdictions are chosen to be every shape this data has: complete constituency geometry (`ka`),
withheld polygons (`wb`), the largest (`up`), re-delimited after 2008 (`as`, `jk`), **no** usable constituency
geometry so the map falls back to neutral districts (`jh`), the smallest (`sk`), and one with no relationship
to any of them (`mh`).

## Five defects the images found

Recorded in the order they were caught, because three of them were invisible to every other check in the
repository — `tsc` type-checks JSX, the render suite reads text, and neither computes a layout.

### 1. The companion table beside both maps did not render at all

**Found before the audit was written, on the first baseline capture.** `.iei-map-split` was
`minmax(0, auto) minmax(0, 1fr)`, and `.iei-map-col` took its width from `--iei-map-w`, which `StateMap`
computed as `calc(70vh * aspect)`. An `auto` grid track sized from a **viewport height** resolves against
whatever the window is, so the map claimed the whole row and the column beside it collapsed to about 50px.

At 1440×900 the national legend rendered as `BJP 11 s` / `INC 5 st` / `AAAP 2 s`, clipped mid-word, and the
36-row standings table — the only place the front page listed the country — **was not drawn**. Karnataka's
district tally went the same way.

Two changes, because there were two faults: `--iei-map-h` is a pixel token and both maps derive their width
from it, and the second track has a `minmax(300px, 1fr)` floor so a collapse is unrepresentable.

### 2. Every stroke inside a map was in user units

A constituency separator of `0.4` and a hover stroke of `1.8` are *viewBox* units, and this product's zoom is a
viewBox change rather than a transform. So the separator drew at about 1.8px across a state and about **25px**
inside a framed district, and the hover stroke at about 8px and **110px**. The heavy black gridding over
Karnataka's 224 polygons was this, not a design choice.

`vector-effect: non-scaling-stroke` on `.iei-map path` makes every width a screen measurement, so a hairline is
a hairline at national, state and district zoom alike and no component computes one. A text size cannot use the
trick, which is why `LABEL_FRACTION` still exists.

### 3. At district zoom the map painted over the whole page

**The worst of the five, and only a browser could have found it.** `.iei-map svg` carried
`overflow: visible` — harmless at state level, where nothing is drawn outside the frame, and catastrophic at
district level, where the frame is a small window onto the state and 200 other constituencies are outside it.
On `/pl/ka?district=ka.bangalore` those 200 muted polygons painted straight over the header, the hero, the
legend and the tally as a green-brown wash across the entire document.

`overflow: hidden`. The muted neighbours are still drawn — they are the context that makes a zoom legible —
they are simply confined to the figure.

### 4. The map kept its two-column width after the columns stacked

At 768×1024 Karnataka drew **220px wide inside a 740px viewport**, with the rest of the row empty. Below
900px the split is one column, but `.iei-map-col` was still honouring the `--iei-map-w` a two-column row needs.
The component sets the variable; the width is the stylesheet's decision, so the narrow breakpoint overrides it
to `100%` and drives the figure from a definite height instead — which also makes the box shrink to the drawing
rather than letterboxing a tall state inside a full-width row.

### 5. Raising the label size quietly moved two states off the map

`labelFits` was answering two different questions with one threshold: *can this polygon hold its abbreviation*
and *is this polygon big enough to click*. Making labels legible (they rendered at about 6.9px) therefore
pushed Mizoram and Tripura into the "too small to select" tile row. Two constants now, and the pointer
threshold does not move when the type does.

## Two things the images changed my mind about

* **State-level labels needed a headroom multiplier, not just a size.** `labelFits` alone is true of 137 of
  Karnataka's 224 constituencies, and 137 abbreviations is the wall of text the brief warns about. Requiring
  1.6× the room gives Karnataka 21 labels, Delhi 14, Sikkim 25, West Bengal 2 and Uttar Pradesh none — which is
  the right distribution: at 391 polygons across 178 units no per-seat label is legible at any size, the
  winners list beside the map is the key, and framing a district brings the labels back where they can be read.
* **The election selector needed reordering, not truncating.** Twelve chips in strict chronological order gave
  Karnataka four full elections scattered through eight single-seat by-polls, over four rows on a phone. Full
  elections first: same twelve, same links, ranked by what a reader came for.

## Before and after, measured

Rendered markup from `ops/probe/render`. **Visible** words, with the map's 46 SVG `<title>` hover cards
stripped — those are the map's accessible name and its mouse tooltip, not visible clutter, and a metric that
punished them would push a redesign towards a less accessible map.

| | `/` before | `/` after | | `/pl/ka` before | `/pl/ka` after |
| --- | --- | --- | --- | --- | --- |
| visible words | 1,229 | **1,037** | | 1,465 | **1,157** |
| tables | 4 | **1** | | 3 | **2** |
| table rows | 66 | **37** | | 117 | **86** |
| table cells | 325 | **185** | | 492 | **368** |
| "Measured" | 11 | **0** | | 3 | **0** |
| "Derived" | 9 | **0** | | 0 | 0 |
| coverage chips | 8 | **0** | | 0 | 0 |
| prose caveats | 4 | **3** | | 1 | **0** |
| markup | 397 kB | **176 kB** | | 372 kB | 376 kB |

The front page is **56% smaller in bytes and 43% fewer table cells**; the 726-district layer was about 60 kB of
that and the duplicated tables and repeated chips the rest. Karnataka's markup is flat because it lost a 30-row
table and gained 21 map labels and a `What changed` module — the reduction there is in *rows a reader has to
read*, not in path data.

On the seat and person pages, all six metric tiles carry a source, so six drawers rendered beside each other
over the same handful of sources plus one for the panel: **seven affordances for one question, now one.**

## Success criteria

| | |
| --- | --- |
| homepage has substantially fewer visible words | 1,229 → **1,037**, and explanatory prose is 3 sentences |
| homepage has substantially fewer UI elements | 4 tables → 1, 325 cells → 185, 397 kB → 176 kB |
| coverage is no longer primary UI | out of the navigation; `/coverage` is linked from every footer |
| development gaps are no longer primary UI | 8 coverage chips → 0; one `partly loaded` marker where true |
| source information is centralized | one `Evidence` drawer per module; nothing else may print a URL or hash |
| derived/measured metadata hidden unless meaningful | 20 chips → 0. `BasisChip` survives on a seat's flags alone |
| state page substantially cleaner | one district table, not two; a result strip; `What changed` |
| lists are visually uniform | one `DataList`/`DataRow` for five modules, so one row height by construction |
| tables used intentionally | one on the front page: the 36-row standings comparison |
| map has progressive detail | states → districts → constituencies; 726 hairlines gone from national zoom |
| selected state border looks polished | a thin edge plus `brightness(1.14)`, never a thick dark outline |
| party colours are consistent | untouched: `fillFor(key)`, one hue per party across every surface |
| search is one field | unchanged, and now the only control in the header |
| navigation is coherent | wordmark + search + breadcrumbs. Two dead nav links removed |
| all pages share the same design system | one stylesheet, enforced by `viz/iei.test.ts` |
| no legacy dashboard, no duplicate design system | `review.css` holds only the classes for judging a merge pair, on the product shell |
| mobile layout is deliberate | 390px: one column, height-driven map, 26px title, 16px search input |
| visual QA passes | 230 captures; five defects found and fixed |
| TypeScript passes | app and registry package |
| production build passes | 9/9 static pages, 94.3 kB first load |
| smoke tests pass | 467 of 468; the one failure is the `searchPersons` ranking case classified since Phase 2.5 |

## What this pass deliberately did not do

* No new route, no new tab, no new dashboard. `Closest contests` is the only module added, and it is paid for
  out of `What to watch` going from nine rows to four.
* No change to the registry, the schema, the ingestion, the geometry or the party-identity system. Phase 3
  froze those, and nothing here was a correctness defect in them. The three repo-layer additions —
  `CloseFight.href`, `topParties()`, `stateShifts()` — compose existing queries and add no table and no column.
* No provenance removed from the **data model**. Every source, hash, licence and retrieval date is exactly
  where it was; what changed is how loudly it is printed.
