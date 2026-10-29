// The seat list beside a map: how a page puts its seats in order, what the list's heading says it is, and what a row says
// of a figure it does not have. Pure: seats in, a list and its words out, so every rule below is tested on literals.
//
// WHY THIS EXISTS. The state page sorted its seats by margin with the unknown ones last, the election page ranked only the
// seats that had a margin and listed a narrowed selection in seat order, and neither said which it was. With no vote counts
// the state page's "closest" twelve were the first twelve in seat order, and the election page's list was empty, and a row
// with nothing to show for its runner-up or its margin showed a dash that reads as zero.
//
// THE ORDER IS RETURNED, NOT GUESSED. A heading written beside a sort can disagree with it, so each builder returns the
// order it applied and `listHead` says that order; nothing between the two reads the election or the data again. Which
// seats a builder keeps, and in which order, is what each page already did.
//
// Imports nothing from `src/` (ADR 0002), and no React and no database.

import type { MapMode, TalliedSeat } from "./map-selection.ts";
import { tally } from "./map-selection.ts";
import type { Turnout } from "./turnout-trust.ts";

const IN = new Intl.NumberFormat("en-IN");

/* ─────────────────────────────── the builders ─────────────────────────────── */

/**
 * How the listed seats are ordered.
 *
 *   margin            smallest margin first, and every seat listed has one
 *   seat              the order the view holds them in (state, then seat number): no margin decided it
 *   margin-then-seat  some have a margin and come first by it, the rest follow in seat order
 */
export type SeatOrder = "margin" | "seat" | "margin-then-seat";

export type SeatList<T> = {
  seats: T[];
  /** How many seats the list is a part of: the set it was cut from, before the cap. */
  of: number;
  order: SeatOrder;
};

type Margined = { marginPct: number | null };

/**
 * Closest first, and a seat with no margin after every seat that has one, in the order it came. So the order a list
 * has is a fact of the seats it holds: all margins, none (an election with no vote counts is in seat order), or both.
 * A cap that stops before the seats with no margin is a list of margins and says only that.
 */
export function closestFirst<T extends Margined>(seats: readonly T[], limit: number): SeatList<T> {
  const shown = [...seats].sort((a, b) => (a.marginPct ?? 999) - (b.marginPct ?? 999)).slice(0, limit);
  const known = shown.filter((s) => s.marginPct !== null).length;
  const order: SeatOrder = known === shown.length ? "margin" : known === 0 ? "seat" : "margin-then-seat";
  return { seats: shown, of: seats.length, order };
}

/**
 * The closest contests of a set, by margin over votes polled: only a seat with a margin and a winner is ranked at all, so
 * where none has one the list is empty and not a list in seat order. `of` counts every seat, ranked or not.
 */
export function closestRanked<T extends Margined & { partyLabel: string | null }>(seats: readonly T[], limit: number): SeatList<T> {
  const ranked = seats
    .filter((s) => s.marginPct !== null && s.partyLabel !== null)
    .sort((a, b) => (a.marginPct as number) - (b.marginPct as number))
    .slice(0, limit);
  return { seats: ranked, of: seats.length, order: "margin" };
}

/** The first seats of a set, in the order the set came in. */
export function inSeatOrder<T>(seats: readonly T[], limit: number): SeatList<T> {
  return { seats: seats.slice(0, limit), of: seats.length, order: "seat" };
}

/* ─────────────────────────────── the heading ─────────────────────────────── */

/** What a list is called and how much of it is shown. `note` is said under the heading, where the list explains nothing. */
export type ListHeading = { title: string; count: string; note: string | null };

/**
 * What the reader has narrowed the list to, said as the words that follow "Seats": `isolation` is "won by TMC" or "decided
 * by under 1%" (`partyPhrase`, `bandPhrase`, `binPhrase`), `district` a district's name.
 */
export type Narrowing = { isolation: string | null; district: string | null };

export function partyPhrase(label: string, mode: MapMode): string {
  // The selection's own rule: a party is the winner's, except on the runner-up tab, where it is the one who came second.
  return mode === "runnerup" ? `where ${label} came second` : `won by ${label}`;
}

export function bandPhrase(label: string): string {
  return `decided by ${label}`;
}

/** A two-point margin bin; the last one has no top and is everything from its floor up. */
export function binPhrase(bin: { lo: number; hi: number | null }): string {
  return bin.hi === null ? `decided by ${bin.lo} percent or more` : `decided by ${bin.lo} to ${bin.hi} percent`;
}

/** A party's label from the seats that carry it, on the side the mode reads; the key where no seat does. */
export function partyLabelIn(seats: readonly TalliedSeat[], key: string, mode: MapMode): string {
  return tally(seats, mode === "runnerup" ? "runnerUp" : "winner").find((l) => l.key === key)?.label ?? key;
}

/**
 * The heading of a list, from the list the builder returned and what the reader narrowed it to. An unnarrowed list is what
 * its order makes it; a narrowed one says the narrowing and then the order, because a district's seats are in an order too.
 */
export function listHead(narrowing: Narrowing, list: SeatList<unknown>): ListHeading {
  const count = `${IN.format(list.seats.length)} of ${IN.format(list.of)}`;
  const { isolation, district } = narrowing;
  if (isolation === null && district === null) {
    const title =
      list.order === "seat"
        ? "In seat order"
        : list.order === "margin"
          ? "Closest contests"
          : "Closest contests, then seats with no margin";
    // A list of nothing, over seats there are, is a list that ranked nothing: the reader is owed the reason.
    const note =
      list.seats.length > 0 || list.of === 0
        ? null
        : list.of === 1
          ? "This seat has no margin over votes polled, so it cannot be ranked."
          : `None of the ${IN.format(list.of)} seats has a margin over votes polled, so none can be ranked.`;
    return { title, count, note };
  }
  const what = `Seats${isolation === null ? "" : ` ${isolation}`}${district === null ? "" : ` in ${district}`}`;
  const how =
    list.order === "seat" ? "in seat order" : list.order === "margin" ? "closest first" : "closest first, then those with no margin";
  // A selection nothing is in (a margin bin with no seat, or a party that won none on the tab being read) is "0 of 0" under a
  // heading that names it; the sentence is what says the list did not fail to load.
  return { title: `${what}, ${how}`, count, note: list.of === 0 ? "No seat matches this selection." : null };
}

/* ─────────────────────────────── the rows ─────────────────────────────── */

/** What a row needs of a seat. An `ElectionSeat` is one. */
export type RowFacts = {
  partyLabel: string | null;
  runnerUpLabel: string | null;
  marginVotes: number | null;
  marginBasis: "declared" | "counted" | null;
  marginPct: number | null;
  turnout: Turnout;
};

/**
 * The margin in votes, as a row's figure: counted, or declared by a source that published no counts and labelled as that.
 * Null where there is none.
 */
export function marginSaid(s: Pick<RowFacts, "marginVotes" | "marginBasis">): string | null {
  return s.marginVotes === null ? null : `${IN.format(s.marginVotes)} votes${s.marginBasis === "declared" ? " (declared)" : ""}`;
}

/**
 * What a row says in place of a figure it does not have, in the words the rest of the page uses for it: "margin not reported"
 * (the front page's closest fights), "no runner-up recorded" (the map's hover card) and "verification pending" (the turnout
 * beside the page's name). Null where the figure is there, and null where saying it would only repeat another gap: a seat
 * with no margin says so once, and has no share of it to report; a seat with no winner has no runner-up to lack.
 *
 * The share is the margin over votes polled. It goes missing for two reasons that read differently: the turnout is held and
 * cannot be corroborated (`unverified`), or there is none. The dash that begins the first is held to the word before it, so a
 * narrow row cannot break the line in front of it.
 */
export function gaps(s: RowFacts): { margin: string | null; runnerUp: string | null; share: string | null } {
  return {
    margin: s.marginVotes === null ? "margin not reported" : null,
    runnerUp: s.partyLabel !== null && s.runnerUpLabel === null ? "no runner-up recorded" : null,
    share:
      s.marginPct !== null || s.marginVotes === null
        ? null
        : s.turnout.state === "unverified"
          ? "share of votes polled\u00a0— verification pending"
          : "share of votes polled not reported",
  };
}
