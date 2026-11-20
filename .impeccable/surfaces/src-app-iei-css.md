---
version: 1
slug: "src-app-iei-css"
primary_target: "src/app/iei.css"
related_targets: []
---

# Surface brief: the product shell and every page's chrome (`src/app/iei.css`)

Scope and mode: the whole product's shared look (top bar, rail, section cards, stat cards, tabs, tables, forms, controls) in BOTH themes. Mode: Operate.

Audience, job, task: PRODUCT.md's. A correspondent, an analyst and a voter on a phone read the same record; the tool must feel current, fast and legible, and adapt to the screen it is on.

Scope decision (user's, asked): the owner finds the Night Desk instrument-room look horrendous, with no adaptability or dynamism, and chose the direction "Adaptive tool UI". This REPLACES the visual world in DESIGN.md (the documenter rewrites it at finish). Kept: PRODUCT.md, every content and provenance rule, the party-colour and contrast rules, the light/dark `light-dark()` token system and the ThemeToggle.

## Direction contract

THESIS: A modern, adaptive product shell: sans-only, sentence case, soft rounded cards, one accent, and motion that carries state. It refuses the instrument-room costume (uppercase tracked mono labels everywhere, hairline boxes, a different hue per page, a static page).

OWN-WORLD: The neutral surface and ink hexes stay exactly as they are (iei.test.ts, party-ink.test.ts and the TypeScript copies hold them), so the new character comes from type, shape, elevation, accent and motion. Type: the system sans for everything, numerals tabular via font-variant-numeric (no mono for labels or figures; mono survives only for code-like ids if any); labels are sentence case, 12-13px, 600, no tracking. Shape: two radii, 12px for cards and panels, 8px for controls, chips and inputs. Elevation: light theme cards sit on the tinted canvas with a soft two-layer shadow and no border; dark theme cards get a 1px low-contrast ring and a faint shadow. Accent: ONE accent hue for the whole product (the indigo token, per theme), used for the current rail place, the selected tab, primary and hover states, links, focus and the section marker; never on a data mark; the per-page hue cycle is removed.

STORY: A reader lands, sees the same answer-first page in a calmer, friendlier shell, taps a tab or a state and feels the page respond, moves between pages without the chrome flashing, and gets the same product on a phone as a bottom-nav app and on a laptop as a rail workbench.

FIRST VIEWPORT: Composition of the front page is unchanged (answer title, status strip, workbench with map and inspector). What changes: the rail is a rounded pill-highlighted navigation, tabs are a segmented control with a filled accent selection, cards are 12px, labels are sentence case, headings are tighter and heavier. At 640px and below the rail becomes a fixed bottom tab bar (safe-area aware) and the top bar is one row.

SIGNATURE: (1) Cross-document view transitions: the top bar and rail keep their identity across navigation (view-transition-name) while the page content cross-fades, inside prefers-reduced-motion: no-preference. (2) Press and hover feedback on every control (a 120ms ease, a 1px press), and a staggered fade-up of a page's first sections on load, once. ADAPTIVITY: fluid type for the answer, lead and title via clamp(); a fluid gutter; container queries on the status strip, stat cards and workbench so a component adapts to the width of its own column, not only the window; the two themes follow the system.

FORM: Operate, the product's own shell; direction pinned by the owner so no roll was run. seed: none (unavailable)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
