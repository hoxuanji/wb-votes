# turnout_pct — Turnout

**Unit** percent (1 dp) · **Grain** one contest · **Declared in** `packages/mandate/src/semantic/measures.ts`

## Formula

    voters / electors * 100, rounded to 1 decimal place

Rounding is to one decimal at the point of computation (`Math.round(x * 1000) / 10`), so the stored
figure and the rendered figure are the same number. Null when either side is missing or `electors`
is 0 — an unreported turnout is not a turnout of zero.

## Inputs

| Input | Source | Column |
| --- | --- | --- |
| `voters` | `turnout` row, `scope = 'contest'` | `turnout.voters` |
| `electors` | same row | `turnout.electors` |

1,135 contest-scope rows exist for 1,176 contests; the 41 without one produce null, not zero.

## Why this measure exists here

This is the measure the semantic layer was created for. Cycle 2 shipped **two** definitions —
`pct(voters, electors)` computed in the read path (`repo/person.ts`) and a stored `turnout_pct`
claim from the ingest — and a reviewer had to cross-check them by hand across all 1,135 contests
(they agree to within 0.15pp). `measures.test.ts` now asserts that agreement on real rows, so the
third writer inherits a test instead of a discrepancy.

## Known failure modes

- **Postal votes.** Contests before 2014 may exclude postal votes from `voters`, understating
  turnout by a fraction of a point. The direction is known: too low, never too high.
- **Roll vintage.** `electors` is the roll as of poll day. It will not match a current
  electoral-roll count, and comparing a 2011 turnout to a 2026 one compares two different rolls.
- **Booth and phase scope.** Only `scope = 'contest'` is a constituency turnout. A phase-scope or
  booth-scope row has a different denominator and must not be fed to this measure.

## What would make this number wrong

1. `voters` counted with postal votes for one election and without for another, then compared —
   the comparison, not either figure, is the defect.
2. An `electors` figure taken from a later roll revision than the poll: the denominator grows and
   turnout falls with no change in behaviour.
3. A turnout row whose `scope` is not `'contest'` (a phase total against constituency electors
   yields a figure above 100%).
4. Provenance: every claim over this registry is `confidence = 'provisional'` — only 8 of 2,932
   sources were ever fetched, so this figure is as good as an unverified upstream assertion.
