// The semantic layer, §13, in the only form this cycle needs: six measure records that declare
// MEANING, CAVEATS and FORMATTING. It is NOT a query compiler, not a dimension registry, not a SQL
// generator — the repo layer still writes its own SQL, and `formula` here is prose a human checks a
// query against, not something executed. Do not expect `select(measure)` to exist.
//
// The property that earns it its keep today is §13's first one: one definition of turnout. Cycle 2
// shipped two — `pct(voters, electors)` in the read path and the stored `turnout_pct` claim — and a
// reviewer had to hand-check that they agree (they do, to within 0.15pp over all 1,135 contests).
// The third writer gets `turnout_pct.compute` instead of a third query.
//
// ponytail: six records, no registry machinery — add a lookup/validator when a route accepts a
// measure id from the outside (that is /v1/query, not this cycle).


export type Unit = "percent" | "percentage_points" | "count" | "rate";

export type Measure<I> = {
  id: string;
  label: string;
  unit: Unit;
  /** Exact prose. The arithmetic a reader can check a query against, including the denominator. */
  formula: string;
  /** Validity conditions, not footnotes. Rendered wherever the measure is (§13.2). */
  caveats: string[];
  /** Repo-relative, and asserted to exist by measures.test.ts (§18 enforced as a test). */
  modelCard: string;
  format(value: number | null): string;
  compute(inputs: I): number | null;
};

/** Every measure over THIS registry inherits it: nothing here is verified. */
const PROVENANCE =
  "All 22,414 claims in this registry are confidence='provisional': only 8 of 2,932 sources were " +
  "ever actually fetched, so every figure is as good as an unverified upstream assertion.";

/** The truncation that bounds vote_share_pct and enp. Cycle 1 weakened the "shares sum to 100"
 *  invariant to a one-sided bound for exactly this reason — see resolve/index.ts
 *  `vote_share_never_exceeds_100`. */
const TRUNCATION =
  "data/seed/historical-results.json publishes only a truncated top-N field (at most 5 contestants), " +
  "so shares do not sum to 100 — 1,009 of 1,135 contest revisions are short, averaging 72.9%.";

// ── formatters, once ─────────────────────────────────────────────────────────────────────────────
// inr/rupees already existed in repo/brief.ts (cycle 2) and are re-exported from semantic/index.ts
// rather than rewritten: brief.ts is the Person Brief's presentation module, /p imports it directly,
// and moving them would edit a cycle-2 file this task does not own. The two that did NOT exist —
// percent and percentagePoints — are here.

/** One decimal, always, so a column of them stays tabular. */
/**
 * The one string this layer emits for "the source published no figure".
 *
 * It is a dash because a formatted table needs a placeholder of a known width, and it is a CONSTANT because
 * the display layer has to be able to recognise it: the product's rule is that an absence is rendered as
 * words, never as a bare dash beside other numbers, and a component cannot apply that rule to a string it
 * has to guess about. `Metric` turns this into "not reported" in the absence style.
 */
export const ABSENT = "—";

export function percent(value: number | null): string {
  return value === null ? ABSENT : `${value.toFixed(1)}%`;
}

/** Sign FIRST, so direction survives greyscale, a screen reader, and a colour-blind reader (§24,
 *  §27): colour may repeat the sign, never carry it alone. U+2212 minus, not a hyphen. */
export function percentagePoints(value: number | null): string {
  if (value === null) return ABSENT;
  const sign = value > 0 ? "+" : value < 0 ? "−" : "±";
  return `${sign}${Math.abs(value).toFixed(1)} pp`;
}

/** Laakso–Taagepera and other pure counts read better at two decimals. */
function twoDp(value: number | null): string {
  return value === null ? ABSENT : value.toFixed(2);
}

function pct(part: number | null, whole: number | null): number | null {
  if (part === null || whole === null || whole <= 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

// ── the six ──────────────────────────────────────────────────────────────────────────────────────

export const turnout_pct: Measure<{ voters: number | null; electors: number | null }> = {
  id: "turnout_pct",
  label: "Turnout",
  unit: "percent",
  formula: "voters / electors * 100, rounded to 1 decimal place. Grain: one contest.",
  caveats: [
    "Contests before 2014 may exclude postal votes from `voters`, which understates turnout by a fraction of a point.",
    "`electors` is the roll as of poll day, not the roll at any later revision, so it does not match a current electoral-roll count.",
    "Returns null rather than 0 when either side is missing or electors is 0: an unreported turnout is not a turnout of zero.",
    PROVENANCE,
  ],
  modelCard: "docs/methodology/turnout_pct.md",
  format: percent,
  compute: ({ voters, electors }) => pct(voters, electors),
};

export const margin_pct: Measure<{
  rank1Votes: number | null;
  rank2Votes: number | null;
  validVotes: number | null;
}> = {
  id: "margin_pct",
  label: "Margin",
  unit: "percent",
  formula:
    "(rank-1 votes − rank-2 votes) / valid votes * 100, rounded to 1 decimal place. Grain: one contest.",
  caveats: [
    "Undefined for an uncontested seat: with no rank-2 candidacy there is no margin, and null is the answer, not 100.",
    "The denominator is valid votes for the contest. Where only the truncated top-N field is on record, valid votes is taken from the turnout row, not from summing the field — summing a truncated field inflates every margin.",
    "Not meaningful for a multi-member contest; this registry holds none.",
    PROVENANCE,
  ],
  modelCard: "docs/methodology/margin_pct.md",
  format: percent,
  compute: ({ rank1Votes, rank2Votes, validVotes }) =>
    rank1Votes === null || rank2Votes === null ? null : pct(rank1Votes - rank2Votes, validVotes),
};

export const vote_share_pct: Measure<{ votes: number | null; validVotes: number | null }> = {
  id: "vote_share_pct",
  label: "Vote share",
  unit: "percent",
  formula:
    "candidacy votes / valid votes for the contest * 100, rounded to 1 decimal place. Grain: one candidacy.",
  caveats: [
    TRUNCATION +
      " A share is therefore correct for the candidacies present and silent about the missing tail; the shares shown do not add up to the whole field.",
    "Never compare a share against the sum of the shares rendered beside it: the residual is the missing tail plus NOTA, not 'others'.",
    PROVENANCE,
  ],
  modelCard: "docs/methodology/vote_share_pct.md",
  format: percent,
  compute: ({ votes, validVotes }) => pct(votes, validVotes),
};

export const swing_pp: Measure<{
  sharePct: number | null;
  previousSharePct: number | null;
  sameEpoch: boolean;
}> = {
  id: "swing_pp",
  label: "Swing",
  unit: "percentage_points",
  formula:
    "this election's vote_share_pct for the party at this place minus the previous election's, in PERCENTAGE POINTS (a subtraction of two percentages, never a ratio). Grain: (place, party, election pair).",
  caveats: [
    "Undefined across a boundary-epoch change: the 2011–2026 contests all sit in epoch delim-2008, so a swing spanning the 2008 delimitation compares two different electorates and is not computed.",
    "Undefined — null — for a party that did not contest the earlier election. That is NOT a swing of −100: an absent contestant has no prior share to fall from.",
    "Inherits the truncation bias of its inputs: if a party finished outside the recorded top-N in one of the two elections it reads as absent, so a small party's swing is missing rather than small.",
    PROVENANCE,
  ],
  modelCard: "docs/methodology/swing_pp.md",
  format: percentagePoints,
  compute: ({ sharePct, previousSharePct, sameEpoch }) =>
    !sameEpoch || sharePct === null || previousSharePct === null
      ? null
      : Math.round((sharePct - previousSharePct) * 10) / 10,
};

export const enp: Measure<{ sharesPct: readonly number[] }> = {
  id: "enp",
  label: "Effective number of parties",
  unit: "count",
  formula:
    "Laakso–Taagepera: 1 / Σ(sᵢ²) where sᵢ is each contestant's vote share as a FRACTION of the total, not a percentage. Grain: one contest.",
  caveats: [
    TRUNCATION +
      " enp computed from a truncated field is BIASED DOWNWARD — it drops the small shares, which are the ones that would raise the sum of squares' denominator, so it OVERSTATES concentration and makes every contest look more two-horse than it was. This is the measure's validity condition, not a footnote: a chart that renders enp without it is misleading.",
    "Shares are renormalised over the contestants on record before squaring, so the figure is the effective number of parties AMONG THE TOP-N, and a true value is at or above it.",
    "Returns null for an empty or all-zero field.",
    PROVENANCE,
  ],
  modelCard: "docs/methodology/enp.md",
  format: twoDp,
  compute: ({ sharesPct }) => {
    const total = sharesPct.reduce((a, s) => a + Math.max(s, 0), 0);
    if (total <= 0) return null;
    const sumSq = sharesPct.reduce((a, s) => a + (Math.max(s, 0) / total) ** 2, 0);
    return Math.round((1 / sumSq) * 100) / 100;
  },
};

export const incumbency_retention: Measure<{
  winningPartyId: string | null;
  previousWinningPartyId: string | null;
  sameEpoch: boolean;
}> = {
  id: "incumbency_retention",
  label: "Seat held by the same party",
  unit: "rate",
  formula:
    "1 when the winning party at this place is the party that won it at the previous election, else 0; null when either winner or the previous winner is unknown. Rolled up across places as a rate: retained / pairs with both winners known. Grain: (place, election pair).",
  caveats: [
    "The question it answers is 'did this PARTY hold this seat', not 'did this MEMBER hold it'. A sitting member who switched party and won again reads as a LOSS for the old party and a gain for the new one — which is the right answer to the party question and the wrong answer to the person question.",
    "A party merger, split or rename between the two elections reads as a change of party unless the registry maps both to one party id.",
    "Undefined across a boundary-epoch change: a redrawn seat has no predecessor to be retained from.",
    "Undefined where the previous contest has no declared result; this registry has 2,627 candidacies with status='contesting' and no result row.",
    PROVENANCE,
  ],
  modelCard: "docs/methodology/incumbency_retention.md",
  format: (v) => (v === null ? ABSENT : v === 1 ? "held" : v === 0 ? "changed hands" : percent(v * 100)),
  compute: ({ winningPartyId, previousWinningPartyId, sameEpoch }) =>
    !sameEpoch || winningPartyId === null || previousWinningPartyId === null
      ? null
      : winningPartyId === previousWinningPartyId
        ? 1
        : 0,
};

/** The six the Place Analysis floor renders, as the part every consumer shares — the declaration.
 *  `compute` is deliberately NOT on this type: each measure takes different inputs, so callers reach
 *  for the named export (`turnout_pct.compute`) and this list carries the id/label/caveat/card side
 *  that the model-card test and a caveat footer iterate over. */
export const MEASURES: readonly Omit<Measure<unknown>, "compute">[] = [
  turnout_pct,
  margin_pct,
  vote_share_pct,
  swing_pp,
  enp,
  incumbency_retention,
];
