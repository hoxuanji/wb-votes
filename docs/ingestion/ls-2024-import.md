# Phase 1 — 2024 Lok Sabha, from the ECI's own reports

The first ECI ingestion. Built **2026-08-11**, verified against the live registry, and reproducible with
one command:

```sh
node packages/mandate/bin/mandate.ts eci ls-2024 --apply
```

Sources and their behaviour were established first in [eci-2023-2026.md](eci-2023-2026.md). This document
records what was built, what it imported, the defects it found on the way, and exactly what it did not do.

## The pipeline

```
DISCOVER → DOWNLOAD → HASH → STORE RAW → PARSE → NORMALIZE → STAGE → VALIDATE → IMPORT → REPORT
```

Nothing downstream ever sees an HTTP response. Each step writes its result to disk before the next reads
it, so each is separately runnable and the whole thing is resumable:

| Step | Code | Output |
|---|---|---|
| DISCOVER | [discover.ts](../../packages/mandate/src/ingest/sources/eci/discover.ts) | the 42 artefact URLs, from ECI's own index |
| DOWNLOAD · HASH · STORE | [acquire.ts](../../packages/mandate/src/ingest/sources/eci/acquire.ts) | `.data/cache/eci/**` + `manifest.tsv` |
| PARSE | [sheet.ts](../../packages/mandate/src/ingest/sources/eci/sheet.ts) | BIFF8 and XLSX readers, zero dependencies |
| NORMALIZE · STAGE | [stage.ts](../../packages/mandate/src/ingest/sources/eci/stage.ts) | `.data/cache/eci/staging/ls-2024.json` |
| VALIDATE | [validate.ts](../../packages/mandate/src/ingest/sources/eci/validate.ts) | 17 checks; a hard failure blocks the import |
| IMPORT | [import.ts](../../packages/mandate/src/ingest/sources/eci/import.ts) | one transaction, idempotent |
| REPORT | [ls2024.ts](../../packages/mandate/src/ingest/sources/eci/ls2024.ts) | the report below |

**Four reports, each for something the others do not carry.** 33 is the only file with every candidate;
13 is the only one that numbers the constituencies; 4 states the winner and margin outright, so neither is
inferred from row order; 2(A) is Surat.

**Zero new dependencies.** `.xls` is an OLE2 container of uncompressed BIFF8 records; `.xlsx` is a ZIP of
XML, and `node:zlib` inflates it. Format is decided by **magic bytes**, never by the extension — ECI ships
one 2023 report titled `…-pdf` that is an `.xlsx`.

## The import report

```
Election                          ls-2024
Expected constituencies           543
Constituencies staged             543
Imported constituencies           543      (524 before Phase 1.5)
Unresolved                        0        (19 before Phase 1.5)
Candidates (staged)               8360
Candidacies                       8360     (8117 before Phase 1.5)
Results                           8359     (8116 before Phase 1.5)
Winners                           542      (523 before Phase 1.5)
Rejected rows                     0
Warnings                          0
Sources                           4
Source hashes                     4
Report 33 rows                    8901
Report 13 rows                    542
Report 4 rows                     542
Join success                      542/542
All validation checks             PASS
```

Every figure was counted from the registry after the import, not assumed: 543 contests, 8,359 results,
542 declared winners, 8,359 candidacies with a declared age, 543 turnout rows, 4 sources carrying ECI's
caveat. **542 and not 543 because Surat held no poll** — see below.

Coverage before and after, for the 2024 Lok Sabha: **42 seats → 524 → 543**, all 42 of the earlier ones being
West Bengal placeholders with a margin and no vote counts. The last 19 arrived with Phase 1.5's delimitation
work; the figures in this report's table are that final state.

**Seventeen checks, not sixteen.** Check 17 requires every constituency to have a jurisdiction, a house-seat
number, a boundary epoch, a place_version, and an epoch that cites the order which drew it — classified
VALID / UNRESOLVED / AMBIGUOUS / CONFLICT with all three failure states hard. It would have fired had the 19
been forced through against `delim-2008`.

## The 543rd constituency

Classification: **source omission, by ECI's own explicit design — and resolved.**

Report 4's own footer says so:

> Note -This report is based on election related data of 542 PCs only excluding data of PC-24:Surat due to
> unopposed election in the PC. Important Statistical Information of PC - Surat may be seen in
> Report2A:Highlights(Surat PC).

So Gujarat PC 24, Surat, is absent from reports 33, 13 and 4 because **the seat was won unopposed** and
there was nothing to tabulate. Report 2(A) carries it, and the pipeline reads that report for exactly this
reason. Surat is imported as a contest with an elected candidacy, its electors and polling stations, and:

- **no `result` row.** `result_has_a_figure` requires votes, margin or share, and ECI publishes none of the
  three — its vote cell is `-`. A fabricated `0` here is precisely what migration 007 was written to undo.
- **a cited claim instead**: `contest:ls-2024:gj-pc024 / elected_unopposed = true`, citing report 2(A), with
  ECI's note as the claim's unit text.

That is why declared winners are 542 for 543 contests. The absence is asserted, not a hole.

## Defects this work found

Six, all fixed, all now regression-tested.

**1. Seven seats fielded a candidate with the winner's exact name.** Rewa had two JANARDAN MISHRAs — one on
477,459 votes and one, an independent, on 2,295. Matching the winner by name marked both, so 543 contests
produced **550 winners**. Report 4 states the winner's vote count beside the name; that is what separates
them.

**2. The same seven seats then collapsed at the candidacy layer.** `candidacy` is UNIQUE
(contest_id, person_id), so resolving both same-named candidates to one person made the second row
**overwrite** the first. Three constituencies lost their winner to a namesake with 780 votes. A person may
now hold at most one candidacy per contest; a second candidate of the same name becomes a new person marked
for review. This is the Bihar-2005 collapse in a new place, and it is why the next item exists.

**3. The importer reported success while the registry held fewer rows.** It counted 8,116 results; 8,110
were present. An upsert cannot fail loudly by itself, so the importer now **counts what is actually in the
registry before COMMIT** and refuses to commit on any disagreement.

**4. The bad person mapping was sticky.** `person_identifier(eci_candidate_id)` had recorded both ECI
candidate ids against one person, so re-running reproduced the collapse. The identifier now repoints on
conflict, and the guard covers the remembered path — so re-running repairs the registry rather than merely
refusing again.

**5. The seed's 42 placeholder winners would have doubled every West Bengal winner.** They carry a margin and
no counts. A prior result with **no vote count**, from a non-ECI source, for a contest ECI now reports in
full, is superseded: deleted, and written to the public correction ledger with what it said and why —
42 rows under `eci-ls2024-supersede-*`. A prior result that *does* carry votes is left alone, and check 5
fails on it rather than having the importer pick a winner.

**6. Party matching missed 58 winners, including all 29 Trinamool seats.** The registry's `party.id` **is**
the ECI abbreviation (`AITC`, `CPI(M)`); `short_name` carries TCPD's (`TMC`, `CPM`). Matching on id, short
name and full name — all three strings the registry already stores — resolved 240 more candidacies. No
abbreviation is invented: 920 candidacies still carry `party_raw`, mostly post-2019 splits (SHSUBT, NCPSP,
LJPRV, ZPM) that the register genuinely does not hold.

Two more, found earlier and recorded in [eci-2023-2026.md](eci-2023-2026.md): Node's `fetch` fails with
`connect EPERM` in this sandbox while `curl` works, so the transport is a seam with a curl fallback; and the
secret is read from ECI's own `var` declaration because following `headers:{secret:s}` back to `s` resolved
it to the string `"function"`.

## The 19 constituencies not imported — RESOLVED 2026-08-11

**All 19 are now imported: 543 of 543, zero unresolved.** Phase 1.5 acquired the delimitation orders that
created them and registered each as a cited `boundary_epoch`; `docs/model/delimitation-assam-jk.md` is the
full account, and the section below is preserved as the record of why they were held back.

The resolution in one line: `stage.ts` stopped assuming `delim-2008` and now asks the registry which epoch is
in force for each jurisdiction, so Assam resolves against its 2023 delimitation and J&K against its 2022 one
— through the same code path that imported the other 524, with no state exceptions, no fuzzy matching and no
seat-number shifting. Counts after: **543 contests, 8,359 results, 542 declared winners** (Surat still has
none), 8,359 candidacies with a declared age, and the previously-imported 524 untouched.

### Why they were held back, as recorded at the time

**Assam (14) and Jammu & Kashmir (5) are quarantined**, and this is the one substantive gap.

Both states were re-delimited after the 2008 order, so their 2024 constituencies are not `delim-2008`
slots. The evidence is decidable and carries no fuzzy matching — ECI's name for a seat sits at a *different*
number in the registry:

| ECI 2024 | ECI calls it | the registry calls that | and calls this number |
|---|---|---|---|
| as 1 | Kokrajhar | pc 5 | KARIMGANJ |
| as 2 | Dhubri | pc 4 | SILCHAR |
| as 7 | Karimganj | pc 1 | GAUHATI |
| jk 4 | UDHAMPUR | pc 5 | LADAKH |
| jk 5 | JAMMU | pc 6 | UDHAMPUR |

Adopting by seat number would file Kokrajhar's votes under Karimganj's name: the BIDAR/CHIKKODI defect
[electoral-geography.md](../model/electoral-geography.md) was written to undo. The **whole jurisdiction** is
held back, including seats whose number and name happen to agree — a state that was re-delimited did not
renumber some seats and keep others, and importing the coincidences would put two geographies inside one
state and one election.

**What would unblock them**, and why it was not done here: a `boundary_epoch` row built from the ECI
delimitation order for each state, as a cited source. The registry has modelled epochs as first class since
migration 011, and `geography validate` check 2 groups by jurisdiction, so a per-state epoch fits without
any change to identity semantics. What is missing is the **order itself** — its date and its text. Creating
an epoch with a date this pipeline guessed would be the fabrication this registry refuses everywhere else,
so the seats are reported as unresolved rather than filed under an invented epoch. Acquiring those two
orders is a bounded, separate task.

The other three name-resolution outcomes, for completeness: **518 adopted** where the name agrees or differs
only in spelling (ARUKU/Araku, PATALIPUTRA/Patliputra, AHMADNAGAR/Ahmednagar — 34 such variants, each
recorded as a `name_variant_eci_2024` claim, with the registry's own name never overwritten); **6 created**
for the seats in jurisdictions this registry had never held a parliamentary constituency for (Andaman &
Nicobar, Chandigarh, Daman & Diu, Dadra & Nagar Haveli, Ladakh, Lakshadweep).

## Validation

Sixteen checks, run before every import; a hard failure blocks it. The arithmetic identities are asserted as
exact because they were **measured** as exact on all 542 published constituencies first:

| | measured |
|---|---|
| EVM + postal = total, per candidate | 8,359 of 8,359 |
| sum of candidate votes = reported total valid votes | 542 of 542 (ECI excludes NOTA from "valid") |
| published share agrees with published votes, ±0.05pp | 8,359 of 8,359 |

An identity that held for 541 of 542 would be a warning. These hold for all of them, so one failure is a
real defect and the import stops.

## Provenance

One `source` row per artefact, `hash_kind='document_bytes'`, `retrieval_kind='fetched'`, with the URL,
retrieval timestamp, HTTP status, byte length, `Last-Modified` and a sha256 over the bytes as received.
Every result, turnout row, claim and created place_version cites one.

**Migration 014 adds `source.publisher_note`**, carrying ECI's own caveat verbatim:

> These statistical reports are prepared only for academic and research purposes from the secondary data
> filled in the Index Cards. The primary data is in the statutory forms maintained by the concerned
> Returning Officers and the data kept in statutory forms is final.

The Commission classes its own statistical reports as **secondary to Form 20**. `licence` is the governance
field the bulk surface filters on and `title` is not a place anyone reads a paragraph, so the caveat had
nowhere to live; without the column the only alternative was to drop it, and then a page built from a
statistical report would be indistinguishable from one built from the statutory record.

## Idempotency and atomicity

Every id is derived from content, so a second run upserts identical values over themselves. Verified by
snapshotting eleven tables, re-running, and diffing: **every count identical.** There is no "have I run
before?" flag to get wrong, and a half-finished run is completed rather than duplicated.

One `BEGIN`, one `COMMIT`, `ROLLBACK` on any throw. Proven twice, not asserted: the first `--apply` died on
`citation.page_no` and left the registry byte-for-byte as it was (42 results, 0 corrections), and a test
injects a failure mid-import and counts rows afterwards.

## Field classification

`FIELD_CLASS` in stage.ts labels every staged field RAW / NORMALIZED / DERIVED / INFERRED. The ones worth
naming here:

- **RAW** — votes, EVM votes, postal votes, all three vote-share denominators, age, gender, category, party,
  symbol, electors, turnout and its gender splits, polling stations, NOTA, **winner** (report 4 names them)
  and **margin** (report 4 states it).
- **NORMALIZED** — the match value for a name, and the jurisdiction id. Never stored as the fact.
- **DERIVED** — rank, the ECI candidate id, name-mismatch and reservation-conflict flags.
- **INFERRED** — the place_version a constituency resolves to, and the resolution outcome. These are this
  pipeline's judgements and are the ones a reviewer should be able to disagree with.

**8,116 candidacies carry a declared age with ECI provenance.** The registry's outstanding 193,951 unsourced
declared ages are a separate, older problem; these are not part of it.

## Not done in this phase, deliberately

- **No state page, no OSINT, no prediction, no verticals.**
- **Schedule ingestion.** The seam is ready and the data is RAW in the schedule API and report 1, but
  `election_phase` is untouched. `election.house_ordinal = 18` and `poll_no = 0` are set; announced dates are
  not, and are still absent rather than derived.
- **Entity resolution.** Nothing is merged. 8,117 candidacies resolved through
  `person_identifier(eci_candidate_id)`; pairs where an earlier source named the same human in the same
  contest go to the review queue, which now holds 52,350.
- **Index Cards and the per-AC PDFs.** No PDF is parsed. Every field v1 uses is in a spreadsheet.

## Consequences a reader should know

- **Party seat counts for 2024 are 542 seats' worth, not 543** — Surat's unopposed BJP win has no result row
  to count, and that is the only difference. (Before Phase 1.5 they were 524 seats' worth: BJP read 228
  rather than 240 because Assam's 9 and J&K's 2 were still held back.)
- **Surat appears with no winner in any query that reads winners from `result`.** It has an elected
  candidacy and a cited claim; it has no vote row, because no votes exist.
- **`situation.test.ts` had one obsolete expectation**, corrected upward rather than weakened: it asserted a
  2024 general-election party row could not exceed 42 seats, which was only true while the registry's 2024
  Lok Sabha was West Bengal alone. It now bounds rows by the Lok Sabha's own size and by the election's
  counted winners, and sums against the registry rather than a constant.

## State at the end

**356 tests, 355 pass.** The one failure is the pre-existing, classified `searchPersons` ranking issue,
untouched. `npx tsc --noEmit` clean, `npm run build` passes, real-registry smoke suite green,
`mandate elections validate` 5 of 5, `mandate geography validate` 10 of 10.
