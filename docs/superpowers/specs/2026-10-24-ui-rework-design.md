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
