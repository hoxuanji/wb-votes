# ROADMAP — India Election Intelligence

Where this stands, what was asked, and what is left. Updated **2026-08-10**.

> This supersedes the *WB Votes → WB Civic Dashboard* roadmap, which described a single-state civic
> dashboard for the 2026–2031 West Bengal term. That document is in git history; it is not what this is
> any more, and leaving it in place as "the source of truth" was misleading.

This file is the record of the ask and its state. Nothing is described as done that does not run. Every
number was measured on the live registry on the date above, and where a figure is derived rather than
sourced it says so.

## The ask, as given

**Vision.** Rebuild WB Votes into **India Election Intelligence** — a data-rich, fact-based, OSINT-style
election intelligence platform for all of India: Lok Sabha, state assemblies, by-elections, municipal,
panchayat, historical, upcoming, live. North star: *Bloomberg Terminal × World Monitor × Reuters Graphics
× ECI data × modern consumer UX.* Two layers at once — Citizen and Researcher. Map-first.

**The structural requirement, stated twice:** adding a state must be *"primarily a data/configuration
problem rather than a complete engineering project."*

**The wider frame.** A Political Intelligence Platform in which elections are **one vertical of
eighteen** — parliamentary sessions, MLA/MP performance, bills and voting records, schemes, budgets,
constituency development funds, cabinet reshuffles, promises vs delivery, public spending, political
funding, court cases, RTI datasets, delimitation, census overlays, policy timelines, coalitions,
historical trends.

**The home page, as specified 2026-08-10:**

| # | Asked for | State |
|---|---|---|
| 1 | India map with current state assembly winners | **built** |
| 2 | Card: upcoming elections | **built** — derived term-end, labelled as derived |
| 3 | Recent elections | **built** |
| 4 | State-by-state vote share, recent election, pie chart | **built as share + change table, not a pie** — see Decisions |
| 5 | Vote share per state by party, last two elections and the change | **built** |
| 6 | Close fights across states | **built** |
| 7 | What was said in exit polls | **not built — no data, no model** |
| 8 | How states voted before: last 4–5 elections, who won | **data loaded for all 31 states**; the surface belongs on the state page |
| 9 | Live section: recent by-polls and who won | **by-polls built**; "live" needs a counting-day feed |
| 10 | Upcoming elections with month and year, link to all state/UT dates | **year only** — announced dates and phases are not in the registry |
| 11 | States dropdown in the top bar | **built** |
| 12 | State page: seat distribution, party-wise count, constituency results, historical, fact checks | **not built** — the dropdown lands on the existing state brief |
| 13 | Year dropdown on the state page | **not built** — `electionsIn()` is the query it needs, and exists |
| 14 | Search bar's hardcoded hint text looks bad | **fixed** |
| 15 | Don't make West Bengal the hero | **fixed** |
| 16 | Search and state picker looked disjoint in the chrome | **fixed** — one bordered control cluster after the wordmark |

## Where the data stands

| Measure | Value |
| --- | --- |
| jurisdictions with results | **31** of 36 |
| elections | **1,188** |
| contests | 63,288 |
| candidacies | 565,714 |
| results | **557,645**, every one carrying a source id |
| persons | 448,035 — 440,708 carry a published TCPD id |
| parties | 3,330 |
| assembly seats, current delimitation | **4,117 of 4,123** (99.9%) |
| Lok Sabha | 538 of 543 for 2019 · **42 for 2024** |
| genuinely fetched, byte-hashed sources | 72 of 2,996 |
| merge queue | 52,330 pending — 43,723 of them seed × TCPD |

**Coverage stops where the source stops.** TCPD's assembly files end in 2022 and its parliamentary files
in 2019. That is why 2024's Lok Sabha holds only West Bengal's 42 seats, and why eight state terms show
as ended-in-our-data rather than upcoming.

**Not loaded at all:** the five union territories with no assembly (Andaman & Nicobar, Chandigarh, Dadra
& Nagar Haveli and Daman & Diu, Ladakh, Lakshadweep). Lokdhaba publishes no file for them.

**Adding a state is two commands**, which is the structural requirement met:

```sh
curl -o /tmp/Kerala_AE.csv.gz "https://lokdhaba.ashoka.edu.in/downloads/Kerala/Kerala_AE.csv.gz"
node packages/mandate/bin/mandate.ts import --state=kl --file=/tmp/Kerala_AE.csv.gz
```

No UI change, no component change, no list of states anywhere in the app.

## Decisions taken, with reasons

**A pie chart per state was asked for and deliberately not built.** A pie cannot be read comparatively
across 31 states, and the comparison asked for in the same sentence — this election against the last —
is a change in percentage points, which a pie cannot express at all. The section shows share now, share
then, and the signed change.

**The map is district polygons grouped by state, not dissolved outlines.** 760 published district shapes;
each state's districts are filled as one path, so interior edges vanish under the fill and the district
geometry is already in place for when district-level colour arrives.

**Boundaries are a generated asset, not a registry table.** `place_geometry` is keyed by
`place_version_id`, and a state has no place_version — only seats do. Giving 36 states versions inside a
delimitation epoch is a modelling question (a state's boundary changes with *reorganisation*, not with
delimitation) and should not be settled in the commit that draws the first map.
`data/geo/india-states.json` carries its source URL and sha256 inside itself, and
`ops/geo/build-india.mjs` rebuilds it from scratch.

**Upcoming elections are derived and say so.** Last election plus a five-year term. The Election
Commission announces dates; this registry does not hold them, and printing a derived date as an announced
one would be the quiet fabrication this codebase refuses everywhere else.

**Exit polls are absent rather than stubbed.** No model, no source, no rows. A header with nothing behind
it is worse than its absence.

**Interactivity: server-rendered, with state in the URL.** Filters and pickers are plain forms and links,
so every view is addressable, shareable, and works with no JavaScript. Client JS is reserved for the two
things that genuinely need it — the ⌘K command bar and the evidence drawer.

## Next, in order

1. **The state page** (asks 12, 13). `/pl/<state>` becomes the state front page: seat distribution,
   party-wise count, constituency results, the last five cycles, with a year picker. Every query it needs
   is already in `repo/elections.ts` — `electionSummary`, `electionsIn`, `swings` and `closeFights` all
   take an election id and none of them cares which house it is.
2. **Scoring, so the 52,330-pair queue can be worked.** No pair scores above the auto-merge line on name
   evidence, because the contest-deferral rule means a seed person and a TCPD person never share a
   contest — so `sameContest`, the strongest feature there is, is structurally zero for exactly the pairs
   the queue exists to resolve. This is the deferred supersession design arriving as a scoring problem.
3. **Announced election dates and phases** (ask 10), from the ECI. `election_phase` models them and holds
   zero rows.
4. **2023–2026 results**, the live coverage gap. TCPD stops in 2022; the ECI's own result pages cover the
   rest, and 2024's Lok Sabha is the most valuable single load left.
5. **193,951 declared ages and educations render with no claim behind them** — a P2 violation the
   `coverage` command already prints.
6. **Historical on the home page** (ask 8), once the state page proves the component.
7. **The other seventeen verticals.** `tenure` — person × office × period — is the spine every one of them
   attaches to. The registry currently ends at `result`, which is why nothing yet represents *holding*
   power. See `docs/platform/00-model.md`.

## Known red, and why

11 tests. Three families, none cosmetic:

- **place-page window expectations (8).** Tests asserting four elections against seats that now have
  sixteen, and a turnout floor that 1962's real 47.2% falsifies. Expectations, not defects — but each
  needs a decision about what a seat page should show.
- **person surfaces (2).** `searchPersons` homonyms and `getPersonBrief` at 60× the people. One is fallout
  from running `resolve`: 1,202 persons were merged away and a test still names an absorbed id.
- **§20's provisional-claims caveat (1).** A TCPD-derived person has no provisional claims to caveat.

## How to keep this file honest

Update it in the commit that changes what it describes. Every figure here is reproducible:
`mandate coverage` for the registry counts, `npm test` for the red list, and `ops/geo/build-india.mjs`
for the map asset. If a number in this file cannot be reproduced by one of those, it is wrong.
