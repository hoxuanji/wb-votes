# PHASE 3 — FINAL

**Date** 2026-08-13 · **Branch** `feat/mandate-registry-foundation` · **Status: CLOSED. The data foundation
is frozen.**

Every figure below is a query. [`coverage.md`](coverage.md) and
[`geometry-coverage.md`](geometry-coverage.md) are generated from the registry; nothing here is typed twice.
[`RC-1.md`](RC-1.md) was written before this closure and its one blocker is resolved — see §Export.

---

## The gate

| | |
| --- | --- |
| **Geometry coverage** | **4,445 / 4,812** current-epoch seats (92.4%) |
| **Geometry unavailable** | **367**, every one classified in [geometry-coverage.md](geometry-coverage.md) |
| **Export** (seed round trip) | **PASS** — 95.0% against a floor RAISED from 94.1 to 95.0 |
| **Election validation** | **PASS** — every check |
| **Geography validation** (identity) | **PASS** — every check |
| **Geometry validation** (the stored polygons) | **PASS** — 9 hard checks clean, 2 recorded at baseline |
| **Tests** | **465 / 466** — the classified `searchPersons` ranking failure is the only one |
| **TypeScript** | **PASS** — app and registry package |
| **Lint** | **PASS** |
| **Production build** | **PASS** — 9/9 static pages, 94.3 kB first load |
| **Smoke suite** | **PASS** — every read function against the real registry |
| **Deterministic build** | **PASS** — two independent rebuilds, identical content; four generated reports byte-identical on a second run |

### Why the 367 are missing

| status | seats | meaning |
| --- | --- | --- |
| NO-TRUSTWORTHY-GEOMETRY | 265 | the epoch draws most of its seats; this one matched no polygon on any pair of independent keys |
| SECONDARY-SOURCE-CANDIDATE | 82 | a source of the right vintage covers the jurisdiction and nothing resolved to this epoch — the epoch failed, not the seat |
| EPOCH-BLOCKED | 20 | the epoch takes effect after the newest source describes, and the order's only published form is a raster scan |
| WRONG-FRAME | **0** | a polygon in a different projection from its neighbours. This was 31 before the rebuild — West Bengal's leftovers from the superseded module — and the module leaving the seed removed them. Those 31 versions now hold no polygon at all and count as NO-TRUSTWORTHY-GEOMETRY, which is the honest description of them |

Concentrated rather than scattered. **Four jurisdictions hold 287 of the 367**: Andhra Pradesh 147 (the
source carries undivided Andhra Pradesh's seats in Telangana-first numbering, so most of AP's
post-bifurcation numbering matches nothing — while Telangana itself is complete at 119 of 119 from the same
file), Jharkhand 81 (DPACO 2008 redrew it and no source describes the result), West Bengal 31, Gujarat 23.
Then Madhya Pradesh 18, Assam's 2023 parliamentary set 14, Uttar Pradesh 12, and 41 across fourteen others,
most of them short by one to four seats. **Nothing was imported to make these numbers smaller.**

---

## The four things this closure fixed

### 1. Export — the blocker is gone, and the floor went UP

**94.0% → 95.0%, floor 94.1 → 95.0.** Neither half was arranged.

The number rose because **`marginPct` stopped being listed as something the registry has no home for**. It is
derived from two figures the registry reconstructs exactly — the winner's margin and the contest's votes
polled — so "not stored" was never true of it. 1,135 values. A derived field looks like a missing column,
which is why it sat on that list unexamined.

The denominator shrank because **`data/seed/wb-ac-paths.json` left the seed**. 294 constituency paths in a
West Bengal-only projection from a repo module with no publisher, superseded by 4,950 polygons from two
hashed, licensed, published boundary sets in the projection the whole product shares. With the module gone,
the per-file "not reproduced" table that had been excusing it went too — **an accounting exception in an
accounting gate is a gate with an exception**. Both figures agree again at 95.0%, which is the state a round
trip should be in.

262 of the 1,135 `marginPct` values still differ, by rounding alone: the seed stores 2 decimals for
2011/2016/2021 and 1 for 2026, because a different script wrote the 2026 rows. Reported rather than
special-cased — fitting the exporter to which script wrote which year is not reproducing a source.

**A fourth option was considered and rejected as an accounting move.** `constituencies.json` sits at 71.4%
because `nameBn` and `districtBn` reconstruct at 0 of 294, which looked like an exporter not reading
`place.names`. It reads them: all 307 West Bengal assembly places hold `names = '{}'`. And every one of the
seed's 294 `nameBn` values is byte-identical to its `name`, with no Bengali script anywhere — so ingesting
them would move a placeholder into the registry to raise a percentage.

### 2. Determinism — and the defect the rebuild exposed

`ops/rebuild.mjs` builds the whole registry from cached, content-addressed sources into a **separate file**,
and `ops/rebuild-compare.mjs` compares two registries by row count and by content hash over the tables a
reader meets. Timestamps that legitimately move — retrieval times, ingest logs — are excluded with the reason
stated rather than by omission.

**Two independent rebuilds are identical.** Every table's row count, and every content hash: places, versions,
epochs, geometry, elections, contests, results, parties, sources, turnout.

Getting there found a live defect that a total would never have shown. The Lokdhaba importer **planned** a
general election under the union (`in`) and **looked it up** under the state, so every historical Lok Sabha
row missed the lookup and was skipped — with the reason printed and nobody reading it. **86,454 results and
seventeen elections, `ls-1962` through `ls-2019`, absent from any registry rebuilt with that code.** The rule
now lives in one exported function used by both sides. This is exactly what a reproducibility check is for: a
registry nobody can rebuild is not frozen, it is stuck.

It also found an ordering requirement worth writing down: the ECI 2024 import **refuses** unless
`geography delimitation` has registered `delim-2023-as` and `delim-2022-jk` first — 19 quarantined seats and
one hard validation failure. The validator working.

**`provenance.json` no longer moves.** `writeSeed` stamped `new Date()` into a tracked file on every call;
its seventeen callers were deleted in Phase 3's hardening, so it was unreachable and left loaded. It is gone.
`scripts/build-seed.js` is now the one function still used — the atomic writer — and four generated reports
are byte-identical when run twice.

### 3. The Karnataka defect, fixed generically

JD(S) won 23 of Karnataka's 224 seats in 2023 and its polygons read as unshaded. The cause was **party colour
resolution, not geometry, CSS or the legend**: JD(S) was not curated, so it fell to the generated register at
chroma 0.055 — a wash a reader takes for "no data".

Fixed for every party, not for Karnataka: 60 curated identities, the set chosen by measurement (every party
that won four or more seats in the newest election of any jurisdiction), and the quiet register's chroma
raised as far as it can go while the two registers still separate.

The regression test names no state and no party. It asks the registry which parties won seats, then asserts
that none of them is drawn in either ink that means absence, that none is drawn hueless, and that any party
with four or more seats anywhere has a curated identity. A new party crossing that line fails it.

### 4. Geometry validation against the stored registry

`mandate geography check` — eleven checks on `place_geometry` itself, as distinct from constituency identity
(`geography validate`) and from validating a source before writing it (the import). Drawable rings, empty
paths, duplicate polygons within an epoch, one polygon per place_version, a polygon shared across epochs only
where a `derived_from` link proves the order restated it, elections against epochs that postdate them,
multipart survival, jurisdiction containment, impossible centroids, source hash, source publisher.

Two checks are **recorded at a baseline** rather than passing or failing — the finding stays visible, the
number stays honest, and a new violation turns it red:

* **2 — Manipur's and Nagaland's 1974 assembly elections sit on `delim-1976`**, an order effective two years
  later. A real defect, from TCPD's DelimID mapping. Fixing it means rewriting `election.epoch_id`, which is
  electoral identity — the thing this closure freezes.
* **1 — `wb-districts.json` has no publisher.** 19 West Bengal district outlines from a repo module, the
  provenance this phase replaced everywhere else. Still here because nothing replaces it, and no surface reads
  it any more (a district frames itself from its own constituencies). Deleting data to make a check pass is
  the move this whole exercise refuses.

---

## Known unresolved issues

Each is deliberate, each is measured, and each names why it was not fixed here.

1. **West Bengal: 307 assembly place_versions for a 294-seat house.** 220 name conflicts; 2011, 2016 and 2021
   each report 307 contests, so their seat totals are 13 too high. Untouched, as the closure brief requires —
   an electoral identity decision. Report and options: [`../geo/audit.md`](../geo/audit.md).
2. **21 constituencies held by two place_versions** — 20 in West Bengal `delim-2008`, 1 in Maharashtra
   `delim-1963`. Same name, same district, two versions.
3. **Manipur and Nagaland 1974 on a 1976 order.** Recorded baseline, above.
4. **Three registry invariants fail, all pre-dating Phase 3** (verified against the pre-Phase-3 database):
   19 contests whose epoch differs from their election's — Assam's 14 and J&K's 5 from the 2024 Lok Sabha —
   and 15 party_versions with overlapping or doubly-open validity.
5. **Three keys for the CPI(M); `NCP`/`ncp` and `CPI`/`cpi` differ only in case.** The colour system folds
   case and declares the CPI(M) aliases, so the map is right. The party rows are not merged.
6. **Fifteen assembly elections held since 2023 are absent, and the source does not have them.** Verified:
   `Rajasthan_AE.csv.gz` re-fetched is byte-identical to the cache and ends at 2021.
7. **A parliamentary constituency has no page of its own.** "Cooch Behar" is both a district and a PC in West
   Bengal, so addressing PCs by name needs a new URL space rather than a widened query.
8. **`searchPersons` ranking** — classified since Phase 2.5, one test of 466.
9. **554,962 candidacies carry an unresolved party string; 52,187 merge candidates await review.** Visible in
   the review queue rather than resolved silently.
10. **`homeView` takes 626 ms** — the slowest thing a reader waits for, and it pre-dates this phase.

---

## THE FOUNDATION IS FROZEN

For the UI phase, the following do not change unless a **critical correctness defect** is found — and a
correctness defect means the product would state something false, not that something would be easier to
build:

* no new schema, no migration beyond a correctness fix
* no change to election identity: `election.id`, its epoch, its occurrence
* no change to `place_version` semantics: identity, numbering, epoch, district assignment
* no further geography abstraction — `boundary_epoch` / `place_version` / `place_geometry` /
  `place_version_link` is the model
* no additional ingestion framework and no additional source system

What the UI phase may rely on, because it is now measured and reproducible:

| | |
| --- | --- |
| `stateMapView(db, jurisdictionId, {election, house})` | 13 ms for the largest state; seats, districts, legend, sources, frame, drawable counts |
| `homeView(db, {layer, thisYear})` | the national map and its layers |
| `geometryCoverage(db)` | 0.23 s for the whole matrix — was 381 s until this phase measured it |
| `missingGeometry(db, vintages)` | every undrawable seat with its reason |
| `releaseReport(db)` | the national coverage report |
| `place_geometry` | 4,969 polygons, one coordinate space for every constituency, `view_box` declared per row |
| `ops/rebuild.mjs` | the whole registry from cached hashed sources, verifiably identical run to run |

### How to rebuild it

```bash
node ops/rebuild.mjs .data/next.db          # ~12 minutes, from cached hashed sources
node ops/rebuild-compare.mjs .data/registry.db .data/next.db
```

The second command must print `REPRODUCIBLE — same content`. If it does not, the difference is the finding.
