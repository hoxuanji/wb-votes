// What comes next: the elections ahead, soonest first, each with how much of its five-year term has run.
//
// Built from `upcoming()` (elections.ts), which already decides what is announced and what is only a five-year count, so this module
// adds three things and changes none of that:
//  · the Lok Sabha as one entry, from the same function asked for general elections, because the nation's own term is the longest bar
//    on the rail and the one a reader asks about first;
//  · `termElapsed`, the fraction of the term run as of a day the caller names;
//  · the election each entry follows, with who led it (the landscape's rule: the most seats, and nobody where two are level; and nobody
//    for a Lok Sabha the registry holds only part of), so the page can say what the term is counted FROM.
//
// THE WORDING RULE, and the reason this is a type and not a string: `basis` is "announced" only where the Commission set a date
// (`announced_on` or `notified_on` is on the row). Every other entry is "inferred", carries no date (`on` is null) and no fraction of
// a term can ever be attached to an announced one (`termElapsed` is null): a term is arithmetic on a past date, and an announced date
// is not arithmetic. A date inferred from a term has no way to be flagged as announced from here.
//
// THE TERM RULE. A term is five years (TERM_YEARS, as upcoming() counts it) from the middle of the month the last election was
// polled in, where the registry holds the month, and from the middle of the year (1 July) where it holds only the year: the registry
// does not derive a polling month from a term, so neither does this. The middle is the guess that is wrong by the least: it is out by
// half a year at most, which is a tenth of a term. As of the day asked the fraction is (today - start) / (end - start), floored at
// 0, and above 1 once the term has run out. An entry is OVERDUE when the year its term ends in is before this year (upcoming()'s own
// split); the fraction says it too, but the term of a state due this year can be over by a few months and still be this year's.
//
// ORDER. Announced first, by the date the Commission announced (a row with no date last), then the terms still to run, by the year
// each ends and then by name, then the overdue ones, by the same. The overdue go last because "Jammu and Kashmir was due in 2019" is
// a statement about where the registry stops, and an eight-state backlog at the head of a rail called "next up" would push every
// election actually coming off the screen. The page can tell them apart by `year` against its own year, and by `termElapsed > 1`.

import type { DatabaseSync } from "node:sqlite";
import { all } from "../db/index.ts";
import { read } from "./index.ts";
import { TERM_YEARS, previousElection, seatsWonBy, upcoming } from "./elections.ts";
import type { Dated } from "./elections.ts";
import { blocsByElection, leaderOf } from "./landscape.ts";
import type { Bloc } from "./landscape.ts";
import type { NextUp } from "./situation-types.ts";
import { bodyWord } from "../core/election-kind.ts";
import type { Body } from "../core/election-kind.ts";
import { INDIA_TOTALS, JURISDICTIONS } from "../ingest/india.ts";

/** Everything an entry is made of, once the registry has been read: the pure half's input. */
export type Pending = {
  basis: NextUp["basis"];
  jurisdictionId: string;
  jurisdictionName: string;
  body: Body;
  /** The year the election is announced for, or the year the term ends. */
  year: number;
  /** The date the Commission announced it, for an announced election that has one. */
  announcedOn: string | null;
  /** The election it follows, with the month it was polled in where the registry holds one. */
  after: { electionId: string; year: number; month: number | null; leaderLabel: string | null };
  seats: number;
};

/** Milliseconds from the start of the term to its end: the same calendar date TERM_YEARS later, so leap days do not shorten it. */
function termSpan(start: Date): [number, number] {
  const end = new Date(start.getTime());
  end.setUTCFullYear(end.getUTCFullYear() + TERM_YEARS);
  return [start.getTime(), end.getTime()];
}

/**
 * The fraction of a five-year term that has run on `today`, counted from the election at `year` (and `month`, 1 to 12, or null where the
 * registry holds none): 0 before the term has begun, 1 on the day it ends, above 1 when it is overdue. To three decimals, which is
 * finer than the uncertainty of the start.
 */
export function termElapsed(year: number, month: number | null, today: Date): number {
  const known = month !== null && Number.isInteger(month) && month >= 1 && month <= 12;
  const [start, end] = termSpan(new Date(Date.UTC(year, known ? month - 1 : 6, known ? 15 : 1)));
  return Math.max(0, Math.round(((today.getTime() - start) / (end - start)) * 1000) / 1000);
}

/**
 * The seats an election will fill: the reference strength of the body (ingest/india.ts, "the figure ECI conducts elections for"), and the
 * seats the last election contested only where the reference holds none. Not the last election's count first, because delimitation and
 * reorganisation change a house between elections and the reference is today's: Jammu and Kashmir's last election in the registry may
 * have filled 87 seats and its next fills 90.
 */
export function seatsToFill(body: Body, jurisdictionId: string, lastContested: number): number {
  if (body === "lok-sabha") return INDIA_TOTALS.lokSabhaSeats;
  return JURISDICTIONS.find((j) => j.id === jurisdictionId)?.assemblySeats ?? lastContested;
}

/** One entry. An announced one has no term to elapse; an inferred one has no date. */
export function entryOf(p: Pending, today: Date): NextUp {
  return {
    jurisdictionId: p.jurisdictionId,
    jurisdictionName: p.jurisdictionName,
    bodyWord: bodyWord(p.body),
    year: p.year,
    basis: p.basis,
    on: p.basis === "announced" ? p.announcedOn : null,
    after: { electionId: p.after.electionId, year: p.after.year, leaderLabel: p.after.leaderLabel },
    termElapsed: p.basis === "announced" ? null : termElapsed(p.after.year, p.after.month, today),
    seats: p.seats,
  };
}

/**
 * The party to name as the leader of the election an entry follows: the one with the most seats of the ones the registry holds (a tie
 * names nobody, as in the landscape), except for a Lok Sabha it holds only part of. The nation's house is loaded state by state, and a
 * registry that holds 42 of its 543 seats would otherwise say that the party that won those 42 led the Lok Sabha. Such an election has
 * no leader to name here, which is true: the registry does not know it.
 */
export function namedLeader(body: Body, contested: number, blocs: readonly Bloc[]): string | null {
  if (body === "lok-sabha" && contested < INDIA_TOTALS.lokSabhaSeats) return null;
  return leaderOf(blocs).leader?.label ?? null;
}

/**
 * An announced election is still ahead until its counting day has passed, on the Commission's own date. `upcoming()` lists an announced
 * election by its YEAR, so one counted earlier this year would otherwise stay on the rail as "next"; a row with no counting date cannot
 * be shown to be over and stays.
 */
export function stillAhead(countingOn: string | null, today: Date): boolean {
  return countingOn === null || countingOn >= today.toISOString().slice(0, 10);
}

/** Binary order, as the rest of the repo's "then by name". */
const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Sorts after every date: where an announced election has no announcement date, it goes last among the announced. */
const LAST = "\uffff";

/** The order of the header: announced by date, then terms still to run by the year they end, then the overdue by the same. */
export function inOrder(entries: readonly NextUp[], today: Date): NextUp[] {
  const thisYear = today.getUTCFullYear();
  const rank = (e: NextUp): number => (e.basis === "announced" ? 0 : e.year >= thisYear ? 1 : 2);
  return [...entries].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (rank(a) === 0 ? byText(a.on ?? LAST, b.on ?? LAST) : 0) ||
      a.year - b.year ||
      byText(a.jurisdictionName, b.jurisdictionName) ||
      byText(a.bodyWord, b.bodyWord),
  );
}

/** Every election ahead, from the registry in `db`, as of `today` (UTC). The caller slices what its rail can hold. */
export function nextUp(db: DatabaseSync, today: Date): NextUp[] {
  return read(() => {
    const thisYear = today.getUTCFullYear();
    // Every row, not upcoming()'s default eight: the page decides how many it shows, and a limit applied before the overdue are
    // split off and the announced ones merged in would drop a state at random.
    const ALL = 1000;
    const assembly = upcoming(db, thisYear, "assembly", ALL);
    const general = upcoming(db, thisYear, "general", ALL);

    // What is announced is its own election; what is inferred stands on the election it is counted from. The announced election's
    // predecessor is the election its term follows, and an announced election with none on record has nothing to be "after".
    const announced = [...assembly.announced, ...general.announced].filter((d) => stillAhead(d.countingOn, today));
    const follows = new Map<string, string>();
    for (const d of announced) {
      const before = previousElection(db, d.id);
      if (before !== null) follows.set(d.id, before);
    }
    const inferred = [...assembly.derived, ...assembly.overdue, ...general.derived, ...general.overdue];
    const afterOf = (d: Dated, basis: Pending["basis"]): string | null => (basis === "announced" ? (follows.get(d.id) ?? null) : d.id);

    const afterIds = [...new Set([...announced.flatMap((d) => afterOf(d, "announced") ?? []), ...inferred.map((d) => d.id)])];
    const facts = new Map(
      afterIds.length === 0
        ? []
        : all<{ id: string; year: number; month: number | null; seats: number }>(
            db,
            `SELECT e.id AS id, e.year AS year, e.polling_month AS month,
                    (SELECT COUNT(*) FROM contest c WHERE c.election_id = e.id) AS seats
               FROM election e WHERE e.id IN (${afterIds.map(() => "?").join(",")})`,
            ...afterIds,
          ).map((r) => [r.id, r] as const),
    );
    // Who led each election the entries follow, by the rule the landscape uses (a tie has no leader), so the two panels cannot name
    // different parties for one election.
    const blocs = blocsByElection(afterIds.length === 0 ? [] : seatsWonBy(db, afterIds));

    const pending = (d: Dated, basis: Pending["basis"]): Pending | null => {
      const id = afterOf(d, basis);
      if (id === null) return null;
      const f = facts.get(id);
      return {
        basis,
        jurisdictionId: d.jurisdictionId,
        jurisdictionName: d.jurisdictionName,
        body: d.body,
        year: d.year,
        announcedOn: d.announcedOn,
        after: {
          electionId: id,
          year: f?.year ?? d.year - TERM_YEARS,
          month: f?.month ?? null,
          leaderLabel: namedLeader(d.body, f?.seats ?? 0, blocs.get(id) ?? []),
        },
        seats: seatsToFill(d.body, d.jurisdictionId, f?.seats ?? d.seatsContested),
      };
    };

    return inOrder(
      [...announced.map((d) => pending(d, "announced")), ...inferred.map((d) => pending(d, "inferred"))]
        .filter((p): p is Pending => p !== null)
        .map((p) => entryOf(p, today)),
      today,
    );
  });
}
