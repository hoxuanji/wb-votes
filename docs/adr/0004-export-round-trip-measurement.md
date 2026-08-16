# ADR 0004 — `mandate export`: measuring what the registry can give back

Status: accepted · 2026-08-09 (revised same day after review) · Relates to §17 (contract-first
ingest), §29 (strangler fig, Phase C/E), §12 (data model) · Implemented in
`packages/mandate/src/ingest/export.ts`, `packages/mandate/bin/mandate.ts` (`export` subcommand)

## Context

Cycle 4 inverted the dependency: `data/seed/*.json` is now the input both the old app and the
registry read, and `src/data/*.ts` no longer sits between the scrapers and the registry. That makes
the next question answerable for the first time — **can the registry give the input back?**

It matters because §29's Phase C/E ends with deleting the seed and the old app. That deletion is only
safe if everything the seed carries is either in the registry or knowingly abandoned. Before this
cycle the project had no number for that; it had an assumption. An assumption is what gets discovered
at the moment the files are already gone.

## Decision

Add one subcommand:

```
mandate export
```

It reads the registry, reconstructs the **eight ingested** seed modules from it, and reports per
module and per field: rows in the seed vs rows rebuilt, values reconstructed exactly, values
reconstructed with a difference (up to 3 concrete examples, both sides), and values the schema has
nowhere to hold. It exits non-zero below the threshold below.

### What this is NOT

It is **not a migration**, and no part of it is a step toward one in this cycle. `reconstruct()` has
exactly one consumer — the report. The app still reads `data/seed/`, the registry still ingests
`data/seed/`, and no page, route or test changed. The value delivered is a number, not a code path.

Four rules keep the number honest:

1. **"Not reconstructable" means the schema has nowhere to hold it** — `parties.color`, a minister's
   map pin, an SVG path. Anything else that fails to come back is a **difference**, including a value
   that is merely re-cased or rounded. `vote_share` is compared exactly; a recomputed `margin` is
   compared exactly. The first version of this file broke its own rule: it listed `photoUrl` (2,920)
   and `incumbentYears` (157) as unstorable while the registry held a cited claim for every one of
   them, i.e. it told a reader the cycle's two recovered fields were unrecoverable. Both are now
   reconstructed, and `isIncumbent` with them (it is `incumbentYears != null` — a stored boolean
   beside the number it shadows can only disagree with it).
2. **Merge ambiguity is reported, never guessed.** A `candidacy` has no name column: the name a
   source used lives on `person_alias`, which is keyed by person and not by candidacy. Resolution
   merged 1,160 persons, so for a merged person the registry holds N spellings and cannot say which
   row each belongs to. Those values are counted `ambiguous`, and `guessable` records how often the
   obvious guess (the survivor's `canonical_name`) would have been right — 1,560 ambiguous values,
   of which 821 are guessable. The report refuses the guess and shows you the size of the refusal.
3. **Rows the ingest deliberately discarded are counted as lost, under their own line.**
   `historical-results.json` holds 40 `(year, AC)` keys twice; the ingest keeps one. That is 1,655
   leaf values the round trip cannot return, and they are reported as one pseudo-field rather than
   smeared across twenty field lines.
4. **A rebuilt row the seed has no row for is counted too.** The first version walked only the seed,
   so a rebuild could invent unlimited rows and still score 100% — and it was already doing it,
   printing `provenance.json rows seed 7 / rebuilt 8 / matched 7 values 14/14 exact 100.0%`.
   Unmatched rebuilt rows now land under `(row invented: no seed row for this key)` and cost the
   percentage exactly what a lost row costs it.

### What the report deliberately does NOT measure

`wb-ac-paths.json` (294 rows) and `wb-districts.json` (19) are not in the report. Nothing ingests
them: an SVG path needs `place_version.geometry_ref` and a geometry store, and neither exists. Their
1,546 values entered the denominator at 0% and then had to be subtracted back out with a *second*
percentage, so the report printed two numbers to say one thing. Their cost is stated here instead —
1,546 values, 313 rows, `deleting the seed loses every map on the site` — which is where a fact that
never varies belongs. `provenance.json` is not a module either: it is the registry's own bookkeeping,
not seed content, and modelling it as one is what produced the false 100% above.

### Measured, 2026-08-09, after `migrate` + `ingest` + `resolve`

| module | rows seed → rebuilt | values exact | % |
|---|---|---|---|
| demographics.json | 294 → 294 | 2387/2387 | **100.0** |
| candidates.json | 2920 → 2920 | 41661/42135 | **98.9** |
| current-mla.json | 294 → 294 | 2241/2352 | **95.3** |
| historical-results.json | 1175 → 1135 | 35770/39805 | **89.9** |
| wbmps.json | 42 → 42 | 294/336 | **87.5** |
| parties.json | 32 → 32 | 176/208 | **84.6** |
| cabinet.json | 6 → 6 | 74/103 | **71.8** |
| constituencies.json | 294 → 294 | 1470/2058 | **71.4** |
| **eight ingested modules** | | **84073/89384** | **94.1** |

`candidates.json` was reported as 84.6% before the review: 3,077 values were sitting in the registry
being called unstorable.

### Threshold

`THRESHOLD_PCT = 94.0` — today's measured 94.07% floored to a tenth. It was 85.8 for one commit, over
eleven "modules", two of which nothing ingests and one of which was bookkeeping scoring a false 100%.
Deliberately not 100: cycle 1 shipped an unsatisfiable vote-share invariant and an always-red gate
teaches everyone to ignore the colour. The floor is a **ratchet**: it is raised in the same commit
that raises the number and never lowered to make a run pass. A drop means either the registry lost a
field or resolution merged more aggressively — both are things a reviewer should have to look at.

## What blocks 100%

Grouped by cause. The largest group is **not** a missing column — it is entity resolution, and it is
fixable with one column that also improves the product.

**A. Entity resolution (1,560 values, 821 of them guessable).** Every ambiguous value is a name:
`candidates.name` 289, `historical-results` winner/runnerUp/topContestants names 1,155,
`current-mla.name` 106, `cabinet.name`+`id` 10. One root cause: no link from a candidacy to the
alias that names it.

**B. Rows the ingest discards (1,655 values).** The 40 duplicate `(year, AC)` keys in
`historical-results.json`, kept one apiece.

**C. No column exists (1,813 values).** `constituencies.nameBn` / `districtBn` (588 — the ingest
drops a Bengali label identical to the Latin one, and in this seed it always is); `parties.color`
(32); `historical-results.marginPct` (1,135, derived from two stored numbers); `wbmps.lsNumber` (42);
`cabinet.lat`/`lng`/`inducted`/`bio` (19). Plus the 1,546 geometry values named above, which are
outside the measurement.

**D. The registry keeps the canonical value, not the label the row used (76 values).**
`partyAbbr` "ISF" comes back as "AISF" (36) because `party.short_name` is the register's
abbreviation, not the results file's; `historical-results` 2026 `winner.partyId`/`partyAbbr` come
back as the *nomination's* party for 20 seats where the results file disagrees with
`candidates.json`, because the ingest joins a 2026 result onto the existing candidacy and never
records the party the result declared. Note the contrast: the **31 unresolvable party labels round
trip verbatim** — `candidacy.party_raw` does exactly the job it was added for, and 2920/2920
`candidates.partyId` values are exact.

**E. A merge overwrote a declared column (185 values).** `candidates.gender` is absent for 185 rows
because `person.sex` is the *survivor's*, and a survivor built from a press or results row has
`sex` NULL. The declared gender was in the input and is now nowhere.

**F. Two real disagreements the round trip surfaced (19 values).** `current-mla.candidateId` comes
back different for 4 seats and non-null for 1 where the seed says null: the ingest matched the
declared winner onto the candidacy whose name-slug matched (c0095 → `wb26_1656` "Anupam Biswas"/BJP)
while `current-mla.json` names a different nomination (`wb26_1653` "Anupam Biswas S/O Uttam
Biswas"/IND). And 14 `winner.name` values differ in spelling because the 2026 join is on a slug, so
"DADHIRAM RAY" and "Dadhiram Ray" are one candidacy with one name. These are findings about the
input, not defects in the export.

## What would have to change to reach 100%

- `candidacy.name_as_declared` (or `person_alias.candidacy_id`) — kills all of **A** and the 14
  spelling differences in **F**. This is the single highest-value change: 1,574 values, and it also
  makes a candidate page able to print the name the affidavit used rather than a merge survivor's.
  It is also what would make the field-coverage probe for `candidates.name` exact instead of
  total-loss-only.
- `result.party_version_id` + `result.party_raw` — kills **D**: a declared result's party is a
  property of the declaration, not of the nomination it was joined to.
- Per-source declared columns instead of person-level ones (`sex` on the affidavit, not the person)
  — kills **E**.
- A composite key for `historical-results.json` that is not `(year, AC)`, upstream, or an accepted
  policy that a duplicated AC id loses one row — **B**, 1,655 values.
- Columns for the abandoned fields, or a decision to abandon them on the record: geometry
  (`place_version.geometry_ref` + a geometry store), `party.colour`, an `office`/`portfolio` table
  for `inducted`/`bio`/`lat`/`lng`.

Until those land, 94.1% is the honest ceiling, and `mandate export` is the thing that will notice
when it moves.

## Consequences

- One new subcommand, no new dependency, no change to any consumer. Cost is a report that has to be
  kept truthful as the schema grows: a new column that carries a seed field raises the number and
  the floor with it.
- The gate can be wired into CI as `mandate export` whenever the project wants it; it is not wired in
  this cycle, because a gate added in the same commit as its first measurement has never been
  observed to fail.
- There is no `--out=<dir>`. It wrote the reconstruction to disk as "evidence" and nothing — no
  script, npm script, test or doc — ever passed it.
