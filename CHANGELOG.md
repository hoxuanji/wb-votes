# Changelog

## 1.0.0

The first tagged release. The product is **India Election Intelligence**: a registry of Indian elections in which every figure carries the source it
came from, how it was derived, and what is missing. The package is still named `wb-votes`, for the project's first scope.

### What it is

- A Next.js 14 application over a single SQLite registry (`node:sqlite`), served from one Fly machine behind Cloudflare. See `DEPLOYMENT.md`
  and `docs/release/RUNBOOK-1.0.md`.
- Front page, state, district, seat and its analysis, election, person, candidates, search and coverage pages; a `/v1` JSON surface; a merge-review
  queue that records decisions only on a local checkout (`MANDATE_REVIEW_WRITES=1`).

### New look and behaviour

- **A new visual language ("The Adaptive Workbench", see `DESIGN.md`).** One sans voice with tabular numerals and fluid type, sentence-case labels,
  two corner radii, one indigo accent that never colours data, and no kicker labels above headings (a quiet descriptor line sits under the title).
- **Light and dark themes.** The interface follows the system's colour scheme and has a theme button (System, Light, Dark) in the top bar; the choice
  is kept in `localStorage` and applied before first paint, so there is no flash of the wrong theme. Every token is declared once as
  `light-dark(light, dark)` and `iei.test.ts` holds every contrast floor on both themes.
- **Party and chart colours follow the theme.** Each party keeps its hue and its rank in lightness; in the light theme every party fill clears 3:1
  on every light surface (minimum 3.06:1, measured over 460 party keys) and text on a fill clears 4.5:1.
- **Adaptive navigation.** A rail of three places (Overview, People, Data) that becomes a fixed bottom tab bar on phones; the search field is always
  in the top bar (⌘K / Ctrl+K). Tabs are a segmented control; standalone links and controls meet a 24px minimum target (44px on touch).
- **Motion that carries state.** Pages cross-fade while the top bar and rail stay put (cross-document view transitions, where the browser supports
  them), a page's first sections fade up once, data marks that carry a quantity grow once. Everything sits inside `prefers-reduced-motion:
  no-preference`. Escape closes an open evidence drawer.

### Less, but better

Measured on the seed registry (West Bengal), before and after:

- **Front page:** 985 → about 550 words, 144 → about 60 links, 3 evidence drawers → 1, page height 3,510px → about 2,070px at 1280 wide. Layers the
  registry cannot fill are no longer tabs: they are named once, with their reason. The 35 not-loaded states are listed once, not three times. Sections
  that cannot answer their question with the data held (history map, closest contests, party landscape) appear only when they can.
- **Seat page:** 344 → 64 links; the winner and margin are stated once; the flagged and absence panels are one "What the record does not say". The
  analysis page went from 2,808 to about 1,300 words; every chart's table is a closed twin under it.
- **State page:** sections that said the same thing about what changed are one section; the full seat list is "Show all N seats" instead of 294 links.
- **District page:** a caveat that applied to every row (16 repeats) is said once above the table.
- **Candidates:** "no contest on record" was printed 193 times; it is said once, and the "Stood in" column lists only contests that exist.
- **Coverage:** the duplicate 18-row table and the builder-facing text are gone; each subject area's status, rows and the one source it needs remain.

### New insight, from data the registry already held

- The front page's inspector shows each state's assembly seat change against the previous election ("BJP 192 of 294 · majority, +116 on 2021") and how
  many seats changed hands ("139 of 287; 7 left out because one of the two elections declared no winner there"), by the same comparison the state page uses.
- Search has a real empty state (five example searches taken from the registry), groups results by kind with counts, and a party filter accepts the
  short label it displays (`?party=TMC`) and says so in words when a filter matches nothing.

### Fixed

- **A figure disagreed between pages:** `/candidates` counted BJP as 193 winners while the front page, state page and election page said 192. It now counts
  a win only from the result row, like every other page, says once in words that one candidacy is named as elected without a result row, and a regression
  test cross-checks the two pages for three elections.
- Person names appeared in three casings across pages; they now all go through one helper.
- The front page's year legend showed fractional years ("2026.0–2026.2"); it now shows whole years.

### Known limits

- **One of 36 states is loaded** (West Bengal). Loading more is a Lokdhaba import job and the largest gap in the product.
- **Data the schema has but the registry does not fill, so nothing is shown (not invented):** turnout by gender, postal votes, NOTA, the EVM/postal
  split of a result, legal cases, alliances. 11 of 37 tables are empty; `/coverage` states it.
- No live-results feed: `MANDATE_LIVE_PATH` has no producer in this repository, so `/v1/live` answers 404 until one exists.
- No two-seat compare page: it was removed on purpose (`docs/product/removed-features.md`); the comparison that exists is a seat against its own predecessor.
- English only; no accounts; no paid tier.
- Seat history shows the winner and margin per election; the runner-up and share live in each election's candidate list.
- Checked in a WebKit browser and headless Chromium only. Safari proper, Firefox, real phones and screen readers have not been tried. Keyboard focus
  rings are held by a stylesheet test but were not seen in a browser; reduced-motion behaviour is held by a test and was not measured in a browser.
- In the light theme the three categorical chart hues sit closer to some party colours than on dark: the palette chooses separation under colour-vision
  deficiency over distance from party fills, because a search found no set that does both (the note is in `viz/palette.ts`). Party marks carry their code
  beside the colour, so colour is never the only channel.
- `npm test` fails 51 tests on the seed registry; they need the full registry. CI compares the failing names with `.github/test-baseline.txt`.

### Before deploying

The production registry must be migrated to the current schema first (migrations 018 and 019; 019 rewrites claims in place and cannot be undone).
Migrate a copy. See section 2 of `docs/release/RUNBOOK-1.0.md`.
