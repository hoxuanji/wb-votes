# 05 — Craft

§22 Microinteractions · §23 Motion · §24 Colour · §25 Typography · §26 Responsive · §27 Accessibility

---

## §22 Microinteractions

Twelve, and they are the whole feel of the product. Each has a stated job; anything without a
job is deleted.

**1 — The ink-stain fill (the signature).** When a phase completes on the `PhaseLadder`, the
block fills with ink-violet using an irregular organic mask that spreads from the left edge over
900 ms, like ink wicking into paper. Runs once per phase, per session, ever. This is the one
piece of ornament in the system, it is drawn from the most recognisable physical artefact of
Indian democracy, and its scarcity is what makes it land.

**2 — Round tick.** When a counting round lands, the affected numbers roll their digits (each
digit column animating independently, 220 ms, staggered 20 ms left-to-right) inside a fixed
tabular width. Layout never moves. A number that reflows as it grows is unreadable at speed.

**3 — Lead-change flash.** The row's background lifts to `--ink-flash` (a 12% ink wash) and
decays over 700 ms. Once. No sound, ever — a product that beeps on counting day gets muted, and
a muted product loses its live channel.

**4 — Citation reveal.** `.` or click on the citation mark: the popover scales from 0.96 with the
source title already rendered (no loading state for metadata — it ships with the number).
Document thumbnails stream in after. The gesture must feel free or people stop using it, and if
people stop using it the product has no thesis.

**5 — Crosshair snap.** The chart crosshair snaps to data x-positions rather than tracking the
pointer continuously, with a 60 ms ease. Snapping tells you the data is discrete, which it is.

**6 — Filter chip commit.** Clicking a mark to filter: the mark holds a 2px ink ring, a chip
flies to the `FilterBar` over 180 ms along a slight arc, and the other cards' bars re-tween to
their new values over 240 ms with staggered starts by column. The flight is what makes the
causal link legible — the user sees *why* the other cards changed.

**7 — Table row focus.** `j`/`k` moves a 2px ink bar down the left gutter and lifts the row to
`surface-raised`. No outline (§27). Row actions fade in at the right edge after 80 ms.

**8 — Tab drag.** Workspace tabs reorder with the dragged tab lifted 2px and neighbours sliding
with spring physics. Tabs are the analyst's workspace; making them feel physical makes the
workspace feel owned.

**9 — Map feature hover.** Feature outline goes to 1.5px ink at full opacity, the feature card
appears at the pointer after 60 ms, and the matching row in a linked table pane highlights
simultaneously. The simultaneity is the whole point of linked panes.

**10 — Split-pane link.** Pressing `⌘⇧L` draws a 1px ink line briefly connecting the two pane
headers, then leaves a small link glyph in both. State changes need a moment of visible cause.

**11 — Copy confirm.** Copying a figure swaps the copy glyph for a check for 1.2 s and the toast
says "Copied with citation" — because it *is* copied with the citation appended, which is a
product decision expressed as a microinteraction.

**12 — Disabled reason.** Hovering a disabled control reveals why, after 200 ms, in a tooltip
with no delay on dismiss. A disabled thing that will not explain itself is the most common small
cruelty in dense software.

### Deliberately absent

No page-transition animations (they tax every navigation to flatter the first one). No hover
lift on cards (32 cards breathing is nausea). No parallax. No skeleton shimmer — skeletons are
static blocks; shimmer is a moving element that carries no information. No confetti, no sound,
no scroll-jacking.

---

## §23 Motion system

### Tokens

| Token | Duration | Easing | Used for |
|---|---|---|---|
| `motion-instant` | 0 ms | — | filter application, tab switch, lens switch |
| `motion-fast` | 120 ms | `cubic-bezier(.2,0,.4,1)` | hover, focus, chip, tooltip |
| `motion-base` | 200 ms | `cubic-bezier(.2,0,.2,1)` | popover, panel, row lift |
| `motion-slow` | 320 ms | `cubic-bezier(.3,0,.2,1)` | chart re-tween, pane resize |
| `motion-data` | 220 ms | `cubic-bezier(.4,0,.2,1)` | digit roll, bar grow |
| `motion-signature` | 900 ms | custom ink spread | phase fill, once per phase |
| `motion-spring` | — | spring(220, 26) | tab drag, pane divider |

Seven tokens. A component using a raw duration fails lint.

### Rules

1. **Navigation is instant.** Lens switches, tab switches, and filter applications have zero
   transition. The user's mental model is "I am already there"; an animation contradicts it. This
   is the most important motion decision in the document and the one most often got wrong.
2. **Data moves; chrome does not.** Bars tween, digits roll, map fills. Panels appear.
3. **Motion encodes causation.** The filter chip flies because it explains why five other cards
   changed. Motion with no causal content is deleted.
4. **Nothing loops.** The only continuous motion in the product is the ink strip's live pulse
   during counting, and it is a 2 s opacity breathe on a 4px band — not a spinner.
5. **Stagger, never simultaneity, for sets.** Bars enter staggered 15 ms by index, capped at 8
   items (past 8 the stagger reads as lag, so items 9+ share the last delay).
6. **One signature moment.** The ink fill. Adding a second dilutes the first.

### Reduced motion

`prefers-reduced-motion: reduce` is respected properly, not by disabling everything:

- Durations collapse to 0 for movement and scale.
- **Opacity cross-fades are retained at 120 ms** — instant swaps are disorienting, and the
  vestibular concern is movement, not fade.
- Digit rolls become instant value swaps.
- The ink fill becomes an instant fill.
- The counting pulse stops entirely.
- **Nothing becomes unreachable or unnoticeable.** The lead-change flash becomes a persistent
  2px left border on the row for 5 s instead of a decaying wash, so the information survives
  even though the animation does not.

---

## §24 Colour system

### The palette is computed, not chosen

Every categorical value below was validated with the palette checker, on this product's own
surfaces. The runs are reproducible; the commands are in §24.6. **Party brand colours were
tested first and rejected on measurement, not taste:**

```
$ validate_palette.js "#FF9933,#19AAED,#00A550,#DA291C,#0072B1,#22409A,#FFD200,#E4181C" \
    --mode dark --surface "#13111B"

[FAIL] Lightness band       #FF9933 L .774 · #FFD200 L .877 · #22409A L .407 — outside .48–.67
[WARN] CVD separation       #DA291C ↔ #00A550  ΔE 6.3 deutan   (CPI-M red vs TMC green)
[FAIL] Normal-vision floor  #22409A ↔ #0072B1  ΔE 13.7         (BSP navy vs AAP blue)
[WARN] Contrast vs surface  #22409A  2.02:1
```

Two parties' official colours are indistinguishable to a reader with normal colour vision, and
another pair is indistinguishable under deuteranopia. This is the measurement behind principle
P3: **party identity is carried by the ECI symbol glyph and short name; colour reinforces.**

### 24.1 Surfaces

Ink-tinted neutrals — a violet cast rather than pure grey, so the product reads as ink on paper
rather than as a code editor.

| Role | Dark | Light |
|---|---|---|
| `surface-canvas` | `#0C0A11` | `#FAF9FB` |
| `surface-panel` | `#13111B` | `#FFFFFF` |
| `surface-raised` | `#1B1825` | `#FFFFFF` + hairline |
| `surface-overlay` | `#221E2E` | `#FFFFFF` + `shadow-sm` |
| `line-subtle` | `#201C2B` | `#EDEBF1` |
| `line` | `#2A2536` | `#E0DDE6` |

`#13111B` is the surface every validator run below is measured against, because that is where
chart marks actually sit.

### 24.2 Text (measured WCAG ratios)

| Role | Dark | vs canvas | vs panel | Light | vs canvas |
|---|---|---|---|---|---|
| `text-primary` | `#F2F0F7` | 17.41 | 16.54 | `#14121C` | 17.66 |
| `text-secondary` | `#A7A2B8` | 7.97 | 7.57 | `#55506B` | 7.29 |
| `text-muted` | `#6E687F` | 3.70 | 3.51 | `#7C7691` | 4.12 |

`text-muted` clears 3:1 but not 4.5:1, so it is restricted to ≥ 16 px or ≥ 14 px semibold (large
text), and never used for a value — only for labels, units, and metadata. Values always use
`text-primary`.

### 24.3 Ink — the accent

| Token | Hex | vs canvas | vs panel | Use |
|---|---|---|---|---|
| `ink-400` | `#A98BF2` | 7.18 | 6.82 | links, active nav label, focus text |
| `ink-500` | `#8B6DE8` | 5.11 | 4.85 | primary interactive, selection, focus bar |
| `ink-600` | `#6D4FCC` | 3.41 | 3.24 | fills, borders, the phase-ladder stain |
| `ink-flash` | `#8B6DE8` @ 12% | — | — | lead-change wash |

Light mode: `ink-600` `#6D4FCC` (5.50:1 on canvas) for interactive, `ink-700` `#563BA8`
(7.73:1) for text on white.

**Ink is never a data colour.** It means "the system" — interactive, selected, focused, current.
A user must never have to ask whether violet is a party or a state.

### 24.4 Categorical — the data palette

Eight slots. Adopted from the validated reference theme rather than re-derived, then re-run
against this product's surfaces. Assignment to parties is **fixed per party in the registry**,
so colour follows the entity and never repaints on filter.

| Slot | Hue | Dark | Light | Typical binding |
|---|---|---|---|---|
| 1 | blue | `#3987e5` | `#2a78d6` | INC |
| 2 | orange | `#d95926` | `#eb6834` | BJP |
| 3 | aqua | `#199e70` | `#1baf7a` | AITC |
| 4 | yellow | `#c98500` | `#eda100` | TDP / JD(U) |
| 5 | magenta | `#d55181` | `#e87ba4` | BSP |
| 6 | green | `#008300` | `#008300` | regional green |
| 7 | violet | `#9085e9` | `#4a3aa7` | AAP |
| 8 | red | `#e66767` | `#e34948` | CPI(M) / SP |

**Adjacent-pair gate, dark, surface `#13111B` — all eight slots pass:**

```
[PASS] Lightness band       all 8 inside L 0.48–0.67
[PASS] Chroma floor         all 8 ≥ 0.10
[PASS] CVD separation       worst adjacent #c98500↔#199e70  ΔE 8.4 protan
[PASS] Normal-vision floor  worst adjacent #d55181↔#c98500  ΔE 19.3
[PASS] Contrast vs surface  all 8 ≥ 3:1
```

**Adjacent-pair gate, light, surface `#FAF9FB` — passes with a relief obligation:**

```
[PASS] CVD separation       worst adjacent #eda100↔#1baf7a  ΔE 9.1 protan
[PASS] Normal-vision floor  worst adjacent #e87ba4↔#eda100  ΔE 19.6
[WARN] Contrast vs surface  #1baf7a 2.68 · #eda100 2.06 · #e87ba4 2.57 — below 3:1
```

The light-mode WARN is not dismissable: those three slots ship with **visible direct labels or
the table view**, which the `ChartFrame` enforces by refusing to render them label-free.

### 24.5 The three-hue cap (the constraint that shapes the map)

Sorted stacks, sorted bars, and lines have a *known* adjacency, so the adjacent gate applies and
all eight slots are legal. **Choropleths, scatter, bubble, and small multiples are all-pairs
problems** — any two marks can end up side by side — and there the palette does not survive past
three:

```
3 slots, all pairs, dark:  PASS   worst CVD ΔE 9.4 deutan · worst normal-vision ΔE 20.9
4 slots, all pairs, dark:  FAIL   #9085e9 ↔ #3987e5  ΔE 1.9 protan · 9.8 normal-vision
4 slots, all pairs, light: PASS   worst CVD ΔE 9.2 · normal-vision 16.3
```

Dark is the default mode, so **the product-wide cap for all-pairs forms is three hues.** Past
three: fold to "Other" with a 45°/135° **texture fill**, facet into small multiples, or switch to
sequential + symbol labels. This is why the winning-party map in §15 renders at most three hues,
and why the comparison cap in §11 is four columns rather than eight.

### 24.6 Sequential, ordinal, diverging, status

**Sequential** (continuous magnitude — turnout, electors, assets): one hue, blue, light→dark.
The `100` step may recede toward the surface because "near zero" should.

```
100 #cde2fb · 150 #b7d3f6 · 200 #9ec5f4 · 250 #86b6ef · 300 #6da7ec · 350 #5598e7
400 #3987e5 · 450 #2a78d6 · 500 #256abf · 550 #1c5cab · 600 #184f95 · 650 #104281 · 700 #0d366b
```

**Ordinal** (discrete ordered — competitiveness class, election lifecycle stage): 4 steps with
enforced lightness gaps, both validated.

```
dark  #cde2fb → #86b6ef → #3987e5 → #184f95    PASS (ΔL ≥ .06, light end 2.31:1)
light #86b6ef → #3987e5 → #256abf → #0d366b    PASS (ΔL ≥ .06, light end 2.01:1)
```

**Diverging** (polarity — swing to/from incumbent, margin change): **blue ↔ red** with a neutral
grey midpoint (`#383835` dark, `#f0efec` light), equal steps per arm. Never a hue at the
midpoint; zero swing must read as *nothing*, not as green.

**Status** — three tiers, and they are **not** a categorical palette:

| Tier | Dark | Light | Meaning here |
|---|---|---|---|
| `verified` | `#199e70` | `#1baf7a` | primary-source confirmed |
| `provisional` | `#c98500` | `#eda100` | live or unconfirmed figure |
| `disputed` | `#e66767` | `#e34948` | contested or under correction |

Run all-pairs as chart marks, these tiers **fail** (`#e66767 ↔ #c98500` normal-vision ΔE 13.0;
`#d55181 ↔ #199e70` ΔE 1.6 deutan on the magenta variant). That failure is designed around rather
than ignored: **status is a chip primitive — icon + label + colour, all three, always** — and when
evidence grade must appear as a chart mark it is encoded with **texture or shape, never hue.**
Status colours are reserved and never reused as a ninth series.

### 24.7 Mark specs

Thin marks; 4px rounded radius on the **data end only**, anchored square to the baseline (a
rounded baseline detaches the bar from its zero and misreads magnitude); 2px lines; ≥8px markers;
a 2px surface-coloured gap between adjacent fills and stacked segments; a 2px surface ring on
overlapping marks; grid lines at `line-subtle` and never over the marks; axes recessive in
`text-muted`; direct labels on the first, last, and extreme values only — never a number on
every point.

**Text never wears a series colour.** Values, labels, and legend text stay in the text tokens; a
coloured swatch beside them carries the identity. Coloured numerals at 12px are the fastest way
to fail a contrast audit and the most common chart mistake in dashboards of this density.

### 24.8 Reproducing every claim in this section

```bash
V=~/.claude/plugins/.../dataviz/scripts/validate_palette.js

# party brand colours — expected to FAIL (P3's evidence)
node $V "#FF9933,#19AAED,#00A550,#DA291C,#0072B1,#22409A,#FFD200,#E4181C" --mode dark --surface "#13111B"
# categorical, adjacent
node $V "#3987e5,#d95926,#199e70,#c98500,#d55181,#008300,#9085e9,#e66767" --mode dark  --surface "#13111B"
node $V "#2a78d6,#eb6834,#1baf7a,#eda100,#e87ba4,#008300,#4a3aa7,#e34948" --mode light --surface "#FAF9FB"
# the three-hue cap
node $V "#3987e5,#d95926,#199e70"                   --mode dark --surface "#13111B" --pairs all   # PASS
node $V "#3987e5,#d95926,#199e70,#9085e9"           --mode dark --surface "#13111B" --pairs all   # FAIL
# ordinal ramps
node $V "#cde2fb,#86b6ef,#3987e5,#184f95" --mode dark  --surface "#13111B" --ordinal
node $V "#86b6ef,#3987e5,#256abf,#0d366b" --mode light --surface "#FAF9FB" --ordinal
```

This runs in CI on every change to `packages/ui/tokens/colour.ts`. A palette change that fails a
gate fails the build. **The colour system is a test, not a document.**

---

## §25 Typography

### The pairing

The binding constraint is not aesthetic. This product must set political names and place names
in **Devanagari, Bengali, Tamil, Telugu, Kannada, Malayalam, Gujarati, Odia, Gurmukhi, Assamese,
Urdu, and Latin** — often in the same table row — with matching weights and matching optical
sizes. Almost no display pairing survives that.

**UI and display: the Anek superfamily** (Anek Latin, Anek Devanagari, Anek Bangla, Anek Tamil,
Anek Telugu, Anek Kannada, Anek Malayalam, Anek Gujarati, Anek Odia, Anek Gurmukhi). A variable
superfamily designed for exactly this problem: one skeleton, one weight axis, one width axis
across all ten scripts. The width axis is the reason it wins twice — a dense table can set
labels at 87.5% width and gain three characters per column without switching to a second
condensed family. Display sizes use the heavy weight at tight tracking; this is a face with a
point of view, and it is not on anyone's list of default choices.

**Data and evidence: IBM Plex Mono.** Every numeral, every code, every Form 20 excerpt, every
document quotation. Chosen because it is engineered for data legibility at small sizes, has a
real Devanagari companion (IBM Plex Sans Devanagari) for mixed evidence rendering, and because a
monospaced ledger face is what the source documents *are*. The evidence layer should feel like
the record.

**No third family.** No serif. A serif display face on a dark dense terminal is the cream-and-
terracotta default this brief explicitly is not.

### Scale

1.2 ratio from a 13px base — a tighter ratio than editorial design uses, because this is a
workspace and a 1.333 scale wastes vertical space at terminal density.

| Token | Size / line-height | Weight | Tracking | Use |
|---|---|---|---|---|
| `display-lg` | 40 / 44 | 700 | −0.02em | Situation Room hero |
| `display` | 30 / 34 | 700 | −0.02em | entity name |
| `title-lg` | 22 / 28 | 600 | −0.015em | Floor 1 headline verdict |
| `title` | 17 / 24 | 600 | −0.01em | panel titles |
| `subtitle` | 15 / 22 | 500 | 0 | card titles (P1: computed questions) |
| `body` | 14 / 21 | 400 | 0 | prose, tooltips |
| `body-sm` | 13 / 19 | 400 | 0 | dense tables |
| `label` | 12 / 16 | 500 | +0.02em | stat-tile labels, axis labels |
| `label-xs` | 11 / 14 | 600 | +0.06em | eyebrows, column headers, caps |
| `data-xl` | 34 / 36 | 600 | −0.01em | hero numbers (mono, tabular) |
| `data-lg` | 22 / 26 | 500 | 0 | stat-tile values (mono, tabular) |
| `data` | 14 / 20 | 400 | 0 | table numerals (mono, tabular) |
| `data-sm` | 12 / 16 | 400 | 0 | dense table numerals (mono, tabular) |
| `mono` | 12 / 18 | 400 | 0 | source IDs, parser versions, quoted evidence |

Fourteen tokens. Any size not on this list fails lint.

### Numeral rules

Non-negotiable in a product that is 40% numerals:

1. **`font-variant-numeric: tabular-nums` on every numeral, always.** A count that shifts width
   as it climbs is unreadable on counting day.
2. **Reserve maximum width from first paint.** A cell that will hold 7 digits reserves 7 digits.
   Nothing reflows as data arrives.
3. **Indian digit grouping by default** — `7,10,930`, not `710,930` — with a per-user toggle to
   international grouping, because Rohit exports to pandas and Priya writes for an Indian
   readership. Both are right; the toggle is one line and settles the argument.
4. **Unit and basis always attached.** `+8.1 pp` never bare `+8.1`. Percentage points and percent
   are never both rendered `%`.
5. **Sign first, colour second.** `Delta` renders the sign glyph before applying colour, so the
   direction survives greyscale, print, and colourblindness.
6. **Currency in Indian units** — `₹9.8 cr`, `₹42 lakh` — with the exact rupee figure on hover.
   Affidavit values are declared in these units; converting to millions silently distorts the
   source.

### Indic typography rules

- **Line height is per-script.** Devanagari and Bengali need more leading for conjuncts and
  matras: `1.65` against Latin's `1.45` at body size. A single line-height across scripts either
  clips Bengali or wastes Latin space. Implemented as a `[lang]`-scoped rule, not a component prop.
- **Never letter-space Indic text.** Positive tracking on Devanagari or Bengali breaks conjunct
  rendering. The `label-xs` +0.06em tracking applies to Latin only.
- **No all-caps for Indic.** Indic scripts have no case; a "caps" eyebrow style must fall back to
  weight and colour.
- **Names render in the user's script with the Latin transliteration available on hover** — and
  in the evidence layer, always in the source document's own script, because that is what the
  document says.
- **Font loading:** `font-display: swap`, per-script subsets loaded on demand, `unicode-range`
  splitting so a Latin-only session never downloads Tamil. Variable fonts make the whole family
  cheaper than three static weights of one family would be.

---

## §26 Responsive behaviour

### Three surfaces, not one layout

The single most consequential responsive decision: **the terminal does not shrink** (P8).

| Surface | Width | IA | Persona |
|---|---|---|---|
| **Terminal** | ≥ 1280 | rail + tabs + splits + command bar + 4-col grid | Priya, Rohit, Anand, Kavya |
| **Console** | 768–1279 | rail collapsed to icons, no split, 2-col grid, tabs → a switcher | Terminal users on a laptop or tablet |
| **Reader** | < 768 | bottom nav, single column, vertical card feed, no command bar | Farida, and every share-link recipient |

Console is a *degradation* of Terminal — same routes, same cards, fewer columns, no split panes.
Reader is a **different application** (`apps/reader`) with its own routes, its own IA, and the
same API and citations.

### Why Reader is separate rather than responsive

A cross-filterable 12-card analysis floor has no honest phone layout. Squeezing it produces a
page that scrolls for nine screens and answers nothing — the exact failure the five-second test
exists to catch. So Reader answers different questions:

- `/` — today's briefing as a vertical card feed, one question per card
- `/me` — my constituency, my representatives, my next election
- entity pages — Brief and a *lite* Analysis (3 charts, no cross-filter), full Evidence
- `/vote` — when, where, how, from the ECI record

**Reader keeps every citation.** The `.` gesture becomes a tap on the citation mark. Provenance
is not a desktop luxury; it is the product.

### Shared and divergent

| Shared | Divergent |
|---|---|
| API, semantic layer, measures | navigation, layout, density |
| `packages/ui` primitives and tokens | chart sizing and interaction |
| charts (mobile variants: fewer ticks, no crosshair, tap-only tooltips) | Reader has no command bar, studio, boards, or split panes |
| citations, freshness, corrections | Reader ships ≤ 250 KB first view; Terminal ships ≤ 180 KB JS |
| language switching, all 12 scripts | Reader defaults to the device language; Terminal defaults to English with a switcher |

### Mobile specifics

- Touch targets ≥ 44 px. Tables become card lists below 640 px, or scroll horizontally with a
  pinned first column when the tabular structure carries meaning — never truncated to fit.
- Maps get a simplified layer set, tap-to-inspect (no hover), and a bottom sheet inspector.
- Charts on mobile: fewer axis ticks, direct labels instead of legends where possible, tap
  tooltips that dismiss on outside tap.
- The ink strip persists on Reader at 20 px — the signature works at any width because it is one
  dimension of information.
- Everything is server-rendered. Reader assumes a slow 4G connection and a mid-range Android
  device as the *default* case, not the edge case.

### Print and share

Print stylesheets are real deliverables, not an afterthought: a printed entity Brief is one page,
in light mode, with the citation list rendered as footnotes and the URL and data version in the
footer. Share cards (OG images) are generated per entity with the headline verdict, the key
number, and the source count — never a generic logo card.

---

## §27 Accessibility

### The house rule on focus, stated plainly

This project's standing instruction is **no focus rings or outlines on any interactive element.**
That instruction is honoured, and keyboard accessibility is not weakened, because a visible focus
indicator does not have to be a ring. WCAG requires that focus be *visible and sufficiently
distinguishable* — it does not require `outline`.

**The MANDATE focus treatment — no outline anywhere:**

| Element | Focus indication |
|---|---|
| Table row | 2px `ink-500` bar in the left gutter + row raised to `surface-raised` |
| Button | background steps to `ink-500` at 18% + border to `ink-500` at full |
| Input / select | 2px `ink-500` **bottom** border (replacing the 1px hairline) + panel→raised surface shift |
| Card / chart mark | 2px `ink-500` inset border on the card + the mark's own 2px ink ring |
| Rail item | 2px `ink-500` bar on the rail's inner edge + icon to `ink-400` |
| Tab | 2px `ink-500` underline + label to `text-primary` |
| Map feature | feature outline to 1.5px `ink-400` + the inspector follows focus |
| Link | underline thickness 1px → 2px + colour to `ink-400` |

Every one of these is ≥ 3:1 against both its adjacent colours and ≥ 2px thick, which satisfies
the focus-appearance criterion. `outline: none` is set globally **and** every focusable element
declares one of the above — enforced by a lint rule that fails any focusable component without a
`:focus-visible` style. The global `*:focus-visible { outline: 2px solid #3b82f6 }` currently in
[src/app/globals.css](../../src/app/globals.css) is removed and replaced by this system.

*The one caveat worth stating:* `forced-colors` mode overrides our colours, so under
`@media (forced-colors: active)` we re-enable `outline: 2px solid CanvasText` — because in that
mode the user's OS has taken over the colour system and a border-based indicator may be
flattened away. This is not a violation of the house rule; it is the rule's correct edge case.

### Target: WCAG 2.2 AA, with the dense-data cases named

Generic AA compliance claims are worthless for a product like this. The cases that actually
matter here:

**Colour is never the only encoding.** Party identity = symbol + short name + colour (P3). Status
= icon + label + colour (§24.6). Delta = sign glyph + colour. Map = ≤3 hues + texture + legend +
direct labels + a table view. This is enforced by the component API: `PartyTag` cannot render a
colour dot without a name; `<ConfidenceChip>` has no colour-only variant.

**Every chart has a table.** `t` toggles it, it is in the DOM (visually hidden when the chart is
shown, not absent), and it is what screen readers read. A chart's `aria-label` is its computed
title (P1) plus its headline finding — never "chart".

**Tables are properly navigable.** Real `<table>` semantics with `<th scope>`, `aria-sort` on
sortable headers, a caption naming the data and its source count, arrow-key cell navigation, and
`aria-rowcount` on virtualised tables so the total is announced rather than the rendered window.

**Live regions, used sparingly.** The national tally is `aria-live="polite"` and updates at most
once per 10 seconds regardless of stream rate — a live region firing every second is a screen
reader denial-of-service. Lead changes go to a log region (`role="log"`) that is not announced;
a "3 new lead changes" summary is announced. Connection loss is `aria-live="assertive"` because it
changes whether the numbers can be trusted.

**The map is not the only path.** Every map view has an equivalent sortable table at the same
URL with `?view=table`, and it is a first-class view, not a fallback. Feature-by-feature keyboard
traversal exists, with the inspector following focus.

**The document viewer is text-first.** Every source page carries OCR text with a confidence score;
the viewer exposes it as selectable, searchable text alongside the image. A provenance layer that
is images-only is inaccessible, which would make the product's central claim unavailable to
exactly the users most dependent on it.

**Motion and density.** `prefers-reduced-motion` per §23, including the rule that reduced motion
substitutes a persistent border for a decaying flash so information survives. Density modes never
remove information. Text zoom to 200% reflows without loss — which the 4px spacing scale and the
1.2 type ratio make achievable, and which a hard-pixel grid would not.

**Language.** `lang` is set correctly per element, including per-cell where a table mixes scripts,
so screen readers switch voices. Transliterated names carry the original script in
`aria-label`. All 12 script bundles ship complete, or the language is not offered — a half-
translated interface is worse than an English one.

### Testing

`axe-core` in CI on every route archetype at three viewports; keyboard-only walkthroughs of the
eight flows in §21 recorded per release; screen-reader passes with NVDA and VoiceOver on the four
entity archetypes; the palette validator as a build gate (§24.8); and — the one that finds what
automation cannot — a paid annual audit with users of assistive technology, published on
`/methodology/accessibility` alongside the open issues. Publishing our own accessibility gaps is
consistent with publishing our error rates, and it is the same argument.
