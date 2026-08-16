# vote_share_pct — Vote share

**Unit** percent (1 dp) · **Grain** one candidacy · **Declared in** `packages/mandate/src/semantic/measures.ts`

## Formula

    candidacy votes / valid votes for the contest * 100, rounded to 1 decimal place

## Inputs

| Input | Source | Column |
| --- | --- | --- |
| candidacy votes | `result` row for the candidacy | `result.votes` |
| valid votes | the contest's `turnout` row | `turnout.voters` |

## The validity condition: the field is truncated

`src/data/historical-results.ts` publishes only a **truncated top-N** contestant field — at most 5
contestants per contest. 1,009 of 1,135 contest revisions are therefore short of the full field,
averaging a sum of **72.9%**. A share computed for a candidacy that IS on record is correct; the set
of shares rendered beside each other is incomplete.

This is why ADR 0001's "vote_share sums to 100 ± 0.5" invariant was weakened, in cycle 1, to the
one-sided bound `vote_share_never_exceeds_100`: a partial field can only sum to less than 100, never
more, so a sum above 100.5 means double-counted or corrupted rows. See the comment on that invariant
in `packages/mandate/src/ingest/resolve/index.ts`. The shortfall itself is reported per contest as
the ingest's `incomplete_contestant_field` anomaly.

## Known failure modes

- **The residual is not "others".** 100 minus the sum of the rendered shares is the missing tail
  **plus NOTA plus rejected ballots**, mixed together and not separable. Labelling it "Others" in a
  chart invents a category.
- **A missing party is not a party at 0%.** A party outside the recorded top-N has no share on
  record; rendering it as 0 asserts something the source does not say.
- **Denominator choice.** Share against valid votes is not share against votes polled where postal
  and rejected ballots differ; pre-2014 rows may not separate them.

## What would make this number wrong

1. Renormalising the truncated field to 100% and presenting the result as the real share — every
   share then reads too high.
2. Treating the residual as a single "Others" contestant, or as a party that did not contest.
3. Using a different denominator (votes polled, electors, or the field sum) on one page than on
   another — the failure the semantic layer exists to prevent.
4. Provenance: all claims are `confidence = 'provisional'`; 2,924 of 2,932 sources were never
   fetched.
