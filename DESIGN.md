---
name: India Election Intelligence
description: A canonical registry of Indian elections in which every figure carries its source, how it was derived, and what is missing, set as an adaptive, sans-only tool with one accent and two themes.
colors:
  canvas-light: "#eef0f6"
  panel-light: "#f8f9fc"
  raised-light: "#ffffff"
  line-light: "#dcdfea"
  line-strong-light: "#c3c7d6"
  ink-light: "#12131c"
  ink-2-light: "#454859"
  ink-3-light: "#585b70"
  void-light: "#dfe3f2"
  canvas-dark: "#07070b"
  panel-dark: "#0d0d13"
  raised-dark: "#14141c"
  line-dark: "#1e1e28"
  line-strong-dark: "#2a2a38"
  ink-dark: "#f2f2f7"
  ink-2-dark: "#a3a3b3"
  ink-3-dark: "#8b8ba2"
  void-dark: "#1c203b"
  accent-light: "#4350d6"
  on-accent-light: "#ffffff"
  accent-dark: "#8b9bff"
  on-accent-dark: "#07070b"
  good-light: "#0b6b3f"
  warn-light: "#7a4f00"
  alert-light: "#a8341c"
  good-dark: "#7fd4a8"
  warn-dark: "#e0b458"
  alert-dark: "#e8927c"
  series-vermilion: "#d05320"
  series-blue: "#6fa4fc"
  series-rose: "#e1a6a2"
  series-fold-dark: "#7b7490"
  series-fold-light: "#828094"
typography:
  answer:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "clamp(32px, 1.25rem + 3.2vw, 56px)"
    fontWeight: 650
    lineHeight: 1.15
    letterSpacing: "-0.025em"
    fontFeature: "tnum"
  lead:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "clamp(22px, 1rem + 1vw, 30px)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.03em"
    fontFeature: "tnum"
  title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "clamp(18px, 1rem + 0.35vw, 22px)"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "-0.01em"
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "clamp(15px, 0.9rem + 0.15vw, 16px)"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0em"
    fontFeature: "tnum"
  data:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0em"
    fontFeature: "tnum"
  meta:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0em"
  label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0em"
  inspector-value:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.3
    fontFeature: "tnum"
rounded:
  card: "12px"
  control: "8px"
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
    backgroundColor: "{colors.panel-light}"
    textColor: "{colors.ink-light}"
    rounded: "{rounded.card}"
    padding: "24px"
  segment:
    textColor: "{colors.ink-2-light}"
    typography: "{typography.meta}"
    rounded: "{rounded.control}"
    padding: "4px 12px"
  segment-selected:
    backgroundColor: "{colors.accent-light}"
    textColor: "{colors.on-accent-light}"
    typography: "{typography.meta}"
    rounded: "{rounded.control}"
    padding: "4px 12px"
  button-primary:
    backgroundColor: "{colors.accent-light}"
    textColor: "{colors.on-accent-light}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "8px"
  rail-item:
    textColor: "{colors.ink-2-light}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "8px 4px"
    width: "72px"
  command-bar:
    textColor: "{colors.ink-light}"
    rounded: "{rounded.control}"
    height: "32px"
  provenance-marker:
    textColor: "{colors.ink-3-light}"
    typography: "{typography.label}"
---

# Design System: India Election Intelligence

## Overview

**Creative North Star: "The Adaptive Workbench"**

The product is a tool for looking at elections, and it now behaves like a modern tool rather than an instrument room: one sans voice, sentence-case labels, soft rounded cards, a single accent, two themes that follow the reader's system, and a shell that rearranges itself to the screen (a labelled sidebar on a wide laptop, an icon rail on a laptop, a bottom tab bar on a phone). The data is still the loudest thing on a screen, because a party's own colour is never the product's. This file replaces the earlier dark-only "Night Desk / Situation Room" world; its neutral hexes, contrast floors, party-colour rules and provenance rules carry over unchanged, and its mono labels, six-hue wayfinding and bounded glows do not.

The voice is forensic, calm and civic. Forensic, because every figure carries its source, how it was derived and what is missing, and the surface says so in words: an absence is a phrase, never a bare dash. Calm, because the chrome is neutral and rounded and moves only to carry state. Civic, because it takes no side: nothing here recommends, ranks or editorialises, and the one accent is used for wayfinding and affordance, never for a mark that means something about an election.

**Key Characteristics:**
- Two themes from one token block: `light-dark()` values, `color-scheme: light dark` (the system's choice) and an `<html data-theme>` override the reader sets with a System / Light / Dark toggle, applied by a script in the head before first paint.
- One voice: the system sans for everything, numerals tabular. Monospace survives only for real code.
- One accent (indigo, per theme). No page has its own hue.
- Two radii (12px, 8px) and seven spacing steps.
- Depth differs by theme: a soft two-layer shadow in light, a 1px low-alpha ring and a faint shadow in dark.
- Adaptive by construction: fluid type and gutter, a three-form navigation, a status strip and workbench that reflow at 900, 1080 and 640px.
- Motion carries state or does not exist, and sits entirely inside `prefers-reduced-motion: no-preference`.

## Colors

A cool-tinted canvas with three reading inks, one indigo accent, three meaning inks, and the parties' own colours, which belong to the data. Every token is declared once as `light-dark(LIGHT, DARK)`; the frontmatter lists both halves.

### Primary
- **Accent Indigo** (light #4350d6, dark #8b9bff; `--iei-a-indigo`, read through `--accent`): the current rail place, the selected segment, links, the focus outline, primary buttons, and the dot before a section heading. The same on every page. Never the fill or stroke of a data mark.
- **On-Accent Ink** (light #ffffff, dark #07070b): text on a filled accent. 6.26:1 on #4350d6 and 7.88:1 on #8b9bff.

### Neutral
- **Canvas** (light #eef0f6, dark #07070b): the page, the tinted ground cards sit on.
- **Panel** (light #f8f9fc, dark #0d0d13): a card, the workbench, the evidence drawer, and the top bar and bottom bar at 84% and 92% over a blur.
- **Raised** (light #ffffff, dark #14141c): the lifted surface inside a card.
- **Line** (light #dcdfea, dark #1e1e28) and **Line Strong** (light #c3c7d6, dark #2a2a38): rules, the dashed edge of an unavailable segment, scrollbar thumb.
- **Ink** (light #12131c, dark #f2f2f7): values and headings. **Ink 2** (light #454859, dark #a3a3b3): prose, sub-lines, notes. **Ink 3** (light #585b70, dark #8b8ba2): every label, table header, caption, placeholder and metadata line, the tier with the least headroom.
- **Void** (light #dfe3f2, dark #1c203b): the ink of a seat or district with no data, deliberately below the 3:1 mark floor because an unlit polygon is the absence of a mark.
- **Tint** (4.5% ink in light, 4% white in dark) and **Tint 2** (7.5% and 7%): the quiet fill of a segment track, a tile, a note, a hover; derived tokens, not new inks.
- **Accent wash** (12% accent in oklab): the current rail pill. Rail text on its wash is 6.82:1 dark, 6.45:1 on the other dark surface, and 4.64:1 and 5.00:1 in light.

### Tertiary (meaning only)
- **Good** (light #0b6b3f, dark #7fd4a8): a figure that went up, a good state.
- **Warn** (light #7a4f00, dark #e0b458): a derived value, a warning: "this number was computed, not announced".
- **Alert** (light #a8341c, dark #e8927c): a figure that went down, an alert, the live indicator.

### Data inks
- **Party ink.** A party has one colour, everywhere; rank, seat count, page and neighbour never change it. About sixty are curated in OKLCH in `data/party-ink.json`; every other party gets a quieter hashed colour, so "this party's colour is not recorded here" is itself visible. Each has a light and a dark half (the same hue and chroma, lightness moved): light fills clear 3:1 on all three light surfaces (the minimum measured is 3.06:1) and text on a fill clears 4.5:1 (minimum 4.52:1). A party mark also carries its abbreviation, and the legend names every party it shows.
- **Series inks** (dark #d05320, #6fa4fc, #e1a6a2; light #cc6004, #385db8, #784756; the fold grey #7b7490 dark, #828094 light): for chart series that are not parties. Three are handed out, the rest fold to the grey, and every line is named at its end. `palette.ts` holds five more slots; the test gate, not this file, says which are in use.
- **Diverging** (up/down/zero): the Good and Alert inks and the fold grey.

### Named Rules
**The Data Hue Rule.** A hue on a data mark means what the data says, and nothing else. A party's colour is the party's, a ramp is a magnitude, a semantic ink is its meaning. The accent is not on this list, and `iei.test.ts` refuses a rule that paints a seat, bar, ribbon, dot or swatch with it.

**The One Accent Rule.** There is one accent hue per theme and it is the same on every page. It says where you are and what you can press, never what a mark is.

**The Floor Rule.** Every ink clears 4.5:1 as text on all three surfaces, and every mark clears 3:1, in both themes. `iei.test.ts` parses both halves of the token block and holds the neutral hexes: do not change one without running it.

**The Three-Ink Rule.** Three reading inks and no fourth. A tier nothing may legitimately use is a tier to delete.

## Typography

**Display, Body and Label Font:** the system UI sans (`ui-sans-serif`, then `system-ui` and the platform stack). No webfont is loaded.
**Code Font:** the system monospace, used only for real code such as a command to run. `--iei-mono` is kept as a name and resolves to the sans.

**Character:** One voice. Hierarchy comes from size, weight and tightening, not from changing face. Numerals are tabular wherever they appear (set once on the page wrapper), so columns line up without a second face.

### Hierarchy
- **Answer** (650, `clamp(32px, 1.25rem + 3.2vw, 56px)`, 1.15, -0.025em): the page's one large line, capped at 30ch and balanced.
- **Lead** (700, `clamp(22px, 1rem + 1vw, 30px)`, 1.15, -0.03em): a figure, a lead sentence, the name of the state the inspector shows.
- **Title** (600, `clamp(18px, 1rem + 0.35vw, 22px)`, -0.01em): a section heading, with an 8px accent dot before it; a state name in a list (700, -0.02em).
- **Body** (400, `clamp(15px, 0.9rem + 0.15vw, 16px)`, 1.5): prose. The scope statement under a title is body in Ink 2 at 64ch and line-height 1.6.
- **Data** (400, 14px): a table cell, a note, a caveat.
- **Meta** (600 as a label, 13px): a segment, a caption, a note under a value.
- **Label** (600, 12px, sentence case, no tracking): a column title, a rail word, a figure's name, an evidence summary.
- **Inspector value** (600, 20px, 1.3): the figure in an inspector row; see Components.

### Named Rules
**The One Voice Rule.** Sans for everything; tabular numerals for every figure. Never uppercase, never tracked, never monospace for a label, a figure or a tag.

**The Fluid Three Rule.** Answer, lead and title are `clamp()` between a phone's size and a laptop's, so they settle at every width instead of jumping at a breakpoint. Body is fluid within one pixel; data, meta and label are fixed.

## Layout

Content sits in a column of at most 1340px under a fluid gutter, `clamp(16px, 0.5rem + 2vw, 32px)`. The top bar is one row at every width (a 48px minimum: wordmark, the one command bar, then the theme button and the live indicator). Navigation takes three forms: a 72px icon rail beside the content from 641px; an 11.5rem labelled sidebar (icon beside word) from 1360px; and, at 640px and below, a fixed bottom tab bar with three 44px targets, safe-area aware, with the page padded so nothing hides under it. There are three places: Overview, People, Data.

Spacing is seven steps: 4, 8, 12, 16, 24, 32 and 48px, declared as tokens and used for every margin, padding and gap, with a 1px or 2px nudge beside a rule as the stated exception (the build also carries a few fixed sizes outside the scale: 6px bars, 44px touch targets, 20px for inspector values). Sections are stacked 24px apart; open sections are 32px apart. A table row is 8px by 12px; the 36-row jurisdiction lists use a 4px "tight" row so every state in India fits a screen.

The front page reads in one order: the answer as the title, one descriptor line, the status strip, the workbench, then open reference sections. The workbench is one card in three bands: a toolbar (heading, question, sources drawer), the segmented layer tabs, and the map beside its inspector with a rule between them. Under 900px the inspector drops below the map behind a top rule; at 640px the layer strip becomes one sideways-scrolling row. Heights that belong to a mark are pixels (map at most 620px, margin band 128px, seat flow 260px, arc 720px wide), never viewport units, so a map's width may depend on its shape and never on the window's height.

### Named Rules
**The Seven Steps Rule.** Every length is a token on the 4-8-12-16-24-32-48 scale. A rule that wants 18px has not decided whether it means 16 or 24. Where the build holds a value off the scale (above), it is carried drift, not a licence.

## Elevation & Depth

Depth is by theme, composed into two tokens from colour pieces because `light-dark()` takes colours only. A card is a card because of its surface and its edge, never because of what happened to it.

### Shadow Vocabulary
- **Card, light** (`--iei-elev`: `0 0 0 1px transparent, 0 1px 2px rgba(24,30,72,0.07), 0 8px 24px -8px rgba(24,30,72,0.1)`): a soft two-layer shadow on the tinted canvas, no border.
- **Card, dark** (the same token: `0 0 0 1px rgba(255,255,255,0.075), 0 1px 2px rgba(0,0,0,0.5), 0 8px 24px -8px rgba(0,0,0,0.3)`): a 1px low-alpha ring and a faint shadow.
- **Floating** (`--iei-elev-up`, with the same pieces and a deeper second layer): the evidence drawer.
- **Frost** (`rgba(248,249,252,0.84)` light, `rgba(13,13,19,0.84)` dark, with `blur(12px)` and a 1px foot): the top bar; the bottom tab bar is the same at 92%. On a phone both are opaque, so a line of content cannot show through the search field.

### Named Rules
**The Theme Elevation Rule.** Light separates by shadow and no border; dark separates by a ring and a faint shadow. Never a border in light, never a shadow alone in dark.

**The Quiet State Rule.** Hover and press change a fill or an ink, and press moves a control down 1px. They do not change a shadow.

## Shapes

Two radii. **12px** is a card, a panel, the workbench, the status strip and a segmented track. **8px** is a control, an input, a segment, a chip, a keyboard hint, a rail pill and the end of a bar. A dot is a circle (50%). Cards have no border (see Elevation); the one thick line is the 2px focus outline. Inside a map every stroke is a device measurement (`vector-effect: non-scaling-stroke`). Icons are one family: 24 units, stroke only, 1.5 wide, round caps and joins, in `currentColor`.

### Named Rules
**The Two Radii Rule.** 12px holds things, 8px is pressed. A third corner is a new decision, made once here.

## Components

Controls say what they are in plain sentence-case words, sit on soft 8px corners, and fill with the accent when chosen.

### Top bar and command bar
- **Top bar:** sticky, frosted, one row. Wordmark in the title size at weight 800, with a 13px quiet tag in Ink 3; the theme toggle (System / Light / Dark) and, only while an election is being counted, the live indicator in Alert at the right.
- **Command bar:** the product's only search field. A tinted field with no edge, 420px at most; hover deepens the tint, focus lifts it to the card colour and draws the accent outline round the whole joined group. A `<kbd>` hint goes away on a touch screen.

### Rail and bottom tab bar
- **Rail:** three places, each an icon (24px) over a 12px/600 word, Ink 2 at rest, Ink on a Tint 2 pill on hover. The **current place** is a pill in the accent wash with the accent as text and weight 700. From 1360px the pill is the width of an 11.5rem column with the icon beside the word.
- **Bottom bar (640px and below):** the same three links as 44px targets, fixed, opaque, with a 1px top foot and safe-area padding.
- **Persistence:** the top bar and the rail carry a `view-transition-name`, so they stay put while the page cross-fades.

### Segmented tabs
- **Track:** a Tint-filled 12px pill holding 8px segments (13px, 600, Ink 2, 4px by 12px). Standing alone, a segment carries its own tint.
- **Selected:** filled with the accent, text in On-Accent Ink. **Hover:** Ink on Tint 2. **Press:** 1px down. **Focus:** 2px accent outline with a 2px offset.
- **Unavailable:** Ink 3 over a dashed edge in Line Strong with a not-allowed cursor, and a screen-reader word. The strip says what is missing rather than offering a layer that would shade a country in a colour standing for nothing.

### Section cards and open sections
- **Card:** Panel, 12px, `--iei-elev`, 24px padding (16px on a phone), no border. A figure inside a card is a Tint tile, never a nested card.
- **Heading:** the title with an 8px accent dot before it. Inside a card it has no rule; in an open section it sits over a 1px Line rule.
- **Open section:** a heading and its rule, then content, with no box, fill or shadow, 32px apart. Used for reference that should not outweigh the work area above it. Its caveat is a note in Ink 2, not a callout.

### Workbench (signature)
- **Shape:** the front page's one card, Panel, 12px, no padding of its own, in three bands: toolbar at 12px by 24px, layer tabs at 24px margins, map and inspector at 24px each with a Line rule between them.
- **Inspector:** reads answer first. Rows are a Ink 3 label (13px) over a value (20px, 600, tabular), with a change note (13px, Ink 2) beneath. A state the registry holds one of, or the reader has chosen, is named at the lead size; states not loaded come last, in Ink 3 as names, in columns. A closing note sits behind a quiet top rule.
- **Phone:** the map is on the first screen; the inspector stacks under it.

### Scope statement and status strip
- **Descriptor line:** one line of body in Ink 2, 64ch, directly under the title, saying what the page covers. It replaces the kicker or eyebrow label that used to sit above the title. The title is the answer sentence.
- **Status strip:** a card of measures in a row, each a label, a figure at the lead size, and its denominator; at 1080px and below the label stacks over the figure; at 640px it becomes a ruled list.

### Schedule, tables and lists
- **Schedule (Next up):** a ruled list, one row per election, read down columns: date, name over its context, a term meter, context. Rows divided by a Line rule, a Tint 2 row on hover; at 900px and below the meter and context take their own lines.
- **Tables:** one treatment. Headers are 12px/600 sentence case in Ink 3 over a Line Strong rule; numbers are right-aligned and tabular, with the header aligned over them; a row header is a sans label; a row lights on hover. A denominator has its own left-aligned column.

### Buttons and links
- **Primary:** accent fill, On-Accent Ink, 8px corner, 600; hover mixes 14% of Ink into the accent; press 1px down. Used for submit actions (filters, the find control).
- **Links:** prose links are the accent with an underline; focus is the shared 2px accent outline with a 2px offset. Under forced colours the system outline takes over (CanvasText).

### Evidence drawer
A `details` disclosure: a 12px Ink 3 summary over a 2px Line Strong rule. Opened, in the workbench toolbar it is **floating**: absolutely positioned under the toolbar, Panel with the floating elevation, at most 70vh and 72ch, inside the window by its gutters. Elsewhere it opens inline on a Tint fill. Escape closes an open drawer and returns the keyboard to its summary.

### Provenance marker (signature)
A word with a rule under it that says what kind of number a figure is, and survives greyscale, forced colours and a screen reader. *Measured* is Ink 2 over a solid rule; *derived* is Warn over a Warn rule, because a computed term expiry printed like an announced date is the fabrication this product refuses; *reference* is a dashed rule; *absent* is a dotted one. An absence is words, never a dash.

### Maps and marks (signature)
A seat is a polygon or a square, and both read from one source so a colour means one thing in both. Party ink fills it; a seat with no data is Void. A party swatch always sits beside its label and never breaks across lines. A state with no result is named in Ink 2 where it fits, by two-letter code where only that fits, and not at all where neither does. On a phone the map's text is not drawn. The seat page's light along the top is the holding party's own ink, at 45% in light and full strength in dark, and exists on seat pages only.

### Motion
Motion carries state or does not exist. One easing (`cubic-bezier(0.2, 0.7, 0.2, 1)`) and three duration tokens (160ms for state, 360ms for entrances, 640ms available). Between pages, a cross-document view transition cross-fades the content in 160ms while the top bar and rail persist. On load the first five sections of a page rise 8px and fade in, once, 60ms apart. Data marks that are a quantity or a place (a bar from its baseline, a wedge, an outline round a seat) arrive with the same duration and curve and no delay; a keyframe names only its starting state, so a page at rest is exactly the page the screenshots judge. Nothing loops. Every animation, the view transition included, sits inside `prefers-reduced-motion: no-preference` (`motion.test.ts` holds this, the single entrance pattern and the tokens).

### Named Rules
**The Word Not Colour Rule.** Status is a word, a rule style or a shape, never a colour alone: a provenance marker, a party abbreviation beside a swatch, the current rail place (a pill, a weight and an accent), a dashed edge on an unavailable segment.

**The Once Rule.** An animation runs once and never loops. It exists only where the motion is the information or the state change.

## Do's and Don'ts

### Do:
- **Do** spend hue on data first: a party's own ink, a semantic ink for its meaning only, series inks for non-party lines.
- **Do** use the one accent for the current place, the selected segment, links, focus, primary buttons and the section dot, and nothing else.
- **Do** pair every colour mark with a word, an abbreviation or a shape.
- **Do** write labels in sentence case at 12-13px, weight 600, and set every figure in tabular numerals.
- **Do** declare a new colour once as `light-dark(LIGHT, DARK)` and run `iei.test.ts`, `party-ink.test.ts` and `palette.test.ts` after any change to a neutral, an accent or a party ink.
- **Do** say an absence in words ("not loaded", "not reported") at an ink that clears 4.5:1.
- **Do** keep every animation inside `prefers-reduced-motion: no-preference`.
- **Do** put a page's scope in the one-line descriptor under its title.

### Don't:
- **Don't** fill or stroke a seat, bar, ribbon, dot or legend swatch with the accent.
- **Don't** give a page its own hue, or cycle hues by section.
- **Don't** let a party's colour change with rank, count, page or neighbour.
- **Don't** set a label, figure or tag in uppercase, tracked or monospace type.
- **Don't** add a kicker or eyebrow above a title; the descriptor goes below it.
- **Don't** add a third radius, a fourth ink tier, or a border to a card in the light theme.
- **Don't** change a shadow on hover or press, or draw a focus ring that is not the 2px accent outline.
- **Don't** print an absence as a bare dash, or a derived figure as if it were announced.
- **Don't** load a webfont, or loop an animation.

### Not verified
This system was checked in one WebKit browser. Not checked: Safari and Firefox beyond that engine, real phones (the 390px and 320px views were emulated), screen readers, and keyboard focus rings seen in a browser (a CSS test covers that every control has one). `getAnimations()` under `prefers-reduced-motion: reduce` was not measured; the guarantee rests on the CSS structure and `motion.test.ts`.
