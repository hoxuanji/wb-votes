# Electoral geography: identity, delimitation, and what the registry got wrong

Status: **proposal and repair record**. Written 2026-08-11, against the registry as measured that day.
Every number here is reproducible with `mandate geography validate`.

---

## 1. The defect

The importer identified an electoral constituency as

```
(jurisdiction, house, seat number)
```

and wrote its name **only when creating the row**. Every later delimitation adopted the existing row by
seat number and its own `Constituency_Name` was discarded.

Seat numbers are not stable across delimitation. India has redrawn constituencies four times — orders of
1952, 1963, 1976 and 2008 — and each order renumbers from scratch. So:

| | Karnataka parliamentary seat 1 | Karnataka assembly seat 1 |
|---|---|---|
| 1976 order | BIDAR | AURAD |
| 2008 order | CHIKKODI | NIPPANI |
| in the registry | BIDAR | AURAD |

The 2019 winner of Karnataka PC 1 is Annasaheb Jolle, who won **Chikkodi**. The result is right. The name
beside it said Bidar.

**Measured before repair:**

| Measure | Count |
|---|---|
| contests naming a seat from a delimitation other than their own | **52,875 of 63,288** (84%) |
| constituency versions carrying the wrong name | **11,500 of 16,785** |
| constituencies with versions in more than one epoch | 4,847 of 5,112 |
| constituencies spanning all four epochs | 2,822 |

The root cause is one expression, at `packages/mandate/src/ingest/sources/lokdhaba.ts`:

```ts
const already = placeFromDb.get(`${j.id} ${kind} ${seatNo}`);   // no epoch in the key
if (already === undefined) placeRows.set(placeId, [..., seatName, ...]);   // name only on create
```

## 2. Why it is reconstructible, and on what authority

Every row of every source file carries `Constituency_Name` beside `DelimID` and `Constituency_No`. The
name was never missing from the source; it was dropped on the way in.

All 62 Lokdhaba files were re-fetched and **all 62 are byte-identical to the sha256 recorded on their
`source` row at import time** (`ops/geo/refetch-lokdhaba.sh`, manifest in
`.data/cache/lokdhaba/refetch-manifest.tsv`). This matters more than it looks: a reconstruction from
*different* bytes would be a new assertion wearing a repair's clothes. Because the bytes match, every
corrected name is traceable to the same document that produced the row being corrected.

Reconstruction keys on the source's own identity:

```
(file jurisdiction, house, DelimID, Constituency_No)
```

- **file jurisdiction, not `State_Name`.** Undivided Andhra Pradesh files carry `State_Name =
  Andhra_Pradesh` for seats that are now Telangana's, and the registry's place ids were built from the
  file. Keying on `State_Name` would disagree with the rows being repaired.
- **house from the row's `Election_Type`, not the file.** The column reads `"Lok Sabha Election (GE)"` /
  `"State Assembly Election (AE)"`. An early version of this matched a bare `"GE"`, housed all 16,772
  seats as assembly, and silently lost every parliamentary seat in the country. Anything naming neither
  house is now counted, never defaulted.

Result: **16,772 source seats, and every one matches exactly one existing `place_version`.** Zero source
seats are unaccounted for. That 1:1 correspondence is what makes this a repair rather than a re-import.

## 3. The model

### 3.1 What a constituency *is*

> **A constituency is a place version.** `(jurisdiction, house, delimitation epoch, seat number)` — with
> its own name, its own district, its own reservation, and its own provenance.

`place_version` already existed, already carried the epoch, and `contest.place_version_id` already
pointed at the right one. The contests were never mis-linked; only the *name* was read from the wrong
level. So the repair adds identity to `place_version` rather than rewiring 63,288 contests:

```
place_version (
  id, place_id,                      -- place_id retained for audit only; see 3.2
  jurisdiction_id  -> place(id),     -- explicit, not parsed out of an id string
  kind,                              -- 'ac' | 'pc'
  epoch_id         -> boundary_epoch(id),
  number,
  canonical_name,                    -- THE name, per epoch
  district_place_id -> place(id),    -- district membership changes with delimitation too
  reservation, geometry_ref, electors_at_creation,
  source_constituency_key,           -- the source's own identity string, verbatim
  name_source_id   -> source(id),    -- P2: who asserted this name
  name_conflict,                     -- another cited source names this slot differently
  name_variants,                     -- JSON: every spelling observed, with years and row counts
  UNIQUE (jurisdiction_id, kind, epoch_id, number)
)
```

Validity comes from `boundary_epoch.effective_from` / `effective_to`. No per-version validity columns are
invented, because no source gives per-seat validity inside an order.

### 3.2 What `place` becomes for a constituency

`place` keeps the containment tree — nation, state, UT, district — which is what it is good for. For `ac`
and `pc` rows it is **demoted to a legacy seat-number grouping, retained for audit and reversibility**,
and it is not an entity:

- nothing may take a constituency's **name** from `place`
- nothing may take a constituency's **history** by grouping on `place_id`

Deliberately not deleted: `place_geometry`, `booth_result` and the legacy West Bengal app key on those
ids, and the brief requires old identifiers to survive the repair. The landmine is disarmed by removing
it from every read path and by a validation check, not by a `DELETE`.

Rejected: re-keying `place` to `ka.pc.delim-2008.001`. It buys nothing that `place_version` does not
already provide, and it would rewrite 5,112 ids, every URL and every geometry reference for a cosmetic
gain.

### 3.3 Cross-epoch continuity

Two mechanisms, both requiring evidence, neither populated by guesswork.

**`place_crosswalk`** (already exists, 0 rows) — the quantitative one: `from_place_version_id`,
`to_place_version_id`, `area_share`, `population_share`, `elector_share`, and a `method` restricted to
`areal` / `booth_reassignment` / `official_order`. This is where "Bidar's territory became 40% of the new
Bidar and 35% of Bhalki" belongs, when a delimitation order or an areal computation is in hand. **Nothing
in this repair populates it.**

**`place_version_link`** (new) — the nominal one. The vocabulary the brief asks for exists in the schema:

```
kind IN ('name_match','renamed_to','successor','predecessor','split_into','merged_from','boundary_changed')
CHECK (kind = 'name_match' OR source_id IS NOT NULL)
```

That CHECK is the point. A succession claim is structurally impossible without a cited source, so the
schema itself refuses to hold a fabricated one. Only `name_match` is populated, and only from the source
names: *a constituency with this name existed in the adjacent delimitation*. That is a fact about the
documents, not a claim about territory — and it is enough to let a seat page offer "this name before 2008"
without asserting the geography is the same.

### 3.4 No hardcoded 2008

"Current" is resolved, never literal: the current epoch for a `(jurisdiction, house)` is the epoch of its
most recent election on record. `currentEpochs()` in
`packages/mandate/src/ingest/geography/validate.ts` is the single implementation, and no epoch id appears
as a literal anywhere in it. When the next Delimitation Commission reports, the work is: add a
`boundary_epoch` row with its order and source, set the previous epoch's `effective_to`, import the
results, run the backfill — and every surface follows, because nothing anywhere names an epoch.

## 4. Two authorities disagreeing: West Bengal

The repair surfaced a second, independent defect, in the West Bengal seed rather than the importer.

West Bengal has **294** assembly seats. The registry has **307** `wb.ac` places: 294 created by the seed,
plus 13 created by the importer at numbers the seed had left unused. The seed numbered its 294 seats
across the range 1–307 with 13 gaps, so from seat 100 onward its numbers drift from ECI's — the seed's
Habra is 104, the source's HABRA is 100 — reaching a 13-seat offset by the end of the list.

The seed's `(number, name, winner)` triples are **internally consistent and factually correct per named
seat**: Agnimitra Paul at Asansol Dakshin, Moloy Ghatak at Asansol Uttar, both verified against the 2021
result. It is the numbering that is wrong, and 1,413 of West Bengal's 1,534 2021 results are the seed's.

So a name-by-number backfill would have written MURARAI over the place holding Asansol Uttar's result —
recreating, in the flagship state, the exact defect being repaired. Instead:

- for the **221** affected versions the owning source's name is kept and the source's differing name is
  recorded in `name_variants` with `name_conflict = 1`
- a name-join from seed to source numbering was tested and **rejected**: 278 of 294 match, 16 differ only
  by transliteration (Tollyganj/TOLLYGUNGE, Bangaon/BONGAON, Dabgram-Fulbari/DABGRAM-PHULBARI) and one
  collides. A 94.6% fuzzy match is not a mapping to renumber a state on
- resolving it needs a third authority — the ECI's own West Bengal constituency list — and is **not** done
  here

This is the brief's rule applied literally: preserve the source fact, mark the conflict, do not invent
continuity.

## 5. Recommended URL semantics

Not implemented in this task; the model comes first.

```
/pl/<jurisdiction>/<house>/current/<seat-slug>      canonical, follows the delimitation
/pl/<jurisdiction>/<house>/<epoch>/<seat-slug>      a historical constituency, addressable
/pl/<legacy-place-id>                               301 → the current-epoch seat at that number
```

`current` resolves through `currentEpoch()`, so the canonical URL survives the next delimitation while
the historical URL keeps pointing at the geography that actually held the election. Existing
`/pl/wb.ac.284` links keep working; they are redirects, not identities.

## 6. What the repair did, measured

`mandate geography backfill --apply`, against the 62 hash-verified files:

| Bucket | Versions |
|---|---|
| **corrected** — the source names it and owns the results | **11,254** |
| already correct — names agreed; the curated spelling kept, provenance added | 5,298 |
| **conflict** — another cited source owns the results and names the slot differently | **220** (all West Bengal) |
| no source row — existing name kept | 13 (all West Bengal) |
| not a constituency — the 19 district versions | 19 |
| left unnamed | **0** |

`mandate geography validate`:

| | |
|---|---|
| contests naming a seat from another delimitation | **51,702 → 900** |
| the 900 remaining | the recorded West Bengal numbering conflict, counted, not absorbed |
| versions where the source itself carries >1 spelling | 2,352 (kept in `name_variants`) |
| `name_match` links written | 8,738 |
| succession links asserted | **0** |
| quantitative crosswalk rows | **0** |

Nine of the ten checks pass. Check 7 does not, and is not filtered — see below.

## 7. Two further defects this surfaced

**Bihar held two assembly elections in 2005** — February and October — and the election id is
`(jurisdiction, house, YEAR)`, which cannot tell them apart. Both polls' results landed on one election, so
34 seats carry two winners (`PURANMASI RAM` with 59,151 votes and `PURNMASI RAM` with 60,794 — the same
person winning both). One more contest, `up-bypoll-ae-2014`, is affected. This is the same class of mistake
as the one repaired here, one level up: **a year is no more a stable identity for an election than a seat
number is for a constituency.** Repairing it means splitting elections and re-keying their contests, and it
is not done here. Check 7 stays red so it cannot be forgotten, and the regression test asserts it has not
grown past 35.

**The importer was overwriting curated district rows.** `w()` is an upsert on id, and a district has no
`eci_code`, so the adoption map could not see it: all 19 of West Bengal's district rows had been rewritten
with TCPD's spelling — `Cooch Behar` became `COOCH BEHAR`, Bengali names became `{}`, LGD codes became
`NULL`. The same mistake that once reduced "All India Trinamool Congress" to the four characters AITC. The
importer now creates a district only when absent, and `mandate ingest` restored the seed's rows.

## 8. The two test failures, classified

The brief requires each remaining failure to be classified rather than made green. Before this work: 11 red.
After: 1.

**Nine were real defects, not obsolete expectations.** `getPlaceBrief: four elections`,
`getPlaceAnalysis` × 3, `analysisCards` × 2 and `placeView` × 3 were all failing because reads grouped a
seat's history by `place_id` — every election ever held under that NUMBER, sixteen of them for Mekliganj
across four sets of boundaries, presented as one seat's record. Scoping each read to its own
`place_version` turned all nine green. The tests were right; the model was wrong. One of the nine also
exposed `SELECT MAX(election_id) FROM contest` on the district page — lexical, so a West Bengal district
asked for results from whichever state sorts last and got none.

**One was an obsolete expectation.** `§20 contract` asserted unconditionally that a person response
declares its provisional claims. That held while every person was a 2026 affidavit filer with five claims;
of 448,035 persons most now come from TCPD and have none, and "0 of 0 claims are provisional" is noise
dressed as rigour. Now a biconditional, matching the never-fetched caveat beside it, and counted from the
registry rather than from the caveat under test.

**One is a real defect, out of this task's scope, left red.** `searchPersons: surname-first and
given-name-first meet` — searching "Md Salim" and "Salim Md" does reach the same person: both produce the
order-independent key `md|slm`, and the overlap is real at a large enough limit. It fails at the top-50
window because "Md Salim" also emits the bare single-token key `slm`, which matches every Salim in the
registry, and the exact match is not ranked above them. That is person-search ranking, not electoral
geography, and it is not touched here.


## 9. What runs

| Deliverable | Where |
|---|---|
| re-fetch + hash verification | `ops/geo/refetch-lokdhaba.sh` |
| reconstruction from source bytes | `packages/mandate/src/ingest/geography/reconstruct.ts` |
| schema | `ops/migrations/011_place_version_identity.sql`, `012_place_version_name_required.sql` |
| backfill, with a row-level before/after audit | `mandate geography backfill [--apply]` |
| validation, ten checks + before/after metrics | `mandate geography validate` |
| regression tests | `packages/mandate/src/ingest/geography/geography.test.ts` |
| audit / recovery record | `.data/reports/geography-backfill.json` |

Order on a fresh registry: `mandate migrate` → `mandate ingest` → `mandate import --state=…` →
`ops/geo/refetch-lokdhaba.sh` → `mandate geography backfill --apply` → `mandate geography validate`.

Recovering the pre-repair state needs no backup: `place.canonical_name` was never written, so
`UPDATE place_version SET canonical_name = NULL, name_source_id = NULL, name_conflict = 0,
name_variants = '[]', source_constituency_key = NULL` returns the registry to where it started, and 011's
columns can then be re-derived from the same bytes.
