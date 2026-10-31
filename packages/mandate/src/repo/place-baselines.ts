// What a seat is set against on the Analysis page: where its margin stands among the margins of the other seats of its election, and what the
// state's votes were, by party, in the seats on record.
//
// ONE RANK RULE, because two give two numbers for the same result: a margin is ranked BY VOTES within its own election, closest first, ties by seat
// number, over the contests that have a result and a margin. Not by margin as a share of votes polled, which does not exist for an election with
// no votes polled and would put a 2026 seat on a different scale from a 2021 one. A rank is never printed without its denominator.
//
// The rule is written ONCE, in `marginField`: the list of an election's margins in that order. A seat's rank (`rankIn`), the Brief's "24th widest of
// 42", the proof figures that draw the whole list (seat-proof.ts) and the Analysis's strip all read it, so none of them can order the same seats
// another way.

import type { DatabaseSync } from "node:sqlite";
import { bodyWord } from "../core/election-kind.ts";
import { get } from "../db/index.ts";
import { read } from "./index.ts";
import { seatHref, seatTies } from "./place-resolve.ts";
import { bodyOfKind } from "./routes.ts";
import { readSeats } from "./seat-results.ts";
import type { PartyRef, SeatResult } from "./seat-results.ts";
import { stateTrajectory } from "./trajectory.ts";

export type MarginRank = {
  electionId: string;
  /** 1 is the closest. */
  rank: number;
  /** The contests of the election, in its state, that have a declared winner and a margin. */
  of: number;
  /** The median margin of those contests, in votes. */
  medianVotes: number;
  basis: "counted" | "declared";
  votes: number;
};

/** The median of a set of numbers, or null for none. */
export function medianOf(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

/** One seat of an election's margin field: who won it and by how many votes, and where that stands among the seats of its election. */
export type RankedSeat = {
  versionId: number;
  placeId: string;
  name: string;
  number: number | null;
  /** The address of the seat's page. */
  href: string;
  /** The declared winner's name as the registry spells it, and the party. */
  winner: string;
  party: PartyRef;
  /** Votes ahead of the runner-up, as a positive number. */
  votes: number;
  /** Counted from the two candidates' votes, or declared by the source with no counts behind it. */
  basis: "counted" | "declared";
  /** 1 is the closest. */
  rank: number;
};

/**
 * Every margin of one election in one state, in the one order: closest first, ties by seat number. `contests` is how many contests the election has
 * there, whether or not they declared a winner; `seats` are those that have a declared winner and a margin, the only ones that can be ranked, so
 * `contests - seats.length` is how many are left out.
 */
export type MarginField = {
  electionId: string;
  /** The seats' state and body as a reader says them ("West Bengal Lok Sabha"), the same words the sentence about a lone margin uses. */
  scope: string;
  contests: number;
  seats: RankedSeat[];
};

/** The contests that have a declared winner and a margin, closest first by votes, ties by seat number, then by version. The one rank rule. */
function closestFirst(contests: readonly SeatResult[]): SeatResult[] {
  return contests
    .filter((s) => s.winner !== null && s.margin !== null)
    .sort((a, b) => Math.abs(a.margin!.votes) - Math.abs(b.margin!.votes) || (a.number ?? 1e9) - (b.number ?? 1e9) || a.versionId - b.versionId);
}

/**
 * The margin field of each election named, among the seats of `stateId`. `kind` is the seat's own place kind (an election belongs to one body, so
 * every seat of the field is of the same kind) and is only what a seat's address is built from.
 */
export function marginFields(db: DatabaseSync, stateId: string, electionIds: readonly string[], kind: string): Map<string, MarginField> {
  return read(() => {
    const tied = seatTies(db);
    const stateName = get<{ name: string }>(db, "SELECT canonical_name AS name FROM place WHERE id = ?", stateId)?.name ?? stateId;
    const scope = `${stateName} ${bodyWord(bodyOfKind(kind))}`;
    const out = new Map<string, MarginField>();
    for (const electionId of electionIds) {
      const contests = readSeats(db, { elections: [electionId], within: stateId });
      const seats = closestFirst(contests).map(
        (s, at): RankedSeat => ({
          versionId: s.versionId,
          placeId: s.placeId,
          name: s.name,
          number: s.number,
          href: seatHref(tied, { versionId: s.versionId, placeId: s.placeId, stateId, kind, name: s.name }),
          winner: s.winner!.name,
          party: s.winner!.party,
          votes: Math.abs(s.margin!.votes),
          basis: s.margin!.basis,
          rank: at + 1,
        }),
      );
      out.set(electionId, { electionId, scope, contests: contests.length, seats });
    }
    return out;
  });
}

/** Where one seat stands in a margin field, or null where it has no declared winner or no margin there: a seat with nothing to rank is not ranked. */
export function rankIn(field: MarginField, versionId: number): MarginRank | null {
  const mine = field.seats.find((s) => s.versionId === versionId);
  return mine === undefined
    ? null
    : {
        electionId: field.electionId,
        rank: mine.rank,
        of: field.seats.length,
        medianVotes: medianOf(field.seats.map((s) => s.votes)) ?? 0,
        basis: mine.basis,
        votes: mine.votes,
      };
}

/** The same rank counted from the widest, which is how a sentence about a lone margin says it ("the 24th widest of 42"): the reverse of the one order. */
export function widestRank(field: MarginField, versionId: number): number | null {
  const mine = field.seats.find((s) => s.versionId === versionId);
  return mine === undefined ? null : field.seats.length + 1 - mine.rank;
}

/**
 * Where the margin of one seat stands in each of its elections, among the seats of the same election in the same state. Null for an election in
 * which the seat has no declared winner or no margin: a seat with nothing to rank is not ranked.
 */
export function marginRanks(db: DatabaseSync, versionId: number, stateId: string, electionIds: readonly string[]): Map<string, MarginRank | null> {
  const kind = get<{ kind: string }>(db, "SELECT kind FROM place_version WHERE id = ?", versionId)?.kind ?? "";
  const out = new Map<string, MarginRank | null>();
  for (const [electionId, field] of marginFields(db, stateId, electionIds, kind)) out.set(electionId, rankIn(field, versionId));
  return out;
}

/**
 * The state's share of the votes polled, by party, in each election: a party's votes over the votes polled in the seats where candidate votes are on
 * record. One denominator, the trajectory's own, so the state page and this one cannot give two figures for the same party and year. An election with
 * no candidate votes has no entry, and a party with no votes in it has none.
 */
export function stateShares(db: DatabaseSync, stateId: string, house = "ac"): Map<string, Map<string, number>> {
  return read(() => {
    const out = new Map<string, Map<string, number>>();
    for (const p of stateTrajectory(db, stateId, house, 12).parties) {
      for (const pt of p.points) {
        if (pt.votePct === null) continue;
        const m = out.get(pt.electionId) ?? new Map<string, number>();
        m.set(p.key, pt.votePct);
        out.set(pt.electionId, m);
      }
    }
    return out;
  });
}
