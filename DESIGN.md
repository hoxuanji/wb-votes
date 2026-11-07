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
  command-bar:
    backgroundColor: "rgba(255, 255, 255, 0.04)"
    textColor: "{colors.bright-ink}"
    typography: "{typography.meta}"
    rounded: "{rounded.r}"
    padding: "8px 32px 8px 12px"
  eyebrow:
    backgroundColor: "rgba(255, 255, 255, 0.03)"
    textColor: "{colors.reading-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.r}"
    padding: "4px 12px"
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

The product is a tool for looking at elections, and the interface behaves like the room that tool would live in: dark, quiet, built from a rail of six places, a command bar and a sticky strip across the top, with the data as the only thing that glows. Structure, shape and density do the work. The canvas is a blue-violet black, the chrome is a stack of near-black cards, and a party's own colour is the loudest thing a screen can contain because it is the thing the screen is about.

The voice is forensic, instrument-like and civic. Forensic, because every figure carries its source, how it was derived and what is missing, and the surface says so in words: an absence is a phrase, never a bare dash; a derived value is a marked word, never a plain number. Instrument-like, because it is operated: tabs choose a view and the view is URL state, numerals are tabular, labels are small uppercase mono. Civic, because it takes no side: party colours are the parties' own, never the product's, and nothing here recommends, ranks or editorialises.

It rules three looks out, each confirmed. Not a lab report or a school project: flat, all-monospace, hairlines between sections, which this stylesheet used to be and replaced with the card skin. Not TV-news election graphics: saturated party slabs, tickers and hue as decoration. Not a generic SaaS dashboard: glass cards and gradients with nothing behind them. Where the system uses a gradient, a blur or a glow, it is a fixed, bounded device with a stated job, and the data never sits on a decorative one.

**Key Characteristics:**
- Dark only. There is no light surface, and every contrast in the system is measured against the three night surfaces.
- Sections are cards on a faintly lit page; the page's hue says what kind of page it is.
- One voice for prose (sans) and one for numbers, marks and metadata (mono, tabular).
- Seven spacing steps, seven type sizes, one radius, three inks.
- Hue is spent on data first and wayfinding second, and never the other way round.
- Status survives greyscale: a word with a rule under it, never colour alone.
- System fonts only; no webfont is loaded.

## Colors

A blue-violet black with three reading inks, a small set of meaning inks, a six-hue wayfinding palette for the chrome, and the parties' own colours, which belong to the data.

### Primary
- **Night Desk** (#07070b): the canvas. The page, and the text colour on a filled tab. Also the browser's theme colour, and repeated inline in the root layout so the page doesn't flash white before the stylesheet arrives.
- **Wayfinding Indigo** (#8b9bff): the front page's hue, the first section on any page, and the default accent wherever nothing else sets one.

### Secondary
- **Wayfinding Cyan** (#49d2ea): a place (state or district) page, and the second section.
- **Wayfinding Violet** (#c583f3): an election page and the review pages, and the fourth section.
- **Wayfinding Rose** (#f77cb0): a person page, and the fifth section.
- **Wayfinding Teal** (#61d7b2): the coverage page, and the sixth section.
- **Wayfinding Amber** (#ebbd57): search, and the third section.

### Tertiary
- **Signal Green** (#7fd4a8): a figure that went up, or a good state. Meaning only.
- **Caution Amber** (#e0b458): a derived value, a warning. It is the colour of "this number was computed, not announced".
- **Ember** (#e8927c): a figure that went down, an alert, and the live indicator.

### Neutral
- **Night Panel** (#0d0d13): a section card, and the top bar at 78% over a blur.
- **Night Raised** (#14141c): a stat card, the current rail place, a hovered rail item, a seat that held.
- **Hairline** (#1e1e28): the border of a card and the rule between table rows.
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

**The Wayfinding Edge Rule.** The six signal hues say where you are, never what a mark is. They appear only as a 1–2px edge, a small marker, a label or a faint wash, and never as the fill of a seat, a bar, a ribbon, a dot or a legend swatch, because every hue in the band sits within a few ΔE of some party's colour.

**The Floor Rule.** Every ink clears 4.5:1 as text on all three night surfaces, and every mark clears 3:1. `iei.test.ts` locks the neutral hexes: do not change one without running it.

**The Three-Ink Rule.** There are three reading inks and no fourth. A tier nothing may legitimately use is a tier to delete.

## Typography

**Display Font:** the system UI sans (`ui-sans-serif`, with `system-ui` and the platform stack as fallback)
**Body Font:** the same sans
**Label/Mono Font:** the system monospace (`ui-monospace`, with SF Mono, Menlo and Consolas as fallback)

**Character:** Two voices that never swap jobs. The sans is for sentences and names; the mono is for numbers, marks and metadata, tabular and right-aligned. There is no webfont, by decision: a face fetched on every load to render text that doesn't exist is paying for something no reader receives.

### Hierarchy
- **Display** (760, 52px, 1.08): the page title, with a -0.03em tightening and a gradient from bright ink to the page's hue. Capped at 22ch. A title that is a sentence drops to 0.72 of this, never below the lead size.
- **Lead** (700, 26px, 1.15): a stat's words, a year heading on a person page, the big figure in a hero card.
- **Title** (700, 18px, 1.5): a section heading, in sentence case, with a hue-coloured dot before it.
- **Body** (400, 15px, 1.5): prose, at 64ch in a sub-line and 78ch in a note. A sub-line runs at 1.6.
- **Data** (400, 13.5px, 1.5): a table cell, a note under a chart, a row header.
- **Meta** (400, 12.5px, tabular mono): captions, the command bar's text, a number's unit.
- **Label** (500, 11px, mono, 0.1em, uppercase): a column header, a tab, an eyebrow, a rail item, a provenance marker. Never a sentence.

### Named Rules
**The Two Voices Rule.** Numbers, marks and metadata are monospace and tabular. Prose is sans. A note under a chart is a sentence and is set as one.

**The Four Tiers Rule.** A screen has a title, a metric, body and a label, and they are far enough apart in size that no two look alike. The scale runs 11 to 52px for a reason: when it ran 9.5 to 25, everything had the same visual weight.

## Layout

Content sits in a column of at most 1340px with a 16px gutter. From 901px up, a 72px rail of six places sits beside it, sticky under a 48px bar; at 900px and below the rail turns into a horizontal strip under the bar, and the bar wraps to two rows. Other breakpoints are 1080px, 1024px and 640px, where the gutter, the answer's size, the section padding and the tight cell are redeclared as tokens rather than overridden rule by rule.

Spacing is seven steps and every length is one of them: 4, 8, 12, 16, 24, 32 and 48px. A 1px or 2px nudge beside a hairline is the only exception. A table row has 8px of vertical padding and 12px of horizontal; the 36-row jurisdiction lists use a 4px "tight" row, which exists so that every state in India fits one screen. Pages are stacks of cards separated by 24px, with stat cards in an auto-fit grid of 200px minimum.

Heights that belong to a mark are pixels, not viewport units: the map is at most 620px tall, the margin distribution band is 128px, the seat flow is 260px, and the arc is at most 720px wide. A map's width may depend on its own shape; it may never depend on how tall the window is.

### Named Rules
**The Seven Steps Rule.** Every length is a token. A rule that wants 18px is a rule that hasn't decided whether it means 16 or 24.

## Elevation & Depth

Depth is layered and ambient. A section is a card on a faintly lit page, and its depth says "this is a card", never "this was clicked". States are carried by borders and ink, not lift. The top bar is the one frosted surface and lets the page scroll beneath it.

### Shadow Vocabulary
- **Card** (`box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 8px 24px rgba(0, 0, 0, 0.32)`): a section card, over a 4% white gradient that fades out across its first 120px.
- **Signal edge** (`box-shadow: inset 0 2px 0 0 color-mix(in oklab, var(--accent) 70%, transparent)`): the 2px top edge of a section, in that section's wayfinding hue, over a 10% wash that is gone by 140px.
- **Stat foot** (`box-shadow: inset 0 -2px 0 0 color-mix(in oklab, var(--accent) 38%, transparent)`): the coloured foot of a stat card.
- **Page glow** (`radial-gradient(80% 32% at 50% 0, page hue at 22%, transparent 72%)`): the light along the top of the page. A seat's page uses the holding party's ink instead.
- **Top bar frost** (`background: rgba(13, 13, 19, 0.78); backdrop-filter: blur(12px)`): the only blur.

### Named Rules
**The Ambient Rule.** Shadows say what a surface is, never what happened to it. Hover and focus change a border or an ink, and never a shadow.

**The Bounded Glow Rule.** Every gradient and blur is a fixed device with a job: the page glow, the card's top highlight, the signal edge and the bar's frost. A data mark never sits on a decorative one, and alpha is chosen so the dimmest label still clears 4.5:1 under it.

## Shapes

One radius, 8px, on every card, control, input, chip and keyboard hint. A dot is a circle (50%): the 6px live indicator, the 8px section marker. A party swatch is 9px with the same 8px radius, so it reads as a dot beside its label. Borders are 1px in the two line inks; the one thick line is a 2px edge that carries a signal or a focus.

Inside a map, every stroke is a device measurement (`vector-effect: non-scaling-stroke`), because zoom is a viewBox change and a hairline in user units becomes 25px inside a framed district. Icons are one family: 24 units, stroke only, 1.5 wide, round caps and joins, in `currentColor`.

### Named Rules
**The One Radius Rule.** The corner is 8px everywhere. A new shape that wants a different corner is a new decision, and is made once here.

## Components

Controls say exactly what they are and nothing more: small uppercase mono labels, 8px corners, borders in the line inks, and a filled state for the current one.

### Section cards
- **Corner Style:** 8px.
- **Background:** Night Panel, with the top highlight gradient (see Elevation).
- **Border:** 1px Hairline, and a 2px signal edge in the section's hue.
- **Internal Padding:** 24px, 16px at 640px and below.
- **Heading:** the title, with a hue dot, over a 1px rule that takes 22% of the hue.

### Stat cards
- **Style:** Night Raised with a 4.5% white top gradient, a 1px Hairline border and a coloured foot. The number is the card: tabular mono, about 37px, weight 700, tightened to -0.04em, under a label in the section's hue softened toward reading ink.
- **Padding:** 16px.

### Tabs
- **Style:** a plain link, so the view is URL state. Mono, 11px, uppercase, 0.1em, Label Ink on a 3% white fill, 1px Hairline border, 8px corner.
- **Hover:** the ink goes to bright and the border takes 55% of the section's hue.
- **Current:** a Bright Ink fill with Night Desk text and weight 700. Its border takes 70% of the hue.
- **Unavailable:** a dashed border and the not-allowed cursor. The strip says what is missing rather than offering a layer that would shade the country in a colour standing for nothing.

### Command bar
- **Style:** the product's only search field: a joined control on a 4% white fill, a 1px Edge border, 8px corner, 420px at most. Placeholder in Label Ink, and a `<kbd>` hint that stays visible while focused and goes away on a touch screen.
- **Focus:** the whole group's border moves to Label Ink, and the field gets a 2px Bright Ink underline inset, never a ring.

### Navigation
- **Top bar:** 48px minimum, sticky, frosted, with a six-hue hairline through its bottom edge. The wordmark is an 18px bold sans over a quiet mono tag; the live indicator, in Ember, appears at the right only while an election is being counted.
- **Rail:** six places, each an icon over a word of 11px mono. At rest the icon is its hue, dimmed; hovered or current it is full, and the current one carries a 2px edge and a lit wash, which is two signals, so it isn't colour alone.
- **Eyebrow:** a bordered chip in the page's hue that names the kind of page.

### Tables
- **One treatment.** Headers are 11px mono, uppercase, in Label Ink over an Edge rule; numbers are right-aligned, tabular and mono, with the header aligned over them; a row header is a sans label, not a heading; a row lights at 3.5% white on hover. A denominator has its own left-aligned column so the figures line up.

### Provenance marker (signature)
A word with a rule under it. It says what kind of number a figure is, and it has to survive greyscale, forced colours and a screen reader. *Measured* is reading ink over a solid rule; *derived* is Caution Amber over an amber rule, because a computed term expiry printed like an announced date is the fabrication this product refuses; *reference* is a dashed rule; *absent* is a dotted one. An absence is words, never a dash, because a dash beside numbers reads as zero.

### Maps and marks (signature)
A seat is a polygon or a square, and the two read from one source so a colour means one thing in both. Party ink fills it; a seat with no data is Unlit Void; the hover card is one line and differs by mode, because the mode is the question being asked. A party swatch always sits beside its label, and the pair never breaks across lines. A state with no result is named in Reading Ink where it fits: its name in a compact polygon, its two-letter code where only that fits, and nothing where neither does, because the tile row and the table name every state and a smaller font only moves the illegibility. On a phone the map's text is not drawn, as it would be about 6px.

### Links and focus
Prose links are Reading Ink with a 1px Edge underline, going to Bright Ink on hover and a 2px Bright Ink underline on focus. Everything that takes focus shows a 2px Bright Ink rule drawn on or inside the control itself, so its box doesn't grow. Under forced colours the browser's system outline takes over.

### Motion
Motion carries information or it doesn't exist: a bar grows from its baseline to say this is a quantity, and a wedge arrives to say these seats are one party's. It runs once on load and never loops. There are three durations (160, 360 and 640ms) and one curve, and 700ms is the ceiling. Every animation sits inside `prefers-reduced-motion: no-preference`, and a keyframe names only its starting state, so a page at rest is exactly the page the screenshots judge.

### Named Rules
**The Word Not Colour Rule.** Status is a word, a rule style or a shape, never a colour alone: a provenance marker, a party abbreviation beside a swatch, a current-place bar beside a hue.

**The Once Rule.** An animation runs once and never loops, and it lasts at most 700ms. It exists only where the motion is the information.

## Do's and Don'ts

### Do:
- **Do** spend hue on data first: a party's own ink, the margin ramp, a semantic ink for its meaning only.
- **Do** keep the signal hues to a 1–2px edge, a small marker, a label or a faint wash.
- **Do** pair every colour mark with a word, an abbreviation or a shape.
- **Do** set numbers in tabular mono and right-align them with their headers; set sentences in sans.
- **Do** use only the seven spacing steps and the seven type sizes, and one 8px radius.
- **Do** say an absence in words ("not loaded", "not reported"), at a ink that clears 4.5:1.
- **Do** run `iei.test.ts` after any change to a neutral hex or a party ink, and `party-ink.test.ts` after any change to the party colours.
- **Do** keep every animation inside `prefers-reduced-motion: no-preference`.

### Don't:
- **Don't** fill a seat, bar, ribbon, dot or legend swatch with a wayfinding hue.
- **Don't** let a party's colour change with rank, count, page or neighbour.
- **Don't** make it a lab report: all-monospace, hairlines between every section, grey 11px captions.
- **Don't** make it TV-news graphics: saturated party slabs, tickers, hue as decoration.
- **Don't** make it a generic SaaS dashboard: glass cards and gradients with nothing to say.
- **Don't** add a fourth ink tier, a second radius, or a length off the seven-step scale.
- **Don't** change a shadow on hover or focus, or draw a focus ring that grows the control's box.
- **Don't** print an absence as a bare dash, or a derived figure as if it were announced.
- **Don't** load a webfont, or loop an animation.
