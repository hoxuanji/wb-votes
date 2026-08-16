# enp — Effective number of parties (Laakso–Taagepera)

**Unit** count (2 dp) · **Grain** one contest · **Declared in** `packages/mandate/src/semantic/measures.ts`

## Formula

    ENP = 1 / Σ(sᵢ²)

where `sᵢ` is contestant *i*'s vote share as a **fraction of the recorded total**, not a percentage.
Feeding percentages in unchanged divides the answer by 10,000. Shares are renormalised over the
contestants on record before squaring, so a top-3 field summing to 80% gives the same figure as the
same three shares scaled to 100%.

Hand-checkable anchors, asserted in `measures.test.ts`:

| Field | ENP |
| --- | --- |
| 50 / 50 | exactly 2.00 |
| 100 / 0 | exactly 1.00 |
| 50 / 25 / 25 | 1 / 0.375 = 2.67 |

Null for an empty or all-zero field.

## Inputs

`vote_share_pct` for every contestant on record in the contest — and that is the problem below.

## The validity condition: the number is biased downward

`src/data/historical-results.ts` publishes only a **truncated top-N** field (at most 5 contestants),
so ENP here is computed over the top of the field and **not the field**. Renormalising the recorded
shares redistributes the missing tail's weight to the parties that are present, and those are the
large ones. Their squared shares rise, Σ(sᵢ²) rises, and 1/Σ(sᵢ²) **falls**.

**Direction of the bias: downward. This measure OVERSTATES concentration.** Every contest reads as
more of a two-horse race than it was, and the true ENP is at or above the figure shown — never
below. It is a floor, not an estimate.

This is not a footnote; it is the condition under which the number means anything, and it is the
same truncation that forced cycle 1 to weaken the "shares sum to 100" invariant to the one-sided
`vote_share_never_exceeds_100` (see `packages/mandate/src/ingest/resolve/index.ts`). **A chart that
renders ENP without stating the direction of this bias is misleading**, because the reader's natural
conclusion — "politics here is consolidating" — is exactly the artefact the truncation produces.

## Known failure modes

- **Cross-contest comparison.** Two contests truncated at different depths (a 4-contestant field vs a
  12-contestant field cut to 5) are biased by different amounts, so the *difference* between their
  ENPs is less trustworthy than either figure.
- **Time series.** If field size grew over the period, a flat ENP series can hide real
  fragmentation, and a falling one can be entirely the truncation.
- **NOTA and independents.** Not a party, but they carry share; whether they are in the field
  changes the figure and this registry does not consistently separate them.

## What would make this number wrong

1. Passing percentages instead of fractions (answer off by 10⁴), or not renormalising a field that
   sums to 72.9%.
2. Presenting it as an estimate of the true ENP rather than a lower bound.
3. Comparing ENP across contests, elections or states whose fields are truncated at different
   depths.
4. Provenance: all claims are `confidence = 'provisional'`; 2,924 of 2,932 sources were never
   fetched.
