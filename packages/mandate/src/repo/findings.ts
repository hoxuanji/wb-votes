// Findings: what an analysis concluded, as DATA.
//
// WHY THIS FILE EXISTS. The repo layer already computed the product's most valuable answers — which seats
// changed hands, which party's share moved, whether the leader holds a majority — and then threw the
// structure away by formatting them into sentences. `StateShifts.lines` was `string[]`; `Signal.detail`
// was `string`. So the UI could print a finding and could not draw one: to shade a map by which party
// gained a seat, a component would have had to parse "BJP gained 30 seats, 79 to 109."
//
// That is the single reason the product looked like a database with charts bolted on. It was not a shortage
// of data and not a shortage of queries. It was that the answers arrived as prose, and prose is a dead end
// for every renderer.
//
// THE RULE HERE: a finding is a value with named fields and a discriminant. It says WHAT was concluded and
// carries the numbers behind it. It says nothing about how it should look — no colour, no ordering
// intended for a table, no pre-formatted string in a field a chart would read.
//
// PROSE IS NOT DELETED, IT IS DEMOTED. `summarise()` turns any finding into one sentence, and that is what
// a screen reader gets, what a `<figcaption>` gets, and what a surface with no room for a chart falls back
// to. One implementation, so the sentence and the chart can never disagree about the number — which is
// exactly what two copies of the formatting would eventually do.
//
// WHAT IS DELIBERATELY ABSENT:
//   · No `text` field on the findings themselves. A stored sentence is a second source of truth that
//     drifts; `summarise` is a function of the data and cannot.
//   · No `colour`. Party ink is looked up from the party key by viz/party-ink.ts, whose whole contract is
//     that a colour depends on identity and on nothing else. A colour in a finding would let one surface
//     hand a different one to another.
//   · No `weight` on most types. Ranking is the caller's question and differs per surface; `watchSignals`
//     keeps its own because its whole job is to rank across rule kinds.

/* ────────────────────────────────── the vocabulary ────────────────────────────────── */

/** A party as any finding refers to one: the registry key, and the label a reader reads. */
export type PartyRef = {
  /** `party.id`, or the raw source string where no party row resolved. What ink is keyed on. */
  key: string;
  label: string;
};

/* ─────────────────────────────────── the findings ─────────────────────────────────── */

/** One cell of a flip matrix: `count` seats went from `from` to `to`. */
export type FlipPair = {
  from: PartyRef;
  to: PartyRef;
  count: number;
};

/**
 * Seats that changed hands, WITH the from→to breakdown a matrix needs.
 *
 * `pairs` is the field that did not exist in any form before. "115 of 223 seats changed hands" cannot say
 * that 53 of them went BJP→INC and 22 JD(S)→INC, and that breakdown is the answer to the question a reader
 * actually has: not how many moved, but where the winner's gain came from.
 *
 * `comparable` is the denominator and it is the GATED one — seats that held or flipped, present on both sides under
 * the same boundary with a winner declared on both. See `compareSeats`.
 */
export type SeatFlips = {
  type: "seat_flips";
  flipped: number;
  held: number;
  comparable: number;
  pairs: FlipPair[];
  previousYear: number | null;
  year: number | null;
};

/**
 * Seats that could not be compared at all, because the constituencies were redrawn.
 *
 * A seat whose winner is undeclared on one side is not counted here: its boundary did not move.
 *
 * A FIRST-CLASS FINDING, not the absence of one. The defect this codebase shipped was a flip count across
 * a delimitation; the fix refuses the comparison, and a refusal that is not reported reads as "nothing
 * changed". So it gets a type, and any surface that draws `SeatFlips` is expected to draw this beside it.
 */
export type SeatsIncomparable = {
  type: "seats_incomparable";
  count: number;
  previousYear: number | null;
  previousEpochId: string | null;
  epochId: string | null;
};

/** Whether the leading party holds the house outright — the fact a seat count alone does not settle. */
export type MajorityFinding = {
  type: "majority";
  party: PartyRef | null;
  seats: number;
  contested: number;
  /** Seats a majority needs, from the seats actually contested. */
  needed: number;
  holds: boolean;
};

/**
 * How a party's share of the vote became its share of the seats.
 *
 * `deltaPp` is the seat bonus: positive means the system rewarded this party, negative means it punished
 * it. Karnataka 2023 is the case that makes it worth drawing — INC 43.2% of the vote to 60.3% of the
 * seats (+17.1), BJP 36.1% to 29.0% (−7.1) — and no current surface states either number.
 */
export type VoteSeatEfficiency = {
  type: "vote_seat_efficiency";
  party: PartyRef;
  votePct: number | null;
  seatPct: number;
  /** seatPct − votePct, or null where no vote count was published. */
  deltaPp: number | null;
  seats: number;
  /** The seats the seat share is over: every seat contested. */
  contested: number;
  /** The seats the vote share is over: those with candidate counts and votes polled, which can be fewer than `contested`. */
  counted: number;
  /** Seats won per point of vote share. Null when the share is null or zero. */
  seatsPerPoint: number | null;
};

/** Every kind of finding the election map's view produces. */
export type Finding = SeatFlips | SeatsIncomparable | MajorityFinding | VoteSeatEfficiency;

/** Narrow a mixed list to one kind, keeping the type. The read pattern every renderer wants. */
export function ofType<K extends Finding["type"]>(
  findings: readonly Finding[],
  type: K,
): Extract<Finding, { type: K }>[] {
  return findings.filter((f): f is Extract<Finding, { type: K }> => f.type === type);
}

/* ─────────────────────────── prose, derived and never stored ─────────────────────────── */

const IN = new Intl.NumberFormat("en-IN");

const seats = (n: number): string => `${IN.format(n)} seat${n === 1 ? "" : "s"}`;

/** One decimal, and never a real value rounded to zero — a party that polled something did not poll none. */
function pct1(v: number | null): string {
  if (v === null) return "not published";
  if (v !== 0 && Number(v.toFixed(1)) === 0) return "<0.1%";
  return `${v.toFixed(1)}%`;
}

function pp(v: number): string {
  const s = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${s}${Math.abs(v).toFixed(1)}pp`;
}

/** The year a finding compares against, in the words a sentence needs. */
const since = (y: number | null): string => (y === null ? "the previous election" : String(y));

/**
 * A finding as one sentence.
 *
 * THE ONLY place a finding becomes prose, so a chart's label and a screen reader's text are the same
 * number by construction. A surface that wants different wording composes from the fields; it must not
 * add a second formatter, because two formatters are how a caption starts disagreeing with its own chart.
 */
export function summarise(f: Finding): string {
  switch (f.type) {
    case "seat_flips":
      return `${IN.format(f.flipped)} of ${seats(f.comparable)} changed hands.`;
    case "seats_incomparable":
      return (
        `${seats(f.count)} cannot be compared: the constituencies were redrawn after ` +
        `${since(f.previousYear)}.`
      );
    case "majority":
      return f.party === null
        ? `No winner is recorded for the ${seats(f.contested)} contested.`
        : f.holds
          ? `${f.party.label} holds an outright majority of the ${seats(f.contested)} contested.`
          : `No party holds an outright majority of the ${seats(f.contested)} contested.`;
    case "vote_seat_efficiency":
      return f.deltaPp === null
        ? `${f.party.label} won ${IN.format(f.seats)} of ${seats(f.contested)}; no vote count is on record.`
        : `${f.party.label} took ${pct1(f.votePct)} of the vote and ${pct1(f.seatPct)} of the seats ` +
          `(${pp(f.deltaPp)}).`;
  }
}

/** Every finding as a sentence, in the order given. The accessible equivalent of a whole section. */
export function summariseAll(findings: readonly Finding[]): string[] {
  return findings.map(summarise);
}
