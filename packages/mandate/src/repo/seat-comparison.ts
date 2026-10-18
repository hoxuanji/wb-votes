// Seat comparison: which seats of one election can be set beside the same seats of another, and what became of them.
// Pure: two arrays in, one answer out, so every rule below is tested on literals.
//
// WHY THIS EXISTS. Three modules each paired two elections' seats by hand, and each answered "how many?" differently:
//
//  · The front page printed "N of M seats changed hands" with M counting a seat nobody declared a winner for, so the
//    figure disagreed with docs/methodology/incumbency_retention.md, which says a pair with an unknown winner is
//    left out of the denominator.
//  · The election map read its previous winners with an inner join, so a seat whose previous winner was undeclared
//    fell into the pile it reports as "redrawn" — a boundary claim about a seat whose boundary never moved.
//  · The state map dropped those seats from both piles without saying so.
//
// ONE POLICY. A seat of `now` lands in exactly one of four buckets:
//
//   held          the same seat in both, a winner declared in both, and the same party won
//   flipped       the same seat in both, a winner declared in both, and a different party won
//   unknown       the same seat in both, and no declared winner on one side or the other
//   incomparable  no counterpart in `then` under the same boundary
//
// and the ONE DENOMINATOR is held + flipped. Unknown is reported and never hidden, never counted as a hold and
// never as a change; incomparable is reported and never compared. `held + flipped + unknown + incomparable` is
// always `now.length`.
//
// The identity a seat is matched on is `seatKey` (elections.ts), `(placeId, epochId)`: the epoch is part of the key,
// so a cross-epoch pair finds nothing, and a caller cannot opt out of the gate. NOT decided here, because it is not
// a property of a pair of seat lists: whether a by-election has anything to be compared with (the caller passes
// `then = []`), and whether party seat totals survive a redraw (they are not seat pairs).

import { seatKey } from "./elections.ts";
import type { FlipPair, PartyRef } from "./findings.ts";

/** What a comparison needs of a seat: which seat it is, and the party of its declared winner. A `SeatResult` is one. */
export type ComparableSeat = {
  placeId: string;
  epochId: string;
  winner: { party: PartyRef } | null;
};

/** The same seat at two elections. */
export type Paired<T, U> = { now: T; then: U };

/** What became of one seat of `now`. `from` is the party that held it then, `to` the party that holds it now. */
export type Verdict<T, U> =
  | { kind: "held" | "flipped"; now: T; then: U; from: PartyRef; to: PartyRef }
  | { kind: "unknown"; now: T; then: U; missing: "now" | "then" | "both" }
  | { kind: "incomparable"; now: T };

export type SeatComparison<T, U> = {
  /** One per seat of `now`, in its order: `verdicts[i]` is the verdict on `now[i]`. */
  verdicts: Verdict<T, U>[];
  held: Paired<T, U>[];
  flipped: Paired<T, U>[];
  unknown: (Paired<T, U> & { missing: "now" | "then" | "both" })[];
  incomparable: T[];
  /** The only denominator: the seats that held or flipped. Never `now.length`, never counting unknown. */
  comparable: number;
  /** Flipped seats by the party that lost them and the party that won them: biggest cell first, then `from.key`, then `to.key`. */
  matrix: FlipPair[];
};

/** Two seats are the same seat when they are the same place under the same boundary. */
export function sameSeat(a: { placeId: string; epochId: string }, b: { placeId: string; epochId: string }): boolean {
  return seatKey(a.placeId, a.epochId) === seatKey(b.placeId, b.epochId);
}

/**
 * Whether a seat stayed with the party that held it.
 *
 * THE ONE PLACE THIS IS DECIDED, and it is party-key equality: an independent replaced by another independent has
 * the same key and counts as held. A person-level rule would need the candidate's identity, which this module is
 * not given; if the answer should change it changes here and nowhere else.
 */
const stayed = (then: PartyRef, now: PartyRef): boolean => then.key === now.key;

/** A seat's index by identity. Two rows with one identity cannot be told apart, so that is refused, not resolved. */
function bySeat<S extends ComparableSeat>(seats: readonly S[], side: string): Map<string, S> {
  const by = new Map<string, S>();
  for (const s of seats) {
    const key = seatKey(s.placeId, s.epochId);
    if (by.has(key)) throw new Error(`${s.placeId} under ${s.epochId} is on the ${side} side twice`);
    by.set(key, s);
  }
  return by;
}

/**
 * Compare the seats of one election (`now`) with the seats of another (`then`).
 *
 * Comparability is decided per SEAT, never per election: `ls-2024` holds 524 contests under delim-2008, 5 under
 * delim-2022-jk and 14 under delim-2023-as, so 19 of its 543 seats sit on boundaries that did not exist in 2019,
 * and an election-level flag would have called all 543 comparable.
 *
 * Throws when either side holds one seat identity twice. The schema makes that impossible for one election
 * (`UNIQUE (place_id, epoch_id)` on the version, one contest per version), so it is a defect upstream, and a count
 * built over it would be wrong without saying so.
 */
export function compareSeats<T extends ComparableSeat, U extends ComparableSeat>(
  now: readonly T[],
  then: readonly U[],
): SeatComparison<T, U> {
  bySeat(now, "now"); // for its refusal: `now` is walked in order below, so the index itself is not needed
  const before = bySeat(then, "then");
  const out: SeatComparison<T, U> = {
    verdicts: [],
    held: [],
    flipped: [],
    unknown: [],
    incomparable: [],
    comparable: 0,
    matrix: [],
  };
  const cells = new Map<string, FlipPair>();

  for (const seat of now) {
    const was = before.get(seatKey(seat.placeId, seat.epochId));
    if (was === undefined) {
      out.verdicts.push({ kind: "incomparable", now: seat });
      out.incomparable.push(seat);
      continue;
    }
    const pair = { now: seat, then: was };
    if (seat.winner === null || was.winner === null) {
      const missing = seat.winner === null ? (was.winner === null ? "both" : "now") : "then";
      out.verdicts.push({ kind: "unknown", ...pair, missing });
      out.unknown.push({ ...pair, missing });
      continue;
    }
    const from = { key: was.winner.party.key, label: was.winner.party.label };
    const to = { key: seat.winner.party.key, label: seat.winner.party.label };
    if (stayed(from, to)) {
      out.verdicts.push({ kind: "held", ...pair, from, to });
      out.held.push(pair);
      continue;
    }
    out.verdicts.push({ kind: "flipped", ...pair, from, to });
    out.flipped.push(pair);
    // Not `seatKey`, which means something else: a cell is a pair of parties, not a seat.
    const cell = `${from.key}\u0000${to.key}`;
    const at = cells.get(cell);
    if (at === undefined) cells.set(cell, { from, to, count: 1 });
    else at.count += 1;
  }

  out.comparable = out.held.length + out.flipped.length;
  out.matrix = [...cells.values()].sort(
    (a, b) => b.count - a.count || a.from.key.localeCompare(b.from.key) || a.to.key.localeCompare(b.to.key),
  );
  return out;
}
