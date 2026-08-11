# Delimitation of Assam and Jammu & Kashmir — evidence report

Written **2026-08-11** for Phase 1.5, whose object was to unblock the 19 held-back 2024 Lok Sabha
constituencies (Assam 14, Jammu & Kashmir 5). See [ls-2024-import.md](../ingestion/ls-2024-import.md) for
why they were held back.

**Status: RESOLVED — 543 of 543. See [Resolution](#resolution--2026-08-11) at the end.**

What follows is the evidence report as it was written before the resolution, kept intact because the
reasoning matters and one of its conclusions was wrong and had to be corrected in place. Read in order it
records: what the Gazette established, the wrong inference drawn from it, the primary order that disproved
that inference, and then what was built. Nothing here has been rewritten to look as though it was right the
first time.

The report's original status line read: *"J&K is fully evidenced. Assam is not… Nothing has been written to
the registry."* Both halves have since changed — Assam's epoch was built on its publication date with the
basis recorded as such, and the registry now holds all 543.

## What the evidence establishes, and it reframes the problem

The single most important finding is not about 2024 at all. The Gazette of India order that re-opened the
Assam exercise states, in terms:

> And whereas the Delimitation Commission completed the delimitation exercise and the Delimitation Order,
> 2008 in respect of all States **except Assam, Arunachal Pradesh, Manipur and Nagaland** as published on
> 26th November, 2008

— *Ministry of Law and Justice (Legislative Department), Order, New Delhi, the 28th February, 2020,
S.O. 903(E)*

**So the 2008 Delimitation Order never applied to those four states.** Their constituencies stayed on the
1976 order until the new exercise. The same order records that the President had deferred delimitation in
Assam by **S.O. 283(E)** of February 2008, and rescinds that deferment because "the circumstances that led
to the deferring of the delimitation exercise in the State of Assam have ceased to exist".

That contradicts what this registry currently says. Measured on the live registry:

| jurisdiction | pc place_versions per epoch | 2009/2014/2019 contests sit in |
|---|---|---|
| Assam | delim-1952: 12 · delim-1963: 14 · delim-1976: 14 · **delim-2008: 14** | delim-2008 |
| Arunachal Pradesh | delim-1976: 2 · **delim-2008: 2** | delim-2008 |
| Manipur | delim-1952: 2 · delim-1963: 2 · delim-1976: 2 · **delim-2008: 2** | delim-2008 |
| Nagaland | delim-1963: 1 · delim-1976: 1 · **delim-2008: 1** | delim-2008 |
| Jammu & Kashmir | delim-1963: 6 · delim-1976: 6 · **delim-2008: 6** | delim-2008 |

And Assam's `delim-1976` and `delim-2008` sets are **identical, 14 of 14** — same numbers, same names, same
`name_source_id`:

```
 1 KARIMGANJ == KARIMGANJ      8 MANGALDOI == MANGALDOI
 2 SILCHAR   == SILCHAR        9 TEZPUR    == TEZPUR
 3 AUTONOMOUS DISTRICT == …   10 NOWGONG   == NOWGONG
 4 DHUBRI    == DHUBRI        11 KALIABOR  == KALIABOR
 5 KOKRAJHAR == KOKRAJHAR     12 JORHAT    == JORHAT
 6 BARPETA   == BARPETA       13 DIBRUGARH == DIBRUGARH
 7 GAUHATI   == GAUHATI       14 LAKHIMPUR == LAKHIMPUR
```

The `delim-2008` rows were reached through TCPD's `DelimID`, which assigns its fourth delimitation to any
election after 2008 (`sources/lokdhaba.ts` maps `DelimID 4 → delim-2008`). On the strength of S.O. 903(E)
alone that looked like an importer artefact for states the 2008 order excluded.

**It is not, and acquiring the 2008 order itself is what settled it.** DPACO 2008
(`9e1ac49aa952febc8e4f57ed23abd28218a21887f355f8dad1502ab5c0d65e69`, ECI doc 3931, 1,340,728 bytes,
639 pages, text layer present) **does contain a Part for each of those states**, and each Part carries the
Commission's own note that its content is the earlier order restated, verbatim:

| DPACO 2008 Part | note in the order itself |
|---|---|
| IV — Arunachal Pradesh | "as per the details given in Order of the Election Commission of India in pursuance of clause (c) of sub-section (4) of Section 14 of the State of Arunachal Pradesh Act, **1986** (69 of 1986), notified in the Central and the State Gazettes on **17th July, 1989**" |
| V — Assam | "as per the details included in the Delimitation of Parliamentary and Assembly Constituencies Order, **1976** for the State of Assam" |
| XII — Jammu and Kashmir *(Parliamentary Constituencies only)*, 1 page | "As per details included in Delimitation of Parliamentary and Assembly Constituencies Order, **1976** under Articles 81 & 82 of the Constitution of India as applied to the State of Jammu and Kashmir by the Constitution (Application to J & K) Order, 1954" |
| XVIII — Manipur | "as per the details included in Delimitation of Parliamentary and Assembly Constituencies Order, **1976** for the State of Manipur" |
| XXI — Nagaland | "as per the details included in Delimitation of Parliamentary and Assembly Constituencies Order, **1976** for the State of Nagaland" |
| Annexure — Jammu and Kashmir *(Assembly Constituencies only)* | "as per the details given in Order No. 1 of the Delimitation Commission, Jammu and Kashmir notified in the Central and the State Gazettes on **27th April, 1995**" |

That reconciles the two documents exactly, and both are right: the 2008 **exercise** did not redraw those
states (S.O. 903(E)), while the 2008 **order** reproduces their existing constituencies unchanged and says so.

**So the registry's `delim-2008` rows for these states are defensible, not defects.** Those constituencies
genuinely were in force under DPACO 2008; they are identical to the 1976 ones because the order made them
identical. Deleting them would destroy a true fact — that DPACO 2008 prescribed them — and would be a worse
error than the duplication.

What the registry does **not** record is the derivation: that Assam's, Manipur's and Nagaland's 2008 content
comes from 1976, Arunachal's from the 1989 order, and J&K's from 1976 (parliamentary) and 1995 (assembly).
That is a `place_version_link` with a cited basis, not a deletion — and it is a separate piece of work from
unblocking the 19.

**Correction of record:** an earlier draft of this document called the `delim-2008` rows for these five
jurisdictions an unfounded importer artefact, on the strength of S.O. 903(E) alone. DPACO 2008's own Part
notes disprove that. The duplication is faithful to the order.


## Source inventory

All six documents acquired from the ECI's own `delimitation-orders-publication` index and hashed. None is
in the registry.

| Slug | Document | Authority | ECI doc | Bytes | SHA-256 | Text layer |
|---|---|---|---|---|---|---|
| `assam-final-2023` | Delimitation of Parliamentary and Assembly Constituencies in State of Assam — Final Notification | ECI (Delimitation Division) | 15220 | 6,925,403 | `dce6860c5e2a8706ce446194b99289e923ebc2c2d046838a10456e6e19f7c6d9` | **none — scan** |
| `jk-final-2022` | Delimitation of Constituencies in Union Territory of Jammu & Kashmir — Final Notification | ECI | 14157 | 13,281,500 | `d5153ac51717bd08a68ef5d964591bec4553a79d0d685fe47b10029bcf76a73f` | **none — scan** |
| `jk-law-ministry-2023` | Gazette of India Extraordinary II-3(ii), **S.O. 2223(E)** of 20 May 2022 | Ministry of Law and Justice | 15233 | 985,857 | `5f16baf35ddfe7ddf41eb0d773aa7e860856b7e879b222b4be5943d088ba636c` | **yes** |
| `r1425` | Gazette of India Extraordinary, **S.O. 903(E)** of 28 Feb 2020 (rescinds the Assam deferment) | Ministry of Law and Justice | 13191 | 901,897 | `41e30756927de45c3ad7d0cc543978b076f83afefedb069b05cb52d8f8c85479` | **yes** |
| `jk-notification-2021` | Gazette of India Extraordinary, **S.O. 1023(E)** of 3 Mar 2021 (amends the 2020 Commission notification) | Ministry of Law and Justice | 13193 | `dec5e9f6…f1e76e2e` | 1,423,758 | **yes** |
| `delim-notification-2020` | Delimitation of Constituencies in Jammu-Kashmir, Assam, Arunachal Pradesh, Manipur and Nagaland — Notification of 06.03.2020 | ECI | 12211 | 802,065 | `6dacd914061f5a5b40a76aa3d5d8a9e4758b3a33f2fe4d64aa1b8a6518e7c824` | **none — scan** |

Retrieved 2026-08-11 from `https://www.eci.gov.in/eci-backend/public/api/download?url=…` (the URL carries an
opaque blob and must be re-discovered through `/api/delimitation-orders-publication`, exactly as the GE-2024
artefacts are). ECI's `Content-Disposition` filenames are randomised (`iUqGHdDOhF.pdf`), so the ECI document
id is the only stable handle.

Both large orders arrived **truncated** on the first attempt — curl closed early on Assam and timed out on
J&K at 4 MB of 13. Re-fetched with resume and verified complete by trailing `%%EOF`; a partial PDF is not a
source that can be hashed.

## Jammu & Kashmir — complete

The statutory chain, verbatim from `S.O. 2223(E)`:

> MINISTRY OF LAW AND JUSTICE (LEGISLATIVE DEPARTMENT) — ORDER — New Delhi, the 20th May, 2022 —
> S.O. 2223(E). In exercise of the powers conferred by sub-sections (2) and (3) of section 62 of the Jammu
> and Kashmir Reorganisation Act, 2019 (34 of 2019), the Central Government hereby appoints **the 20th day
> of May, 2022, as the date on which** the orders of the Delimitation Commission, **Order No. 1, dated the
> 14th March, 2022** and **Order No. 2, dated the 5th May, 2022**, published in the Gazette of India,
> Extraordinary, Part II, Section 3, Sub-section (iii), vide numbers **O.N. 6(E)**, dated the 14th March,
> 2022, and **O.N. 17(E)**, dated the 05th May, 2022, respectively, **shall take effect**.
> F. No. H.11019/03/2019-Leg. — Dr. REETA VASISHT

So, separately as the brief requires:

| | value | authority |
|---|---|---|
| statutory power | J&K Reorganisation Act 2019 (34 of 2019), s.62(2)–(3); Delimitation Act 2002 | S.O. 2223(E) |
| **order date** | **5 May 2022** (Delimitation Commission Order No. 2, Gazette O.N. 17(E)); Order No. 1 of 14 Mar 2022, O.N. 6(E) | S.O. 2223(E) |
| **effective date** | **20 May 2022** | S.O. 2223(E) |
| gazette identifier | CG-DL-E-20052022-235901 | the document itself |

The ECI's own `jk-final-2022` (doc 14157) is Order No. 2 — its `pdf_url` filename is
`FinalNotification5.5.2022`, agreeing with the gazette's 5 May 2022.

**What is still missing for J&K:** the constituency schedule. `jk-final-2022` is 21 pages, 20 images, no
extractable text, so the five parliamentary constituency numbers and names cannot be read from the order.

## Assam — incomplete

| | value | authority |
|---|---|---|
| statutory power | Delimitation Act 2002; deferment S.O. 283(E) of Feb 2008 rescinded | **S.O. 903(E), 28 Feb 2020** |
| 2008 order did **not** cover Assam | "in respect of all States except Assam, Arunachal Pradesh, Manipur and Nagaland as published on 26th November, 2008" | S.O. 903(E) |
| the exercise was to be carried out | "the circumstances that led to the deferring … have ceased to exist" | S.O. 903(E) |
| a final notification exists | title, ECI, published under the Delimitation Division | ECI doc 15220 |
| **order date** | **not established** | — |
| **effective date** | **not established** | — |
| constituency schedule | **not readable** | — |

`assam-final-2023.pdf` is a **pure scan**: 83 pages, 210 image objects, 128 CCITTFaxDecode and 82
DCTDecode streams, and **zero font objects**. A PDF with no fonts contains no text. Measured with
[.data/probe/delim/inspect.mjs](../../.data/probe/delim/inspect.mjs); text extraction with object-stream
support ([text.mjs](../../.data/probe/delim/text.mjs)) returns zero lines.

ECI's own metadata for the document gives `date_of_creation` **"Friday 11 Aug 2023"** — the date the
Commission published it on its website. That is a retrievable, citable date, but it is a *publication*
timestamp, not the order's date and not its effective date.

Searched and found nothing further: ECI's entire delimitation corpus is **32 documents** across three pages
of `/api/delimitation-orders-publication`, and the only 2023 Assam item is the scanned final notification.
`misc-orders`, `miscellaneous-publication` and `eci-publication` mention delimitation nowhere. The 2026 Assam
assembly election documents carry observer lists only, no press note citing the order. `egazette.gov.in` is
not reachable from this environment.

## Why a number-only mapping was rejected

Assam's 2024 seat 1 is Kokrajhar; the registry's Kokrajhar is seat 5. Assam's 2024 seat 7 is Karimganj; the
registry's Karimganj is seat 1. Mapping by seat number would file Kokrajhar's 2024 votes under Karimganj's
name — the same defect as Karnataka's parliamentary seat 1, which is BIDAR under the 1976 order and CHIKKODI
under the 2008 one and which this registry spent a repair undoing
([electoral-geography.md](electoral-geography.md)). Fuzzy name matching was refused for the same reason a
278-of-294 match was refused there.

## What would close this

**For Assam**, exactly one artefact: a text-readable copy of the final notification, or the Gazette of India
reference (an `O.N.`/`S.O.` number and date) for the Assam delimitation order equivalent to J&K's
O.N. 17(E). Any of these would do it:

1. The Gazette of India notification giving effect to the Assam order — the J&K analogue of S.O. 2223(E).
   `egazette.gov.in` would need to be reachable.
2. A text-layer PDF of ECI doc 15220 from the Commission.
3. OCR of the 83-page scan. **Not attempted, and not recommended as authority**: a misread digit in a
   statutory date or a constituency number is precisely the failure this phase exists to avoid, and an
   unverified OCR pass is a guess wearing a citation.

**For J&K**, the effective and order dates are established; only the constituency schedule is unreadable, and
the same three options apply to it.

## The remaining question, which is a judgement rather than a fact

For the *constituency list* — as distinct from the epoch's dates — there is an alternative authority already
in the registry: the ECI's own GE-2024 statistical reports, which are hashed sources and give every Assam and
J&K parliamentary constituency's number, name and reservation (report 4's `Const No.` / `Constituency` /
`Constituency Type`, cross-checked against report 13's `PC NO.` / `PC NAME`). Those reports are the ECI
conducting the election under the new delimitation.

Using them would mean: the *fact and identity* of the new epoch rests on the final notification (acquired,
hashed, cited); the *seat list within it* rests on the ECI's own conduct of the election. No name matching,
no number assumption, no third-party source. What it would **not** supply is a defensible `effective_from`
for Assam — `boundary_epoch.effective_from` is NOT NULL, and the only Assam date available is ECI's website
publication timestamp of 2023-08-11.

That is the decision this report stops at. It is not a data question.

---

# Resolution — 2026-08-11

**543 of 543. Zero unresolved, zero ambiguous, zero conflicts.** Applied with two commands, both idempotent:

```sh
node packages/mandate/bin/mandate.ts geography delimitation --apply
node packages/mandate/bin/mandate.ts eci ls-2024 --apply
```

## What was built

**Migration 015.** `boundary_epoch` gains four nullable columns so an epoch can say whose it is and what
its date means: `jurisdiction_id` (NULL = national), `order_date`, `order_reference`, and
`effective_date_basis` ∈ `legal_effective_date | order_date | publication_date | not_established`. The
publication date deliberately gets no column — `source.published_on` already holds it, on the row for the
document. `place_version_link` gains the kind `derived_from`; every kind but `name_match` still requires a
cited source at the schema level.

**Two epochs, each citing the order that drew it:**

| epoch | jurisdiction | effective_from | basis | order_date | source |
|---|---|---|---|---|---|
| `delim-2022-jk` | jk | **2022-05-20** | `legal_effective_date` | **2022-05-05** | S.O. 2223(E) |
| `delim-2023-as` | as | **2023-08-11** | `publication_date` | **NULL** | ECI final notification |

J&K's is a date the Central Government appointed, with the order's own date stored separately — fifteen
days apart, and both facts kept. Assam's `order_date` is **NULL and stays NULL**: the notification is a scan
and inferring an order date from a publication timestamp would be an invention. `effective_date_basis` is
what stops a reader mistaking one for the other.

**418 cited derivations.** Every `delim-2008` version in the five jurisdictions is linked `derived_from` the
same-numbered version in the epoch DPACO 2008 names, quoting the order's own words in `basis` and citing
DPACO 2008 as the source: Assam 126 ac + 14 pc, Arunachal 60 + 2, Manipur 60 + 2, Nagaland 60 + 1,
J&K 87 + 6. **418 of 418 carry a citation. Nothing was deleted.**

**Seven chain claims**, so the statutory route is queryable rather than a sentence in a name: DPACO 2008's
carry-forward, the rescindment of the Assam deferment by S.O. 903(E), the exercise's constitution, the
non-establishment of Assam's effective date, J&K's statutory power, its Commission's constitution, and the
date its orders took effect.

## How the 19 resolved, without a single exception in the importer

`stage.ts` no longer holds a constant epoch. It asks `currentEpochFor(db, jurisdiction)` — the newest
`boundary_epoch` that either names that jurisdiction or is national. Assam resolves to `delim-2023-as`
(2023-08-11) and J&K to `delim-2022-jk` (2022-05-20) because those beat DPACO 2008's 2008-02-19; every other
jurisdiction still resolves to `delim-2008` because it has nothing newer.

So the mapping is a property of the registry's own cited geography, and **the same code path that imported
the other 524 imported these 19**. No fuzzy matching, no seat-number shifting, no state exceptions, no
name-only inference. Future ECI imports resolve Assam and J&K automatically, and any jurisdiction
re-delimited later needs a cited epoch row and nothing else.

The `place` row is reused across epochs, not duplicated: `as.pc.001` is the seat-number grouping and its two
`place_version` rows are Karimganj (2008) and Kokrajhar (2023) — exactly how `ka.pc.001` has always held
BIDAR (1976) and CHIKKODI (2008). Zero new `place` rows were created.

## Verified

| | |
|---|---|
| Assam PC 1 | **Kokrajhar**, `delim-2023-as`, place_version 1066501, JOYANTA BASUMATARY 488,995, margin 51,583 |
| Assam PC 7 | **Karimganj**, JOYANTA… → KRIPANATH MALLAH 545,093, margin 18,360 |
| Assam PC 1 in 2008 | still **KARIMGANJ** — not overwritten |
| J&K PC 1–5 | Baramulla, Srinagar, Anantnag-Rajouri, Udhampur, Jammu — all `delim-2022-jk` |
| Karnataka PC 1 | **BIDAR** (1976) / **CHIKKODI** (2008) unchanged; 2024 → CHIKKODI |
| West Bengal | 220 `name_conflict` versions intact; `wb.ac.146` still `BISHNUPUR(SC)` |
| Surat | contest ✓, elected candidacy ✓, **0 result rows**, `elected_unopposed` claim ✓ |
| fabricated zero votes in ls-2024 | **0** |
| winners vs the ECI source | **542 of 542 exact on votes and margin**; 72 name differences are spacing only, and the ECI spelling is kept as a `person_alias` |
| the previously-imported 524 | **untouched** — results outside Assam and J&K still 8,116; correction ledger still 42 |

Before → after: contests 524 → **543**, results 8,116 → **8,359**, winners 523 → **542**, place_versions
16,810 → 16,829 (+19), place rows 5,813 → **5,813 (+0)**, links 8,741 → 9,159 (+418), epochs 4 → 6.

**Validation check 17** was added: every constituency must have a jurisdiction, a house-seat number, a
boundary epoch, a place_version, and an epoch that cites the order which drew it — classified VALID /
UNRESOLVED / AMBIGUOUS / CONFLICT, all three failure states hard. It would have fired had the 19 been forced
through against `delim-2008` before the orders were acquired.

**Three obsolete expectations corrected upward, none weakened:**

- `mandate elections validate` check 4 asserted one election = one delimitation. False for 2024: three
  delimitations were in force. It now groups by (election, jurisdiction, house), which is what
  `geography validate` check 2 has always done, and what remains forbidden — one jurisdiction's seats
  straddling two delimitations — is still caught.
- The geography metric `succession` counted every link that was not a `name_match` and asserted zero. The
  rule was "never invent continuity", not "never record it". It now counts **uncited** links, still asserts
  zero, and a companion metric asserts the 418 cited derivations exist.
- The ECI suite's "a renumbered jurisdiction is quarantined" became "a re-delimited jurisdiction resolves
  into its own cited epoch", asserting the epochs, their dates, their bases and that the 2008 names survive.

**356 tests, 355 pass** — the one failure is the pre-existing classified `searchPersons` ranking issue.
`mandate geography validate` 10/10, `mandate elections validate` 5/5, tsc clean, production build passes,
and both commands re-run with zero change across 13 tables.
