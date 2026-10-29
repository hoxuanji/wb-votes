// What a seat is set against on the Analysis page: where its margin stands among the margins of the other seats of its election, and what the
// state's votes were, by party, in the seats on record.
//
// ONE RANK RULE, because two give two numbers for the same result: a margin is ranked BY VOTES within its own election, closest first, ties by seat
// number, over the contests that have a result and a margin. Not by margin as a share of votes polled, which does not exist for an election with
// no votes polled and would put a 2026 seat on a different scale from a 2021 one. A rank is never printed without its denominator.

import type { DatabaseSync } from "node:sqlite";
import { read } from "./index.ts";
import { readSeats } from "./seat-results.ts";
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

/**
 * Where the margin of one seat stands in each of its elections, among the seats of the same election in the same state. Null for an election in
 * which the seat has no declared winner or no margin: a seat with nothing to rank is not ranked.
 */
export function marginRanks(db: DatabaseSync, versionId: number, stateId: string, electionIds: readonly string[]): Map<string, MarginRank | null> {
  return read(() => {
    const out = new Map<string, MarginRank | null>();
    for (const electionId of electionIds) {
      const seats = readSeats(db, { elections: [electionId], within: stateId }).filter((s) => s.winner !== null && s.margin !== null);
      const ranked = [...seats].sort(
        (a, b) => Math.abs(a.margin!.votes) - Math.abs(b.margin!.votes) || (a.number ?? 1e9) - (b.number ?? 1e9) || a.versionId - b.versionId,
      );
      const at = ranked.findIndex((s) => s.versionId === versionId);
      const mine = at < 0 ? undefined : ranked[at];
      out.set(
        electionId,
        mine === undefined || mine.margin === null
          ? null
          : {
              electionId,
              rank: at + 1,
              of: ranked.length,
              medianVotes: medianOf(ranked.map((s) => Math.abs(s.margin!.votes))) ?? 0,
              basis: mine.margin.basis,
              votes: Math.abs(mine.margin.votes),
            },
      );
    }
    return out;
  });
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
