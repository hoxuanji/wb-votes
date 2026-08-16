# Phase 2.5 — visual QA

What was rendered, in what, at what sizes, what it found, and — because this matters more than the list of
fixes — what these images do **not** prove.

## The harness

`ops/probe/shot/shot.mjs`. It renders a route through `ops/probe/render`, wraps the markup in the document
the root layout produces, inlines `src/app/iei.css`, writes it to `.data/shots/`, and screenshots it with
real Chromium at five widths.

`listen()` is refused in this sandbox — with the sandbox off as well, so it is an OS policy and not a
setting — which means there is no `next dev`, no `next start`, and nothing to point a browser at over HTTP.
What is permitted is a browser reading a file, so these are `file://` documents. The layout, the type
metrics, the wrapping, the overflow, the contrast and the grid are all genuinely computed by a browser
engine.

**Two captures per width**, because one cannot serve both purposes. `chrome-headless-shell` ignores
`--screenshot-full-page`, so a whole document needs a tall window — and a tall window changes what `vh`
means, which the phone layout uses deliberately (the map is `max-height: 52vh` there, so that something
after it is visible without scrolling). So `-fold` is the real viewport, where hierarchy and vh-dependent
sizing are judged, and `-doc` is the same **width** in a 3,600px window, where rhythm and alignment down the
page are judged. Media queries key on width, so the layout in `-doc` is the layout.

### What these images do not prove

Stated plainly, because a screenshot invites more confidence than it earns:

* **No HTTP.** Anything that depends on a request — caching headers, streaming, `next/image` — is absent.
* **No hydration.** The product ships one client component (`CommandKey`, which binds ⌘K and paints
  nothing), so this costs the screenshots nothing here. It would cost a great deal in an app with client UI.
* **No `position: sticky` behaviour.** The header has nothing to stick to in a static capture.
* **No interaction.** Hover, focus, `:focus-visible`, an open `<details>` and a scrolled region are all
  unexercised. Those are covered instead by `viz/iei.test.ts`, which parses the stylesheet and asserts that
  every rule removing an outline replaces it, that `forced-colors` restores real outlines, and that no status
  is carried by colour alone.
* **One browser.** Chromium. No Safari, no Firefox, no real device.

## Surfaces and sizes

Every surface the product has, at 1440×900, 1280×800, 1024×768, 768×1024 and 390×844:

| surface | route |
| --- | --- |
| India | `/` — and every one of the six map layers |
| Coverage | `/coverage`, and `/coverage?election=…` |
| Search | `/search?q=ram`, and the empty state |
| State | `/pl/ka`, `/pl/wb`, `/pl/up`, `/pl/as`, `/pl/jk` |
| District | `/pl/wb/cooch-behar` |
| Seat | `/pl/wb/cooch-behar/mekliganj` |
| Analysis | `/pl/wb/cooch-behar/mekliganj/analysis` |
| Person | `/p/…`, including a 194-contest record |

## Pass 1 — structure

Six defects, and the first one is why this phase insisted on a real browser.

1. **`IndiaMap` returned a fragment into a two-column grid.** A fragment creates no box, so the grid saw
   three items instead of one: the map took column 1, the tile row took column 2, and the legend and the
   36-row companion table wrapped to a third cell underneath the map. **The entire right-hand half of the
   front page was empty, at every width.** No markup assertion could see it — every element was present, in
   order, with the right classes.
2. **`.iei-rule` was inline.** Every cell using it as a second line ran the two together: "West
   BengalAssembly 2026", "BJP192 of 294", "INC135 of 224". Four tables and the coverage ledger.
3. **Vote shares printed as raw floats** — "50.0220697882493251% in 2014 to 17.009326330450175% in 2019".
   Sixteen decimal places is not precision, it is the absence of a decision about precision.
4. **The party landscape's "Assemblies" column held two numbers per cell** — "11 5 with a majority" — in a
   right-aligned tabular column whose whole purpose is that figures line up.
5. **`Metrics` took a column count**, so a five-tile row in a six-column grid painted the hairline colour
   into the empty cell: a solid grey block sitting in the row like a broken tile.
6. **A pre-formatted absence rendered as a literal em dash at 19px**, on every place and person page,
   wherever a source published no margin.

## Pass 2 — spacing and alignment

7. **Numeric headers were left-aligned over right-aligned figures.** `.iei-t th` sets `text-align: left`
   and outspecifies a bare `.iei-n` — a class plus a type beats a class — so "ASSEMBLY SEATS" started 58px
   left of where "1,450" ended. Phase H's rule was intended, not true.
8. **"150 of 175" in one right-aligned cell** aligns the denominators and leaves the figures ragged: 150,
   41, 60, 75, 156 stepping left and right down the column.
9. **The section question sat 1,000px from its title.** `.iei-h` was `space-between` with the question in
   the right-hand group, so on a 1,340px page "Which party leads each assembly now?" was nowhere near the
   words ASSEMBLY CONTROL.
10. **36 resting underlines** under the state names in the map's companion table — in a column that is
    entirely links, an underline is a stripe pattern rather than an affordance.
11. **Two side-by-side panels drew two bottom rules** thirty pixels apart, because each owned its own.
12. **The "House" column in Next said "Assembly" in all eight rows.**

## Pass 3 — polish

13. **The map split stacked at 1080**, so a 1024×768 laptop got a full-width map: 330px of chrome above it
    and a 553px map below, and the whole first screen was one polygon. It stacks at 900 now; at 1024 the two
    columns are 503px and 457px.
14. **`viz/palette.ts` was a second palette**, and named its surfaces after `mandate.css`'s `--panel` and
    `--muted` — which this phase deleted. Every chart on an Analysis floor was drawing itself on a `#13111B`
    card the page no longer painted. Its three series hues were a separate set, so BJP was a muted orange on
    the national map and a saturated blue on a seat's chart.
15. **Chart type was scaled up.** The SVG has a 640-unit viewBox and no width, so `width: 100%` stretched it
    to the container and took its 11px axis labels with it — 17.9px at the reading measure, which made a
    chart legend louder than the section heading above it.
16. **A "Coverage" column of seventeen identical "how much is loaded" links** on a state page.
17. **The coverage ledger printed "COMPLETE" beside "Has data"** — the same state in two vocabularies.
18. **53 alias spellings rendered in the eyebrow**, above the person's own name, on one record.
19. **A 194-contest career grew a 4,500px document out of one table.**
20. **`min-width` on a table cell is ignored by Chrome.** The coverage ledger's subject column was squeezed
    to about 55px at 390px, wrapping "Who won this seat, by how much, and how has it behaved across cycles?"
    over eight lines. Setting 12ch on the row header and 26ch on the prose columns changed nothing at all;
    the floor has to be on the table, and then the region scrolls.
21. **A year row header was right-aligned**, so the first column of the elections table on a state page
    started 77px right of the first column of the districts table above it.
22. **A conditional "by-election" sub-line** made those rows taller than their neighbours, so a table of 17
    elections rippled.

## Responsive behaviour, and what it costs

* **1440 / 1280** — two-column map split, two-column panel rows, all seven party-landscape columns.
* **1024** — the map split survives (503px + 457px). The panel rows stack.
* **768** — the split stacks; the map is capped at 52vh so the legend and the first table rows stay above the
  fold.
* **390** — the header stacks to three rows with the command bar full width and the section links scrolling
  sideways rather than wrapping to three lines. The metric grid is one column. iOS gets 16px in the search
  field only where a touch keyboard exists, because Safari zooms the page on a smaller one and a sticky
  header then jumps sideways on the first tap.

**Two deliberate costs, named rather than hidden.** The sparkline column is dropped below 640px — it is the
only column in the product whose value is also printed as a number beside it, so it is the only one that can
go without losing a fact. And a genuinely wide data table scrolls sideways inside its named, focusable
region rather than dropping columns; no figure is lost, and the gesture is the standard one, but a reader has
to discover it. Hiding a column that carried a figure would be worse.

## Not fixed, and why

* **`—` inside a chart's table.** The Analysis floor's tables come from `viz/charts.ts` as pre-formatted
  strings, and an absent swing renders as an em dash. The product's rule is that an absence is words — but
  the caveat directly above each of those charts already says "a party absent from the earlier election has
  no swing, not a swing of −100", which is the explanation, adjacent. Converting those strings would mean
  changing every table `charts.ts` builds.
* **Twelve election chips on a phone** take about eight rows above the coverage panel they filter. Shorter
  labels would drop the jurisdiction, which is the one thing that distinguishes one chip from the next.
* **`/review/merges` was reviewed at 1440 only.** It is an internal queue, linked from nothing, with a
  mutating POST.

## The question the phase ends on

> *If I removed another 10% of the visible interface, would the product become worse?*

**Yes — and this is the element-by-element answer rather than a shrug**, because a "no" here is only
credible if every remaining thing has been asked to justify itself by name.

The front page has four sections, one dateline, one sentence, four prose caveats and one footer. Going
through them:

| element | what it would cost to remove |
| --- | --- |
| The dateline's six counts | The page's only statement of its own scope. It already replaced a six-tile strip. |
| The computed headline | The answer to "what is happening". Nothing else on the page is a sentence. |
| Map + layer strip + legend | The primary visual and the primary navigation. |
| The 36-row companion table | The exact answer the map can only approximate, and the only route to the eight jurisdictions too small to click — which is what the tile row under it exists for. |
| Next, with its derived caveat | "No date on this list was announced by anyone" is the anti-fabrication statement. Without it the table reads as a schedule. |
| The overdue note | The difference between "eight elections are coming" and "our data stops here". |
| Just decided | "What just happened", and the only place coverage per election is surfaced at all. |
| Party landscape | "Where does each party hold power". Its caveat prevents a misreading of the largest number on the page: 1,450 assembly seats summed across elections spanning 2014–2026. |
| The Share column | A different fact from seats, and the one place `<0.1%` appears — the demonstration that a small share is not zero. |
| The Trend sparklines | The only longitudinal view on the page; `vs 2019` is one step, the trend is five. |
| Watch, with its disclaimer | Eight signals found eight different ways, and the product's position on prediction. |
| The footer | What the product is, and the link to what it does not hold. |

**One thing did fall out of asking.** The footer said "Nothing is modelled, predicted or filled in", and the
Watch section says "Nothing here is a prediction. No model, no forecast, no probability" one screen above it,
where it is load-bearing. The footer's copy is cut.

And one defect fell out of looking again rather than of measuring: the link treatment covered the dateline
and the footer and nothing else, so a link inside a section note, a caveat, a table caption, a data row's
detail or the line under an answer fell through to the browser default — blue and underlined, on a page whose
one stated rule is that hue is spent on data alone. Six contexts, now named in the stylesheet and asserted by
`viz/iei.test.ts`.

The measured position, from the rendered markup: **44% fewer sections, 43% fewer tables, 53% fewer rows, 55%
fewer table cells, 64% fewer prose caveats, 52% fewer visible words, and no metric tiles at all.** The
brief's target was 30–50%.
