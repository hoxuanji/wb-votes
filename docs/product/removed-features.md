# Removed in Phase 2.5, and why

Phase 2.5 deleted the West Bengal civic dashboard rather than porting it. This file records what each
route was, so the decision is retrievable instead of lost in a diff. Everything here is in git at
`c2c81c7` and earlier.

## Replaced by the generalized implementation

These asked a question the national surfaces already answer, for one state, with hand-maintained JSON
instead of the registry.

| route | was | now |
|---|---|---|
| `/classic` | West Bengal civic dashboard home — hero, tabbed panels, AC picker | `/` and `/pl/wb` |
| `/assembly` | directory of 294 sitting MLAs, party breakdown | `/pl/wb` (every seat, with its winner) |
| `/results` | 2026 results by constituency | `/pl/wb?election=…` |
| `/explore` | key faces, hard-fought seats, money in politics, party strength | `/pl/wb`, `/p/*`, and the Watch section on `/` |
| `/compare` | side-by-side candidate comparison | `/p/*` (two tabs) |
| `/find-rep` | "who is my MLA" by constituency | `/pl/wb/<district>/<seat>` |

The redirects at `/candidate/[id]`, `/constituency/[id]`, `/mla/[id]` and `/candidates` are kept: they
resolve old ids through `person_identifier` and the place tree, so inbound links still land somewhere
correct.

## Removed as out of scope

Each of these is a real feature. None of them is *this* product — India Election Intelligence is a
registry of elections in which every figure carries its source — and each was one state's hand-maintained
file with no national model behind it. Porting them would have meant inventing data for 35 more
jurisdictions.

| route | was | why it is not ported |
|---|---|---|
| `/quiz` | a policy quiz matching a reader's answers to party stances | `src/data/party-stances.ts` was written by hand for one state's parties; there is no source for it, and a "your party match" score is exactly the modelled number this registry refuses |
| `/funds` | MLALADS allocation for 294 constituencies | a real dataset, absent from the registry, and a different vertical (`docs/platform/00-model.md` lists it) |
| `/cabinet` | WB Council of Ministers, 2026 term, searchable | one state, one term, `data/seed/cabinet.json`, maintained by hand |
| `/live` | counting-day results over a Redis store, with a dev seed route | `election_phase` holds no rows and `election.lifecycle` is `declared` for all 1,202 elections, so it had nothing live to show; the shell's live indicator is the honest replacement and stays dark until the ECI schedule is ingested |
| `/methodology` | how candidate data was collected and scored | `/coverage` and `docs/methodology/*` say it for the whole registry rather than for one scraper; the *candidate scoring* it documented (`src/lib/candidate-scoring.ts`) was a composite index over declared assets and pending cases, which is a judgement dressed as a measurement |
| `/api/news`, `/api/feed`, `/api/insights/[id]`, `/api/reports`, `/api/quiz/questions`, `/api/live/*`, `/api/cron/scrape-results`, `/api/admin/update-ac`, `/api/candidates*`, `/api/constituencies` | the dashboard's back end | every consumer was in the deleted closure; `/v1/*` is the API that remains |

## Ideas worth keeping, not built here

Phase 2.5 forbids new features. These came out of the audit and are recorded rather than implemented:

* **MLALADS and party finance as verticals.** Both are in `docs/platform/00-model.md` as unmodelled.
  `/coverage` already lists them as "not modelled yet", which is the right place for the promise.
* **A real ⌘K palette.** The command bar is a `<form method="get">` over a grouped result page: linkable,
  0 KB of client JavaScript, correct with the back button. An in-page palette is a genuine upgrade for
  keyboard users and is also the moment this app stops being 0 KB. Separate decision.
* **Constituency-level choropleth on a state page.** `/map` drew West Bengal's 294 outlines from
  `place_geometry`; the outlines are still in the registry after `/map` is gone. A state page is where
  they belong, once every state has them — West Bengal is the only one that does, and a map that exists
  for one of 36 jurisdictions is a state-specific surface.
* **Election-scoped coverage on the state page.** The homepage's coverage panel answered "how much of
  *this* election do we hold?" That is a real question at the election level; it is now answered by
  `/coverage` for all of them and by the coverage chip on each "recently held" row.
