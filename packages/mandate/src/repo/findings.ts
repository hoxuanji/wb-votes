// Findings: what an analysis concluded, as DATA.
//
// WHY THIS FILE EXISTS. The repo layer already computed the product's most valuable answers — which seats
// changed hands, which party's share moved, whether the leader holds a majority — and then threw the
// structure away by formatting them into sentences. `StateShifts.lines` was `string[]`; `Signal.detail`
// was `string`. So the UI could print a finding and could not draw one: to shade a map by which party
// gained a seat, a component would have had to parse "BJP gained 30 seats, 79 to 109."
//
// That is the single reason the product looked like a database with charts bolted on. It was not a shortage
// of data (63,334 contests carry a computable margin) and not a shortage of queries (47 analytical
// functions). It was that the answers arrived as prose, and prose is a dead end for every renderer.
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

import type { Reservation } from "../core/entities/index.ts";

/* ────────────────────────────────── the vocabulary ────────────────────────────────── */

/** A party as any finding refers to one: the registry key, and the label a reader reads. */
export type PartyRef = {
  /** `party.id`, or the raw source string where no party row resolved. What ink is keyed on. */
  key: string;
  label: string;
};

/**
 * A seat's identity inside a finding, carrying the boundary it was fought under.
 *
 * `epochId` is not decoration: it is half of what makes two seats the same seat (see `seatKey`), so a
 * finding that names a seat without it cannot be checked for comparability by whoever receives it.
 */
export type SeatRef = {
  placeId: string;
  epochId: string;
  name: string;
  number: number | null;
  reservation: Reservation | null;
  /** The seat's own page, where the place path can address it. Null where it cannot be addressed. */
  href: string | null;
};

/* ─────────────────────────────────── the findings ─────────────────────────────────── */

/**
 * A party's seat count moved between two elections.
 *
 * `then` and `now` are both present, so a renderer can draw a slope, a dumbbell or a diverging bar from
 * one value — none of which was possible from "gained 30 seats, 79 to 109".
 */
export type SeatMovement = {
  type: "seat_movement";
  party: PartyRef;
  then: number;
  now: number;
  /** now − then. Kept rather than derived so the sign is the finding's, not each renderer's arithmetic. */
  delta: number;
  previousYear: number | null;
  year: number | null;
};

/**
 * A party won seats having won none last time, or lost every seat it held.
 *
 * Its own type rather than a `SeatMovement` with `then = 0`, because those are different sentences and
 * different marks: an arrival has no baseline to draw a slope from, and a wipeout's endpoint is zero.
 */
export type PartyEntry = {
  type: "party_arrival" | "party_wipeout";
  party: PartyRef;
  seats: number;
  previousYear: number | null;
  year: number | null;
};

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
 * `comparable` is the denominator and it is the GATED one — seats present on both sides under the same
 * boundary. See `partitionByEpoch`.
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

/** Turnout moved, as a share of electors on both sides. */
export type TurnoutChange = {
  type: "turnout_change";
  nowPct: number;
  thenPct: number;
  /** Percentage points, one decimal. */
  deltaPp: number;
  previousYear: number | null;
  year: number | null;
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
  contested: number;
  /** Seats won per point of vote share. Null when the share is null or zero. */
  seatsPerPoint: number | null;
};

/**
 * One contest's winning margin, with the runner-up.
 *
 * The runner-up is the point. `result.margin` is populated for winners only (63,944 rows), but rank-1 and
 * rank-2 vote counts exist for 63,334 contests — so the margin AND who it was over are both available, and
 * the second half was never surfaced anywhere.
 */
export type MarginFinding = {
  type: "margin";
  seat: SeatRef;
  winner: PartyRef;
  runnerUp: PartyRef | null;
  winnerName: string | null;
  marginVotes: number | null;
  /** Over votes polled, never over the sum of the result rows. */
  marginPct: number | null;
  votesPolled: number | null;
  electionId: string;
  year: number | null;
};

/** A party's vote share moved between consecutive elections, with the seats that came with it. */
export type ShareMovement = {
  type: "share_movement";
  party: PartyRef;
  nowPct: number | null;
  thenPct: number | null;
  /** Percentage points. Null where the party did not contest the earlier election. */
  deltaPp: number | null;
  nowSeats: number;
  thenSeats: number;
  previousYear: number | null;
  year: number | null;
};

/** Every kind of finding this registry produces. */
export type Finding =
  | SeatMovement
  | PartyEntry
  | SeatFlips
  | SeatsIncomparable
  | TurnoutChange
  | MajorityFinding
  | VoteSeatEfficiency
  | MarginFinding
  | ShareMovement;

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
    case "seat_movement":
      return `${f.party.label} ${f.delta > 0 ? "gained" : "lost"} ${seats(Math.abs(f.delta))}, ${IN.format(
        f.then,
      )} to ${IN.format(f.now)}.`;
    case "party_arrival":
      return `${f.party.label} won ${seats(f.seats)}, having won none in ${since(f.previousYear)}.`;
    case "party_wipeout":
      return `${f.party.label} lost every one of the ${seats(f.seats)} it held in ${since(f.previousYear)}.`;
    case "seat_flips":
      return `${IN.format(f.flipped)} of ${seats(f.comparable)} changed hands.`;
    case "seats_incomparable":
      return (
        `${seats(f.count)} cannot be compared: the constituencies were redrawn after ` +
        `${since(f.previousYear)}.`
      );
    case "turnout_change":
      return f.deltaPp === 0
        ? `Turnout held at ${f.nowPct.toFixed(1)}%.`
        : `Turnout ${f.deltaPp > 0 ? "rose" : "fell"} ${Math.abs(f.deltaPp).toFixed(1)} points, ` +
            `${f.thenPct.toFixed(1)}% to ${f.nowPct.toFixed(1)}%.`;
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
    case "margin":
      return (
        `${f.seat.name}: ${f.winner.label} ${f.runnerUp === null ? "won" : `over ${f.runnerUp.label}`}` +
        `${f.marginPct === null ? "" : ` by ${pct1(f.marginPct)} of votes polled`}` +
        `${f.marginVotes === null ? "" : `, ${IN.format(Math.abs(f.marginVotes))} votes`}.`
      );
    case "share_movement":
      return f.deltaPp === null
        ? `${f.party.label} took ${pct1(f.nowPct)}; it has no recorded share in ${since(f.previousYear)}.`
        : `${f.party.label} moved ${pp(f.deltaPp)}, ${pct1(f.thenPct)} to ${pct1(f.nowPct)}, with ` +
          `${IN.format(f.thenSeats)} seats becoming ${IN.format(f.nowSeats)}.`;
  }
}

/** Every finding as a sentence, in the order given. The accessible equivalent of a whole section. */
export function summariseAll(findings: readonly Finding[]): string[] {
  return findings.map(summarise);
}
