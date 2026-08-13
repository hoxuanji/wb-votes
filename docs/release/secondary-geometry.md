# Secondary geometry — what was accepted, what was refused, and how each was decided

Phase 3's closure asks for the seven jurisdictions where a secondary source is most likely to be the *wrong*
delimitation to be examined one by one. This is that examination. The source classification and the reasons
for rejecting the primary alternatives are in [`../geo/sources.md`](../geo/sources.md); this is about
reconciliation.

## The rule the pipeline applies, before any state is discussed

A secondary dataset is never trusted for what it *is*. It is trusted for what it can be **reconciled to**, and
reconciliation has to succeed on all four of:

| | |
| --- | --- |
| **Jurisdiction** | the source's own state key resolves to one registry jurisdiction, or to a declared few, and the constituency is found in one of them |
| **Epoch** | the source declares WHEN its boundaries were in force, and the epoch is the latest one the registry contests that had taken effect by then. An order effective after the source's vintage cannot be selected at all |
| **Identity** | number and name, or number and a truncation of the name, or number and a phonetic match, or a name unique in the epoch, or a name plus the source's own number as a tie-break. Never a similarity score |
| **Topology and extent** | a drawable ring, no duplicate within the epoch, one polygon per place_version, and a bounding box that sits inside the jurisdiction's extent in an **independent publisher's** administrative geometry |

Anything that fails is **staged**: reported by name in [`../geo/import.md`](../geo/import.md) and not written.
95 constituencies are in that state.

## The seven jurisdictions

The first six share one fact, and it is a document rather than an inference. DPACO 2008 **did not redraw**
Arunachal Pradesh, Assam, Manipur or Nagaland, and did not apply to Jammu & Kashmir at all; its own Part notes
say each state's content is the earlier order restated, verbatim. Phase 1.5 acquired the order, quoted those
notes, and wrote them into the registry as 418 `place_version_link` rows of kind `derived_from` with the
sentence as the basis. So "this polygon is valid for both epochs" is a **citation**, not a judgement.

| jurisdiction | source declares | resolved to | linked | also written to `delim-2008` | verdict |
| --- | --- | --- | --- | --- | --- |
| **Assam** | pre-delimitation | `delim-1976` | 126 of 126 | 126, via `derived_from` | ACCEPTED |
| **Manipur** | pre-delimitation | `delim-1976` | 60 of 60 | 60 | ACCEPTED |
| **Nagaland** | pre-delimitation | `delim-1976` | 60 of 60 | 60 | ACCEPTED |
| **Arunachal Pradesh** | pre-delimitation | `delim-1976` | 59 of 60 | 59 | ACCEPTED, one staged |
| **Jammu & Kashmir** | pre-delimitation | `delim-1976` | 80 of 87 | 80 | ACCEPTED, seven staged |
| **Jharkhand** | pre-delimitation | `delim-1976` | 81 of 81 | **0 — refused** | ACCEPTED for 1976, REFUSED for 2008 |
| **West Bengal** | post-delimitation | `delim-2008` | 276 of 307 | n/a | ACCEPTED, 31 undrawable |

### Jharkhand — the refusal that proves the rule is doing something

The source marks Jharkhand's constituencies pre-delimitation, exactly as it marks Assam's. Its 81 seats
reconcile to `delim-1976` cleanly: 78 on number and name, 3 on number and phonetics, none staged.

**And nothing is written to `delim-2008`, which is the epoch Jharkhand votes under today.** DPACO 2008 applied
to Jharkhand and redrew its boundaries, so the registry holds no `derived_from` link for it — and the pipeline
follows links, not lists. Jharkhand's 2019 assembly result therefore has no polygon it may legally be drawn
on, its page falls back to a district tally and says so, and all 81 seats appear in
[`geometry-coverage.md`](geometry-coverage.md) as SECONDARY-SOURCE-CANDIDATE: a source of the right vintage
exists and does not describe this epoch.

Had the pipeline reasoned "the source says pre-delimitation, and pre-delimitation content served DPACO 2008 in
Assam, so it serves it here", Jharkhand would have 81 wrong polygons and no warning. That is the single most
likely way to get this wrong, and the registry's own citations are what prevent it.

### Jammu & Kashmir — two orders, and only one of them is reachable

The 87 seats the source carries are the **1995** J&K Delimitation Commission's, which DPACO 2008 reproduced in
its Annexure. Those reconcile and are written to both `delim-1976` (where this registry holds them) and
`delim-2008`.

**The 2022 order is not reachable and must not be approximated.** `delim-2022-jk` takes effect 2022-05-20;
the newest declared source describes 2014-11-24. A source cannot describe boundaries drawn after it, so the
five parliamentary seats of that epoch are EPOCH-BLOCKED — and the only published form of the order is a
13.3 MB scan with **zero** text operators. Two of the 87 were additionally refused by the containment check:
LEH and ZANSKAR fall outside Jammu & Kashmir's extent in a post-2019 basemap, because Ladakh is its own
jurisdiction there. Correct, and visible.

### Assam — the same shape, one epoch further on

`delim-2023-as` takes effect 2023-08-11. Its 14 parliamentary seats are EPOCH-BLOCKED for the same reason and
with the same evidence: the final notification is a 6.9 MB scan, 210 image objects, no text layer. Assam's
assembly map is complete on `delim-2008` because that is the epoch its 2021 election was held under; its 2026
assembly election, when it happens, will need geometry this release does not have and the page will say so.

### West Bengal — accepted, and the identity defect left alone

276 of 307 place_versions matched, 200 of them on a name unique in the epoch rather than on a number, because
two sources numbered that epoch differently and the seed's numbering is not the Commission's. **The identity
model is untouched**, as the closure brief requires: no version merged, no number rewritten, no name conflict
resolved. What changed is only which polygon each version carries, decided by the authoritative source's own
keys.

31 versions still hold geometry from the superseded repo module in the old projection. They are withheld from
the map rather than drawn in the wrong place, counted as WRONG-FRAME in the coverage report, and they
disappear on a fresh rebuild — the module has left the seed.

## What was not evaluated, and why

No further secondary dataset was sought. The two accepted sets cover 30 of 31 assembly jurisdictions and all
36 parliamentary ones; the gaps that remain are **not** gaps a third dataset would close:

* the two post-2014 orders, which no vector source describes;
* 234 individual seats whose names the accepted source spells differently or omits — a reconciliation problem,
  not a coverage one, and one more dataset would add a third spelling to disagree with;
* Andhra Pradesh's 128, where the source holds undivided Andhra Pradesh's seats in Telangana-first numbering.

Adding a source to raise a percentage, against seats that failed reconciliation rather than availability,
would import geometry nobody has reconciled. The brief's instruction and the pipeline's design agree: if it
cannot be reconciled deterministically, it is not imported.
