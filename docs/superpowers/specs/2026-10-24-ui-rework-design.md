# UI rework: composition first, on the design system the product already has

Date: 2026-10-24. Status: written by the builder, who made the calls marked **(my call)**; review them in the pull request.

## Intent

The architecture refactor made the backend say more and say it more correctly: one definition of a seat result, a voting epoch, a tie, a comparison, a reason a map is not drawn, a reading that is "declared" rather than counted. The pages show little of it, and what they show is composed badly. This work closes that gap. It is not a new look.

## What the screens show (1440 wide, the dev registry with the West Bengal boundaries loaded)

Read from screenshots of the real routes, not from the code.

1. **The map is not the first thing on a map page.** Measured with `ops/probe/shot/measure.sh`: on `/state/wb` the map's top edge is at 484px, under a title, a headline sentence, a section heading, two tab rows and a three-line caveat, so at 1440x900 you see 416px of a 620px-tall map, at 1280x800 only 316px, and on a 390x844 phone 236px of 523px. On `/election/wb-assembly-2021` the top edge is at 350px (550px visible at 1440x900, 450px on the phone).
2. **The list beside the map has no name.** Twelve seats follow the district chooser with no heading and no hint that they are the first twelve in seat order (for an election with no vote counts) or the twelve closest contests (for one with them). The district chooser runs straight into the first seat with no gap.
3. **The vote-against-seat plot is mostly empty and its labels collide.** Four small parties print over each other and the axis at the origin; the axes have no numbers, so the diagonal means nothing to read off.
4. **The competitiveness histogram has no counts.** Bars of unknown height against a scale that says only 0%, 20%, 40%+.
5. **The seat page is four numbers and four table rows.** The registry holds the candidates, the runner-up, the margin and the seat's outline for every election; the page shows the winner and a share.
6. **Metro seats are unreadable.** About ninety seats (Kolkata, Howrah, North and South 24 Parganas) are slivers a few pixels wide at the scale of a state.

## Goals

- On `/state/<id>` and `/election/<id>` the map is in the first viewport at 1440x900 and 1280x800, at a size where seats can be told apart, with the controls and the list beside it. Measured with `measure.sh`, not by eye: at least 520px of the map visible at 1440x900, at least 480px at 1280x800 (its top edge at or above 320px), and on a 390x844 phone the map's top edge at or above 400px. The map is 620px tall at that width because a state is taller than it is wide; it does not need to be wider, it needs to be earlier.
- Every list says what it is and how much of it is shown.
- Every chart with data is legible: no overprinted labels, numbers on the axes, counts where bars are the point.
- The seat page shows what the registry knows about each contest: who stood, who came second, by how much.
- Where the backend is uncertain (declared against counted, verification pending, not loaded), the page says so beside the figure, as it does now.

## Non-goals

- A new identity. Palette, fonts, the monochrome-interface rule, the spacing and type scales, the 2px radius, hairline sections and the contrast test (`viz/iei.test.ts`) stay. **(my call)**: the system is argued for in the first forty lines of `iei.css` and the failures above are failures of composition, not of the system. Replacing it would spend the work on taste and risk the locked contrast.
- Client-side JavaScript. **(my call)**: nothing client-side can be tested in this environment (no server, no hydration in the captures), so none is added. Hover states are CSS, tooltips are SVG `<title>`.
- New dependencies, new routes, changes to the data or to what a figure means.
- The home page: its table is 35 of 36 states "not loaded" on the dev registry, so it cannot be judged here.

## Anti-goals (a failure even if it technically works)

- A page that looks better and says less: hiding "declared", "verification pending" or "not loaded" for polish.
- A layout that is only right at one width. 390 wide is judged with the same weight as 1440.
- Anything the screenshots cannot show being claimed: sticky behaviour, hover, focus order are stated as untested.

## Constraints

- Server-rendered, the existing components, `src/app/iei.css` and its tokens.
- Existing tests assert strings and markup; a changed string changes its test in the same commit.
- Evidence for every visual claim is a screenshot that was opened and described (`ops/probe/shot/shot.mjs`), before and after, at 1440, 1280 and 390.

## Decisions, as made

1. **Map-first composition (my call).** A compact header band (name, result line and the one-sentence context in one block), one control row (year, then mode), then a two-column atlas: the map on the left, large; legend, district chooser and seat list on the right. The no-vote-counts caveat moves into the right column above the list. (Batch 1 reworded it rather than shortening it: 297 characters against 281, because it now says what a row prints in place of a figure it does not have.) On wide screens the map column is `position: sticky`, so the list scrolls past a map that stays in view (untestable here, stated as such).
2. **Every list is headed (my call).** "Closest contests, 12 of 294" or "In seat order, 12 of 294", whichever is true of how the list was ordered (a narrowed list says its narrowing and its order, "Seats in Kolkata, closest first"); the district chooser is separated from it.
3. **Plot labels are placed, not printed where they fall (my call).** Pure placement logic with tests on literal coordinates; parties under 1% of both shares are listed as one labelled group; axes get ticks at round values.
4. **Histogram counts (my call).** The tallest bar's count is printed, a hairline gridline marks half of it, each bar's `<title>` carries its count and range.
5. **Seat page (batch 2).** A locator (the seat's outline in its state, drawn from the geometry the page already can read), the contest per election (winner, runner-up, margin as a bar, turnout), and neighbouring seats.
6. **Metro inset (batch 3).** An inset of the densest district group at 3 to 4 times scale, from the district reframing the selection already supports.

## Batches

1. Composition of `/state` and `/election`, list headings, chart legibility. (This pull request.)
2. The seat page.
3. The metro inset, and whatever the screenshots of batch 1 and 2 show is still wrong.

## What is left to the builder

Exact spacings within the token scale, the wording of headings, which parts of the right column collapse at 1024, how the placement algorithm breaks ties. Each is checked against screenshots at five widths.

## What could not be verified here

Interaction of any kind; sticky positioning; real-browser font rendering (system fonts only); any state other than West Bengal on real data (the dev registry holds nothing else).

## Batch 1 results

Measured at the tip of `ui-composition-1` with `ops/probe/shot/measure.sh`, against the start of the batch (`6274b66`). "Visible" is the part of the 620px map (523px at 390 wide) inside the window.

| Route | 1440x900 visible | 1280x800 visible | 390x844 map top |
|---|---|---|---|
| `/state/wb` | 416 -> 620 | 316 -> 533 | 608 -> 368 |
| `/state/wb?election=wb-assembly-2021` | 486 -> 620 | 386 -> 533 | 479 -> 368 |
| `/state/wb?house=pc` | 429 -> 620 | 329 -> 562 | 594 -> 288 |
| `/election/wb-assembly-2021` | 550 -> 611 | 450 -> 511 | 394 -> 352 |

Every measured goal is met; no route overflows horizontally at any of five widths; the map SVG is byte-identical (288 paths, 41 for the parliamentary view). The goals "every list says what it is" and "legible charts" are met for the seat lists beside the maps and for the two charts. The district chooser, party rows and flip lists carry no count.

Not met, or not tested:

- The phone goal is met with little room: with an eight-election year strip, the map's top edge on `/state` is at about 397px at 390 wide and 439px at 360 wide. Only a four-election state could be measured.
- `position: sticky` on the map column exists in the stylesheet and cannot be tested here. A viewport shorter than about 684px cannot keep the 620px map and its offset in view.
- Hover, focus order and any client behaviour were not tested.
- The no-map pages (Karnataka fixture) are better, but the list is a 776px column with the right 40% of the first screen empty.
- The state page and the election page still order a narrowed list differently (closest first, 60 rows, against seat order, 40 rows). The headings say so; the pages should agree.
- Twelve identical "no runner-up recorded" lines on an election with no vote counts are honest and noisy; a note on the heading would say it once.

## Direction added 2026-10-25: more visualisation, and motion that carries information

The request: the product should feel like an intelligence platform, with more visualisation and a little animation, taking
the look of electionmanager.in as a reference. **That site could not be read from this environment** (the sandbox blocks
the host), so nothing below copies it; the motion and look pass waits for it.

What is decided now, as the builder's calls:

1. **Visualisation first, on the pages that are mostly text.** The seat page is four numbers and a table; its Analysis tab
   has line charts 460px wide in a 1000px column with end labels printed over each other, each followed by a table that
   repeats them. Batch 2 gives the seat page a locator (the seat's outline among its neighbours), a strip of who held the
   seat at each election, and a result bar per election, and makes the Analysis charts the width of their column with
   labels that do not collide. Tables stay, as the exact and accessible form.
2. **Later visualisations, in order of value:** a parliament arc of every seat for a state or election (a standard,
   instantly read picture of a house); a seat-tile cartogram (one equal tile per constituency, placed from the outlines'
   centroids), which also solves the unreadable Kolkata cluster; a flow of seats between parties across two elections.
3. **Motion carries information or does not exist.** CSS only: no client JavaScript, because none can be tested here. Bars
   grow from zero, map seats fade in by party, figures count up with `@property`, an outline draws; each once, on load,
   in under 700ms, with durations and easing declared as tokens beside the spacing scale. Nothing loops except one
   status indicator if the data has a live concept (it does not). Every animation is disabled under
   `prefers-reduced-motion: reduce`, and the end state is the state the screenshots judge. **Motion itself cannot be seen
   in this environment**: only the first and last frames can be checked, and the document says so wherever it claims motion.
4. **The look of the reference** is applied as a separate pass once it can be read; the structure and data work above does
   not depend on it.


## Batch 2 results

Measured at the tip of `ui-seat-1` against its start (`7208512`), in-process pages through `ops/probe/shot/shot.mjs` and
`measure.sh`, on the dev registry (West Bengal, boundaries loaded). Mekliganj is the seat with four elections, Bishnupur
(`wb.ac.154`) the seat whose first three elections declare no winner, Baharampur the Lok Sabha seat with one election.

| Measured | Start | Tip |
|---|---|---|
| Locator beside the header (Mekliganj, 1440x900) | none | 320 x 362 at y=99, wholly inside the fold |
| Held-by strip (Mekliganj, 1440x900 and 1280x800 and 1024x768) | none | y=235, h=107, wholly inside the fold |
| Held-by strip at 390x844 | none | y=249, inside the fold |
| Result bar per election (Mekliganj, 1440) | none | list from y=970; three bars and one sentence (2026 has no counts) |
| Analysis chart width at 1440 / 1024 / 390 | 640 / 640 / 366 | 1008 / 992 / 366 (the column's width) |
| Analysis labels overlapping, Mekliganj at 1440 | 17 pairs (96.6% with 96.4% among them) | 0 of 6 charts' labels, none clipped |
| Horizontal overflow, three seats, five widths | none | none |

The start widths at 1024 and 390 are the ones the S-analysis commit recorded; the rest were measured here. The overlap count is a pairwise test of the rendered `<text>` boxes; the same checker finds the 17 at the start and none at the
tip, so it does detect what it is said to rule out. Tests 1104 -> 1146 with the same 51 environment failures as before
(see the test-baseline note in the architecture review); `tsc`, `registry:typecheck` and `next build` are clean, and the seat
routes ship the same 514 to 516 bytes of page script as every other route.

What decision 5 asked for, and where it stands:

- The seat's outline among its neighbours, linking to each: met (S-locator).
- The contest per election, winner and runner-up and margin: met as a sentence and a bar of each candidate's share of the votes
  polled, where counts are on record. Where only a declared margin is (West Bengal 2026) or nothing is, the row says so and
  draws no bar. The margin is written beside the bar, not drawn as a bar of its own; turnout stays in the table.
- Who held the seat, with where it changed hands: met (S-results).
- Analysis charts the width of their column with labels that touch nothing: met (S-analysis).

Not met, or not tested:

- The seat with ten candidates was seen only on a test fixture; the dev registry holds no contest with more than five.
- The Karnataka fixture (no outlines) the brief named is gone; the no-map case was looked at on a fixture seat in a made-up state.
- Hover (the Analysis lines pick out, the strip's and the bars' titles) and any interaction were not tested.
- On Bishnupur the "changed hands" tile says "never" with three of four elections undeclared; the strip's caption says "no change
  of hands on record". The tile is older than this batch and was left.
- At 390 the election table is 605px wide in a 390px column, as it was before this batch.
- No motion has been added: the "Direction added 2026-10-25" list still has it all to do, and the look of the reference site waits
  until the site can be read.

## Batch 3 results

The request in "Direction added 2026-10-25" that was still open after batch 2: more visualisation, and motion that carries information. Measured
at the tip of `ui-batch-3` against `main` (`abd6cee`), in-process pages through `ops/probe/shot/shot.mjs` and `measure.sh` on the dev registry
(West Bengal, boundaries loaded), and with Chromium's own account of the animations it creates.

| Measured | Before | After |
|---|---|---|
| The house as a parliament arc (`/state/wb`, `/election/*`) | none | 720 wide at 1440, 1280 and 1024, 744 at 768, 366 at 390; 383, 395 and 194 tall |
| How power moved as a flow (West Bengal 2026 against 2021) | a tally and a list of 7 flips | 287 of 294 seats drawn from previous holder to winner; the stage is 260 tall; its ribbons are 1084, 768 and 142 wide at 1440, 1024 and 390 |
| Kolkata's 16 seats, on the 620px-tall map | median 7 px² (2 to 21), against 216 for the state and 2,392 for its largest seat | as tiles, about 708 px² each (a 26.6px square in a 29.5px cell) |
| `/state/wb` map top edge at 1440 and 390 | 267 and 368 | 267 and 368 |
| `/election/wb-assembly-2021` map top edge at 1440 and 390 | 289 and 352 | 289 and 385 |
| `/state/wb` markup, against the 340,000-byte markup ceiling (not the document: Next also sends the tree again as flight data, 2.1 to 2.6 times the markup in a model, not a captured response) | 123,789 bytes | 149,111 as the map, 108,744 as tiles (`/election/wb-assembly-2021`: 122,335 to 148,240) |
| Animations Chromium creates (Mekliganj, `/state/wb`, 2021 election) | 0 | 5, 14 and 25; the longest ends at 640, 660 and 540ms; with reduced motion, 0 on all three |
| Horizontal overflow at 390 and 360, every mode and shape on `/state/wb` and on three elections | Flips overflowed (451 against 390), on `main` too | none |
| Tests | 1146 | 1254; the same 51 environment failures as `main` |

What the direction asked, and where it stands:

- **A parliament arc of every seat for a state or election:** met. One dot per seat in the party's ink, the leader's seats and distance from a
  majority at its centre, a key and a table twin; a wedge links to the party isolation the page already had. A by-election, which decides no
  house, has none. The Lok Sabha narrowed to one state is a delegation, not the house: its panel is named for the state's seats and states no
  majority (a review found it first said "the house… TMC has it" over 42 of 543 seats). Parties run largest first and the caption says that
  means nothing about left, right or alliances.
- **A flow of seats between parties across two elections:** met. Held and moved seats are told apart (fainter and brighter ribbons) and the
  seats it cannot compare are counted in the sentence under it, with the reason, and agree with `findings.ts` on every election in the registry.
- **A seat-tile cartogram:** met as a Map / Tiles control on both pages. Tiles are placed from the outlines' centroids by closest pair first, then
  settled by swaps. A tile and a polygon are the same colour and say the same thing. **How near it keeps a seat to its place depends on the
  state:** no seat moves more than three cells on a uniform cloud, but on West Bengal's real outlines (288 tiles on a 14 by 21 grid, because a
  rectangle holds a state that is not one only by moving seats) the median seat sits 4.4 cells from where its boundary is, the worst 9.9, three in
  four of each seat's two nearest neighbours are its adjacent tile and 11 neighbour pairs end up more than three cells apart. The caption therefore
  says "roughly where the seat is" and "distances are not to scale".
- **Motion that carries information:** met for what is listed below, as CSS only, inside `no-preference`, once, under 700ms, with tokens.
  *Dropped:* the numeral count-up (a figure counting up from 0 can be caught showing a wrong number, and a browser without `@property` would jump
  from 0 to the answer) and a fade of 492 map polygons by party (a stagger index on every polygon, for an effect that cannot be seen here).

What was found on the way: `/state/wb?mode=flips` scrolled sideways on a phone on `main` (the legend's one sentence inherited `nowrap`), which
the batch 1 audit missed because it measured the default mode only; it is fixed and tested. A first guess at the cause was wrong and was
reverted when the browser measurement did not change.

Not met, or not tested:

- **The reference's look** (glow, heavier type, mono stat cards, dossier framing) is not in this batch. The stylesheet's own header says the
  interface is monochrome and has no gradients, glass or shadows, so changing that is a decision for the person who owns the product.
- **The arc sits under the map**, below the 1212px atlas on `/state/wb` (its top edge is at 1422px at 1440): the first screen is still the map. A compact
  arc in the header band was not tried.
- **Interaction on the new pictures** (hover, the pick-out, focus and keyboard on a wedge, a ribbon or a tile), forced-colors and a screen reader
  were not tested; the captures have no pointer, no focus and no accessibility tree.
- **Motion was counted and timed, not watched.** Only a first and a last frame can be judged here, and the screenshots have animation switched off.
- **Other browsers.** Animation was counted in Chromium only; `animation-delay: min()`, `pathLength` on a circle with a non-scaling stroke and
  a custom property in an SVG `fill` were not seen in Firefox or Safari.
- **The national Lok Sabha page against the 340,000-byte budget.** The seed holds West Bengal's 42 of its 543 seats, and a map page's polygon
  paths dominate its size; the arc adds about 13 kB and the flow picture a few. The ceiling is held on West Bengal's pages (`render.test.ts`)
  and not on a 543-seat one.
- **Tab order** through the tiles follows the picture (reading order), but how a screen reader announces 288 links was not tried.
- **A comparison with more than seven parties on a side**, or an arc key with more than eight parties, was seen only on test fixtures; the dev
  registry has none.
- **On a phone** the arc's dots are about 6px across for 294 seats, and `/election` is one row of tabs lower (352 to 385) because the new control has no
  year strip to share a row with.
- **The Task 8 commit message calls the 29.5px cell "a 29px tile":** the tile inside it is 26.6px.
