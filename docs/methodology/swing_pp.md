# swing_pp — Swing

**Unit** percentage points, signed (sign first) · **Grain** (place, party, election pair) ·
**Declared in** `packages/mandate/src/semantic/measures.ts`

## Formula

    vote_share_pct(party, place, this election) − vote_share_pct(party, place, previous election)

A **subtraction of two percentages**, so the unit is percentage points, never a percentage and never
a ratio. A party going from 38.1% to 45.3% swings **+7.2 pp**, not +18.9%. Rendered with the sign
first (`+7.2 pp`, `−11.5 pp`) so direction survives greyscale and a screen reader; colour may repeat
the sign and never carry it alone (§24, §27).

## Inputs

`vote_share_pct` at both ends (and therefore its truncation caveat), the two elections' ids, and the
`place_version.epoch_id` of each — the epoch is an input, not a footnote.

## Returns null, deliberately

| Case | Why null and not a number |
| --- | --- |
| Party did not contest the earlier election | An absent contestant has no prior share to fall from. **This is not a swing of −100.** |
| Party outside the recorded top-N in either election | Indistinguishable from not contesting, given this dataset. |
| Boundary-epoch change between the two elections | The two electorates are different populations. All 2011–2026 contests sit in epoch `delim-2008`, so nothing in the current data crosses one; a pre-2008 backfill immediately would. |
| Either result undeclared | 2,627 candidacies have `status = 'contesting'` and no `result` row. |

## Known failure modes

- **Small parties go missing, not small.** Truncation removes exactly the parties whose swing is
  most interesting at the bottom of the field, so an aggregate "average swing" over available pairs
  is an average over the large parties only.
- **Party identity.** A merger, split or rename between the two elections makes "the same party" a
  judgement the party table has to have already made; if it has not, the swing is measuring two
  different parties.
- **Alliance arithmetic.** A seat-sharing deal that moved a seat between allies shows as a large
  swing for both without any change in the alliance's support.

## What would make this number wrong

1. Substituting 0 (or −100) for a party that did not previously contest — the single most common way
   swing charts lie.
2. Computing it across a boundary-epoch change without a crosswalk, and not labelling it an
   estimate.
3. Expressing it as a percentage change of the earlier share instead of a difference in points.
4. Provenance: all claims are `confidence = 'provisional'`; 2,924 of 2,932 sources were never
   fetched.
