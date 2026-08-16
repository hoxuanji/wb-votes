# ADR 0003 — Entity resolution thresholds

Status: accepted · 2026-08-07 · Relates to §12 stages 1–4, §28's ship gate, §21 F8 · Implemented in
`packages/mandate/src/ingest/resolve/`, `ops/migrations/004_resolve_queue.sql`

## Context

India has no national politician identifier. The registry holds 7,327 `person` rows built from a
MyNeta affidavit extract (2026 nominations, with declared ages) and a Lokdhaba-derived results file
(2011/2016/2021 winners and runners-up, with no ages), and the ingest disambiguates same-name
arrivals with a hash suffix — `abdur-rahim-boxi`, `abdur-rahim-boxi-eb389f`, `abdur-rahim-boxi-9a3e34`,
`abdur-rahim-boxi-d197bf`. Some of those are one human across four elections; some are four humans.
Deciding which is the moat.

§12 puts a human gate in the middle of that decision: auto-merge above a high threshold, auto-reject
below a low one, a staffed queue in between. This ADR fixes the two numbers, and — more importantly —
states what would move them.

## Decision

```
autoMergeAt = 0.92        merge with no human in the loop
queueAt     = 0.55        below this, reject and do not queue
[0.55, 0.92)              person_merge_candidate, state 'pending'
```

The score is a weighted sum over five features, plus one bonus, with one short-circuit and one cap:

| feature | weight | notes |
|---|---|---|
| name similarity | 0.45 | Jaro-Winkler over the alias cross product — Latin form, token-sorted Latin form, and the separator-joined token key. Floor 1.00 on token-key **equality**; **fixed at 0.85** on proper containment. |
| phonetic key | 0.10 | 1.0 on equality, 0.5 on containment, 0 otherwise. Both are compared on the per-token key LIST, never on the concatenated `phoneticKey`. |
| constituency overlap | 0.18 | Jaccard over contested `place_id`s, plus the seats asserted by `mla_term` / `cabinet_portfolio` claims (an office-holder row has no candidacy). |
| party overlap | 0.12 | Jaccard after collapsing `party_lineage` `split`/`merge`/`rename` into equivalence classes. **Independents are excluded**: every independent candidacy points at the one `IND` party row, so counting it as a shared affiliation manufactured 0.12 for two unrelated people who both had none. |
| age proximity | 0.15 | **Signed**, in [−1, 1]. See below. |
| shared identifiers | +0.12 | Bonus only, outside the normalised sum. |

- **Same-contest short-circuit → 0, before any other feature is computed.** Two distinct candidacies
  in one contest are two humans. `candidacy UNIQUE (contest_id, person_id)` makes it checkable. The
  returned feature vector carries `nameSim: 0`, because the name was never looked at — no name score
  can outvote a hard negative if no name score exists.
- **Age is signed.** Implied birth year is `election year − age_declared`; the feature is the smallest
  residual over the candidacy cross product. `≤2 → +1`, `≤5 → +0.5`, `≤10 → 0`, then a linear ramp to
  `−1` at 20 years. A 20-year divergence therefore *subtracts* 0.15 rather than merely failing to add it.
- **`ageResidual > 15` caps the score at 0.60.** Below any sane `autoMergeAt`, inside the review band:
  a father/son pair sharing a name and a constituency goes to a human, it is not silently merged and
  not silently dropped.
- **An unobservable feature is redistributed, not zeroed — but it cannot buy certainty.** Age is
  missing on every results-sourced candidacy, so `ageResidual === null` divides the sum by `1 − 0.15`
  instead of counting a zero. Absence of evidence is not evidence against. Same reasoning puts shared
  identifiers outside the sum: in this corpus one human has a *different* `myneta_id` per election, so
  a non-match is the norm. **`ageResidual === null` then caps the score at 0.95.** Redistribution
  alone made `phoneticEqual + constituency 1 + party 1` come out at exactly 1.00 and published 927
  merges as *certain* on three agreeing features with the only negative one unobservable. The ceiling
  is above `autoMergeAt`, so it is not a refusal — it is a refusal to say 1.00. `ageResidual: null` in
  the stored evidence vector is how the audit counts them.

## Why these two numbers

**0.92.** It is the lowest threshold at which no *single* feature disagreement can carry a merge
through. Read off the weights, with the age term unobserved (the corpus's common case, so the divisor
is 0.85):

| what disagrees | score | outcome |
|---|---|---|
| nothing (identical name, same AC, same party), age unobserved | 0.95 (ceiling) | merge |
| nothing, and the ages agree | 1.00 | merge |
| party only — including "both were independents" | 0.859 | queue |
| constituency only | 0.788 | queue |
| name is containment, not equality (`NARMADA CHANDRA` / `NARMADA CHANDRA ROY`) | 0.862 | queue |
| name is Jaro-Winkler 0.844 with no key equality (`Banerjee` / `Bandyopadhyay`), everything else agrees *including* a consistent age | 0.830 | queue |

So 0.92 encodes exactly one rule: **auto-merge requires the name to match phonetically AND the
constituency AND the party to agree.** Anything less is a question, and questions go to people.
Raising it to 0.95 would now be a no-op on this corpus and not a strengthening: all 1,160 merges
score exactly 0.95, because every pair that can merge has an unobservable age and hits the ceiling.
0.90 was rejected because it lets the containment tier through — the containment class scores 0.862
by construction, and before that tier was split out of key equality, 0.90-and-up auto-merged
`Abdul Karim` into `Abdul Karim Chowdhary` on a real run. That class is now decided *uniformly*: the
containment floor is assigned, not `Math.max`'d against Jaro-Winkler, because letting the string
metric win inside the class made the auto/queue decision a function of how many characters the extra
surname has — `NARMADA CHANDRA`/`NARMADA CHANDRA ROY` merged at 0.9294 while `ABDUL KHALEQUE`/`ABDUL
KHALEQUE MOLLA`, same seat, same party, identical feature vector, was queued at 0.9176.

**0.55.** The floor at which a pair still contains a reviewable claim. It sits deliberately *below*
0.647 and *above* 0.381: an identical-name pair with **no** shared constituency and **no** shared
party scores 0.647 with the age term unobserved and reaches the queue, while a 0.72-similarity name
pair with nothing else in common scores 0.381 and does not. That
is the line we want: "same name, nothing else" is worth a human's ten seconds; "vaguely similar name,
nothing else" is not, and there are 159,685 of those. Lowering it to 0.40 grows the queue by roughly
an order of magnitude with pairs no reviewer can adjudicate from the evidence shown.

## Transitivity

Auto-merge edges are unioned with union-find. Then:

> **Before any component is merged, EVERY internal pair is scored — not only the edges that built
> it. If any internal pair is a same-contest hard negative, or scores below `autoMergeAt`, the
> ENTIRE COMPONENT IS REFUSED: nothing merges, and every internal pair is written to the queue with
> state `deferred`.**

The bar for an internal pair is `autoMergeAt`, not `queueAt`. Testing against `queueAt` left a hole
big enough to drive the father/son case through: three `Ajoy Mondal` rows where A~B and B~C are both
1.00 but A~C is 0.60 — `AGE_CAPPED_SCORE`, imposed precisely because their implied birth years are 38
years apart — fused all three into one person and recorded it as `decided_by='auto:v1', score=0.6` by
a resolver whose auto-merge bar is 0.92. A component may merge only when every pair inside it clears
the bar on its own; anything in the review band is a question, and questions go to people.

"Refuse and queue the cluster", not "merge anyway". On the corpus as of 2026-08-08 the rule fires on
nothing — 0 clusters refused, 0 `deferred` rows, all 8,683 queue rows `pending` — so it is currently
carried by the fixture, not by production data: `index.test.ts`'s `nirmal-maji` cluster (A and C in
one contest) and `ajoy-mondal` cluster (A~C capped for a 38-year age gap) are what keep it honest. An
earlier version of this section claimed 12 refused clusters on the real corpus; that was measured
before the cluster bar moved from `queueAt` to `autoMergeAt` and before the name fixes, and it is not
reproducible today.

**The survivor is picked by evidence, not by id sort.** Most candidacies, then the most tokens in the
canonical name, then the longest name, then the id as the deterministic tie-break. Rooting the cluster
at its lexicographically smallest member made a truncated Lokdhaba row the registry's canonical name
for a sitting MLA: `canonical_name` "BANDYOPADHYAY", a bare surname, with "NAYNA BANDYOPADHYAY"
demoted to an alias, on every surface that renders a person's name.

The resolver then **iterates to a fixed point** (2 passes on the real corpus; `MAX_PASSES = 10`, and
reaching it THROWS rather than reporting a partial run — a loop that exits on the bound has not
converged, so `resolve` would no longer be idempotent and every count in the report would be a lie
under a green exit code). A merge enriches the survivor with the absorbed record's constituencies, parties and ages,
so a pair that scored 0.86 can legitimately clear 0.92 next pass. This is not transitivity by the
back door: every pass re-scores from scratch and re-applies the refusal rule, so A and C merge only
on the evidence they actually hold after absorbing B. It is also what makes `mandate resolve` twice
in a row produce zero new merges, which is the property an operator needs.

## Measured on the fixture (`resolve/index.test.ts`)

| pair | score | decision | correct? |
|---|---|---|---|
| `Md. Salim` / `Mohammed Salim`, same AC, +5y age, different contests | 1.00 | merge | ✓ |
| `Ratan Roy` / `Ratan Roy`, **same contest** | 0.00 | reject | ✓ |
| `Bimal Ghosh` / `Bimal Ghosh`, different districts, 25y gap | 0.40 | reject | ✓ |
| `Ajit Mondal` / `Ajit Mondal`, same AC, same party, 28y gap | 0.60 (capped) | queue | ✓ |
| `Sujata Banerjee` / `Sujata Bandyopadhyay`, same AC, same party, +5y age | 0.830 | queue | ✓ (see below) |
| `Mamata Banerjee` (latn+beng+deva) / `মমতা ব্যানার্জী` | 1.00 | merge | ✓ |
| `Nirmal Maji` ×3 where two share a contest | cluster | refuse + defer | ✓ |
| `Kalyan Ghosh` ×2, same AC, same party, **no declared age** | 0.95 (ceiling) | merge | ✓ |
| `Ajoy Mondal` ×3, A~B = B~C = 0.95, A~C = 0.60 capped | cluster | refuse + defer | ✓ |
| `MD. AFFAN ALI` ×2, same AC, both **IND**, no age | 0.859 | queue | ✓ |
| `NARMADA CHANDRA` / `NARMADA CHANDRA ROY` and `ABDUL KHALEQUE` / `ABDUL KHALEQUE MOLLA` | 0.862 both | queue | ✓ |
| `Abai Dullah` / `Abdul Hai` — identical *concatenated* `phoneticKey` | 0.847 | queue | ✓ (0.95 before: token equality) |
| `Keya Biswas` / `ANCHHARUL HAQUE BISWAS` — `kbsbs` is a substring of `ankhrlhkbsbs` | 0.504 | reject | ✓ (0.862 before) |
| `NAYNA BANDYOPADHYAY` with candidacies / the same name as a **sitting MLA row with none** | 0.95 | merge | ✓ |

Precision 14/14, recall 4/4 on the pairs the fixture asserts a merge for; 0 wrong merges, 0 missed
merges. A fixture cannot estimate a rate — it pins behaviours.

**Banerjee vs Bandyopadhyay resolves to QUEUE, and that is the intended answer.** `core/indic`
deliberately puts them in one bucket (recall), and scoring deliberately declines to decide (0.830,
inside the band — every feature but the name agrees, and the name is 0.844, not 1.0). They genuinely are the same surname in two transliterations *and* genuinely are two
different surnames depending on the family. No feature available to v1 distinguishes those cases, so
v1 does not pretend to.

## Measured on the real registry (7,327 persons)

**These numbers are a snapshot, not a property.** They were re-measured on 2026-08-08 (Node 25.9,
`src/data` as of that date) and they drift the moment `src/data` or a threshold does. Reproduce them
before disagreeing with them:

```sh
npm run registry:ingest -- --fresh   # migrate + ingest, prints the ingest column below
npm run registry:resolve             # first run: the "fresh" column
npm run registry:resolve             # again: the idempotent column (must show merged 0, queued 0)
npm run registry:audit               # n=200 seed=1 by default; exits 1 on any red invariant
```

Every number below is copied from those four commands' output; nothing here is estimated.

```
ingest      7,327 persons   6,985 candidacies   4,357 results   22,414 claims / 22,414 citations
            0 uncited values   2,932 sources   1,176 contests   ~0.74 s
            19,882 person_alias rows for 6,201 distinct names (1-3 blocking-key rows per name)

resolve, first run on the fresh database
            persons 7,327 -> 6,167 after resolution   1,160 merges   2 passes (the 2nd proved the
            fixed point)   0 clusters refused   ~3.0 s (2,931-3,104 ms; wall time, so it moves)
            blocking 230,784 pairs of 26,838,801 naive = 99.1401% reduction
            9,085 buckets   maxBucket 404   0 oversized   0 unparseable term claims
            398,835 pair scores over the 2 passes (each pass re-scores from scratch)
            8,683 queued   159,685 rejected   968 hard negatives   queueDepth 8,683
            every one of the 1,160 merges scored exactly 0.95 — AGE_UNOBSERVED_CEILING, on 1,160/1,160

resolve, run again (idempotency, and the only run whose blocking figures describe the RESOLVED corpus)
            merged 0   queued 0   1 pass   ~1.2 s
            blocking 168,051 pairs of 19,012,861 naive = 99.1161% reduction
            5,769 buckets   maxBucket 350   0 oversized

audit       n=200 seed=1: sampled 200, 23 merged, 0 suspected wrong, 0.000%, invariantsFailed 0
            whole population (n=6,167, seed=1): 833 merged persons, 0 suspected wrong, no flag fired
```

Read the two `resolve` blocks as one run in two states: the first-run blocking figures are the
*pre-resolution* corpus (7,327 persons), the second-run figures are the *post-resolution* one (6,167).
Quoting 168,051 pairs next to 7,327 persons — as an earlier version of this section did — mixes them.
`persons`, `pairs`, `buckets` and `maxBucket` are the FIRST pass of a run; `aboveAutoMerge`,
`refusedClusters`, `rejected` and `hardNegatives` are its LAST pass, which is why a converged run
reports `aboveAutoMerge 0` beside `merged 1,160`: by the pass that proved the fixed point there was
nothing left above the bar. `merged` and `queued` are totals over all passes.

The person count is 7,327 and not 7,344 because the 40 duplicated `(year, constituencyId)` rows in
`historical-results.ts` are resolved by content (higher `totalVotes`) rather than by array position.
`queued` and `queueDepth` agree (8,683 = 8,683), and all 8,683 are `pending`: no cluster was refused
on this corpus, so there are 0 `deferred` rows.

**The 0% is a lower bound, not a validated precision.** Three of the four red flags
(`same_contest`, `age_divergence`, `no_shared_history`) describe states the v1 scorer *structurally
refuses to create*, so they can only ever fire on a human decision, a future scorer, or a lowered
threshold — they audit the merge **ledger**, not v1's judgement. Only `two_seats_one_election` is
reachable at these thresholds, and it fired 0 times over the whole population (833 merged persons,
1,160 merges). §28's <1% gate is therefore met in the honest sense (nothing checkable is wrong) and
*not* met in the strong sense (no human has looked). The first release that publishes
`/methodology/entity-resolution` must publish a **human**-adjudicated sample drawn from
`person_merge`, and this file should be updated with it.

## The ADR-0001 invariants, and the one that was unsatisfiable

ADR 0001 lists cross-table invariants a portable `CHECK` cannot express and routes them to
`registry:audit`. Until cycle 2 there was no runner, which a cycle-1 reviewer correctly filed as
docs-drift. `auditSample` now runs NINE — ADR 0001's five, both halves of D2's dropped `EXCLUDE`
constraint, the margin half split out of the share check, and 006's dropped merge-queue FKs — and
returns each with its row count, pass/fail, and the SQL that produced it. `registry:audit` exits 1 if
any of them returns rows. Measured 2026-08-08 on the real registry:

| invariant | rows | |
|---|---|---|
| `convicted_requires_court_order` (P5) | 0 | PASS |
| `vote_share_never_exceeds_100` | 0 | PASS |
| `margin_is_rank1_minus_rank2` | 0 | PASS |
| `contest_epoch_matches_election_epoch` (P4) | 0 | PASS |
| `contested_place_version_has_crosswalk_to_current_epoch` | 0 | PASS (vacuous: `delim-2008` *is* the current epoch) |
| `booth_votes_not_more_than_result_votes` | 0 | PASS (vacuous: `booth_result` is empty) |
| `party_version_no_overlapping_validity` (D2's view) | 0 | PASS |
| `party_version_no_two_open_ended_rows` | 0 | PASS |
| `queued_pair_names_two_live_persons` | 0 | PASS (006 dropped both person FKs; nothing else checks it) |

**Decision (cycle 2): ADR 0001's `vote_share` invariant is replaced by its one-sided half.** As
originally worded — "sums to 100 ± 0.5 per contest revision" — it was red on 1,009 of 1,135 contest
revisions and *unsatisfiable by construction*: `src/data/historical-results.ts` publishes only
`topContestants` (≤ 5 rows, no full field), so the tail of every larger field has no row at all and
the average sum is 72.9%. An invariant that can never go green gates nothing; it only teaches people
to ignore the gate. What survives truncation is the direction: a partial field can sum to *less* than
100 but never *more*, so `> 100.5` still catches double-counted or corrupted rows, which is the
failure mode worth a hard stop. The shortfall itself is not discarded — the ingest already reports it
per contest as the `incomplete_contestant_field` anomaly. The margin half was split into its own
invariant: fused into one `COUNT`, its 0 violations were invisible behind the share half's 1,009 and
could have regressed to red unnoticed. **Reversal trigger:** full candidate-level results (ECI Form
20 / Lokdhaba full field) land. Then restore the two-sided bound and delete the ingest anomaly.

ADR 0001 used to say `registry:audit` "is expected to fail the run when the view returns rows", which
was written before `audit` existed. Both files now describe the code: `case "audit"` in
`bin/mandate.ts` exits 1 when `invariantsFailed > 0`, and `index.test.ts` drives the CLI on a database
with two open-ended `party_version` rows to prove the exit code, because an invariant reported in JSON
under exit 0 is not a gate.

## Known blocker this package cannot fix: the root `tsconfig.json`

`npm run build` (i.e. `next build`) exits 1 on this package, and no change inside
`packages/mandate/**` can fix it. The root `tsconfig.json` has `"include": ["**/*.ts"]` and
`"exclude": ["node_modules", "scripts", "workers"]` — `packages` is absent, so Next's type-check
phase compiles the whole mandate tree under the *app's* compilerOptions, which lack
`allowImportingTsExtensions`, lack `target >= ES2015` and lack `downlevelIteration`:
104 errors, 100% of them under `packages/` (50× TS5097, 39× TS2802, 15× TS1501). The two configs are
mutually unsatisfiable — `moduleResolution: NodeNext` *requires* the `.ts` import extensions that the
app's `bundler` resolution *rejects*. `npm run registry:typecheck` is structurally blind to this
because it greps the package config's output only.

**Required owner action, one line:** add `"packages"` to `exclude` in the root `tsconfig.json`. The
app does not import the registry (the registry is a CLI over `.data/registry.db`), so excluding it
loses no coverage — `packages/mandate/tsconfig.json` type-checks the same files under the correct
options, and a probe config proved the app itself is at 0 errors once `packages` is excluded.

## What would make us change these numbers

Stated up front so the next person does not have to argue from taste:

1. **A human-adjudicated 200-merge sample showing >1% wrong merges.** Raise `autoMergeAt` to 0.95
   and re-measure. This is the §28 gate and it outranks every other trigger here.
2. **A human-adjudicated sample of the review band showing >90% of `[0.85, 0.92)` pairs are correct
   merges.** Then 0.92 is costing reviewers thousands of pairs of work for nothing; lower it to 0.85
   and split the containment tier out of that band explicitly — the containment class now scores a
   single value (0.862) precisely so that it can be promoted or rejected as one decision.
3. **`age_declared` landing on historical candidacies.** Today it is the reason every single merge
   scores 0.95: age is unobservable for every pair that can merge, so the ceiling binds all 1,160 of
   them and the module's only negative signal never fires on a real decision.  (Lokdhaba does not carry it; an ECI Form 20
   or affidavit backfill would.) The age term stops being redistributed for most pairs, every score
   moves, and the whole table above must be recomputed. This is the single biggest pending change.
4. **A real identifier arriving** — `eci_candidate_id`, or a stable `myneta_id` per human rather than
   per nomination. A shared identifier should then be a *short-circuit to merge*, not a +0.12 bonus,
   and the name features become tie-breakers.
5. **Bengali-script aliases arriving in volume.** Today `person_alias` is 100% `latn`, so the
   cross-script path is exercised only by the fixture. Real Bengali data will change the Jaro-Winkler
   distribution (it runs on `toLatin` output) and the 0.45 name weight needs re-measuring against it.
6. **`party_lineage` gaining rows.** It is empty today, so the lineage-aware party feature is
   currently equivalent to exact party equality. Once splits are loaded, party disagreement becomes
   rarer and the 0.12 weight is worth less than it looks.
7. **A bucket exceeding `MAX_BUCKET = 500`** (observed max: 404 pre-resolution, 350 after, `mndl` —
   Mandal; 1.24x headroom,
   thinner than the 1.5x the code used to claim). That is a blocking problem, not a
   threshold problem, but it silently suppresses pairs and the report says so — do not raise the cap
   without looking at what landed in the bucket.

## Alternatives rejected

- **A trained classifier.** No labelled data exists; producing it is exactly the human review this
  design is building the queue for. A weighted sum whose vector is stored in `person_merge.evidence`
  is also the only version that can be *explained* to a politician disputing their profile (§21 F8) —
  "our model said 0.94" is not an answer, "same name, same seat, ages five years apart, and here are
  the two nomination records" is.
- **A single threshold with no queue.** Every choice of one number is either a merge machine or a
  do-nothing. §12's human gate is the design.
- **Merging on name equality alone.** 993 same-contest pairs in this corpus have identical names.
- **Blocking-time precision.** Rejected in `core/indic`'s own header and reaffirmed here: a pair in
  two buckets is a duplicate that survives forever, a pair wrongly in one bucket costs one
  `scorePair` call. Over-collapse and reject in scoring.
