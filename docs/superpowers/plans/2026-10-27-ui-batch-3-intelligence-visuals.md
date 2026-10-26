# UI batch 3: intelligence visuals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The state, election and seat pages gain the pictures an intelligence product is read by: a parliament arc of the house, a seat-flow picture of how power moved, a seat-tile map that un-crowds the dense districts, and motion that carries information.

**Architecture:** Each picture is a pure function over data the pages already hold (`ElectionMapView.seats`, `legend`, `majority`, each seat's `flip`, outlines in `place_geometry`), tested on literal data, then a server-rendered SVG/HTML component with a table twin, then one stylesheet section. Motion is CSS only, declared as tokens next to the spacing scale and switched on only under `prefers-reduced-motion: no-preference`.

**Tech Stack:** TypeScript run natively by Node 26, `node --test`, Next.js 14 server components, `src/app/iei.css`. No new dependencies, no client JavaScript.

**Spec:** `docs/superpowers/specs/2026-10-24-ui-rework-design.md` ("Direction added 2026-10-25", items 2 and 3; decision 6's Kolkata cluster is solved by the tiles, not by an inset).

## Global Constraints

- The interface is monochrome and only data is coloured; only parties get hues, by `fillFor(partyKey)` (the party's KEY, never its short name). `iei.test.ts` locks the contrast; no colour token changes.
- Every length is a spacing token (4, 8, 12, 16, 24, 32, 48); radius is `--iei-r` (2px); marks are thin, segments and tiles are separated by a 2px surface gap, never a stroke.
- No new dependency; no client JavaScript; one stylesheet; the product's single client component stays `CommandKey`.
- Every picture has a table twin (a native `<details>` holding a `<table>`), prints party codes beside every swatch (colour is never the only channel), and says in words what it leaves out. Nothing is drawn that is not on record.
- Motion: CSS only, once, on load, no longer than 700ms, durations and easing are tokens, declared inside `@media (prefers-reduced-motion: no-preference)`; the end state is the element's own style.
- A page stays under the render test's budget: `html.length < 340_000` (`render.test.ts`).
- Tests: `node --test`; the suite has 51 known environment failures on the seed registry (same names as `main`); judge by failing names, not counts. Page tests render in a child process on a literal fixture (model: `map-composition.test.ts`).
- Commit style: first line is a sentence stating the outcome, no type prefix; author `Claude Code <noreply@anthropic.com>`.

## Review Focus

- A by-election or any partial house has no majority: no arc, and no sentence that implies one (Task 3, 4).
- Seats with no declared winner must neither vanish from the arc nor be coloured as a party: counts still add up to the house (Task 3, 4).
- A house of 1 to 5 seats (a union territory) and one of 543 must both lay out with no `NaN`, overlap or dot outside the frame (Task 2).
- A seat whose boundary was redrawn, or whose winner is undeclared at either election, must not enter a flow, and the picture must say how many seats it left out (Task 5, 6).
- Two seats with the same centroid, or a seat with no outline, must still get distinct tiles, or be named as not tiled; never silently dropped (Task 7, 8).

## Calls made (the builder's, for the user to check)

- **Order:** motion contract, then the arc (the picture most often wanted), then the flow, then the tiles, then motion applied to all of them.
- **The arc is ordered by seats, largest first, and says so.** The registry holds no left/right or alliance data; an order that looked political would be invented. Its wedges link to the party isolation the page already has.
- **No numeral count-up.** A figure that animates up from 0 can be caught or screenshotted showing a wrong number, and a browser without `@property` would jump from 0 to the answer. In a product whose point is that absences are legible, a flashing wrong figure is worse than no motion. The design document listed it; this plan drops it.
- **No per-seat fade on the 492-polygon map.** It would put a stagger index on every polygon for an effect that cannot be seen here. The arc's wedges carry the "fade in by party" idea instead.
- **Tiles exist only where outlines do.** Placing a seat with no outline would be inventing its geography.
- **The reference look is not in this plan** (glow, heavier type, mono stat cards, dossier framing). The stylesheet's own header says "no gradients, no glass, no shadows" and the interface is monochrome by rule; changing that is the user's decision, not a builder's.

---

### Task 1: The motion contract

**Files:**
- Modify: `src/app/iei.css` (tokens beside the spacing scale in `:root`)
- Modify: `ops/probe/shot/shot.mjs` (captures freeze animation, so a screenshot judges the end state)
- Create: `packages/mandate/src/viz/motion.test.ts`

**Interfaces:**
- Produces: tokens `--iei-t-1: 160ms`, `--iei-t-2: 360ms`, `--iei-t-3: 640ms`, `--iei-ease: cubic-bezier(0.2, 0.7, 0.2, 1)`; the rule every later animation follows (below).

- [ ] **Step 1: Write `motion.test.ts`** (parses `iei.css`, as `iei.test.ts` does). Tests: "every duration an animation uses is a motion token of at most 700ms"; "every @keyframes names only a starting state, so the end of an animation is the element's own style"; "every animation is declared inside prefers-reduced-motion: no-preference"; "the reduced-motion block still switches animation and transition off". Run it: the token test fails (no tokens yet); the others pass vacuously, which the next step makes real.
- [ ] **Step 2: Add the four tokens** under the space scale with a comment saying why motion has a ceiling (information, not decoration).
- [ ] **Step 3: In `shot.mjs`, inject `.iei *{animation:none!important;transition:none!important}`** into the document it captures, with a comment (a capture taken mid-animation would judge a frame nobody keeps). Run `node ops/probe/shot/shot.mjs mo /state "" wb`; open one PNG.
- [ ] **Step 4: Run `node --test packages/mandate/src/viz/motion.test.ts`; all pass. Commit.**

### Task 2: The arc layout

**Files:**
- Create: `packages/mandate/src/viz/arc-layout.ts`, `packages/mandate/src/viz/arc-layout.test.ts`

**Interfaces:**
- Produces: `export const ARC_BOX: { w: 640; h: 340 }`; `export type ArcDot = { x: number; y: number; r: number; row: number }`; `export function arcLayout(total: number): ArcDot[]`, dots ordered by angle from the left end, the outer row first when angles tie, so a party's seats are a contiguous slice.

- [ ] **Step 1: Write the failing tests**: "returns exactly total dots for 0, 1, 2, 5, 40, 294 and 543"; "every dot, with its radius, is inside ARC_BOX"; "no two dots overlap (centre distance at least 2r) at 294 and 543"; "order is non-decreasing in angle from the left end"; "two calls are equal"; "r at 543 is at least 3.2 and one dot at total 1 has no NaN". Run: fail (module missing).
- [ ] **Step 2: Implement `arcLayout`**: concentric semicircle rows from an inner radius of 0.35 of the outer; seats per row proportional to the row's radius; row count and `r` chosen so rows are `2r + 2` apart; sort by angle. Run: pass.
- [ ] **Step 3: Commit.**

### Task 3: The house, as parties

**Files:**
- Create: `packages/mandate/src/repo/house-arc.ts`, `packages/mandate/src/repo/house-arc.test.ts`

**Interfaces:**
- Produces: `export type ArcParty = { key: string; label: string; n: number }`; `export type HouseArc = { total: number; parties: ArcParty[]; undeclared: number; majority: number; leader: ArcParty | null; shortBy: number | null }`; `export function houseArc(seats: readonly { partyKey: string | null; partyLabel: string | null }[], majority: number | null): HouseArc | null`.

- [ ] **Step 1: Write the failing tests** on literal seats: "a by-election (majority null) has no arc"; "no seats has no arc"; "parties are ordered by seats, then by key, so ties are stable"; "a seat with no declared winner is counted as undeclared and is in no party"; "parties plus undeclared add up to total"; "shortBy is the majority minus the leader's seats, and null once the leader has one"; "a party is labelled by its label, keyed by its key". Run: fail.
- [ ] **Step 2: Implement `houseArc`.** Run: pass. Commit.

### Task 4: The seat arc on the state and election pages

**Files:**
- Create: `src/components/iei/SeatArc.tsx`, `packages/mandate/src/repo/house-arc-page.test.ts`
- Modify: `src/app/election/[id]/page.tsx` and `src/app/_place/state.tsx` (a `Panel id="house" title="The house" question="Who holds the house, and how far is it from a majority?"` directly after the atlas, before Competitiveness / What changed), `src/app/iei.css` (a section "the house, as an arc"), `GLOSSARY.md` (Seat arc; use the domain-modeling skill)

**Interfaces:**
- Consumes: `arcLayout`, `ARC_BOX`, `houseArc`, `fillFor`, `NOT_HELD`, `selection.href({ party })` / `selection.href('release')` (as `VoteSeatPlot` is given).
- Produces: `export function SeatArc(props: { arc: HouseArc; selected: string | null; hrefFor: (partyKey: string | null) => string }): JSX.Element`.

- [ ] **Step 1: Write the failing page tests** (fixture with a full house of 7 seats over 3 parties plus one undeclared; a second election that is a by-election): "the arc has one dot per seat of the house"; "each party's group holds exactly its seats, largest first"; "each party's link is the page's own isolation link for that party"; "undeclared seats are dots in the no-data ink and are not links"; "a by-election has no arc and the word majority is not on the panel"; "the table twin lists every party and an undeclared row, and its seats add up to the house"; "with a party isolated, every other party's group is marked dimmed"; "the caption says the order is by seats and says nothing about alliances"; "the page stays under 340,000 bytes". Run: fail.
- [ ] **Step 2: Implement `SeatArc`.** One `<svg role="img" aria-label>` in `ARC_BOX`; one `<g class="iei-arc-p" style="--i:N">` per party inside an `<a>` with a `<title>` ("TMC · 215 of 294 seats"); centre text is the leader's seats over the total and "majority 148" or "short by 12"; a key of the first eight parties (swatch, code, seats) as links, the rest folded as "k smaller parties, m seats"; the `<details>` table twin. Wire `houseArc(view.seats, view.majority)` into both pages (the whole house, not the narrowed list). Run: pass.
- [ ] **Step 3: CSS** in a new section using tokens only; the dimmed rule keys on `data-dim`. Add the glossary entry. Run the whole suite, `npx tsc --noEmit`, `npm run registry:typecheck`.
- [ ] **Step 4: Look.** `node ops/probe/shot/shot.mjs arc-state /state "" wb`, `arc-election /election/wb-assembly-2021`, and a Lok Sabha election; open the 1440 and 390 documents; measure with `measure.sh` that the arc is inside the column and nothing overflows at five widths. Commit.

### Task 5: Seat flows

**Files:**
- Create: `packages/mandate/src/repo/seat-flows.ts`, `packages/mandate/src/repo/seat-flows.test.ts`

**Interfaces:**
- Produces: `export type Flow = { from: string; to: string; n: number }`; `export type SeatFlows = { parties: { key: string; label: string }[]; flows: Flow[]; compared: number; held: number; flipped: number; left: { incomparable: number; undeclared: number } }`; `export function seatFlows(seats: readonly { partyKey: string | null; partyLabel: string | null; comparable: boolean; flip: { from: { key: string; label: string } } | null }[]): SeatFlows`.

- [ ] **Step 1: Write the failing tests**: "a seat enters a flow from its previous holder to its winner"; "held plus flipped is compared"; "a redrawn seat (not comparable) is counted as incomparable and enters no flow"; "a comparable seat with an undeclared winner at either election is counted as undeclared"; "compared plus both left counts is the number of seats"; "flows are ordered by seats, then from, then to". Run: fail.
- [ ] **Step 2: Implement `seatFlows`.** Run: pass. Commit.

### Task 6: The seat-flow picture in "How power moved"

**Files:**
- Create: `src/components/iei/SeatFlow.tsx`, `packages/mandate/src/repo/seat-flows-page.test.ts`
- Modify: `src/app/election/[id]/page.tsx` and `src/app/_place/state.tsx` (inside the existing flips panel, above the tally), `src/app/iei.css`, `GLOSSARY.md` (Seat flow)

**Interfaces:**
- Consumes: `seatFlows`, `fillFor`, `placeLabels` (`viz/plot-labels.ts`), the hatch of `.iei-res-others`.
- Produces: `export function SeatFlow(props: { flows: SeatFlows; previousYear: number; year: number }): JSX.Element`.

- [ ] **Step 1: Write the failing page tests**: "two columns of parties, the previous holders left and the winners right, each as tall as its seats"; "a ribbon's width is its seats and its ink is the winning party's"; "past six parties on a side the tail is Others (n) in the hatch, and says so"; "the sentence says how many seats were left out and why, and never says all seats"; "the table twin lists every non-zero flow and sums to the compared seats". Run: fail.
- [ ] **Step 2: Implement `SeatFlow`**: two stacked columns separated by a 2px gap, ribbons as cubic Béziers between them, labels placed by `placeLabels`, party code with every swatch, table twin in a `<details>`. Run: pass.
- [ ] **Step 3: Run the suite and both type checks; take the look** (`/election/wb-assembly-2021`, `/state` with a comparison, a page with no comparison, which shows no picture); measure; commit.

### Task 7: Centroids and the tile layout

**Files:**
- Create: `packages/mandate/src/viz/seat-tiles.ts`, `packages/mandate/src/viz/seat-tiles.test.ts`

**Interfaces:**
- Consumes: `parse` from `viz/simplify.ts` (absolute M/L/Z only; `unsupported` means refuse).
- Produces: `export function centroidOf(path: string): [number, number] | null` (area-weighted centroid of the largest subpath; null when unsupported or empty); `export type TileSeat = { id: string; x: number; y: number }`; `export type Tile = { id: string; col: number; row: number }`; `export function tileLayout(seats: readonly TileSeat[]): { tiles: Tile[]; cols: number; rows: number }`.

- [ ] **Step 1: Write the failing tests**: "the centroid of a unit square, an L shape and a two-ring path is the known point"; "an unsupported or empty path has no centroid"; "every seat gets its own cell"; "the grid is compact: cells are at least n and at most 1.6 n"; "a 3 by 3 lattice of centroids lays out as that lattice"; "ten seats at one point and ten spread seats all get distinct cells"; "the layout does not depend on input order"; "no seat moves more than 3 cells from where a uniform seeded cloud put it". Run: fail.
- [ ] **Step 2: Implement.** Pitch from the extent and `n`; seats processed densest-neighbourhood first, each to the nearest free cell, ties broken by id. Run: pass. Commit.

### Task 8: The tiles view of the map

**Files:**
- Create: `src/components/iei/SeatTiles.tsx`, `src/components/iei/seat-fill.ts`, `packages/mandate/src/repo/seat-tiles-page.test.ts`
- Modify: `packages/mandate/src/repo/map-selection.ts` (a `shape` of `"map" | "tiles"`, default `"map"`, read from `?shape=`, carried by `selection.href` exactly as `mode` is), `src/components/iei/ElectionMap.tsx` (use `seatFill`; a Map / Tiles control in the control row, printed only where the map is drawn), `src/app/iei.css`, `GLOSSARY.md` (Seat tile)

**Interfaces:**
- Produces: `export function seatFill(seat: ElectionSeat, mode: MapMode): string` (the fill `ElectionMap` computes today for winners, flips, margin and runner-up, moved unchanged); `export function SeatTiles(props: { view: ElectionMapView; selection: MapSelection }): JSX.Element`.

- [ ] **Step 1: Write the failing tests**: "seatFill for each mode equals the fill the rendered map gives the same seat" (render the map for the fixture and compare); "the shape defaults to map and every link on the page carries a chosen shape"; "tiles view: one link per seat that has an outline, each to its seat page, filled as the map fills it"; "a seat with no outline is not tiled and the caption names how many"; "a seat outside the isolation or district is drawn in the no-data ink, as on the map"; "no Map / Tiles control is printed where the map is not drawn". Run: fail.
- [ ] **Step 2: Extract `seatFill`; run the existing map tests (they must stay green); implement `shape` in `map-selection.ts`; implement `SeatTiles`** (a rect per tile with 2px gaps, a `<title>` per seat as the map has, no per-tile text). Run: pass.
- [ ] **Step 3: Run the suite and type checks; take the look** at `/state/wb` in both shapes, and measure that the tiles view keeps the map's top edge. Commit.

### Task 9: Motion that carries information

**Files:**
- Modify: `src/app/iei.css` (a section "motion", inside `@media (prefers-reduced-motion: no-preference)`), `src/components/iei/SeatLocator.tsx` (`pathLength="1"` on the seat's ring), `packages/mandate/src/viz/motion.test.ts`

**Interfaces:**
- Consumes: Task 1's tokens and contract; the classes `iei-res-bar`, `iei-arc-p` (with `--i`), the margin histogram's bars, the party rows' bars, the locator's seat ring.

- [ ] **Step 1: Extend `motion.test.ts`** with: "every animation named in the motion section has a keyframes rule"; "stagger delays are clamped so that the longest finish is under 700ms". Run: fail.
- [ ] **Step 2: Write the animations**, each `animation: <name> var(--iei-t-2) var(--iei-ease) backwards`: bars wipe in from the left (`clip-path`), histogram bars rise (`transform: scaleY` from the baseline), arc groups fade by party in order (`animation-delay: min(calc(var(--i) * 60ms), 300ms)`), the locator's ring draws. Keyframes name only `from`. Run: pass.
- [ ] **Step 3: Prove it in a browser**: inject a script into a saved page, as `measure.sh` does, printing `document.getAnimations()` count and each duration; expect more than zero and none over 700ms; run again with `--force-prefers-reduced-motion` and expect zero. Say plainly that only the first and last frames can be judged here. Commit.

### Task 10: Verify, record and ship

**Files:**
- Modify: `docs/superpowers/specs/2026-10-24-ui-rework-design.md` (a "Batch 3 results" section), `roadmap.md` only if it names these pictures

- [ ] **Step 1:** `node --test "packages/mandate/src/**/*.test.ts"` (failing names against `main`'s 51), `npx tsc --noEmit`, `npm run registry:typecheck`, `npx next build`; read each output.
- [ ] **Step 2:** For `/state/wb`, an election page, a Lok Sabha election, a by-election and a seat page: `shot.mjs`, `measure.sh` at five widths (no overflow), open the 1440 and 390 documents and say what is seen.
- [ ] **Step 3:** Write "Batch 3 results" with measured numbers and what was not met or tested; commit; push `ui-batch-3`; open the pull request in the shape of #8.
