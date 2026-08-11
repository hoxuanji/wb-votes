# Phase 2 — the India front page

Built **2026-08-12**, in eight commits, on top of the registry Phase 1.5 finished. `/` is no longer West
Bengal's results with a national frame drawn around them; it is the country as a place to choose from.

This document records what the page is, the decisions that are arguable, the four pre-existing data defects
the work uncovered, and the one thing this environment could not verify.

## What it renders

Nine sections, all computed at request time, none of them holding a list of states:

| Section | Answers | Basis |
|---|---|---|
| Record strip | how much of India is on record, and when it was counted | measured |
| Hero | who governs, in one computed sentence + six counts | measured + derived |
| Map | six layers over 36 jurisdictions | measured |
| Who governs | the leading party in each assembly | measured |
| Upcoming | which houses face the electorate next | **derived** — see below |
| Recently held | what was just decided, and whether we hold all of it | measured |
| Party landscape | where each party actually holds power | measured |
| Close fights · What to watch | the tightest results; measurable signals | measured |
| Historical | the last five elections in each jurisdiction | measured |
| Data coverage | how much of one election we hold, with its sources | measured |

## The data contract

Everything is in [repo/home.ts](../../packages/mandate/src/repo/home.ts). No SQL reaches a component, and
the page holds no jurisdiction name or id as a literal — asserted by a test, because that rule is what makes
a new state a data load rather than an engineering project.

**One spine, shared.** The first draft cost **1,435 ms** because `swingRows()` calls `standings()` twice and
asking it for a swing per jurisdiction is 62 full passes over `result`. It is **798 ms** median now over
566,580 result rows and 1,202 elections:

- `seatsByParty` does all 62 elections in one `GROUP BY` where the old path did one query each
- `seatsWonBy` reads winners only (~31,000 rows against ~300,000) wherever no vote share is displayed
- the expensive party read is **lazy**, so the five layers that do not need shares do not pay for them
- 475 B of route JavaScript — the ⌘K island, and nothing else

## Decisions worth arguing with

**The interface is monochrome; only data is coloured.** Nav, controls, headers, rules and focus states are
ink on near-black. Hue is spent on four things: the choropleth's parties, the magnitude ramp, coverage
status, and the direction of a change. An accent on the chrome competes with the map for the one channel the
map has, on a page built to be read map-first — and any accent distinctive enough to feel deliberate lands
next to one of the four party fills.

**The map's palette was computed, not chosen.** A choropleth of 36 polygons puts any two fills side by side,
so the separation test is ALL PAIRS, not neighbours-in-a-legend. Three identity hues plus a neutral, found by
searching OKLCH at restrained chroma for the largest worst-case OKLab ΔE across normal, protan, deutan and
tritan vision. That worst case is **14.8**, and `home.test.ts` computes it rather than trusting this
paragraph. Lightness varies on purpose: a dichromat loses one chromatic axis, so hue alone cannot separate a
set under both deuteranopia and tritanopia — which is why the project's own hue-only cap is three.

**Hues go to parties by rank, never by a lookup table.** A table mapping BJP to saffron would be a hardcoded
list of parties and would read as campaign livery. Ranking means the country's largest governing party takes
the first slot whoever that turns out to be. A party leading exactly one jurisdiction folds to the neutral —
thirteen of them do, and "governed by a party that governs only here" is a real category rather than an
"other" bucket.

**Direct labels are the point, not a finish.** 27 of 36 polygons carry their leading party's abbreviation at
the area-weighted centroid of their largest ring ([viz/anchors.ts](../../packages/mandate/src/viz/anchors.ts)).
A bounding-box centre puts Gujarat's label in the Arabian Sea; a mean of vertices is dragged to whichever
coastline is most finely sampled; a centroid over all of Andaman & Nicobar's islands lands in open water
between them. The label is also the secondary encoding that makes four fills legal at all.

**The nine jurisdictions too small to label get a tile row.** Chandigarh's polygon is three viewBox units
across — a label does not fit and neither does a cursor, so those jurisdictions would have been unreachable
on the primary navigation surface. Which ones is computed by `labelFits`, never listed.

**The hover card is a native `<title>`.** It is what a mouse tooltip and a screen reader both read, it costs
no client JavaScript, and it carries the whole card rather than a name:

```
KARNATAKA
Assembly 2023 · 224 seats
INC  135
BJP  65
JD(S)  19
outright majority
```

**Upcoming prefers an announced date, by construction.** `upcoming()` reads `announced_on` and `notified_on`
FIRST; a jurisdiction with an announced election does not also get a derived guess at it. Today the announced
list is empty — `announced_on` is NULL for all 1,202 rows and `election_phase` holds none — so every row is a
five-year term and every row says so. That branch is tested with an in-memory fixture, because it has no live
example and would otherwise have shipped unexercised until the exact moment it mattered.

**Overdue is kept out of Upcoming.** Eight terms expired before 2026 on the same count. "Jammu & Kashmir was
due in 2019" is a statement about where our data stops, not about an election that is coming.

**Gaps and anomalies are different questions.** A gap is data MISSING and drives the coverage verdict; an
anomaly is data PRESENT AND WRONG and changes no verdict. The 2024 Lok Sabha holds 19 orphaned candidacies
and its results are nonetheless complete; letting an anomaly downgrade it would tell a reader something is
absent when nothing is.

**`expected` is reference data, and only for the newest election of a house.** Today's seat counts describe
today's India; printing 543 against 1962 would describe a different country. 543 is never a literal in UI
logic — it comes from [india.ts](../../packages/mandate/src/ingest/india.ts).

**No pie chart.** A party's change against last time is the useful comparison, and two pies cannot show it.

## Pre-existing data defects this uncovered

None of these were introduced here, and none are fixed here — they are ingest concerns. All four are now
**visible on the page** instead of silently shaping a figure.

1. **West Bengal holds 307 assembly `place_version` rows in `delim-2008` for a 294-seat house**, so its
   2011, 2016 and 2021 elections each carry 307 contests. `electionCoverage` reports contests against today's
   elected strength, so the discrepancy prints rather than averaging away.
2. **19 orphaned candidacies in the 2024 Lok Sabha.** They carry the seed's own id scheme
   (`ls-2024:cooch-behar-01:jagadish-basunia-…`), `status = 'elected'`, no party and no result row — West
   Bengal placeholders left behind when the Phase 1 import superseded the placeholder RESULTS but created new
   candidacies for the seats where the person did not match. They inflate any raw count of candidate records
   by 19, so the panel prints the count with that fact beside it.
3. **West Bengal 2026 reports 93.0% turnout** — 63,258,146 voters against 68,014,564 electors. The voter
   count reconciles with the source's own totals and the elector count does not; West Bengal 2021 holds
   76.7M. The aggregation is right (Karnataka reads 72.8% against the ECI's 73.19%, and the 2024 Lok Sabha
   66.0% against 65.79%), so this is the seed's placeholder 2026 election.
4. **BJP's Lok Sabha sparkline reads 278 for 2014 and 301 for 2019** against the 282 and 303 it won, because
   some winners' party did not resolve past `party_raw`.

## Defects fixed here

Six, all pre-existing, all found by building on top of them:

| What | Why it mattered |
|---|---|
| `currentStandings` ranked `ORDER BY e.id DESC`; `previousElection` read the year from `substr(id, -4)` | `wb-bypoll-ge-2016` sorted above `wb-bypoll-ae-2021`, so the current state of play for that kind was a five-year-old result |
| `standings()` had no `revision = 0` filter | a corrected result would have been counted beside the row it superseded |
| `jurisdictions()` filed 535 assembly constituencies under the nation | Andhra Pradesh's 300 seats read as "not loaded" in the picker and as no-data ink on the map |
| `/pl/<id>` matched `kind = 'state'` | **all eight union territories 404'd**, including one of the five jurisdictions the brief names |
| `foldStandings` rounded vote share to one decimal at source | SKM's real 2024 share became exactly 0, so a party that won a seat rendered as "0.0%" |
| `--iei-ink-3` was 4.41:1 and a fourth tier was 2.2:1 | most supporting text missed AA, and the least readable text on the page was the word "not reported" |

And one the tests found in work written the same day: `history()` sorted cells on year alone, so Bihar's
February and October 2005 elections — which migration 013 exists to keep apart — were left in whatever order
the array happened to hold.

## What the tests pin

`node --test` over 398 tests, 397 passing (the classified `searchPersons` ranking issue is the one failure).

- **[home.test.ts](../../packages/mandate/src/repo/home.test.ts)** — the palette's CVD separation computed
  under four vision models; chronology against the exact by-election pair; the vote-share layer printing an
  absence rather than a zero; announced-beats-derived on a hand-built fixture; the unopposed seat never
  counted among numeric results; history depth honest per jurisdiction.
- **[render.test.ts](../../packages/mandate/src/repo/render.test.ts)** — the real routes rendered and read.
  No 0.0%, no unlabelled derived date, no affirmative forecast; all six layers draw 36 polygons; a
  hand-edited `?layer=` falls back rather than reaching the SQL; every `/pl/<id>` the map offers resolves; no
  jurisdiction named as a literal in any file this phase wrote.
- **[iei.test.ts](../../packages/mandate/src/viz/iei.test.ts)** — the stylesheet parsed, not a copy of its
  values: every text ink clears 4.5:1 on all three surfaces, each coverage state carries a shape as well as a
  hue, every `outline: none` is replaced by something, and each multi-column grid is redeclared as one column
  inside a narrow breakpoint.

## The one thing not verified

**There is no visual check.** This sandbox refuses `listen()`, so `next dev` and `next start` cannot run and
there is no browser to point at the page. [ops/probe/render](../../ops/probe/render) compiles `.tsx` through
the Babel already inside `next/dist/compiled` and renders a route to HTML, which is what caught the three
defects in commit 8 — but it renders markup, not pixels. Layout, spacing, line-breaks, the map's optical
balance and whether the whole thing actually reads well at 1440px are reasoned about and read as text, not
seen. That is a real gap and it should be closed by a human opening the page.

## Not done, deliberately

- **No state page rebuild.** `/pl/<state>` still wears the older chrome. The shell and every part in
  `src/components/iei/` were built to be reused by it, which is the next commit rather than this one.
- **No OSINT, no prediction, no verticals.** The watch section is the foundation the brief describes and
  nothing more: counts and differences, each with its rule and its threshold.
- **No schedule ingestion.** The seam is built and tested; the data is not loaded.
- **No entity resolution.** Untouched.
