// The contract between the data layer and the front page's new panels (docs/superpowers/specs/2026-11-03-situation-room-home-design.md).
//
// Types only. The functions that fill them live in landscape.ts, next-up.ts and live-feed.ts; the page and the client components import these
// and nothing else of theirs, so the page can be built against a literal while the readers are written, and a reader that drifts from its
// shape is a compile error and not a surprise in a browser.

import type { PartyRef } from "./seat-results.ts";

/* ───────────────────────────── how we got here ───────────────────────────── */

/** One state or union territory, at one year. */
export type LandscapeState = {
  id: string;
  name: string;
  /**
   * The assembly election this state's government at that year came from: its newest one on record on or before the year.
   * Null where it has none yet, and the state is drawn hollow. The page never colours a state the registry has no election for.
   */
  held: null | {
    electionId: string;
    year: number;
    /** The party with the most seats; null where no seat is declared or where two parties are level for most. */
    leader: PartyRef | null;
    leaderSeats: number;
    seats: number;
    /** The leader holds more than half the seats contested. */
    majority: boolean;
  };
};

export type LandscapeYear = {
  year: number;
  /** Every jurisdiction in the registry's list of them, in id order, whether or not it has a result. */
  states: LandscapeState[];
  /** Parties by the number of states they lead at this year: most first, then by key. */
  tally: { party: PartyRef; states: number }[];
  /** States with an election on record by this year. */
  withResult: number;
};

export type Landscape = {
  /** Every year the registry holds an assembly election in, ascending: the stops of the scrubber. Not every calendar year. */
  years: number[];
  first: number | null;
  last: number | null;
  /** In the order of `years`. */
  byYear: LandscapeYear[];
  /** Every party that leads a state at any stop, in a stable order, for a legend and a ribbon. */
  parties: PartyRef[];
};

/* ───────────────────────────────── next up ───────────────────────────────── */

export type NextUp = {
  jurisdictionId: string;
  jurisdictionName: string;
  /** "Assembly" or "Lok Sabha": the body's own word, decoded in packages/. */
  bodyWord: string;
  /** The year the election is announced for, or the year its term ends. */
  year: number;
  /** "announced" is a date the Commission set; "inferred" is a five-year term counted from the last election, and is never worded as announced. */
  basis: "announced" | "inferred";
  /** The announced date, ISO, when there is one. */
  on: string | null;
  /** The election it follows, so a reader can see what is being counted from. */
  after: { electionId: string; year: number; leaderLabel: string | null };
  /** How much of the term has run, 0 to 1 (above 1 is overdue), as of the day asked. Null for an announced date, which is not a term. */
  termElapsed: number | null;
  /** The seats it will fill. */
  seats: number;
};

/* ───────────────────────────────── live board ───────────────────────────────── */

/**
 * A projection somebody else published. The registry does not forecast: a number is on this list only with its publisher and the day it
 * was published, and the page prints both beside it.
 */
export type Projection = {
  publisher: string;
  kind: "exit_poll" | "opinion_poll" | "agency_projection";
  /** ISO date. */
  publishedOn: string;
  url: string | null;
  /** The publisher's own description of how it was produced, verbatim, when it gave one. */
  method: string | null;
  ranges: { party: PartyRef; low: number; high: number }[];
};

export type LiveEvent = { at: string; text: string; url: string | null };

export type LiveBoard = {
  election: {
    id: string | null;
    name: string;
    jurisdictionId: string | null;
    jurisdictionName: string;
    kind: "assembly" | "lok_sabha";
    year: number;
  };
  status: "polling" | "counting" | "declared";
  /** The feed's own timestamp, ISO. */
  asOf: string;
  /** True when `asOf` is older than the freshness window at the moment the feed was read: the page says so rather than showing a stale count as live. */
  stale: boolean;
  seats: { total: number; declared: number; majority: number };
  parties: { party: PartyRef; won: number; leading: number }[];
  projections: Projection[];
  events: LiveEvent[];
};

/** What reading the feed gives the page. Null: no feed is configured, and the page shows no live element at all. */
export type LiveRead = { boards: LiveBoard[] } | { error: string } | null;

/** A projection's kind, in a reader's words. Here and not in the board because the registry's codes are decoded in packages/ and never read in a component. */
export function projectionWord(p: Pick<Projection, "kind">): string {
  return p.kind === "exit_poll" ? "exit poll" : p.kind === "opinion_poll" ? "opinion poll" : "agency projection";
}
