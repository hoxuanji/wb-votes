# UI final audit — every visible element, and whether a reader needs it

**Date** 2026-08-13 · **Branch** `feat/mandate-registry-foundation` · the inventory the final product-design
pass is built from.

The question asked of every row is not "is this true?" — it is all true, and Phase 3 spent itself making it
true. The question is **who is it for**. An element that helps a developer, a data engineer or someone
validating the pipeline, and does not help a citizen, a journalist, an analyst, a student or an election
watcher, does not belong on a primary screen. It belongs one surface deeper.

## What the pages measure today

Rendered markup, counted rather than felt (`ops/probe/render`). "Words" is every word in the markup, which
includes the map's 46 SVG `<title>` hover cards — 701 of the front page's 1,930. Those are the map's accessible
name rather than visible clutter, so the visual-QA record measures **visible** words with the hover cards
stripped; the figures here are the raw ones the audit was written from.

| surface | words | sections | tables | rows | cells | "Measured" | "Derived" | coverage chips | prose caveats | evidence drawers | markup |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | **1,930** | 5 | 4 | 66 | 325 | **11** | **9** | **8** | 4 | 2 | 397 kB |
| `/pl/ka` | **4,311** | 3 | 3 | 117 | 492 | 3 | 0 | 0 | 1 | 2 | 372 kB |
| `/coverage` | 1,367 | 4 | 2 | 24 | 115 | 3 | 0 | 2 | 4 | 2 | 20 kB |
| `/p/<person>` | 584 | 4 | 3 | 10 | 39 | 4 | 0 | 0 | 1 | 7 | 11 kB |
| `/search?q=ram` | 490 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 3 | 0 | 8 kB |
| `/pl/<seat>` | 527 | 3 | 1 | 5 | 30 | 2 | 2 | 0 | 0 | 7 | 10 kB |

**Twenty provenance words on the landing page** — eleven "Measured", nine "Derived" — and eight coverage
chips, before a reader has learned a single thing about an election.

## Two defects the screenshots found before the inventory started

Recorded first because they are not matters of taste.

1. **The companion table beside both maps is invisible at desktop widths.** `.iei-map-split` is
   `minmax(0, auto) minmax(0, 1fr)`, and `.iei-map-col` takes its width from `--iei-map-w`, which
   `StateMap` computes as `calc(70vh * aspect)`. An `auto` track sized from a **viewport** unit resolves
   against whatever height the window has, so the map claims the whole row and the second column collapses
   to about 50px. At 1440×900 the national map's legend renders as `BJP 11 s` / `INC 5 st` / `AAAP 2 s`,
   clipped mid-word, and the 36-row "who governs" table — the only place the front page lists the country —
   **does not appear at all**. Karnataka's district tally is gone the same way.
2. **Two stroke widths are in user units and never scale.** A constituency separator of `0.4` and a hover
   stroke of `1.8` are ~1.8px and ~8px on a state frame, and ~25px and ~110px inside a framed district.
   The heavy black gridding over Karnataka's 224 polygons is this, not a design choice.

## `/` — India

| element | purpose | user value | keep / move / hide / delete | reason |
| --- | --- | --- | --- | --- |
| Wordmark | identity, link home | high | **keep** | |
| Search field + ⌘K | the whole navigation surface | high | **keep** | one field, five kinds. Already right. |
| Nav: `INDIA` | link to the page you are on | none | **delete** | the wordmark is that link |
| Nav: `COVERAGE` | dataset status | developer | **move** → footer | "Do not expose Coverage as a primary navigation item." It is infrastructure metadata, not a product feature. |
| Dateline: `36 of 36 states & UTs` | scope | low | **hide** → hero | one number, in the hero sentence, or nowhere |
| Dateline: `assembly seats 4,117 of 4,123` | registry reach | developer | **delete** | a row count. No reader asks how many rows are loaded. |
| Dateline: `Lok Sabha 543 of 543` | registry reach | developer | **delete** | as above |
| Dateline: `1,202 elections since 1961` | scope | low | **move** → hero sub-line | one useful fact out of five |
| Dateline: `computed 14:11 UTC` | freshness | developer | **delete** | the time a SQL query ran is not a fact about Indian politics |
| Dateline: `what is and is not loaded` | link to coverage | developer | **move** → footer | |
| Eyebrow `INDIA · CURRENT ELECTORAL LANDSCAPE` | orientation | medium | **keep**, reworded | `INDIA` over a real title |
| Headline `… 11 terms expire within a year on a five-year count — derived, not announced.` | computed answer | medium | **keep** the first clause, **move** the derivation | the second half is a methodology note inside the largest type on the page |
| Map panel title `India · Government` | which claim the colour makes | **high** | **keep** | the product's most load-bearing distinction |
| Map panel `MEASURED` | provenance class | developer | **delete** | "a database query produced a measurement" is not news |
| Map panel `ⓘ 1 source` | provenance | on demand | **keep** as the one drawer | |
| Layer strip (6 tabs) | mode switch | **high** | **keep** | explicit modes, never mixed semantics |
| The choropleth | the primary instrument | **high** | **keep**, redesigned | see the map section below |
| **726 district hairlines at national zoom** | administrative texture | **negative** | **delete** | "At national zoom: DO NOT show 700+ district boundaries aggressively." 60 kB of path data whose only effect is visual interference. Districts return at state zoom. |
| Direct party labels on polygons | colour is never the only channel | **high** | **keep** | the accessibility argument is real and the map is unreadable without them |
| Map figcaption: `Boundaries: 2011 census districts …` | epoch disclosure | low | **shorten** | one clause survives; the district disclaimer goes with the district lines |
| Map figcaption: `District outlines are neutral: the fill is a state's government, which is not a claim about any district in it.` | disclaimer | medium | **delete** | it disclaims a layer that no longer exists here |
| Tile row of 8 `AN not held` chips | jurisdictions too small to click | medium | **keep** | they are genuinely unreachable on the map |
| Contextual legend with counts | key + filter | **high** | **keep** | |
| `+ 13 more, one state each` disclosure | folded tail | medium | **keep** | |
| 36-row companion table (State / Year / Leading party / Seats / of) | who governs where | **high** | **keep**, redesigned as a list | currently invisible (defect 1). Five columns for three facts. |
| `NEXT` panel `DERIVED` chip in the header | provenance class | developer | **delete** | |
| `NEXT` panel 3-sentence caveat (`No date on this list was announced by anyone …`) | methodology | developer | **delete** | replaced by the word `Expected` on the row and an ⓘ |
| `NEXT` table `BASIS` column — 8 identical `DERIVED` badges | provenance per row | developer | **delete** | a column that says one thing eight times, in the loudest colour on the page |
| `NEXT` overdue note (`8 more terms ended before 2026 …`) | data-stop disclosure | developer | **move** → coverage | "That is a statement about where our data stops" — by its own words, not a product fact |
| `JUST DECIDED` `MEASURED` | provenance class | developer | **delete** | |
| `JUST DECIDED` `COVERAGE` column (8 chips) | dataset status | developer | **delete** | one subtle marker only where a result is genuinely incomplete |
| `JUST DECIDED` rows | recent results | **high** | **keep**, as cards with a runner-up | the brief's shape: `2024 · LOK SABHA · BJP 240 · INC 99` |
| `PARTY LANDSCAPE` `MEASURED` | provenance class | developer | **delete** | |
| `PARTY LANDSCAPE` 7-column table | party standing | medium | **keep** the facts, **delete** the table | rank + colour + seats + assemblies + trend as a list; share and change move to the row's second line |
| `PARTY LANDSCAPE` caveat (`… those elections span 2014–2026 …`) | genuinely changes meaning | **high** | **keep**, one sentence | this one is load-bearing: it is not a national vote at one moment |
| `WHAT TO WATCH` `MEASURED` × 9 | provenance class | developer | **delete** | |
| `WHAT TO WATCH` disclaimer (`Nothing here is a prediction … No model, no forecast, no probability.`) | the product's own line | **high** | **keep**, shortened | this is a promise to the reader, not an explanation of the software |
| `WHAT TO WATCH` 9 rows | signals | medium | **cut to 4** | nine rows found five ways is a dataset, not a signal |
| `WHAT TO WATCH` `rule · threshold` mono line × 9 | the rule you argue with | researcher | **hide** → the row's ⓘ | the threshold stays arguable; it stops being the loudest line in the row |
| **Closest contests** | absent | **high** | **add** | the brief asks for it by name and it is the most navigable thing the registry holds: 5 rows, each a seat page. `closeFights()` already exists and is already imported into `home.ts` unused. |
| Footer manifesto (`… every figure carries its source, its derivation and its uncertainty …`) | positioning | low | **shorten** | a claim about the software, in the last thing a reader reads |

## `/pl/<state>` — a state

| element | purpose | user value | verdict | reason |
| --- | --- | --- | --- | --- |
| Breadcrumb | walk back up | high | **keep** | |
| Eyebrow `STATE OR UNION TERRITORY` | orientation | low | **keep** | one word of orientation is cheap |
| Title `Karnataka` | identity | **high** | **keep**, larger | 25px for a page title is not a hierarchy |
| Sub-line `Karnataka has 224 assembly seats across 30 districts; INC won 135 of them in 2023.` | the answer | **high** | **promote** | this is the five-second fact and it is set at 13px under the title. It becomes a result strip: `INC · 135 of 224 · 2023 Assembly`. |
| **Who governs, how strongly** | — | **high** | **add** | the brief's five-second target. Every figure already loaded. |
| Map panel title `Karnataka · Assembly winners · 2023` | which claim | **high** | **keep** | |
| `MEASURED` × 3 | provenance class | developer | **delete** | |
| `ⓘ 2 sources` × 3 | provenance | on demand | **keep** one per module | |
| Election selector: 12 tabs (`LS2024 2023 LS2021 BY 2021 BY …`) | change the election | high | **keep**, relabelled | `LS2021 BY` is not a word. Assembly years read as years; by-elections and Lok Sabha are named. |
| The constituency map | primary instrument | **high** | **keep**, redesigned | heavy black gridding is defect 2 |
| No party labels at state level | — | — | **add where they fit** | a 224-polygon map with no labels is a colour-matching exercise |
| Map figcaption `224 of 224 constituencies drawn, on the delim-2008 boundaries these results were recorded under.` | epoch honesty | medium | **keep** when short of full, **hide** when complete | "224 of 224" tells a reader nothing; "263 of 294" tells them something |
| Legend with counts | key + filter | **high** | **keep**, promoted to a winners list | this is the `WINNERS BJP 66 / INC 135 / JD(S) 19` module the brief asks for |
| District tally table (30 rows × 3) | where the seats are | medium | **keep**, capped | currently invisible (defect 1); shown in full it is a wall |
| `DISTRICTS` panel — a second 30-row table with 4 columns | the same districts again | **low** | **delete** | the map's companion tally is the same 30 districts with the same links. One fact, one home. |
| **Key shifts** | — | **high** | **add** | "3–5 important observations". Composed from `seatsWonBy` + `previousElection`, both of which exist. |
| `ELECTIONS ON RECORD` note (`Coverage here is honest by construction … Bihar held one election in February 2005 …`) | methodology | developer | **delete** | |
| `ELECTIONS ON RECORD` 17-row table | history | medium | **keep**, as a compact timeline, assemblies first | 17 rows of which 12 are single-seat by-elections, ranked equally with a general election |
| Footer (`This level has a list, not an analysis: the measures behind the Analysis floor …`) | explains the software | developer | **delete** | |

## `/pl/<seat>`, `/p/<person>`, `/search`, `/coverage`

| element | verdict | reason |
| --- | --- | --- |
| Seat page: `MEASURED` × 2, `DERIVED` × 2 | **delete** the panel chips; **keep** `Derived` on a flagged inference | a flag *is* an inference and saying so changes its meaning |
| Seat page: **seven evidence drawers** — one per metric tile, plus one per panel | **collapse to one per module** | all six tiles carry a source, so six ⓘ render beside each other over the same handful of sources. That is the repeated source indicator the brief names. |
| Person page: the same seven, and 4 `MEASURED` | same | |
| Person page: `Career`, `Affidavit trail` | **keep** | genuinely tabular comparison |
| `/search`: 3 prose notes about transliteration and paging | **cut to one** | the footer paragraph about "the registry stores no Indic name strings" is an implementation note |
| `/search`: empty-state "what is searchable" list | **keep** | this is teaching, not explaining the backend |
| `/coverage`: everything | **keep** as-is | this is the deep surface. Coverage, gaps, anomalies, the eighteen verticals, per-election completeness — all of it is correct here and nowhere else. It is renamed **Data** in the footer link, and it keeps `/coverage` as its route so `/coverage?election=ls-2024` still resolves. |
| `/review/merges` | **keep**, unlinked | an internal maintainer's queue. Already mounts the product shell; `review.css` holds only the classes for judging a pair. Nothing in the chrome links to it. |

## The design system

One stylesheet already, and the token discipline is enforced by a test. What is wrong is the **scale**, not
the system.

| | now | verdict |
| --- | --- | --- |
| Type sizes | 9.5 / 11 / 12 / 13 / 14 / 19 / 25 | **raise**. A page title at 25px and a section heading at 11px is not a hierarchy — "too much information has the same visual weight" is measurably true: body 13, table 12, title 14. |
| Section headings | mono, uppercase, 11px, 0.14em tracking | **change to sans, 15px, sentence case**. "Too many uppercase labels, too many monospace labels." |
| Everything numeric is mono tabular | | **keep** — this is what lets a table run small and stay readable |
| Monochrome chrome, hue only on data | | **keep** — it is why the map has the only colour channel it needs |
| Spacing 4·8·12·16·24·32·48 | | **keep** |
| Radius 2px, no shadows, no gradients | | **keep** |
| Focus is a 2px underline, never a ring | | **keep** |

## What this audit does not propose

* No new route, no new tab, no new dashboard, no new card type. The answer to clutter is deletion.
* No change to the registry, the schema, the ingestion or the party-identity system. Phase 3 froze those and
  nothing here is a correctness defect in them.
* No removal of provenance from the **data model**. Every source, hash, licence and retrieval date stays
  exactly where it is; what changes is how loudly it is printed.
