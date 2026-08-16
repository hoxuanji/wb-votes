# margin_pct — Margin

**Unit** percent (1 dp) · **Grain** one contest · **Declared in** `packages/mandate/src/semantic/measures.ts`

## Formula

    (rank-1 votes − rank-2 votes) / valid votes * 100, rounded to 1 decimal place

Null when there is no rank-2 candidacy, or when valid votes is missing or 0.

## Inputs

| Input | Source | Column |
| --- | --- | --- |
| rank-1 votes | `result` row with `rank = 1` | `result.votes` |
| rank-2 votes | `result` row with `rank = 2` | `result.votes` |
| valid votes | the contest's `turnout` row | `turnout.voters` |

`result.margin` (absolute votes) is stored separately and is the input to the Person Brief's
"widest winning margin"; this measure is the percentage form of the same gap.

## Known failure modes

- **Uncontested seats.** No rank-2 means no margin. The answer is null. A 100% margin would be a
  fabrication, and 0% would be worse.
- **The wrong denominator.** Summing the recorded contestant field gives a denominator that is too
  small in 1,009 of 1,135 contest revisions (the field is a truncated top-N), which inflates the
  margin. Valid votes comes from the turnout row.
- **Undeclared results.** 2,627 candidacies have `status = 'contesting'` and no `result` row; a
  contest whose result was never declared has no margin, not a margin of zero.
- **Multi-member contests.** The formula assumes a single-member first-past-the-post seat. This
  registry holds none, so the case is undefined rather than handled.

## What would make this number wrong

1. Using the sum of the truncated contestant field as valid votes (inflates every margin).
2. Ranks assigned from a partial count — a rank-2 that was really rank-3 gives a margin that is too
   wide.
3. Treating an uncontested or undeclared seat as a 100% or 0% margin instead of null.
4. Provenance: all claims are `confidence = 'provisional'`; 2,924 of 2,932 sources were never
   fetched.
