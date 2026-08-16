# 02 — Design

§8 Component inventory · §9 Dashboard architecture · §10 Design system · §11 Interaction model

---

## §8 Component inventory

96 components across nine layers. The layer number is the dependency direction: a layer may
import from lower-numbered layers only. This is the rule that keeps a component library from
turning into a mesh.

### L1 — Primitives (`@mandate/ui`) · 18

Unstyled-behaviour + token-styled. No domain knowledge whatsoever.

`Surface` (canvas/panel/raised/overlay) · `Stack` · `Grid` · `Cluster` · `Divider` (hairline,
2 weights) · `Text` (role-based: display/title/body/label/data/mono) · `Number` (tabular,
locale-aware Indian grouping — 7,10,930 not 710,930, with a toggle) · `Delta` (signed, sign-first,
coloured by direction not by good/bad) · `Chip` · `Badge` · `Button` (3 variants, no more) ·
`IconButton` · `Input` · `Select` · `Toggle` · `Tooltip` · `Popover` · `VisuallyHidden`

`Number` and `Delta` are primitives, not data components, because 40% of the product's pixels
are numerals and they must be identical everywhere. `Delta` never colours by sentiment: a
turnout drop is not "bad".

### L2 — Data display · 14

`StatTile` (label, value, unit, delta, sparkline slot, citation slot, vintage slot) ·
`StatRow` · `Meter` (single-value against a scale) · `SeatBar` (the stacked alliance bar —
the most-used chart in the product) · `Sparkline` · `MiniMap` · `DataTable` (virtualised,
sortable, column-pinnable, keyboard-navigable, exportable) · `TableCell` variants
(`NumberCell`, `PartyCell`, `PersonCell`, `DeltaCell`, `StatusCell`) · `Pagination` ·
`EmptyState` (states a fact, never "no data available") · `Skeleton` · `Freshness` (relative
time + absolute on hover + source count)

### L3 — Charts (`@mandate/viz`) · 15

Every chart accepts `citations` and refuses to render without them (P2). Every chart exposes
`asTable()`. Every chart ships the hover layer by default.

`BarChart` · `ColumnChart` · `StackedBar` · `LineChart` · `AreaChart` · `Scatter` · `Bubble` ·
`Heatmap` · `Choropleth` · `Sankey` (vote transfer between cycles) · `Treemap` ·
`NetworkGraph` · `SmallMultiples` · `Timeline` · `RangePlot` (forecast intervals)

Shared chart parts: `ChartFrame` (title as a question per P1, subtitle, legend, footnote,
citation trigger, table toggle, export) · `Axis` · `GridLines` · `Crosshair` · `ChartTooltip` ·
`Legend` · `DirectLabel` · `Annotation`

### L4 — Party & person identity · 8

The layer P3 lives in.

`PartySymbol` (the ECI glyph; the primary identity carrier; 5 sizes; always with an accessible
name) · `PartyTag` (symbol + short name + optional colour dot) · `PartyLineageBadge` (marks a
party version so "BJP 1984" is never silently conflated with "BJS 1971") · `PersonAvatar`
(photo where licensed, initials otherwise, never a generic silhouette) · `PersonTag` ·
`AllianceTag` · `OfficeBadge` · `IncumbentMark`

### L5 — Evidence · 9

`CitationTrigger` (the `.` affordance) · `CitationPopover` · `SourceCard` ·
`DocumentViewer` (PDF/image with page anchors, deep-linkable to a rect) · `ClaimCard` ·
`ProvenanceTrail` (ingest run → parser version → extraction → value) · `ConfidenceChip`
(`verified` / `provisional` / `disputed`, always icon + label + colour, never colour alone) ·
`CorrectionNotice` · `VintageLabel` (for census and other dated inputs)

### L6 — Domain widgets · 16

`PhaseLadder` (the signature; three modes per §5) · `InkStrip` (its container) ·
`ContestCard` · `MarginBar` (winner/runner-up with the margin called out) · `RoundTicker` ·
`LeadChangeFeed` · `TurnoutGauge` · `SwingArrow` · `AffidavitDiff` (field-level, two scans
side by side) · `CaseChip` (P5, stage-typed) · `CareerTimeline` · `SeatFlipMatrix` ·
`CoalitionArithmetic` (drag members in and out, watch the majority line) · `NominationFunnel` ·
`ManifestoDiff` · `AnomalyFlag` (states the rule that fired, links to its model card)

### L7 — Map (`@mandate/map`) · 8

`MapCanvas` (MapLibre GL) · `LayerRegistry` · `LayerControl` · `MapLegend` · `MapTooltip` ·
`FeatureInspector` · `MapCompare` (swipe / side-by-side / difference) · `BoundaryEpochSwitch`

### L8 — Shell & navigation · 8

`AppFrame` · `Rail` · `TabBar` · `CommandBar` · `LensTabs` · `SplitPane` · `PanelHeader` ·
`FilterBar` (all filters in one row above the content, never scattered)

### L9 — Compositions (route-level) · 6 archetypes

`EntityBrief` · `EntityAnalysis` · `EntityInvestigation` · `EntityEvidence` · `DirectoryPage` ·
`BoardCanvas`

Six archetypes cover 62 routes because of the Entity × Lens grammar (§4). A new entity type
costs four configurations, not four pages. This is the leverage that makes the roadmap in §28
plausible.

### Component budget rule

**Any component that exists in only one place is deleted and inlined.** The library grows by
promotion from real usage, never by anticipation. A `components/` directory with 300 entries and
40 of them used once is the standard failure of design systems at this scale, and the lint rule
that prevents it (`no-single-use-export` over `packages/ui`) costs 20 lines.

---

## §9 Dashboard architecture

### The central idea: a card is a query

Every card in the product is a declared object, not bespoke JSX. This is what makes
user-composable boards possible without building a second product.

```ts
type Card = {
  id: string
  title: TitleFn              // P1: computed from the result, interrogative or declarative
  question: string            // the plain-language job of this card, shown in edit mode
  query: QueryRef             // a named semantic-layer query + bound parameters (§13)
  form: FormSpec              // chart type + encodings, chosen by the form heuristic
  size: 1 | 2 | 3 | 4         // column span in the 4-col panel grid
  lens: Lens                  // which floor it belongs to
  refresh: 'static' | 'poll' | 'stream'
  gate?: ComplianceGate       // §6.10 — suppressed during poll periods
  emptyBehaviour: 'collapse' | 'state-fact'
}
```

Consequences that fall out for free:

1. **Boards** — a user-saved dashboard is an array of `Card`s. No new rendering path.
2. **Server-side gating** — the compliance layer filters cards in the API response, so a stale
   client cannot render a suppressed forecast.
3. **Provenance** — the citation set is a property of the query result, so every card is cited
   without any card author remembering to do it.
4. **Testability** — a card's correctness is a query test plus a snapshot, not a browser test.
5. **The AI layer emits cards.** "Show me turnout by district in Bihar" resolves to a `Card`,
   which the user can pin. The AI is a card compiler, not a chat window (§14).

### The four-floor model, made literal

```
FLOOR 1 · BRIEF          the verdict         1 sentence + 4–6 tiles + 1 hero chart + flags
   ↓ scroll or press 2
FLOOR 2 · ANALYSIS       the explanation     6–12 cross-filtered cards, measure picker
   ↓ press 3
FLOOR 3 · INVESTIGATION  the record          full tables, unbounded rows, per-booth, per-round
   ↓ press 4
FLOOR 4 · EVIDENCE       the proof           documents, ingest log, corrections
```

Rules that make the ladder work:

- **Floor 1 is server-rendered and requires no client JavaScript.** It is the shareable,
  crawlable, fast surface. Priya's 3-minute target (§3) depends on this.
- **Floor 1 never has more than 12 elements.** Enforced in review. The temptation to add
  a thirteenth is the temptation that turns this into a government website.
- **Floor 2 owns cross-filtering.** Selecting a district in one card filters every card. The
  filter state is in the URL.
- **Floor 3 has no charts.** It is the record. Charts belong on Floor 2. This separation is what
  keeps Floor 3 honest and Floor 2 legible.
- **Floor 4 is reachable from any number on any floor** via `.`, so the ladder is a shortcut,
  not a staircase you must climb.

### Panel grid

12-column grid inside each pane, but cards declare span in a **4-unit** vocabulary (¼, ½, ¾,
full) so a board cannot produce a 7-column card. Row height is a 4 px base multiple; cards
declare `rows` in units of 40 px. Gutter 12 px, panel padding 16 px, and no card is ever
shorter than 3 rows (120 px) — sub-120 px cards read as noise.

Split panes divide horizontally only. Vertical splits at 1280 px produce columns too narrow for
tabular data, which is what this product mostly is.

### Density modes

Three, user-selectable, persisted, affecting row height and type scale only — never information
quantity:

| Mode | Table row | Base type | For |
|---|---|---|---|
| Comfortable | 40 px | 14 px | default; presentations |
| Compact | 32 px | 13 px | Priya, Anand — most-used |
| Dense | 26 px | 12 px | Rohit scanning 4,120 rows |

Density does not hide columns. Hiding columns to look tidier is how a dense product becomes a
useless one.

### Loading and freshness

- **Never a full-page spinner.** Floor 1 renders from the server complete; Floors 2–4 stream in
  card by card with skeletons matched to the eventual chart geometry.
- **Every card carries a `Freshness` stamp.** Relative on the face, absolute plus source count
  on hover. During live counting the stamp is a live element, not a static one.
- **Stale is a visible state.** A card whose data failed to refresh dims its value and states
  the age. It does not silently show old numbers, and it does not disappear. Silent staleness on
  counting day is how a platform like this dies.

---

## §10 Design system

Colour is §24, typography is §25. This section is everything else, plus the rules.

### Design thesis

**Indelible ink on a counting-hall ledger.** The surfaces are the near-black of a hall at
night with a violet cast, not the neutral charcoal of every developer tool; the accent is the
violet-black of election ink on a finger, the one universally recognised mark of Indian
democracy; the data type is a monospaced ledger face; and the identity system is symbols,
because that is what an Indian ballot is. Every choice in §24 and §25 derives from that
sentence, and the deliberate risk is the ink-stain fill on the phase ladder — a shape borrowed
from a physical stain, used exactly once.

### Tokens

Named by role, never by value. A component that references `#8B6DE8` instead of
`--ink-500` fails lint.

**Space** — 4 px base: `space-0` 0 · `1` 4 · `2` 8 · `3` 12 · `4` 16 · `5` 24 · `6` 32 ·
`7` 48 · `8` 64. Nothing else exists. Every gap in the product is one of nine values.

**Radii** — `radius-none` 0 · `radius-sm` 3 px · `radius-md` 6 px · `radius-full`.
Data marks use 4 px on the data end only (see the mark spec in §24). Panels use 6 px. Nothing
in this product is more rounded than 6 px, because roundness reads as consumer software and
this is an instrument.

**Borders** — `hairline` 1 px at `--line-subtle` · `line` 1 px at `--line` · `emphasis` 2 px.
Panels are separated by hairlines, not shadows.

**Elevation** — four surfaces, no shadows in dark mode. Depth is expressed by surface
lightness and hairlines:

| Token | Dark | Light | Use |
|---|---|---|---|
| `surface-canvas` | `#0C0A11` | `#FAF9FB` | app background |
| `surface-panel` | `#13111B` | `#FFFFFF` | cards, charts (the validator surface) |
| `surface-raised` | `#1B1825` | `#FFFFFF` + hairline | hovered rows, popovers |
| `surface-overlay` | `#221E2E` | `#FFFFFF` + shadow-sm | command bar, tooltips |

Light mode gets exactly one shadow token (`shadow-sm`, for overlays). Dark mode gets none —
shadows on dark surfaces are mud.

### Iconography

- **One icon set, 1.5 px stroke, 16/20/24 px only.** `lucide-react` is already a dependency and
  covers the UI needs; do not add a second set.
- **Party symbols are not icons.** They are licensed data assets in a separate pipeline, served
  as an SVG sprite, versioned with the party (a party's symbol can change), and always paired
  with an accessible name.
- **No emoji anywhere.** Not in flags, not in status, not in the feed.
- **Status is icon + label + colour, always all three** — the validator run in §24 shows why
  colour alone cannot carry three status tiers.

### Writing rules (part of the design system, not a style guide appendix)

- **Titles are the answer** (P1). Computed, interrogative or declarative, sentence case.
- **Active voice, and the label matches the outcome.** The button says "Export CSV"; the toast
  says "Exported". "Save board" produces "Board saved".
- **Numbers get their unit and their basis.** Not "8.1" — "+8.1 pp swing to AITC vs 2019".
  Percentage *points* and percent are never both written "%".
- **Empty states state a fact and offer the next move.** Not "No data available." Instead:
  "Booth-wise results are not published for assembly elections before 2011. The earliest
  available for this seat is 2011." Then a link to it.
- **Errors say what happened and what to do, in the interface's voice.** No apologies, no
  "oops", no personality. "Counting feed disconnected 40 seconds ago. Retrying. Last figures
  shown are from 17:42 IST."
- **We never characterise a person.** We report a delta and cite it. "Declared assets rose from
  ₹1.2 cr (2014) to ₹9.8 cr (2019)" — never "assets ballooned".
- **Never "criminal".** "Cases pending", or "convicted" with a court order cited (P5).
- **Twelve languages means no idioms and no wordplay.** Every string is written to survive
  translation into Bengali and Tamil without a translator's note.

### Component API conventions

- Props are data, not styles. No `className` escape hatch on L2–L7 components; if a variant is
  needed it becomes a named variant.
- Every data component takes `citations: Citation[]` and `freshness: Freshness`.
- Every interactive component takes `label` and is keyboard-operable with no mouse path.
- Server components by default; `'use client'` only where interaction demands it. Floor 1 has
  zero client components.

---

## §11 Interaction model

### The three input modes, ranked

1. **Keyboard** — the primary mode for the paying user. Every action reachable without a mouse.
2. **Pointer** — hover reveals, click drills, drag ranges.
3. **Touch** — Reader only (§26). The terminal is not touch-optimised, deliberately (P8).

### Keyboard map

| Key | Action |
|---|---|
| `⌘K` | Command bar |
| `1`–`4` | Lens: Brief / Analysis / Investigation / Evidence |
| `.` | **Show evidence for the focused number.** The product's signature gesture. |
| `⌘1`–`⌘8` | Workspace tab |
| `⌘W` / `⌘⇧T` | Close / reopen tab |
| `⌘\` | Split pane · `⌘⇧L` link panes |
| `⌥1`–`⌥8` | Rail destination · `⌥\` expand rail |
| `/` | Focus the current view's filter |
| `j` / `k` | Next / previous row in a table or card in a feed |
| `⏎` | Open focused row as entity · `⌘⏎` open in new tab · `⇧⏎` open in split |
| `x` | Select row (multi-select for compare) · `c` compare selected |
| `t` | Toggle chart ↔ table on the focused chart |
| `⌥⇧E` | Export focused card (CSV / PNG / SVG / embed) |
| `p` | Pin focused card to a board |
| `g` `g` | Go to top · `⌘⇧D` density cycle · `⌘⇧K` shortcut sheet |
| `?` | Shortcut sheet |
| `Esc` | Close overlay, then clear selection, then clear filter — in that order |

`.` is the gesture the product is remembered for. Any focused figure — a stat tile, a bar, a
table cell, a map feature — opens its provenance trail. It is the physical embodiment of P2 and
it costs one keystroke.

### Hover contract

Charts are interactive by default, not on request.

- **Line and area** — a crosshair snapped to the nearest x, with a tooltip listing every series
  at that x, sorted by value, with the hovered series emphasised.
- **Bar, column, dot, cell** — per-mark tooltip; hit target extends to the full band, not just
  the drawn mark.
- **Map** — hover reveals the feature card immediately: winner with symbol, vote share, margin,
  turnout, and a 4-point historical sparkline. This is the interaction the map exists for
  (§15), so it is never gated behind a click.
- **Table rows** — hover raises the row to `surface-raised` and reveals row actions at the right
  edge. Never a tooltip on a table row; the row is already the information.
- Tooltips appear after 120 ms, dismiss immediately, follow the pointer on continuous marks and
  anchor on discrete ones, and never obscure the mark they describe.

### Selection and cross-filtering

- **Click a mark to filter, click again to unfilter.** All active filters appear as removable
  chips in the `FilterBar` at the top of the pane — never hidden state.
- **Brush on a continuous axis to range-filter.**
- **Filters are per-pane and shared across cards in the pane.** Linked panes share filters.
- **Filter state is in the URL.** Always. This is how analysts share findings.
- **Colour never repaints on filter.** An entity's colour is bound to the entity, not to its
  rank in the current result set. Filtering to three parties must not recolour them (§24).

### Comparison

Comparison is a mode, not a page. Select 2–4 entities of the same type anywhere (`x`), press
`c`, and get an aligned side-by-side with a shared measure set. Cap at 4, hard: past four
columns, comparison becomes a table, and past three colour slots the palette cannot keep the
series distinguishable (§24). The cap is computed, not aesthetic.

### Live behaviour

- Streaming values animate their digits, never their layout. Numbers occupy tabular width from
  first paint so nothing reflows as a count grows (§22).
- **A lead change is an event, not a re-render.** It flashes the affected row once, appends to
  the `LeadChangeFeed`, and is never announced with sound.
- **"What changed while you were away"** — return to a tab after 60 s and a dismissible bar
  states the delta: "12 seats declared, 3 lead changes since 17:42."

### States every interactive element must define

Default · hover · focus-visible (**non-outline** — see §27) · active/pressed · selected ·
loading · disabled-with-reason (a disabled control always states why on hover) · error.

Eight states, declared in the component, reviewed in Storybook. A component that ships without
`disabled-with-reason` gets sent back — a disabled thing that will not say why is the most
common small cruelty in dense software.
