# Stage 1 — what the map can draw today, and what stands in the way

Phase 3's first instruction is to inventory before writing anything. This is that inventory, plus the four
things measuring it turned up. The matrix itself is generated —
[coverage.md](coverage.md), from `npm run registry -- geography coverage --write` — because a table typed by
hand is a claim nobody re-checks.

## The headline

| | |
| --- | --- |
| Jurisdictions with election results | 36 |
| (jurisdiction, house, epoch) groups | 203 |
| Contested seats, all epochs | 16,810 — **294 drawable** |
| Contested seats in the epoch each jurisdiction currently votes under | 4,812 — **294 drawable** |
| Groups COMPLETE | 0 |

**6 per cent of the country the product claims to cover.** One state of 36, one house of two, one epoch.
And not even that state is complete — see the West Bengal report below.

## What the registry actually holds

313 `place_geometry` rows: 294 West Bengal assembly constituencies and 19 West Bengal districts, all
`delim-2008`, all in one projection frame (`0 0 400 580`), from two sources:

| source | kind | publisher | url |
| --- | --- | --- | --- |
| `4d6106ed7147def5` | `static_module` | **none** | `repo:data/seed/wb-ac-paths.json` |
| `352af76aea95cd84` | `static_module` | **none** | `repo:data/seed/wb-districts.json` |

So the geometry the product ships has **no publisher, no upstream URL, and no hash over anything but this
repo's own file**. It is a source in the sense the schema requires and in no other sense. Whatever else this
phase does, it should not leave that as the provenance of the one map that works.

## Four findings

### 1. West Bengal has 307 constituencies where the state has 294 — STOP report below

The reason coverage.md says PARTIAL and not COMPLETE for the one state that has a map.

### 2. Fifteen assembly elections held since 2023 are not loaded, and the source does not have them

The newest assembly the registry holds, per jurisdiction, stops at 2023 everywhere except West Bengal.
Missing: Chhattisgarh, Madhya Pradesh, Mizoram, Rajasthan and Telangana 2023; Andhra Pradesh, Arunachal
Pradesh, Haryana, Jammu & Kashmir, Jharkhand, Maharashtra, Odisha and Sikkim 2024; Delhi and Bihar 2025.

**This is an upstream limit, not an ingestion defect.** Re-fetched `Rajasthan_AE.csv.gz` from
`lokdhaba.ashoka.edu.in/downloads` on 2026-08-12: 756,270 bytes, sha256 `8d010dee…`, **byte-identical to the
cached copy**, and its `Year` column ends at 2021. TCPD has not published those elections. The ECI pipeline
built in Phase 1 covers the 2024 Lok Sabha and would have to be extended per state assembly to close this,
which is a phase of its own.

Consequence for the map: Jammu & Kashmir's current epoch is `delim-2022-jk` for the Lok Sabha and
`delim-2008` for the assembly, because the 2024 assembly election that would have introduced the 90-seat
`delim-2022-jk` assembly set is not loaded. There is nothing to draw those 90 seats *for*.

### 3. Assam's 2023 delimitation exists for the Lok Sabha only

`delim-2023-as` holds 14 parliamentary constituencies and no assembly seats, correctly: Assam's first
assembly election under that order is due in 2026 and has not happened. Its assembly map's current epoch is
still `delim-2008`, whose content DPACO 2008 restated from 1976 — which the registry records with the
order's own words (finding 4).

### 4. The registry already knows which epochs are the same constituencies, and cites the order for it

418 `place_version_link` rows of kind `derived_from`, written in Phase 1.5, linking every `delim-2008`
constituency of Arunachal Pradesh, Assam, Jammu & Kashmir, Manipur and Nagaland to its `delim-1976`
counterpart, each with DPACO 2008's own Part note as the basis. That is not decoration: it means a polygon
valid for one of those epochs is valid for the other **by the order's own statement**, and the geometry
pipeline can act on it without a hardcoded list of exempted states. Jharkhand has no such link, and its
2008 boundaries genuinely differ from its 1976 ones — so the same rule that lets Assam share a polygon
across two epochs stops Jharkhand from doing it.

---

## STOP: West Bengal's assembly constituencies have two numberings and one of them is wrong

### PROBLEM

`wb` / `ac` / `delim-2008` holds **307 place_versions for a 294-seat assembly**. 220 of them carry
`name_conflict = 1`. Three elections — 2011, 2016 and 2021 — have **307 contests each**, so their seat
totals are overstated by 13 and each has 13 duplicate winners. Geometry is attached to the 294 versions
built by the seed, which is the numbering that disagrees with the Election Commission.

### EVIDENCE

Two sources built constituencies for the same epoch under different numbers. Dakshin Dinajpur district,
five consecutive seats:

| number | registry canonical (seed) | the other name on the same row (TCPD) | ECI's DPACO 2008 |
| --- | --- | --- | --- |
| 38 | Gangarampur | KUMARGANJ | Kumarganj |
| 39 | Harirampur | BALURGHAT | Balurghat |
| 40 | Kumarganj | TAPAN | Tapan (ST) |
| 41 | Balurghat | GANGARAMPUR | Gangarampur (SC) |
| 42 | Tapan | HARIRAMPUR | Harirampur |

The `name_variants` column records both, with the seed's marked `in_force`. **The TCPD column is the
Commission's numbering**, independently confirmed by the constituency geometry acquired in stage 2, whose
`AC_NO` agrees with TCPD and not with the seed on all five.

Where TCPD's number did not collide with a seed row, it created a new place_version instead of adopting
one. Thirteen did that — Farakka 55, Rejinagar 70, Haringhata 93, Panihati 111, Hingalganj 126,
Bishnupur (SC) 146, Ballygunge 161, Chunchura 190, Nandakumar 207, Sabang 226, Manbazar 243, Katwa 270,
Suri 285 — and each carries its own contest in 2011, 2016 and 2021. The seed's numbering pushes the
thirteen seats it displaced into numbers 295–307, which do not exist in West Bengal.

Winners are not scrambled: the seed's 294 contests carry the seed's results, and `wb-assembly-2021`'s
winner at number 38 is Gangarampur's winner, matching the name on that row. The defect is one of
**identity and counting**, not of attribution — 307 seats where there are 294, and thirteen seats reported
twice.

### OPTIONS

1. **Report and leave.** Attach geometry by the authoritative source's own numbers and names, which lands
   it on whichever version each polygon truly is. The 13 duplicates stay, undrawn and visible in the
   coverage matrix as the gap between 294 and 307.
2. **Merge the 13 pairs.** Re-point their contests at one version and delete the other. Smallest change
   that fixes the counts — and it deletes place_versions that results reference, which is an electoral
   identity migration.
3. **Renumber the seed's 294 versions to the Commission's numbering.** Correct at the root; the duplicates
   then collapse of their own accord. Rewrites `place_version.number` for ~220 rows, and `number` is half
   of the `UNIQUE (jurisdiction_id, kind, epoch_id, number)` key that everything else joins through.

### RECOMMENDATION

**Option 1 in this phase.** Options 2 and 3 change electoral identity, which the brief names as a stop
condition, and neither is a change to make in the same commit as a map. Option 3 is the right eventual fix
and it wants its own phase, its own before/after measurement, and the ECI's DPACO 2008 Part XXX read as the
authority rather than a third-party file agreeing with a second one.

### IMPACT

Of leaving it: West Bengal's assembly map reports "294 of 307 constituencies drawn" and its 2011/2016/2021
seat totals stay 13 too high. Both are visible rather than silent — the coverage matrix says PARTIAL and
the map's caption says the numbers.

Of doing it: ~220 rows renumbered, 13 place_versions and 39 contests deleted, three elections' seat totals
corrected from 307 to 294, and every URL of the form `/pl/wb/<district>/<seat>` re-verified, since the
place path is built from names that some of those rows would keep and others would lose.
