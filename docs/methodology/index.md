# Methodology — model cards

Every derived measure in the product is declared once, in
`packages/mandate/src/semantic/measures.ts`, and has a model card here. §18 requires a measure
without a card to break the build; that is enforced by `modelCardProblems()` in
`packages/mandate/src/semantic/index.ts`, asserted both directions by `measures.test.ts` — a measure
without a card fails, and a card without a measure fails too, so a stale card cannot rot here
unnoticed.

| Measure | Reads | Unit | Grain |
| --- | --- | --- | --- |
| [turnout_pct](turnout_pct.md) | Turnout | percent | contest |
| [margin_pct](margin_pct.md) | Margin | percent | contest |
| [vote_share_pct](vote_share_pct.md) | Vote share | percent | candidacy |
| [swing_pp](swing_pp.md) | Swing | percentage points, signed | (place, party, election pair) |
| [enp](enp.md) | Effective number of parties | count | contest |
| [incumbency_retention](incumbency_retention.md) | Seat held by the same party | rate | (place, election pair) |

## What this layer is, and is not

It declares **meaning, caveats and formatting**. It is not a query compiler, not a dimension
registry and not a SQL generator — the repo layer still writes its own SQL, and each card's formula
is prose a human checks a query against. The property it earns its keep with today is §13's first
one: turnout is defined once, so the next writer inherits a test instead of a third definition.

## Two caveats every card repeats

**Provenance.** All 22,414 claims in this registry are `confidence = 'provisional'`: only 8 of 2,932
sources were ever actually fetched. Nothing here is verified, and no measure over it can be.

**Truncation.** The contestant field comes from a truncated top-N (at most 5 per contest), so shares
do not sum to 100 — 1,009 of 1,135 contest revisions are short, averaging 72.9%. `vote_share_pct` is
correct for the candidacies present and silent about the tail; `enp` computed from it is biased
**downward** and overstates concentration.
