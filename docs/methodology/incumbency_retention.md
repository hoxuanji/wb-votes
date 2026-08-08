# incumbency_retention — Seat held by the same party

**Unit** rate (a per-pair boolean, rolled up) · **Grain** (place, election pair) ·
**Declared in** `packages/mandate/src/semantic/measures.ts`

## Formula

Per (place, election pair):

    1  if winning party id == previous winning party id
    0  if they differ
    null if either winner is unknown, or a boundary epoch changed between the two elections

Rolled up across places:

    retention rate = Σ(1s) / count of pairs where both winners are known

Pairs that are null are **excluded from the denominator**, not counted as losses. A single pair
formats as "held" or "changed hands"; a rolled-up rate formats as a percentage.

## Inputs

The rank-1 `candidacy.party_id` at each of the two contests, and the `place_version.epoch_id` of
each.

## The question it answers, and the one it does not

**It answers:** did this *party* hold this seat from one election to the next?

**It does not answer:** did this *member* hold this seat? The two diverge exactly where the story
usually is. A sitting MLA who defects and wins the seat again for a new party reads here as a
**LOSS for the old party** and a gain for the new one. That is the correct answer to the party
question and the wrong answer to the person question. Personal incumbency needs a person-level
measure over `candidacy.person_id`, which this is not, and calling this one "incumbency" without the
party qualifier invites precisely the wrong reading.

## Known failure modes

- **Party identity over time.** A merger, split or rename between the two elections reads as a change
  of party unless the `party` table maps both to one id. Alliance changes are invisible: an ally
  taking over a seat under a seat-sharing deal is a "change" with no change in the alliance's hold.
- **Undeclared results.** 2,627 candidacies have `status = 'contesting'` with no `result` row, so a
  pair whose earlier contest was never decided is null.
- **Boundary epochs.** A redrawn seat has no predecessor to be retained from. Everything currently
  loaded (2011–2026) is epoch `delim-2008`, so no live pair crosses one.
- **Independents.** A win by an independent has no meaningful party continuity in either direction.

## What would make this number wrong

1. Reading it as personal incumbency — the defection case makes it the opposite of the truth.
2. Counting null pairs as 0 in the denominator, which drags any rate toward zero in proportion to
   missing data rather than to real turnover.
3. Two party ids for one party (rename, merger) across the pair, or one id for two.
4. Provenance: all claims are `confidence = 'provisional'`; 2,924 of 2,932 sources were never
   fetched.
