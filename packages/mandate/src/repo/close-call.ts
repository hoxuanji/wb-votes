// What counts as a close call, said once so that a seat's finding, its Flagged notes and its Analysis page cannot disagree about it: the same seat
// would otherwise be "narrow" on one tab and not a close call on the next.
//
// Both are shares of the votes polled, and both apply only to a counted margin over a reported turnout: a share is only as good as the figure it
// divides by (turnout-trust.ts), and a declared margin has no share at all.

/** A counted margin under this many points of the votes polled makes a seat's finding: the winner was ahead by almost nothing. */
export const NARROW_POINTS = 0.5;

/** A counted margin under this many points is flagged as one a recount-scale error could have changed. */
export const FLAG_POINTS = 1;

/** A share of the votes polled for a margin: one decimal, and two where one would print a narrow margin as nothing (57 votes in 250,000 is 0.02%, not 0.0%). */
export function marginShareText(pct: number): string {
  return pct < 1 ? pct.toFixed(2) : pct.toFixed(1);
}
