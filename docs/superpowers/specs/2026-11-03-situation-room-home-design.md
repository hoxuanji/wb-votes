# The situation-room home: an overview, what comes next, how the country got here, and a live mode

Date: 2026-11-03. Status: written by the builder from the owner's brief; the calls marked **(my call)** are the builder's and are listed again at the end for the owner to check.

## Intent

The owner's words, 2026-11-02 and 2026-11-03: the current look "is not suited for an analytical/intelligence platform"; the front page "showing only West Bengal as overview" is a doubt; "when someone opens this they should get an overview and a highlight of the current landscape as well as the upcoming elections which are going to decide the fate of the country"; it should "help them get an overview of the idea how the political landscape has changed over the years"; and "when an election will be live, we will use the same home page to give them the detailed idea about the upcoming election and poll the live events, who is expected to win based on sources and all". Animations are wanted.

Why the page failed, measured by walking it as a user (`.data/ux-audit-20261102/`): it is a 6,500px editorial scroll, and below one map every one of seven sections is one state's story; each tab and filter is a link that reloads the page; nothing highlights across a chart and the map; the first sentence says the registry holds "1 of India's 36 states". The gap is structure and interaction more than colour.

## What the front page does, in the order a visitor needs it

1. **Now.** One computed sentence about the country and four figures (states with a result, seats held, parties governing, elections due), counted up once on arrival. If an election is live, this band becomes the live board (below).
2. **The landscape.** The India map coloured by who leads each state's assembly, a party tally beside it, and a card that follows the pointer. It is a navigation surface: a click goes to the state.
3. **Next up.** The elections that come next, soonest first, each with how much of its five-year term has run. A date the Commission announced is shown as announced; a date inferred from the last election is shown as inferred and says so, as today.
4. **How we got here.** A time machine: a year scrubber and a play button that re-colour the map and re-count the tally for any year the registry can speak to, with a ribbon of how many states each party led over time. A state with no election on record by that year is hollow, not a colour.
5. **Just decided, the closest contests, who holds what.** The reference layer, kept short.

Every state's own story, which the front page used to carry, belongs on that state's page and is one click from the map.

## The live mode

When an election is running the same page changes in place: a status line in the top bar, the Now band becomes a board (seats declared of total, the majority line, each party's won and leading, as of the feed's own timestamp), a table of **projections that other people published, each with its publisher, date, method and link**, and a feed of events. It reads a feed file (`MANDATE_LIVE_PATH`) so the page works the day a feed exists; the page polls a small read-only endpoint every 20 seconds and updates the board without a reload.

**What it will not do (anti-goals, because the registry's rule is "nothing here is a prediction"):** it does not run a model of its own, does not print a probability the registry computed, and does not show a projection without its publisher. "Who is expected to win based on sources" is satisfied by showing the sources' own numbers side by side with the count, attributed. **(my call: the owner asked for "expected to win based on sources" and has not said whether the registry may forecast; this keeps the stated rule and the owner can widen it.)**

## Look and feel

A situation room, not a magazine. A slim top bar with the search, a live indicator and the data's as-of date; a narrow left rail on a laptop (Home, States, Elections, Parties, People, Coverage) that becomes a row under the top bar on a phone; flat panels with one-pixel lines, a four-pixel radius, tabular numerals for every figure, mono for data and labels only, and party colour as the only saturated hue. The signature is the time machine and the next-up rail's term bars. **(my call: keep the dark theme and the system fonts; the product's rule of no webfont stays, so personality comes from structure, scale and numerals.)**

**Motion, and the one architecture change it needs.** The product ships one client component (the command key) by design. Scrubbing, play, hover cards, count-ups and the live poll need small client components; each renders its final state on the server and enhances it, so the page is complete without script. Everything else is CSS: staggered entrance, bar growth, map recolour transitions. All of it stops under `prefers-reduced-motion`. **(my call, needs the owner's eye: this ends "no client JavaScript but the command key"; the owner approved animations on 2026-11-02.)**

## Goals

- At 1440x900 the first screen shows the sentence, the figures, and the map with its tally; the next-up rail and the time machine begin below it. At 390x844 the same, stacked, with no sideways scroll.
- The page's data is the registry's, for however many states it holds: no list of states in the page, and it reads sensibly with 1 state and with 30.
- The time machine answers for any year in the registry's range, and says plainly where it cannot.
- With a feed present the page shows the live board; with none, no live element appears at all.

## Non-goals

- Loading more states. The registry here holds West Bengal; loading others is a data job (the Lokdhaba import), not a design one. The page is built and checked against a **synthetic multi-state registry used for visual checks only** (generated under `.data/`, never committed, labelled synthetic wherever it is shown).
- The live ingestion worker. This work defines and reads the feed; it does not fetch results from any site.
- Restructuring the state, seat, person and Analysis pages. They inherit the new shell and tokens; reworking each into a workspace is the next phase.

## Anti-goals (a failure even if it technically works)

- A page that looks full only because of invented numbers, or a time machine that colours a state it has no election for.
- A forecast with no publisher, or a date inferred from a term printed as announced.
- Animation that carries no information, that plays for a reduced-motion reader, or that the page needs in order to be read.

## Constraints

- Server-rendered pages read the registry per request; the registry's schema and migrations are not touched. No import from `src/` into `packages/`; body-name logic stays in `packages/` (`election-kind.guard.test.ts`).
- `iei.test.ts` fixes seven type sizes, bans raw pixel values off the scale and fixes the radius token; token changes come with the test change and a reason.
- Every sentence the page builds is audited for pronouns, "never", "only", "first time", and for every number being in its inputs (the finding audit); new sentences join it.
- `npm test` keeps exactly the 51 known failing names (`.github/test-baseline.txt`).

## Phases

1. **Foundation and home** (this work): tokens, shell with rail and status bar, the new home, the time machine, the live board and feed, the demo registry, tests, real-browser checks.
2. **Workspace pages**: state, election, seat, person, Analysis restructured around the same panels, with shared filters that do not reload the page.
3. **Live operations**: the feed's producer, a writable store beside the read-only registry, and the source-attributed projections' acquisition.

## What is left to the builder

Icon drawing, easing curves and exact durations (within the existing `--iei-t-*` tokens), the card's copy, the order of the three reference panels, and the demo registry's shape.

## The builder's calls, for the owner to check

1. Projections are third-party numbers shown with their publishers; the registry does not forecast.
2. Dark theme and system fonts stay; the new look is structural (rail, status bar, flat panels, tabular numerals).
3. Small client components are introduced, each progressive.
4. The front page stops carrying one state's seven-section story; it moves to the state page, one click from the map.
5. The live feed is a file the page reads and polls, so no part of the live mode needs a server beyond the app itself.
6. A synthetic multi-state registry exists for visual checks only.
