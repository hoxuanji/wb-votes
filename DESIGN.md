---
name: India Election Intelligence
description: A canonical registry of Indian elections in which every figure carries its source, how it was derived, and what is missing, set as a dark instrument room.
colors:
  night-desk: "#07070b"
  night-panel: "#0d0d13"
  night-raised: "#14141c"
  hairline: "#1e1e28"
  edge: "#2a2a38"
  bright-ink: "#f2f2f7"
  reading-ink: "#a3a3b3"
  label-ink: "#8b8ba2"
  unlit-void: "#1c203b"
  signal-green: "#7fd4a8"
  caution-amber: "#e0b458"
  ember: "#e8927c"
  wayfinding-indigo: "#8b9bff"
  wayfinding-cyan: "#49d2ea"
  wayfinding-amber: "#ebbd57"
  wayfinding-violet: "#c583f3"
  wayfinding-rose: "#f77cb0"
  wayfinding-teal: "#61d7b2"
  margin-ramp-1: "#7055b0"
  margin-ramp-2: "#8669cd"
  margin-ramp-3: "#9d80e7"
  margin-ramp-4: "#b399fb"
  margin-ramp-5: "#c7b6fe"
  margin-ramp-6: "#dad0fe"
  series-vermilion: "#d05320"
  series-blue: "#6fa4fc"
  series-rose: "#e1a6a2"
  series-fold: "#7b7490"
typography:
  display:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "52px"
    fontWeight: 760
    lineHeight: 1.08
    letterSpacing: "-0.03em"
  lead:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "-0.02em"
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0em"
  data:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0em"
  meta:
    fontFamily: "ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0.02em"
    fontFeature: "tnum"
  label:
    fontFamily: "ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.1em"
rounded:
  r: "8px"
  dot: "50%"
spacing:
  step-1: "4px"
  step-2: "8px"
  step-3: "12px"
  step-4: "16px"
  step-6: "24px"
  step-8: "32px"
  step-12: "48px"
components:
  section-card:
    backgroundColor: "{colors.night-panel}"
    textColor: "{colors.bright-ink}"
    rounded: "{rounded.r}"
    padding: "24px"
  stat-card:
    backgroundColor: "{colors.night-raised}"
    textColor: "{colors.bright-ink}"
    rounded: "{rounded.r}"
    padding: "16px"
  tab:
    backgroundColor: "rgba(255, 255, 255, 0.03)"
    textColor: "{colors.label-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.r}"
    padding: "8px 12px"
  tab-current:
    backgroundColor: "{colors.bright-ink}"
    textColor: "{colors.night-desk}"
    typography: "{typography.label}"
    rounded: "{rounded.r}"
    padding: "8px 12px"
  workbench-tab:
    textColor: "{colors.label-ink}"
    typography: "{typography.label}"
    padding: "12px 4px"
  workbench-tab-current:
    textColor: "{colors.bright-ink}"
    typography: "{typography.label}"
    padding: "12px 4px"
  status-strip:
    backgroundColor: "{colors.night-panel}"
    textColor: "{colors.bright-ink}"
    rounded: "{rounded.r}"
    padding: "12px 16px"
  schedule-row:
    textColor: "{colors.bright-ink}"
    rounded: "{rounded.r}"
    padding: "12px 8px"
  command-bar:
    backgroundColor: "rgba(255, 255, 255, 0.04)"
    textColor: "{colors.bright-ink}"
    typography: "{typography.meta}"
    rounded: "{rounded.r}"
    padding: "8px 32px 8px 12px"
  provenance-marker:
    textColor: "{colors.label-ink}"
    typography: "{typography.label}"
  provenance-marker-derived:
    textColor: "{colors.caution-amber}"
    typography: "{typography.label}"
  rail-item:
    textColor: "{colors.label-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.r}"
    padding: "8px 0"
    width: "72px"
---

# Design System: India Election Intelligence

## Overview

**Creative North Star: "The Situation Room"**

The product is a tool for looking at elections, and the interface behaves like the room that tool would live in: dark, quiet, built from a rail of six places, a command bar and a sticky strip across the top, with the data as the only thing that glows. Structure, shape and density do the work. The canvas is a blue-violet black, the chrome is near-black surfaces held to one hue per page, and a party's own colour is the loudest thing a screen can contain because it is the thing the screen is about.

The voice is forensic, instrument-like and civic. Forensic, because every figure carries its source, how it was derived and what is missing, and the surface says so in words: an absence is a phrase, never a bare dash; a derived value is a marked word, never a plain number. Instrument-like, because it is operated: tabs choose a view and the view is URL state, numerals are tabular, labels are small uppercase mono. Civic, because it takes no side: party colours are the parties' own, never the product's, and nothing here recommends, ranks or editorialises.

It rules three looks out, each confirmed. Not a lab report or a school project: flat, all-monospace, hairlines between sections, which this stylesheet used to be and replaced with the card skin. Not TV-news election graphics: saturated party slabs, tickers and hue as decoration. Not a generic SaaS dashboard: glass cards and gradients with nothing behind them. Where the system uses a gradient, a blur or a glow, it is a fixed, bounded device with a stated job, and the data never sits on a decorative one.

**Key Characteristics:**
- Dark only. There is no light surface, and every contrast in the system is measured against the three night surfaces.
- Surfaces are neutral near-black. A page shows one signal hue, its own, in a handful of small places; the front page's workbench is its one card, and the reference sections under it are open.
- One voice for prose (sans) and one for numbers, marks and metadata (mono, tabular).
- Seven spacing steps, seven type sizes, one radius, three inks.
- Hue is spent on data first and wayfinding second, and never the other way round. The chrome never shows two signal hues on one page.
- Status survives greyscale: a word with a rule under it, never colour alone.
- System fonts only; no webfont is loaded.

## Colors

A blue-violet black with three reading inks, a small set of meaning inks, a six-hue wayfinding palette of which a page uses exactly one, and the parties' own colours, which belong to the data.

### Primary
- **Night Desk** (#07070b): the canvas. The page, and the text colour on a filled tab. Also the browser's theme colour, and repeated inline in the root layout so the page doesn't flash white before the stylesheet arrives.
- **Wayfinding Indigo** (#8b9bff): the front page's hue, and the default page hue wherever nothing else sets one.

### Secondary
- **Wayfinding Cyan** (#49d2ea): the hue of a place (state or district) page.
- **Wayfinding Violet** (#c583f3): the hue of an election page and the review pages.
- **Wayfinding Rose** (#f77cb0): the hue of a person page.
- **Wayfinding Teal** (#61d7b2): the hue of the coverage page.
- **Wayfinding Amber** (#ebbd57): the hue of search.

### Tertiary
- **Signal Green** (#7fd4a8): a figure that went up, or a good state. Meaning only.
- **Caution Amber** (#e0b458): a derived value, a warning. It is the colour of "this number was computed, not announced".
- **Ember** (#e8927c): a figure that went down, an alert, and the live indicator.

### Neutral
- **Night Panel** (#0d0d13): a card (a section card, the workbench, the status strip), and the top bar at 78% over a blur.
- **Night Raised** (#14141c): a stat card, the current rail place, a hovered rail item or schedule row, a seat that held.
- **Hairline** (#1e1e28): the border of a card, the rule under a heading, and the rule between table rows, schedule rows and workbench bands.
- **Edge** (#2a2a38): the border of a control, the rule under a table header, a scrollbar thumb.
- **Bright Ink** (#f2f2f7): values, headings, a focus underline.
- **Reading Ink** (#a3a3b3): prose notes, legend text, sub-lines.
- **Label Ink** (#8b8ba2): every label, table header, caption and metadata line. Held at 4.5:1 or better on the lightest surface a label can sit on.
- **Unlit Void** (#1c203b): the ink of a seat or district that has no data. Deliberately below the 3:1 mark floor, because an unlit polygon is the absence of a mark.

### Data inks
- **Party ink.** A party has one colour, everywhere, and nothing about where it is drawn changes it: not rank, seat count, page or neighbour. About sixty are curated in OKLCH in `data/party-ink.json` (the hue is the association; lightness separates same-family parties); every other party gets a quieter, hashed colour, so "this party's colour is not recorded here" is itself visible. A party mark also carries its abbreviation, and the legend names every party it shows.
- **Margin ramp** (#7055b0 to #dad0fe): a six-step violet ramp that means a size of margin, and is brightest at the knife edge, because a tight seat is the finding.
- **Series inks** (#d05320, #6fa4fc, #e1a6a2, and the fold #7b7490): for chart series that are not parties. Only three hues are ever handed out; everything past them folds to the grey. Every line is also named at its end.

### Named Rules
**The Data Hue Rule.** A hue on a data mark means what the data says, and nothing else. A party's colour is the party's, the ramp is a magnitude, the semantic inks are their meaning.

**The Wayfinding Edge Rule.** A page shows one signal hue, its own (`--page`, read through `--accent`), and it says where you are, never what a mark is. It appears in five places: the current rail place (a 2px bar and its icon), the 8px marker before a heading, the 2px underline of the selected workbench tab, the kind-of-page label, and one dim glow along the top of the page (16%). It is never cycled by section, never tints a card's edge, wash or foot, never sets type in a gradient, and never fills a seat, a bar, a ribbon, a dot or a legend swatch, because every hue in the band sits within a few ΔE of some party's colour. The other five hues still exist: a kind of page picks one.

**The Floor Rule.** Every ink clears 4.5:1 as text on all three night surfaces, and every mark clears 3:1. `iei.test.ts` locks the neutral hexes: do not change one without running it.

**The Three-Ink Rule.** There are three reading inks and no fourth. A tier nothing may legitimately use is a tier to delete.

## Typography

**Display Font:** the system UI sans (`ui-sans-serif`, with `system-ui` and the platform stack as fallback)
**Body Font:** the same sans
**Label/Mono Font:** the system monospace (`ui-monospace`, with SF Mono, Menlo and Consolas as fallback)

**Character:** Two voices that never swap jobs. The sans is for sentences and names; the mono is for numbers, marks and metadata, tabular and right-aligned. There is no webfont, by decision: a face fetched on every load to render text that doesn't exist is paying for something no reader receives.

### Hierarchy
- **Display** (760, 52px, 1.08): the page title, in bright ink, with a -0.03em tightening. Capped at 22ch. A title that is a sentence drops to 0.72 of this (about 37px, 1.12, capped at 30ch), never below the lead size; the front page's title is such a sentence, with no label above it.
- **Lead** (700, 26px, 1.15): a stat's words, a year heading on a person page, a figure in the status strip, and the name of the state the inspector shows.
- **Title** (700, 18px, 1.5): a section heading, in sentence case, with a dot in the page's hue before it; a state's name in the inspector's list; a name in the schedule (650).
- **Body** (400, 15px, 1.5): prose, at 64ch in a sub-line and 78ch in a note. A sub-line runs at 1.6.
- **Data** (400, 13.5px, 1.5): a table cell, a note under a chart, a row header.
- **Meta** (400, 12.5px, tabular mono): captions, the command bar's text, a number's unit.
- **Label** (500, 11px, mono, 0.1em, uppercase): a column header, a tab, a rail item, a provenance marker. Never a sentence.

### Named Rules
**The Two Voices Rule.** Numbers, marks and metadata are monospace and tabular. Prose is sans. A note under a chart is a sentence and is set as one.

**The Four Tiers Rule.** A screen has a title, a metric, body and a label, and they are far enough apart in size that no two look alike. The scale runs 11 to 52px for a reason: when it ran 9.5 to 25, everything had the same visual weight.

## Layout

Content sits in a column of at most 1340px with a 16px gutter. From 901px up, a 72px rail of six places sits beside it, sticky under a 48px bar; at 900px and below the rail turns into a horizontal strip under the bar, and the bar wraps to two rows. Other breakpoints are 1080px, 1024px and 640px, where the gutter, the answer's size, the section padding and the tight cell are redeclared as tokens rather than overridden rule by rule.

Spacing is seven steps and every length is one of them: 4, 8, 12, 16, 24, 32 and 48px. A 1px or 2px nudge beside a hairline is the only exception. A table row has 8px of vertical padding and 12px of horizontal; the 36-row jurisdiction lists use a 4px "tight" row, which exists so that every state in India fits one screen. Pages are stacks of sections 24px apart, with stat cards in an auto-fit grid of 200px minimum.

The front page is composed in one order: the title as the answer sentence, one quiet line, a status strip of three measures in a row, then the workbench, then open reference sections. The workbench is one card in three bands (a toolbar with the heading, the question and the sources drawer; the layer tabs; the map beside its inspector with a hairline between them). The map column and the inspector each take 24px of padding. Under 900px the inspector drops below the map behind a top rule; under 1080px each status-strip cell stacks its label over its figure; under 640px the strip becomes a ruled list and the map is still on the first screen. The reference sections under the workbench (next up, history, closest contests, recent results, party landscape) are open: a heading and its rule, no box, 32px apart.

Heights that belong to a mark are pixels, not viewport units: the map is at most 620px tall, the margin distribution band is 128px, the seat flow is 260px, and the arc is at most 720px wide. A map's width may depend on its own shape; it may never depend on how tall the window is.

### Named Rules
**The Seven Steps Rule.** Every length is a token. A rule that wants 18px is a rule that hasn't decided whether it means 16 or 24.

## Elevation & Depth

Depth is layered and ambient. A card sits on a faintly lit page, and its depth says "this is a card", never "this was clicked"; an open section has none. States are carried by borders and ink, not lift. The top bar is the one frosted surface and lets the page scroll beneath it.

### Shadow Vocabulary
- **Card** (`box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 8px 24px rgba(0, 0, 0, 0.32)`): a section card or the workbench, over a 4% white gradient that fades out across its first 120px.
- **Page glow** (`radial-gradient(80% 32% at 50% 0, page hue at 16%, transparent 72%)`): the light along the top of the page, one hue and nothing at the sides. A seat's page uses the holding party's ink instead.
- **Top bar frost** (`background: rgba(13, 13, 19, 0.78); backdrop-filter: blur(12px)`): the only blur.

### Named Rules
**The Ambient Rule.** Shadows say what a surface is, never what happened to it. Hover and focus change a border or an ink, and never a shadow.

**The Bounded Glow Rule.** Every gradient and blur is a fixed device with a job: the page glow, the card's top highlight, the bar's frost, and the fade that tells a scrolling tab strip there is more. Type is never set in a gradient. A data mark never sits on a decorative one, and alpha is chosen so the dimmest label still clears 4.5:1 under it.

## Shapes

One radius, 8px, on every card, control, input, chip and keyboard hint. A dot is a circle (50%): the 6px live indicator, the 8px section marker. A party swatch is 9px with the same 8px radius, so it reads as a dot beside its label. Borders are 1px in the two line inks; the one thick line is a 2px bar that carries a signal (the current rail place, the selected tab) or a focus.

Inside a map, every stroke is a device measurement (`vector-effect: non-scaling-stroke`), because zoom is a viewBox change and a hairline in user units becomes 25px inside a framed district. Icons are one family: 24 units, stroke only, 1.5 wide, round caps and joins, in `currentColor`.

### Named Rules
**The One Radius Rule.** The corner is 8px everywhere. A new shape that wants a different corner is a new decision, and is made once here.

## Components

Controls say exactly what they are and nothing more: small uppercase mono labels, 8px corners, borders in the line inks, and a filled state for the current one.

### Section cards
- **Corner Style:** 8px.
- **Background:** Night Panel, with the top highlight gradient (see Elevation).
- **Border:** 1px Hairline. No coloured edge, wash or foot.
- **Internal Padding:** 24px, 16px at 640px and below.
- **Heading:** the title, with an 8px dot in the page's hue, over a 1px Hairline rule.

### Open sections
- **Style:** a heading and its rule, then the content, with no box, border, fill or shadow. Used for reference that should not outweigh the work area above it (on the front page: next up, history, closest contests, recent results, party landscape). 32px between sections.
- **Caveat:** a note in Reading Ink at 13.5px and 78ch, not a callout. A section with nothing to rank is a heading and one line, not a card holding a sentence.

### Workbench (signature)
- **Shape:** the front page's map panel, and its one card: Night Panel, 8px, 1px Hairline, no padding of its own, set in bands. A toolbar (heading, question, sources drawer) at 12px and 24px; the layer tabs on a 1px rule; the map at 24px beside an inspector at 24px with a Hairline between them.
- **Inspector:** reads answer first. A state the registry holds one of, or the reader has chosen, is named at the lead size (26px, -0.03em); the card's own heading steps down to a 15px, 600, Reading Ink sub-heading; states in the list are named at the title size (18px, 700) with their figures at body size. The states not loaded come last, in Label Ink at the meta size, set in sans as names, in four columns (open when most of the country is missing, wrapping inline on a phone).
- **Phone:** the map is on the first screen; the inspector stacks under it behind a top rule.

### Status strip
- **Style:** one row of three measures in a Night Panel strip with a 1px Hairline border and 8px corner, cells divided by Hairline rules. Each cell: a Label Ink label, the figure at the lead size (700, -0.04em), its denominator at meta size, and a 4px bar. It replaced three stacked stat cards.
- **Narrow:** at 1080px and below the label sits above the figure; at 640px the three are a ruled list, label and figure side by side.

### Stat cards
- **Style:** Night Raised with a 4.5% white top gradient and a 1px Hairline border. The number is the card: tabular mono, about 37px, weight 700, tightened to -0.04em, under a Label Ink label. No coloured foot.
- **Padding:** 16px.

### Tabs
- **Underline strip (the workbench):** a plain link, so the view is URL state. Mono, 11px, uppercase, 0.1em, Label Ink, no box and no corner, 24px apart, 12px by 4px of padding, on a 1px Hairline strip rule. The underline is a 2px bar drawn over that rule (not a border, which would curl at the 8px corner). Hover lights the bar in Label Ink. The selected tab is Bright Ink with the bar in the page's hue. Focus draws the bar in Bright Ink. Unavailable is Label Ink over a dashed 2px bar in Edge: the strip says what is missing rather than offering a layer that would shade the country in a colour standing for nothing. Under forced colours the bars are borders in the system's ink. On a phone the strip scrolls and fades out over its last 16px at the right edge, so a cut-off tab reads as more to come.
- **Pill tabs (everywhere else):** mono, 11px, uppercase, 0.1em, Label Ink on a 3% white fill, 1px Hairline border, 8px corner. Hover takes Bright Ink and an Edge border. Current is a Bright Ink fill with Night Desk text, weight 700, and a Bright Ink border. Unavailable is a dashed border with the not-allowed cursor.

### Command bar
- **Style:** the product's only search field: a joined control on a 4% white fill, a 1px Edge border, 8px corner, 420px at most. Placeholder in Label Ink, and a `<kbd>` hint that stays visible while focused and goes away on a touch screen.
- **Focus:** the whole group's border moves to Label Ink, and the field gets a 2px Bright Ink underline inset, never a ring.

### Navigation
- **Top bar:** 48px minimum, sticky, frosted, with a Hairline under it. The wordmark is an 18px bold sans over a quiet mono tag; the live indicator, in Ember, appears at the right only while an election is being counted.
- **Rail:** six places, each an icon over a word of 11px mono, in Label Ink at rest. Hovered, it goes to Bright Ink on Night Raised. The current place is Bright Ink on Night Raised with a 2px bar and its icon in the page's hue, which is two signals, so it isn't colour alone.

### Schedule (Next up)
- **Style:** a ruled list, one row per election, read down a column: date (mono 11px uppercase, Reading Ink), name (18px, 650) over its context line, the term meter (a 6px bar in Reading Ink on Hairline, Ember once the term has run past its end, also said in words) and the context (mono 11px, Label Ink). Four columns at 11rem, 1.1fr, 8rem+ and 1.3fr with a 24px gap; rows divided by a Hairline, 12px by 8px of padding, and a Night Raised row on hover. At 900px and below the meter and context take their own lines; at 640px each row is one column.

### Tables
- **One treatment.** Headers are 11px mono, uppercase, in Label Ink over an Edge rule; numbers are right-aligned, tabular and mono, with the header aligned over them; a row header is a sans label, not a heading; a row lights at 3.5% white on hover. A denominator has its own left-aligned column so the figures line up.

### Provenance marker (signature)
A word with a rule under it. It says what kind of number a figure is, and it has to survive greyscale, forced colours and a screen reader. *Measured* is reading ink over a solid rule; *derived* is Caution Amber over an amber rule, because a computed term expiry printed like an announced date is the fabrication this product refuses; *reference* is a dashed rule; *absent* is a dotted one. An absence is words, never a dash, because a dash beside numbers reads as zero.

### Maps and marks (signature)
A seat is a polygon or a square, and the two read from one source so a colour means one thing in both. Party ink fills it; a seat with no data is Unlit Void; the hover card is one line and differs by mode, because the mode is the question being asked. A party swatch always sits beside its label, and the pair never breaks across lines. A state with no result is named in Reading Ink where it fits: its name in a compact polygon, its two-letter code where only that fits, and nothing where neither does, because the tile row and the table name every state and a smaller font only moves the illegibility. On a phone the map's text is not drawn, as it would be about 6px. The History ribbon carries a one-line note saying what its empty space is: a column is every state and territory, the coloured part those with an election on record by that year, and the rest have none loaded.

### Links and focus
Prose links are Reading Ink with a 1px Edge underline, going to Bright Ink on hover and a 2px Bright Ink underline on focus. Everything that takes focus shows a 2px Bright Ink rule drawn on or inside the control itself, so its box doesn't grow. Under forced colours the browser's system outline takes over.

### Motion
Motion carries information or it doesn't exist: a bar grows from its baseline to say this is a quantity, and a wedge arrives to say these seats are one party's. It runs once on load and never loops. There are three durations (160, 360 and 640ms) and one curve, and 700ms is the ceiling. Every animation sits inside `prefers-reduced-motion: no-preference`, and a keyframe names only its starting state, so a page at rest is exactly the page the screenshots judge.

### Named Rules
**The Word Not Colour Rule.** Status is a word, a rule style or a shape, never a colour alone: a provenance marker, a party abbreviation beside a swatch, a current-place bar beside a hue, a dashed bar under an unavailable tab.

**The Once Rule.** An animation runs once and never loops, and it lasts at most 700ms. It exists only where the motion is the information.

## Do's and Don'ts

### Do:
- **Do** spend hue on data first: a party's own ink, the margin ramp, a semantic ink for its meaning only.
- **Do** give a page one signal hue, its own, in the five places the Wayfinding Edge Rule lists, and no more.
- **Do** pair every colour mark with a word, an abbreviation or a shape.
- **Do** set numbers in tabular mono and right-align them with their headers; set sentences in sans.
- **Do** use only the seven spacing steps and the seven type sizes, and one 8px radius.
- **Do** say an absence in words ("not loaded", "not reported"), at a ink that clears 4.5:1.
- **Do** run `iei.test.ts` after any change to a neutral hex or a party ink, and `party-ink.test.ts` after any change to the party colours.
- **Do** keep every animation inside `prefers-reduced-motion: no-preference`.
- **Do** draw a selected-state bar over a rule instead of a border on a corner-less control, so the one-radius rule holds.

### Don't:
- **Don't** fill a seat, bar, ribbon, dot or legend swatch with a wayfinding hue.
- **Don't** cycle the signal hues by section, tint a card's edge, wash or foot with one, or set a title in a gradient.
- **Don't** let a party's colour change with rank, count, page or neighbour.
- **Don't** make it a lab report: all-monospace, hairlines between every section, grey 11px captions.
- **Don't** make it TV-news graphics: saturated party slabs, tickers, hue as decoration.
- **Don't** make it a generic SaaS dashboard: glass cards and gradients with nothing to say.
- **Don't** add a fourth ink tier, a second radius, or a length off the seven-step scale.
- **Don't** change a shadow on hover or focus, or draw a focus ring that grows the control's box.
- **Don't** print an absence as a bare dash, or a derived figure as if it were announced.
- **Don't** load a webfont, or loop an animation.

### Open decision (not a rule)
The kind-of-page label (`.iei-eyebrow`) is still set on pages other than the front page, as plain uppercase mono text, in the page's hue under a page head, with no chip, border or fill. The craft floor refuses kickers, and an earlier version of this file named it a component. The owner has not decided whether it stays. Until then it is recorded as carried, not as a pattern: do not add one to a new surface.
