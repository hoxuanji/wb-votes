# ROADMAP — India Election Intelligence

Where this stands, what was asked, and what is left. Updated **2026-08-11**.

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
| 10 | Upcoming elections with month and year, link to all state/UT dates | **year only** — announced dates and phases are not in the registry. The ECI publishes all eight fields as JSON for every 2023–2026 assembly election (`docs/ingestion/eci-2023-2026.md` §10); `election_phase` still holds zero rows |
| 11 | States dropdown in the top bar | **built** |
| 12 | State page: seat distribution, party-wise count, constituency results, historical, fact checks | **not built** — the dropdown lands on the existing state brief |
| 13 | Year dropdown on the state page | **not built** — `electionsIn()` is the query it needs, and exists |
| 14 | Search bar's hardcoded hint text looks bad | **fixed** |
| 15 | Don't make West Bengal the hero | **fixed** |
| 16 | Search and state picker looked disjoint in the chrome | **fixed** — one bordered control cluster after the wordmark |

## Where the data stands

| Measure | Value |
| --- | --- |
| jurisdictions with results | **36** of 36 |
| elections | 1,202 |
| contests | 64,014 |
| candidacies | 569,026 |
| results | **566,337**, every one carrying a source id |
| persons | 454,079 |
| parties | 3,330 |
| assembly seats, current delimitation | **4,117 of 4,123** (99.9%) |
| Lok Sabha | 538 of 543 for 2019 · **543 of 543 for 2024** |
| genuinely fetched, byte-hashed sources | 76 of 3,000 |
| merge queue | 52,350 pending |

**2024's Lok Sabha now comes from the ECI's own statistical reports** — 524 constituencies, 8,116 results,
523 declared winners, every candidacy carrying a declared age with ECI provenance, up from 42 West Bengal
placeholders that had a margin and no vote counts. `mandate eci ls-2024 --apply`;
`docs/ingestion/ls-2024-import.md`.

**All 543 are in, and the last 19 needed the delimitation orders themselves.** Assam was re-delimited in 2023
and Jammu & Kashmir in 2022, so their 2024 constituencies are not `delim-2008` slots — ECI's Assam seat 1
(Kokrajhar) is the registry's seat 5. Both orders are now acquired, hashed and registered as cited epochs,
with J&K's legal effective date (20 May 2022, S.O. 2223(E)) and its order's own date (5 May 2022) stored
separately, and Assam's start date recorded as a **publication date** because its notification is a scan and
inferring an order date from it would be an invention. `docs/model/delimitation-assam-jk.md`.

**Coverage otherwise stops where TCPD stops**: its assembly files end in 2022. The 2023–2026 assembly
elections are the next ingestion, and the reconnaissance in `docs/ingestion/eci-2023-2026.md` establishes
that 16 of 21 are available as spreadsheets.

**The five union territories with no assembly are now loaded for the Lok Sabha** (Andaman & Nicobar,
Chandigarh, Dadra & Nagar Haveli and Daman & Diu, Ladakh, Lakshadweep) — six parliamentary seats Lokdhaba
publishes no file for. They still have no assembly elections, because they hold none.

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
4. **2023–2026 assembly results.** TCPD stops in 2022. The ECI ingestion substrate now exists and the
   reports are the same shape per election, so this is the substrate's second use rather than a new build:
   16 of 21 state elections are available (Chhattisgarh, Karnataka, Tripura, Meghalaya and Nagaland 2023 are
   not, and must stay absent). `docs/ingestion/eci-2023-2026.md` §8.
5. **193,951 declared ages and educations render with no claim behind them** — a P2 violation the
   `coverage` command already prints.
6. **Historical on the home page** (ask 8), once the state page proves the component.
7. **The other seventeen verticals.** `tenure` — person × office × period — is the spine every one of them
   attaches to. The registry currently ends at `result`, which is why nothing yet represents *holding*
   power. See `docs/platform/00-model.md`.

## Known red, and why

**1 test of 355.** Down from 11, and nine of those turned out to be right about a defect rather than out of
date — see `docs/model/electoral-geography.md` §8 for the classification of each.

- **`searchPersons`: surname-first and given-name-first meet.** Real, and out of scope where it was found.
  "Md Salim" and "Salim Md" do reach the same person — both emit the order-independent key `md|slm` — but
  "Md Salim" also emits the bare token key `slm`, which matches every Salim in the registry, and the exact
  match is not ranked above them, so the overlap falls outside the top 50. Person-search ranking, not
  electoral geography.

Both validators are now fully green: `mandate geography validate` **10 of 10** and
`mandate elections validate` **5 of 5**. Geography's check 7 — the 34 Bihar seats with two winners — was
fixed by the election-identity repair below, not excused.

## Electoral geography: a boundary epoch now names its order, 2026-08-11

The 2024 general election was conducted under **three** delimitations — DPACO 2008 for most states, the J&K
Commission's 2022 order, and the ECI's 2023 Assam order — so `boundary_epoch` gained `jurisdiction_id`,
`order_date`, `order_reference` and `effective_date_basis`, and the importer stopped assuming a single epoch.
Assam and J&K's 19 seats resolved through the same code path as the other 524, with no state exceptions.

**A correction, recorded rather than quietly fixed.** The Gazette (S.O. 903(E)) says DPACO 2008 was published
"in respect of all States except Assam, Arunachal Pradesh, Manipur and Nagaland", and this project first
concluded those states' `delim-2008` rows were an unfounded importer artefact to delete. Acquiring DPACO 2008
itself disproved it: the order contains a Part for each, stating its content is an earlier order carried
forward. So the epochs are **kept**, and 418 cited `derived_from` links now record the derivation — Assam,
Manipur and Nagaland from 1976, Arunachal from the ECI's 1989 order, J&K from 1976 and the 1995 Commission
order. The rule was never "record no relationships", it was "invent none": all 418 cite the order, and the
`succession` metric was corrected to count uncited links and still asserts zero.

## The 2024 Lok Sabha ingestion, 2026-08-11

The first ECI ingestion, and the substrate for every one after it:
DISCOVER → DOWNLOAD → HASH → STORE RAW → PARSE → NORMALIZE → STAGE → VALIDATE → IMPORT → REPORT. Nothing
downstream sees an HTTP response; each step writes to disk before the next reads it, so the run is
resumable and a validation failure costs nothing. **Zero new dependencies** — `.xls` is BIFF8 records in an
OLE2 container, `.xlsx` is a ZIP of XML, and format is decided by magic bytes because ECI ships one report
titled `…-pdf` that is an `.xlsx`.

**The 543rd constituency is Surat**, and ECI's own note says why: won unopposed, so it is excluded from the
three main reports and published in report 2(A). It is imported as a contest with an elected candidacy and
**no result row** — `result_has_a_figure` wants votes, margin or share, and there are none — plus a cited
`elected_unopposed` claim. Hence 523 declared winners for 524 contests.

Six defects found and fixed, each now regression-tested. The two worth naming: **seven seats fielded a
candidate with the winner's exact name** (Rewa had two JANARDAN MISHRAs, on 477,459 and 2,295 votes), which
first produced 550 winners for 543 seats and then, because `candidacy` is UNIQUE (contest, person), made one
row overwrite the other and lost three winners outright — the Bihar-2005 collapse in a new place. And **the
importer reported 8,116 results while the registry held 8,110**, so it now counts what is actually there
before COMMIT and refuses to commit on any disagreement. Full account in
`docs/ingestion/ls-2024-import.md`.

Migration 014 adds `source.publisher_note`, carrying ECI's own caveat that these reports are secondary to
Form 20. Without it a page built from a statistical report would be indistinguishable from one built from
the statutory record.

## The election-identity repair, 2026-08-11

An election's identity was `(jurisdiction, house, year)`, held in an id string. **Bihar held two assembly
elections in 2005** — its 13th assembly in February, its 14th in November, 243 seats each — and both became
`br-assembly-2005`. `contest` is UNIQUE on (election, place version), so 486 contests became 243; a
candidacy id derives from (contest, person), so the **618 candidates who stood in the same seat at both
elections** collided and one row overwrote the other. 34 seats declared two winners.

An election is now an event: `house`, `year`, `polling_month`, `house_ordinal` (the source's Assembly_No),
`poll_no` and `occurrence`, under `UNIQUE (jurisdiction, kind, house, year, occurrence)`. The key is the
source's own `(Assembly_No, Poll_No)` — **not** the month, because polling is phased and 2019's Lok Sabha
election spans April and May. **Results went 557,645 → 558,263: exactly +618, the rows the collapse had
destroyed.** Contests with more winners than seats: 35 → 0.

Scanned all 62 files rather than assuming Bihar was alone: 1 general collision, 13 by-election-round
collisions, and a third defect the new constraint exposed — **the house an election fills was never
modelled**, so 145 assembly/parliamentary by-election pairs were told apart by nothing but their id text.
`substr(election_id, -4)` at 17 sites is gone: after the split it is actively wrong, since
`'br-assembly-2005-02'` ends in `'5-02'`. Full account in `docs/model/election-identity.md`.

## The electoral-geography repair, 2026-08-11

The registry identified a constituency as `(jurisdiction, house, seat number)` and wrote its name only when
creating the row, so whichever delimitation was imported first won the name for all the others. Karnataka's
parliamentary seat 1 is BIDAR under the 1976 order and CHIKKODI under the 2008 one; the registry called it
Bidar in both and put Chikkodi's 2019 winner beside the wrong name. **51,702 of 63,288 contests named a seat
from another delimitation; after the repair, 900 do, and all 900 are a recorded West Bengal conflict rather
than an unknown.**

A constituency is now a `place_version`: `(jurisdiction, house, epoch, number)` with its own name, district,
source identity and provenance, under `UNIQUE (jurisdiction_id, kind, epoch_id, number)`. All 62 source
files were re-fetched and every one is byte-identical to the sha256 recorded at import, so every corrected
name comes from the same document that produced the row it corrects. Two more defects surfaced on the way:
the importer was overwriting curated district rows (`Cooch Behar` → `COOCH BEHAR`, Bengali names to `{}`),
and Bihar 2005 above. Full account, including the West Bengal numbering conflict that is deliberately *not*
resolved and why a 278-of-294 fuzzy name match was refused, in `docs/model/electoral-geography.md`.

## How to keep this file honest

Update it in the commit that changes what it describes. Every figure here is reproducible:
`mandate coverage` for the registry counts, `npm test` for the red list, and `ops/geo/build-india.mjs`
for the map asset. If a number in this file cannot be reproduced by one of those, it is wrong.
