# RC-1 — India Election Intelligence, first release candidate

**Date:** 2026-08-13 · **Branch:** `feat/mandate-registry-foundation` · **Not deployed.**

This document is honest before it is favourable. Where a number is short, the number is here and so is the
reason. Where something cannot be done from the data available, it says so rather than approximating.

Every figure below is generated: [`coverage.md`](coverage.md) from `npm run release:report`,
[`../geo/coverage.md`](../geo/coverage.md) from `geography coverage --write`,
[`../geo/import.md`](../geo/import.md) from `geography inspect --write`. Nothing in this file is typed twice.

## Verdict

**Not releasable today. One blocker, stated in full at the end.** The product itself is in the state the
phase set out to reach — electoral geography for 93 per cent of the seats the country currently votes for,
connected to results and to evidence — and the blocker is a measurement gate that Phase 3 legitimately
moved, needing a decision rather than more work.

---

## 1. What is complete

**Electoral geography, for the epoch each jurisdiction currently votes under.** 4,445 of 4,812 contested
seats are drawable — 92.4 per cent, from 294 (6.1 per cent) at the start of the phase. 47 of 203
(jurisdiction, house, epoch) groups are COMPLETE.

**Sixteen jurisdictions draw every seat of their newest assembly election:** Assam, Delhi, Goa, Haryana,
Himachal Pradesh, Karnataka, Kerala, Manipur, Meghalaya, Mizoram, Nagaland, Puducherry, Punjab, Telangana,
Tripura and Uttarakhand. Sixteen more are PARTIAL, most of them short by one to four seats. West Bengal is
not among the sixteen and the reason is caveat 4 below, not a missing polygon.

**The four map levels.** India by government; a state by its own assembly winners, headed with what, when
and at which level; a district framed by the bounding box of its own constituencies; an assembly seat's own
page. Each is URL state, so each is shareable, and the whole thing costs one 20-line client component.

**A state's Lok Sabha map**, which did not exist before this phase and is a separately sourced, separately
hashed, separately validated geometry — not the assembly's polygons reused.

**Provenance.** 566,580 of 566,580 result rows carry a source. 25,517 of 25,517 claims carry a citation.
Both boundary datasets carry a publisher, a URL, a licence, a retrieval date and a sha256 over their bytes,
and all of it is in the panel's one `ⓘ` and nowhere else.

**The epoch gate.** `place_geometry` is keyed by `place_version_id` and a contest names its own version, so
the only polygon a result can be drawn on is the boundary it was recorded under. It is not a check that can
be forgotten; there is no code path that could bypass it. West Bengal 2006 draws nothing and says why.

**Engineering.** TypeScript clean in both projects. Lint clean. Production build compiles and generates 9/9
static pages, first-load JS 94.3 kB. `geography validate` and `elections validate` pass every check.

## 2. What is partial

| | | |
| --- | --- | --- |
| **Geometry, 16 jurisdictions** | 28 groups PARTIAL | Andhra Pradesh 47 of 175 (§5.6), Gujarat 162 of 182, Madhya Pradesh 212 of 230, West Bengal 263 of 294, Uttar Pradesh 391 of 403, Sikkim 29 of 32, Jammu & Kashmir 80 of 87, and nine others short by one to four |
| **The 2024 Lok Sabha** | 492 of 543 drawable | Assam's 14 and Jammu & Kashmir's 5 are UNAVAILABLE by the epoch rule; the rest are staged |
| **West Bengal's assembly** | 263 of 294 drawn for 2026 | 31 place_versions still carry the old repo-module geometry in the old projection, withheld rather than drawn in the wrong place |
| **Results** | 5 of 33 headline elections | Andhra Pradesh 2019 (174 of 175), Karnataka 2023 (223 of 224 — Bommanahalli has 13 candidacies and no declared winner), Telangana 2018 (118 of 119), West Bengal 2026 (293 of 294), the 2024 Lok Sabha (542 of 543 — Surat was unopposed) |
| **Sources fetched** | 86 of 3,010 | 2,924 are cited by locator and their bytes have never been held. The report says so on every page that uses one |

## 3. What is unavailable, and why

**Fifteen assembly elections held since 2023.** Chhattisgarh, Madhya Pradesh, Mizoram, Rajasthan and
Telangana 2023; Andhra Pradesh, Arunachal Pradesh, Haryana, Jammu & Kashmir, Jharkhand, Maharashtra, Odisha
and Sikkim 2024; Delhi and Bihar 2025. **An upstream limit, verified rather than assumed:**
`Rajasthan_AE.csv.gz` re-fetched from Lokdhaba on 2026-08-12 is byte-identical to the cached copy
(756,270 bytes, sha256 `8d010dee…`) and its `Year` column ends at 2021. TCPD has not published them. Closing
this means extending the ECI pipeline built in Phase 1 per state assembly, which is a phase of its own.

**Assam's `delim-2023-as` and Jammu & Kashmir's `delim-2022-jk` geometry.** The only published form of either
order is a raster scan: 210 and 20 image objects, **zero** text operators, measured from the bytes. Deriving
polygons means georeferencing a scan by eye, which is the unreliable extraction the brief names as a stop
condition. So Assam's 2024 parliamentary map and J&K's are unavailable, and the pages say so.

**Jharkhand's current assembly map.** The registry holds its pre-2008 boundaries and DPACO 2008 redrew them,
so nothing may be drawn for 2019. The refusal is derived, not configured: Jharkhand has no `derived_from`
link, and the five states that do — Arunachal Pradesh, Assam, Jammu & Kashmir, Manipur, Nagaland — share
their polygons across both epochs *because DPACO 2008 says the constituencies are the same*, in its own words,
cited in `place_version_link.basis`.

**Ladakh's and Lakshadweep's parliamentary polygons.** Two groups UNAVAILABLE. Ladakh's source name is
"Leh (Ladakh)" against the registry's "LADAKH" and no key pair agrees; Lakshadweep's polygon spans 43
projected units where the territory's administrative box spans 0.7 — a sea area, not a constituency — and
the containment check refuses it. Both are in the staged list by name.

**A parliamentary constituency has no page of its own.** Its polygon is not a link. A two-segment place path
resolves to a district and "Cooch Behar" is both a district and a parliamentary constituency in West Bengal,
so addressing PCs by name needs a new URL space rather than a widened query. The hover card and the
constituency table carry the winner, the party and the margin.

## 4. Known data caveats

1. **West Bengal holds 307 assembly place_versions for a 294-seat house.** Two sources numbered the same
   epoch differently and the seed's numbering is not the Commission's — confirmed independently by the
   boundary set's own `AC_NO`. 220 versions carry `name_conflict`, and 2011, 2016 and 2021 each report 307
   contests, so their seat totals are 13 too high and each has 13 duplicate winners. Full report with
   options in [`../geo/audit.md`](../geo/audit.md). **Not migrated:** it is an electoral identity change and
   not a thing to do in the same commit as a map.
2. **One constituency held by two place_versions:** 20 in West Bengal `delim-2008`, 1 in Maharashtra
   `delim-1963`. Same name, same district, two versions. The detector is in the coverage report.
3. **Three registry invariants fail, all pre-dating this phase** (verified against the pre-Phase-3
   database): 19 contests whose epoch differs from their election's — Assam's 14 and J&K's 5 from the 2024
   Lok Sabha import — and 15 party_versions with overlapping or doubly-open validity.
4. **Three keys for the CPI(M), and two for the NCP and the CPI differing only in case.** The colour system
   folds case and declares the CPI(M) aliases with `sameAs`, so the map is right; the party rows are not
   merged, which is an identity migration.
5. **554,962 candidacies carry an unresolved party string** and 52,187 person-merge candidates await review.
   Both are visible in the review queue rather than resolved silently.
6. **The classified `searchPersons` failure stands, untouched.** One test of 465.

## 5. Known geometry caveats

1. **The Election Commission publishes no vector electoral geometry.** DPACO 2008 has 45,693 text operators
   and **two** image objects in 639 pages: it defines constituencies by naming the tehsils and wards they
   contain, and the boundaries of those units are not published. The source used is DataMeet's, whose
   declared upstream is the ECI's own polling-station GIS and whose ESRI metadata records an internal
   government workstation and a 2014-11-24 creation date. Classification and evidence:
   [`../geo/sources.md`](../geo/sources.md).
2. **The boundaries are a 2014 snapshot of a 2008 order,** and the manifest says so as a date the epoch
   resolver reads rather than as a footnote.
3. **95 constituencies are staged and not attached** — 78 assembly, 17 parliamentary. 92 because no pair of
   independent keys agreed (Tamil Nadu's Senthamangalam against the registry's SENDAMANGALAM is a real
   spelling disagreement, not a truncation), 2 refused by the containment check, 1 because two polygons
   wanted one place_version. Every one is listed with its reason in [`../geo/import.md`](../geo/import.md).
   That file is a review queue, not a footnote.
4. **Two coordinate spaces in `place_geometry`.** 4,950 polygons in the shared national projection and 50 —
   West Bengal's 31 leftover assembly seats and its 19 district outlines — in the old 400×580 frame. The map
   keeps the frame most of an election's polygons are in and withholds the rest; the coverage matrix counts
   drawable within one frame, which is what turned a false COMPLETE back into PARTIAL.
5. **34 source features carry no constituency identity** — Mumbai islets, Kachchh salt flats, Sikkim's four
   districts, two large areas of Jammu & Kashmir outside its 87 seats. Dropped, and counted.
6. **Andhra Pradesh is the worst group: 47 of 175.** The source holds undivided Andhra Pradesh's seats in
   Telangana-first numbering, so most of AP's post-bifurcation seats match nothing. Telangana itself is
   COMPLETE at 119 of 119, from the same file, by name.

## 6. Source coverage

| | |
| --- | --- |
| Sources | 3,010 |
| Bytes fetched and hashed | 86 |
| Cited by locator, never fetched | 2,924 |
| A repo module rather than a publication | 7 |
| Boundary datasets | 2 — `datameet-ac` (CC BY 2.5 IN, sha256 `768522fd…`), `datameet-pc` (CC BY 4.0, `14dba998…`) |
| Results carrying a source | 566,580 of 566,580 |
| Claims carrying a citation | 25,517 of 25,517 |

The ECI was **unreachable from this environment throughout Phase 3** — HTTP 403 at the edge for every path,
having been reachable on 2026-08-11 — so no new ECI document was acquired and the source classification
rests on the eight delimitation documents Phase 1.5 already fetched and hashed. Recorded rather than worked
around.

## 7. Test status

**465 tests, 464 pass, 1 classified failure** (`searchPersons` ranking, deliberately untouched since
Phase 2.5). TypeScript clean in both projects, lint clean, production build passes, `geography validate` and
`elections validate` pass every check.

New in this phase: 23 pipeline tests, 8 coverage-matrix tests, 6 release-report tests, and 5 render tests
covering the parliamentary map, the companion table, the mixed-frame guard, per-view colour separation and
the geometry's evidence drawer.

## 8. Visual QA status

**Real Chromium, 154 images, five viewports, ten jurisdictions** including a small state, a north-eastern
one, and the one whose current epoch deliberately has no geometry. Record and findings:
[`../geo/visual-qa.md`](../geo/visual-qa.md).

Stated limits, unchanged since Phase 2.5: no HTTP, no hydration, no hover or focus state, one browser. The
harness renders the route, wraps it in the layout's own document, inlines the one stylesheet and screenshots
the file — so layout, type, spacing, contrast, wrapping and overflow are genuinely computed by a browser
engine, and anything that depends on a request is not covered.

Five defects were found by looking and fixed: label font size as a constant in user units (7px across India,
340px inside a district, which is why the district level had no labels), Karnataka's 23-seat third party
rendering as though unshaded, a map column sized by a fraction that letterboxed all 36 jurisdictions, a
district focus with nothing drawable falling back to the whole country's viewBox, and two coordinate spaces
in one SVG.

## 9. Performance

Measured on this machine, warm, against the 566 MB registry.

| | |
| --- | --- |
| `stateMapView` — Uttar Pradesh, 403 seats | **13 ms** |
| `stateMapView` — Maharashtra 288 / Karnataka 224 / West Bengal 294 | 11 / 9 / 9 ms |
| `stateMapView` — West Bengal, 2024 Lok Sabha | 10 ms |
| `geometryCoverage` — the whole matrix, 203 groups | **0.23 s** (was 381 s — see below) |
| `mandate release` — the national coverage report | 5.6 s |
| `homeView` — the national page | **626 ms** |
| Rendered HTML — Uttar Pradesh | 617 KB, of which 454 KB is path data |
| Rendered HTML — Karnataka / West Bengal / India | 364 / 324 / 388 KB |
| First-load JS | 94.3 kB, one 20-line client component |

**Three honest notes.**

`geometryCoverage` took **381 seconds** until this was measured. It asked for each group's modal projection
frame in a correlated subquery, so the frame was recomputed for every one of the 16,810 seat rows over all of
that group's rows — and the same query is in the release report and in CI. Pre-aggregated into CTEs it is
0.23 s and returns identical numbers, verified against the 14 tests over it. Nothing in the product read it
at request time, which is why nobody noticed; a report nobody times is a report nobody runs.

`homeView` at 626 ms is the slowest thing a reader waits for, and it pre-dates this phase: many queries
rather than one slow one.

454 KB of path data for a 403-seat state is heavy. The lever is the simplification tolerance, currently 0.03
projected units — about 1.4 km, finer than a state map rendering at 400 px can show. Not changed at the end
of a phase.

## 10. Known limitations

* No parliamentary constituency page (§3).
* Historical maps exist only where the registry holds that epoch's geometry — 126 groups are UNRESOLVED,
  meaning geometry is held for a different epoch of the same house. The page says which, every time.
* A wide table scrolls sideways on a phone rather than dropping columns. Phase 2.5's decision: no figure is
  lost, and the gesture has to be discovered.
* Dichromatic separation of 60 curated colours is measured and reported, not floored. Sixty identity hues
  cannot be pairwise separable under protanopia, deuteranopia and tritanopia. The mitigations carry it: an
  abbreviation on every polygon large enough to hold one, a legend naming every party, and an outline on an
  isolated one.
* Two generated colours may collide inside one view — two of Maharashtra 2019's one-seat parties do. The
  quiet register is a hash and no context-free hash can promise otherwise; making it context-dependent would
  break the stability the system exists for.
* `src/data/raw/` holds 5 MB of raw historical inputs under the application tree. Harmless — nothing imports
  it — and misplaced.

---

## The blocker

### PROBLEM

`mandate export` — the seed round-trip ratchet, and a release gate — reports **94.0 per cent against a 94.1
per cent floor** and exits non-zero.

### EVIDENCE

The floor is a ratchet whose rule is written into the failure message and into ADR 0004: *"raise it in the
commit that raises the number, never lower it to make this pass."*

Phase 3 lowered the number, for a good reason. It replaced `data/seed/wb-ac-paths.json` — 294 constituency
paths in a West Bengal-only projection, from a repo module with no publisher and no upstream URL — with
5,000 polygons from a hashed, licensed, published boundary set in the projection the whole product shares.
The registry can no longer reproduce the old frame and should not be asked to.

Measured three ways, on the same code:

| | ratcheted figure | whole seed |
| --- | --- | --- |
| Before Phase 3 | 94.1% | 94.1% |
| After, counting the superseded module | 93.2% | 93.2% |
| After, module declared `NOT_REPRODUCED` | **94.0%** | 93.2% |

Excluding it cannot restore the number, because it reconstructed at 100 per cent and was lifting the
average. 0.1 per cent is 89 values.

Two other things this uncovered, both already fixed and neither the blocker: the ratchet charged every
rebuilt row with no seed row to the denominator, so growing from West Bengal to India read as
reconstructability of 2.7 per cent; and `export` crashed before printing anything, on a NULL `reservation`
that 140 of the country's assembly constituencies have.

### OPTIONS

1. **Remove `wb-ac-paths.json` from `data/seed/`.** The module is superseded; deleting it makes the round trip
   measure something that still exists, and it also closes geometry caveat 4 — the 31 stale West Bengal
   polygons in the old projection are written by the ingest from this module, so a fresh registry would have
   one coordinate space instead of two. Costs: the ingest stops producing West Bengal geometry, so a fresh
   registry needs `geography fetch && geography import` to have any map at all, and `DEPLOYMENT.md` has to
   say so.
2. **Lower the floor to 94.0 in this commit, with the reason recorded.** Smallest change. Breaks the
   ratchet's own rule, and a ratchet that bends once is a ratchet.
3. **Leave the gate red and release with it red.** Honest, and it teaches everyone to ignore the colour —
   which ADR 0004 names as the specific failure mode it was written to avoid.

**A fourth option was considered and is not real.** `constituencies.json` sits at 71.4 per cent because
`nameBn` and `districtBn` reconstruct at 0 of 294, which looked like an exporter that was not reading
`place.names`. It reads them: all 307 West Bengal assembly places hold `names = '{}'`. And the seed's own
`nameBn` values are the English names copied — `"nameBn":"Mekliganj"` — so ingesting them would move a
placeholder into the registry to raise a percentage. That is the accounting move this section exists to
refuse.

### RECOMMENDATION

**Option 1, in its own commit, before release.** It is the migration the replacement already implies: a seed
module the registry has replaced should not be in the seed, and while it is, the round trip is measuring a
contract that no longer holds. It fixes the blocker by making the measurement true rather than by moving the
line.

**I have not done it in this phase, deliberately.** Rewiring the ingest bootstrap means a `--fresh` rebuild to
verify, which drops the 566 MB development registry that four phases of ingestion built, and doing that in
the last commit of a long phase is how a good change becomes an incident. It wants its own commit and its own
verification run.

Option 2 is available and I have not taken it either. Lowering a floor to pass is the one thing its own
message forbids, and doing it quietly in a release commit is how a gate becomes decoration.

### IMPACT

Of option 1: one seed module deleted (present in git history), `sources/wb-static.ts` stops writing 294
geometry rows, the ratcheted figure is recomputed over a seed that no longer contains geometry the registry
does not store, and the floor is raised in the same commit to whatever it reaches. `DEPLOYMENT.md` gains the
geometry step. No identity changes, no result changes.

Of releasing as-is: one non-zero exit in CI, on a measurement rather than on the product. Nothing a reader
sees is affected.

---

## Release gate

### Data

- [x] current major election results loaded — 33 headline elections, 30 of them COMPLETE
- [x] 2024 Lok Sabha loaded — 543 contests, 542 decided (Surat unopposed)
- [ ] **2023–2026 assembly results where authoritative data exists** — 15 missing, upstream limit (§3)
- [x] by-election data represented — 829 events
- [x] election dates where available
- [ ] **no known duplicate-winner defects** — 13 in each of West Bengal 2011/2016/2021 (§4.1)
- [x] no year-only election identity
- [x] no seat-number-only constituency identity — every version is named, `geography validate` check 8

### Geography

- [x] national state geometry · national district geometry
- [ ] **electoral geometry for every jurisdiction with supported results** — 92.4% of current seats; the
      shortfalls are named in §2 and §3, none silent
- [x] Assembly geometry where Assembly results are shown
- [x] Lok Sabha geometry where Lok Sabha results are shown — 492 of 543
- [x] correct boundary epoch — enforced by the data model, not by a check
- [x] geometry provenance — publisher, URL, licence, retrieval date, sha256, in the drawer
- [x] geometry validation — 13 checks, findings in `../geo/import.md`
- [x] no fabricated constituency polygons — 95 staged rather than guessed

### Map

- [x] India government layer · state electoral layer · district zoom · constituency interaction
- [x] Assembly/Lok Sabha distinction — separate sources, separate hashes, separate validation
- [x] election selector · stable party colours · party highlight · readable labels · correct borders
- [x] responsive behaviour — five viewports
- [x] acceptable rendering performance — 13 ms for the largest state (§9)

### UX

- [x] one design system · one search and navigation model · no legacy WB dashboard · no duplicate dashboards
- [x] no repeated source blocks — swept, 15 occurrences, all classified
- [x] evidence drawer · breadcrumbs · consistent tables · consistent spacing · mobile usable

### Engineering

- [x] TypeScript clean · lint clean · production build passes
- [x] smoke suite · geography validation · election validation
- [x] full tests pass except the classified `searchPersons` issue — 464 of 465
- [x] real-registry smoke tests
- [x] no dead routes — the five surviving legacy routes are documented permanent redirects
- [x] no unreachable legacy components — 17 script files and 16 npm scripts removed; one of them was
      rewriting `provenance.json` with today's date
- [x] no hardcoded state list · no hardcoded party list in UI · no hardcoded electoral counts
- [ ] **`mandate export` ratchet** — the blocker above
- [ ] **`mandate audit` invariants** — 3 failing, all pre-dating this phase (§4.3)
