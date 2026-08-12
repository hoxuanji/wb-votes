# Phase 2.5 — consolidation audit

What is in the repository, what competes with what, and what happens to each thing. Written before any
code moved, from an import closure over `src/` rather than from filenames.

## How this was measured

`src/app/**/{page,layout,route,not-found}.tsx` are the entry points. Every `from '…'` and
`import('…')` was resolved against `@/*` → `src/*` and against relative paths, transitively, twice: once
from the routes outside `src/app/(legacy)/`, once from the routes inside it. A file in the second closure
and not the first is reachable **only** from the old dashboard. A file in neither is reachable from
nothing.

The homepage baseline was measured by rendering `/` through `ops/probe/render` and counting the markup:

| | before |
|---|---|
| `<section>` | 9 |
| tables | 7 |
| table rows | 141 |
| table cells | 726 |
| metric tiles | 12 |
| prose notes / caveats | 11 |
| visible words | 3,868 |

## The four design systems

This is the single largest defect, and it is not a styling complaint: four vocabularies mean four spacing
scales, four table treatments and four navigation models, and a component written for one is unusable in
the next.

| system | stylesheet | class prefix | routes |
|---|---|---|---|
| IEI | `src/app/iei.css` (1,439 lines) | `.iei-*` | `/` only |
| MANDATE | `src/app/p/mandate.css` + `src/app/pl/place.css` | `.mandate`, `.wrap`, `.tiles`, `.crumbs` | `/p/*`, `/pl/*` |
| Situation | `src/app/situation.css` (+ `coverage.css`, `map.css`, `review.css`) | `.sr-*`, `.cv-*`, `.mp-*` | `/coverage`, `/search`, `/map`, `/review/merges` |
| Tailwind | `src/app/globals.css` + `tailwind.config.ts` | utility classes | `(legacy)` group |

Three of them declare their own near-identical dark palette. `--canvas: #0c0a11` (MANDATE) and
`--iei-bg: #07070b` (IEI) are the same intent, two hexes apart, and the root `<body>` hard-codes a third
copy of the first one as an inline style.

**Resolution.** IEI is the survivor: it is the only one with a stated position (monochrome chrome, hue
reserved for data), the only one whose contrast floors are measured by a test (`viz/iei.test.ts`), and the
only one carrying the primitives the brief asks for. It gains a spacing scale and absorbs the others.

## Three navigation models

* `/` — `Shell`: wordmark, search field, state `<select>`, election `<select>`, six section anchors.
* `/coverage`, `/search`, `/map` — a hand-rolled `.sr-nav` listing `MANDATE · Map · Places · People ·
  Coverage · WB Votes`, different per page, pointing at `/pl/wb` as "Places" and at `/classic`.
* `(legacy)` — `Header` + `BottomNav` + `Disclaimer` + `Footer`, a phone-first civic app.

`/pl/*` and `/p/*` have **no** navigation at all — no wordmark, no way back to India, only breadcrumbs
within one state.

**Resolution.** `Shell` everywhere, one set of destinations, no per-page nav.

## Three search fields

| where | scope | mechanism |
|---|---|---|
| `Shell` header input | people | GET `/search?q=` |
| `/search` page's own form | people | GET `/search?q=` — the same field, twice on one page |
| `Shell` state `<select>` | states | GET `/pl?to=` |
| `Shell` election `<select>` | elections | GET `/?election=` |
| `components/GlobalSearch.tsx` | people, client palette | `fetch('/api/candidates')` |

**Resolution.** One command bar over one grouped result surface: states, elections, constituencies,
people, parties. The two `<select>`s go away — a picker that can only reach one entity kind is a search
field that lies about its scope.

## Duplicate implementations

| # | thing | copies | keep |
|---|---|---|---|
| 1 | India map | `src/components/iei/IndiaMap.tsx`, `src/app/india-map.tsx` | the first; the second is imported by nothing |
| 2 | "who governs each state" table | homepage `#map` companion table, homepage `#states` panel | one |
| 3 | choropleth page | `/` (India, 36 shapes), `/map` (West Bengal, 294 shapes) | `/`; `/map` is a state-level view stranded at the root |
| 4 | evidence disclosure | `iei/parts.tsx#Evidence`, `pl/[...path]/parts.tsx#Sources` + `Cite` + `Confidence` | `Evidence` |
| 5 | provenance banner | `Confidence` (a paragraph, above the numbers) and `BasisChip` (a word, beside them) | `BasisChip` |
| 6 | absent-value marker | `Value`'s `absent`, `NotReported`, `.sr-na`, `.na` | `Value` |
| 7 | registry-unavailable page | `page.tsx`, `pl/parts.tsx#Unavailable`, `/map`, `/search`, `/coverage` — five wordings | one |
| 8 | table primitive | `.iei-t`, `.panel > table`, `.sr-table`, `.cv-*` — 6px / 8px / 10px / 12px padding | `.iei-t` |
| 9 | build signpost | `/mandate`, `/pl` (index) | neither: both exist because nothing linked to the new surfaces, and now the shell does |

## The old dashboard

12 routes under `src/app/(legacy)/`, and **84 source files reachable from nothing else**: 41 components,
10 `src/data` modules, 5 lib/hooks, plus the `(legacy)` tree itself. `/classic` is the old West Bengal
civic dashboard; `/assembly`, `/results`, `/explore`, `/compare`, `/find-rep`, `/cabinet`, `/funds`,
`/quiz`, `/live`, `/methodology` are its tools.

It is already unreachable. Nothing in the shell links to it; the only inbound links are the two
hand-rolled navs on `/map` and `/search`, which are themselves being deleted. `/candidate/[id]`,
`/constituency/[id]`, `/mla/[id]` and `/candidates` are 14–29 line permanent redirects into the new
surfaces — those stay, because they keep old URLs alive and cost nothing.

The generalized implementation already covers the core: `/pl/wb` is the same code path as `/pl/ka` and
`/pl/up`, and `/pl/wb/cooch-behar/mekliganj` is the same code path as any other seat. So the question the
brief asks — replaceable, temporarily required, or genuinely unique — resolves as:

* **replaceable, and replaced**: `/classic`, `/assembly`, `/results`, `/explore`, `/compare`, `/find-rep`
  → `/`, `/pl/*`, `/p/*`, `/search`.
* **genuinely unique, and out of scope**: `/quiz` (a policy quiz), `/funds` (party finance), `/cabinet`
  (a WB cabinet list), `/live` (a counting-day view over a Redis store), `/methodology`. None is part of
  India Election Intelligence, none has a national data model behind it, and each is one state's
  hand-maintained JSON. They are removed rather than ported. `docs/product/removed-features.md` records
  what they were, so the decision is retrievable rather than lost.

**Resolution.** The whole `(legacy)` group and its 84-file closure are deleted, with the 13 API routes
that served them and the Tailwind config that only they used.

## Classification

**KEEP** — `src/app/page.tsx`, `src/components/iei/*`, `src/app/pl/[...path]/*`, `src/app/p/[person]/*`,
`src/app/coverage/*`, `src/app/v1/*`, `src/app/candidate|constituency|mla|candidates` redirects,
`packages/mandate/**`.

**REFACTOR** — `iei.css` gains a spacing scale and absorbs `mandate.css`, `place.css`, `situation.css`,
`coverage.css`. `/pl/*`, `/p/*`, `/coverage`, `/search` gain `Shell` and lose their own navs.

**MERGE** — homepage `#states` into the map's companion table. `Sources`/`Cite`/`Confidence` into
`Evidence`. `/search` into one grouped command surface.

**REPLACE** — the two header `<select>`s with the command bar.

**DELETE** — `src/app/(legacy)/**` (12 routes), the 84 files reachable only from it, `src/app/api/**` (13
routes), `src/app/india-map.tsx`, `src/app/map/*`, `src/app/mandate/page.tsx`, `src/app/pl/page.tsx`'s
index body, `src/app/situation.css`, `src/app/p/mandate.css`, `src/app/pl/place.css`,
`src/app/coverage/coverage.css`, `src/app/globals.css`, `tailwind.config.ts`, `postcss.config.mjs`, and
the 9 files reachable from no route at all.

**LEGACY (isolated, documented)** — `src/app/review/merges/*`: an internal entity-resolution review queue
with a mutating POST. Not a product surface, not linked from the shell, and the merge queue is real work
that has nowhere else to live. It keeps its own stylesheet and is named here so its exemption is
deliberate.

## Homepage: what each section is for, and what happens to it

| section | user decision it supports | verdict |
|---|---|---|
| Record strip | "is this current, and how much is loaded?" | keep, thinned — it is the dateline |
| Hero sentence | "what is happening across India?" | keep |
| Hero 6 metrics | — every one of the six is printed again in the record strip or in a section below | **remove** |
| Hero sub-paragraph | — the same sentence is in the footer | **remove** |
| Map + layers + legend | "where do I go, and who holds it?" | keep, dominant |
| Map companion table | "which state, exactly?" | keep — this is "who governs" |
| `#states` "Who governs" | — same 36 rows, same columns, same links as the map's table | **remove** |
| Upcoming | "what election is coming next?" | keep |
| Recently held | "what just happened?" | keep |
| Party landscape | "where does each party hold power?" | keep, columns trimmed |
| Close fights | "where was it closest?" — Watch's knife-edge rule answers this at the same threshold | **remove**, one level deeper |
| Watch | "which signals stand out?" | keep, minus the term-expiry rule, which *is* Upcoming |
| Historical elections | 180 cells of "the last five elections in each state" — every one of them is on that state's page | **remove**, one level deeper |
| Data coverage | "how much of one election do we hold?" — `/coverage` is a page for exactly this, and this panel is the only reason the election `<select>` exists | **remove** |
| Footer | — | keep, thinned |

## Not touched

No data-model change. No change to electoral geography identity, election identity, source provenance,
result semantics or boundary epochs. No new ingestion. The classified `searchPersons` ranking failure in
`packages/mandate/src/repo/person.test.ts:162` stays failing and stays classified.
