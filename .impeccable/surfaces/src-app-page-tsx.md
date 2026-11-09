---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: []
---

# Surface brief: the front page (`/`)

Scope and mode: the front page and the shared chrome it sits in (top bar, rail, section cards, stat cards, tabs). Mode: Operate.

Audience, job, task: journalists and researchers first, then analysts and ordinary voters. Within five seconds, state how much of India the registry holds and who leads where; reach a state's result and its source in one click. Constraints are PRODUCT.md's: nothing predicted, absences said in words, at most three evidence drawers, the Floor Rule contrast tests, no webfont.

Redesign scope decision (the agent's, not asked: the user said to skip the questions): the Situation Room world in DESIGN.md is kept, because nothing the user said rejects it. What is replaced is the composition of the page and the chrome's use of hue. The earlier user decision stands: one page hue for the sections, no rainbow hairline.

## Direction contract

THESIS: The front page is a workbench, not a stack of documents. The map is the work area, one status line says how much of India is loaded, and a side panel answers for the selected state. It refuses the category arrangement of a hero with three metric cards over seven equal panels, and it refuses a topic title.

OWN-WORLD: Night Desk, a blue-violet black, with three reading inks, the system sans for sentences and tabular mono for numbers, and an 8px corner. The chrome is neutral: greys on the night surfaces, hairlines, no gradient text, no eyebrow chip. One page hue (indigo here) marks the current rail place, the heading marker and the selected edge. Every other hue is data: party inks and the margin ramp.

STORY: The reader learns from the title what the registry holds, sees on the status line how much of the country that is, picks a state on the map or in the list, and reads its result with its source without leaving the screen. Below, in one grammar: what comes next, how the map changed, what was decided, who holds what.

FIRST VIEWPORT: At 1440 by 900, rail 72px, then the answer sentence as the page title (sentence size, two lines at most, no eyebrow), a single quiet line under it, a status strip of three measures in one row, and the workbench card from about y=300: a toolbar (title, question, layer tabs, sources), the map at left, the inspector at right (selected state, legend, rows, states not loaded). The map is on the first screen at 1440 and 1280.

FORM: Workbench, position 5 of my ranked list of seven (answer-first brief, command-first, three-pane control room, register-first, workbench, timeline-first, feed-first). The roll dealt 5, 4 and 1; the roll ran degraded (no challengers, roll service unreachable from the sandbox) and the list was written after the deal printed. Alternates not built: register-first (4) and answer-first brief (1). seed:84623ee00b110e5c

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
