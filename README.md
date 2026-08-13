# India Election Intelligence

A registry of Indian elections in which every figure carries the source it came from, how it was derived,
and what is missing. Assembly and Lok Sabha results across 36 states and union territories, 1962 onward.

Nothing here is modelled, predicted or filled in. A figure no source published is rendered as the reason
there is no figure, never as a zero. A date nobody announced is marked **derived** wherever it appears.

## Surfaces

| route | what it answers |
| --- | --- |
| `/` | What is happening across India? A choropleth of 36 jurisdictions — coloured by **government**, which is not a claim about any district inside them — with six layers, a contextual legend, party isolation, and the page's primary navigation. |
| `/pl/<state>` | Who won each constituency, in which election? A map where the boundaries are held, a district tally everywhere. |
| `/pl/<state>/<district>` | Which seats does this district elect? |
| `/pl/<state>/<district>/<seat>` | Who has won this seat, and by how much? |
| `/pl/<...>/<seat>/analysis` | How did this seat get this way? Turnout against a baseline, swing, effective parties, seat-by-seat retention. |
| `/p/<person>` | One person's whole record, and what they declared. |
| `/search?q=` | One field over states, elections, constituencies, people and parties. |
| `/coverage` | What this platform holds and what it does not — counted at request time, per subject area and per election. |
| `/v1/entity/{person,place}/<slug>`, `/v1/search` | The same reads as JSON, with `sources[]`. |

`/candidate/<id>`, `/constituency/<id>`, `/mla/<id>` and `/candidates` are permanent redirects that resolve
old ids through `person_identifier` and the place tree.

## Running it

```bash
npm install
npm run registry:migrate     # create .data/registry.db
npm run registry:ingest      # load the committed sources
npm run registry:resolve     # entity resolution
npm run dev                  # http://localhost:3000
```

`.data/` is gitignored, so a fresh clone has no registry. Every page says so, with the command above, rather
than returning a 500.

## Layout

```text
src/app/                     one route per surface, and one stylesheet
  iei.css                    the design system: tokens, primitives, grid, breakpoints
src/components/iei/          Shell, IndiaMap, StateMap, and the primitives every page is built from
data/party-ink.json          party visual identity: curated hues as OKLCH, with their provenance
data/geo/india-states.json   state outlines and named district rings, with their hash and epoch
packages/mandate/            the registry: schema, migrations, ingestion, entity resolution, read layer
  src/repo/                  one module per surface's data contract — no SQL reaches a component
  src/semantic/              how a measure is defined and how it is written
  src/viz/                   server-rendered charts, and the palette
data/seed/                   the committed sources, with a hash and a retrieval date per file
docs/                        the model, the methodology, and the decisions
ops/probe/                   test scaffolding: render a route, and screenshot it
```

## Checks

```bash
npm test                     # 405 tests, including a real-registry smoke suite
npm run type-check           # tsc over the app
npm run registry:typecheck   # tsc over packages/mandate
npm run lint                 # next lint
npm run build                # production build
npm run registry:audit       # export round-trip and provenance report
```

One test fails and is classified: `searchPersons` ranking/order-independence, in
`packages/mandate/src/repo/person.test.ts`.

Three suites are worth knowing about, because between them they cover what `tsc` cannot see:

* `repo/smoke.test.ts` calls every read function against the real database with arguments discovered from
  it. `tsc` cannot see inside a SQL string, and `next build` renders no dynamic route.
* `repo/render.test.ts` renders the real routes and asserts the data rules on the markup: no fabricated
  figure, no derived date unlabelled, every link resolves, and the navigation graph walks India → state →
  district → seat → analysis → person in five jurisdictions.
* `viz/iei.test.ts` parses the stylesheet and computes contrast, so the accessibility claims are measured
  rather than asserted.

## Documentation

* `docs/model/` — electoral geography, election identity, delimitation
* `docs/geo/` — where the boundary data comes from, what it can and cannot draw, and the review queue of
  what the pipeline refused to attach
* `docs/release/` — the national coverage report, generated, and RC-1
* `docs/methodology/` — one card per measure: what it is, how it is computed, what it does not capture
* `docs/platform/00-model.md` — the eighteen subject areas, four of which hold data
* `docs/product/consolidation-audit.md` — the Phase 2.5 audit
* `docs/product/map-validation.md` — what geometry exists, at what epoch, and what that bounds
* `docs/product/evidence.md` — where provenance lives and where it does not, and the sweep that checked
* `docs/product/map-visual-qa.md` — the Phase 2.6 visual QA
* `docs/product/visual-qa.md` — what was rendered, at what sizes, and what the screenshots do not prove
* `docs/product/removed-features.md` — what the West Bengal dashboard was, and why each part is gone
* `docs/adr/` — the decisions

## Scope

This is not a campaign site and not a prediction engine. `/coverage` is the honest statement of what is
loaded: elections are one of eighteen subject areas in the model, and most of the others are specified and
unbuilt. Where a figure is a judgement rather than a measurement — whether a promise was kept, whether a
member performed — it is not published, and `/coverage` says why.
