// How the country got here: who led each state's assembly, at every year the registry holds an assembly election in.
//
// This is the time machine's data (docs/superpowers/specs/2026-11-03-situation-room-home-design.md, "How we got here"). The page
// scrubs a year and recolours the map, so everything it can ask is computed here once, as one `Landscape`, and the page does no
// arithmetic of its own: a state's colour at a year is a lookup, and so is the tally beside the map.
//
// THE RULES, each of them a refusal to say more than the registry knows:
//  · A state's government at a year is its newest ASSEMBLY election on record on or before that year, by the registry's chronology
//    (year, polling month, occurrence: `CHRONO_ASC`), and never a by-election. Four vacant seats do not replace the election that
//    formed the house (the same rule `currentIds` applies for "now").
//  · An election counts only once a result is on record: its lifecycle is declared (or later), and it has contests. A count that is
//    still running is not a government, however many seats a party leads in it so far; the live board is where that is shown. An
//    announced election with no contests yet is not one either.
//  · A state with no such election by the year has `held: null`, and the page draws it hollow. This module never carries the
//    previous year's colour forward past the state's own first election, and never invents one before it.
//  · The leader is the party with the MOST seats. WHERE TWO OR MORE PARTIES ARE LEVEL FOR MOST SEATS THERE IS NO LEADER: `leader` is
//    null, `leaderSeats` still says how many seats the level parties each hold, and `majority` is false. Breaking the tie by vote
//    share (which `foldStandings`, behind the rest of the front page, does) would be picking a winner the seat count did not pick,
//    and the page must not. A tie for most seats is rare in an assembly of dozens of seats, which is exactly why it must be handled
//    rather than left to whichever party the sort put first.
//  · A majority is MORE THAN HALF of the seats contested: exactly half is not one.
//
// WHY ONE PASS. The grid is 36 states by up to ~60 stops. Asking the registry per state per year would be two thousand reads of
// `result`; instead one read lists the assembly elections, one read counts the seats each party won in all of them, and the stops are
// then walked in memory. The seat counts come from `seatsWonBy` (elections.ts), the winners-only sibling of `seatsByParty`: no new SQL
// against `result` lives here, so a change to which revision of a result counts is made in `readSeats` and reaches this module for
// free. `seatsByParty` would give the same winners and also read every losing candidate of every election to compute vote shares
// that nothing here displays.
//
// SIZE. `byYear[i].states` repeats every state at every stop, so the payload is states × stops entries (the `held` objects are shared
// by reference in memory, but a serializer will copy them). That is the contract's shape; a client component that is handed all of it
// should be handed it once.

import type { DatabaseSync } from "node:sqlite";
import { all } from "../db/index.ts";
import { read } from "./index.ts";
import { jurisdictions } from "./coverage.ts";
import { seatsWonBy } from "./elections.ts";
import type { PartyRef } from "./seat-results.ts";
import type { Landscape, LandscapeState, LandscapeYear } from "./situation-types.ts";
import { CHRONO_ASC, bodyIs, fullHouse } from "../core/election-kind.ts";

type Held = NonNullable<LandscapeState["held"]>;

/** One assembly election with a result on record, as the walk needs it. */
export type LandscapeElection = { id: string; jurisdictionId: string; year: number; seats: number };

/** Seats won by one party in one election: the columns of `SeatsWon` that this module reads. `jurisdictionId` is the seat's own. */
export type Won = { electionId: string; key: string; label: string; seats: number };

/** A party and the seats it holds in one election, across every jurisdiction the election's seats sit in. */
export type Bloc = { key: string; label: string; seats: number };

/** Binary order, which is what SQLite's default collation and `tally` (seat-results.ts) give "by key". */
const byKey = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Result lifecycles: the election's own lifecycle says a result has been declared. The registry's 'declared' for every election it
 * holds today; 'disputed' and 'closed' follow it and still have a result on record.
 */
const RESULT_ON_RECORD = "'declared', 'disputed', 'closed'";

/**
 * `SeatsWon` rows folded into each election's blocs. Seats are summed across jurisdictions, because an election is one house: the
 * 2014 election of an undivided state holds seats whose version says they now sit in another jurisdiction, and a general election's
 * seats sit in every state. `currentStandings` folds the same way, so the leader here is the leader there.
 */
export function blocsByElection(won: readonly Won[]): Map<string, Bloc[]> {
  const by = new Map<string, Map<string, Bloc>>();
  for (const w of won) {
    const blocs = by.get(w.electionId) ?? new Map<string, Bloc>();
    const at = blocs.get(w.key) ?? { key: w.key, label: w.label, seats: 0 };
    at.seats += w.seats;
    blocs.set(w.key, at);
    by.set(w.electionId, blocs);
  }
  return new Map([...by].map(([id, blocs]) => [id, [...blocs.values()]]));
}

/**
 * The party with the most seats, and how many that is. No leader (null) where no seat is declared, and where two or more parties
 * are level for most: `seats` is then the count they share, so a caller can say "level on 14" and not name a winner.
 */
export function leaderOf(blocs: readonly Bloc[]): { leader: Bloc | null; seats: number } {
  let top = 0;
  let at: Bloc | null = null;
  let level = false;
  for (const b of blocs) {
    if (b.seats > top) {
      top = b.seats;
      at = b;
      level = false;
    } else if (b.seats === top && top > 0) {
      level = true;
    }
  }
  return { leader: level ? null : at, seats: top };
}

/**
 * The landscape from its inputs, with no database: `states` (id and name, in the order the page lists them), the assembly elections
 * with a result on record OLDEST FIRST (the registry's chronology, so two elections in one year are in the order they were held and
 * the later one is the government), and the seats each party won in each.
 */
export function landscapeFrom(
  states: readonly { id: string; name: string }[],
  elections: readonly LandscapeElection[],
  won: readonly Won[],
): Landscape {
  // A stable sort on the year alone: the order within a year is the caller's chronology and is kept. It only guards the walk below,
  // which needs the years not to go backwards.
  const held = [...elections].sort((a, b) => a.year - b.year);
  const blocs = blocsByElection(won);

  // One label per party key for the whole landscape, the newest election's, so that a legend and every tally agree on what a key is
  // called. Keys come from the party id, so in practice a key has one label; this only decides it where a source's own string varies.
  const label = new Map<string, string>();
  for (const e of held) for (const b of blocs.get(e.id) ?? []) label.set(b.key, b.label);
  const ref = (key: string): PartyRef => ({ key, label: label.get(key) ?? key });

  const heldAt = held.map((e): Held => {
    const { leader, seats: top } = leaderOf(blocs.get(e.id) ?? []);
    return {
      electionId: e.id,
      year: e.year,
      leader: leader === null ? null : ref(leader.key),
      leaderSeats: top,
      seats: e.seats,
      majority: leader !== null && top * 2 > e.seats,
    };
  });

  const years = [...new Set(held.map((e) => e.year))];
  const ordered = [...states].sort((a, b) => byKey(a.id, b.id));
  const government = new Map<string, Held>();
  const stops = new Map<string, number>();
  let next = 0;

  const byYear = years.map((year): LandscapeYear => {
    // Every election on or before this year, oldest first: the last one a state had is its government.
    for (; next < held.length && (held[next] as LandscapeElection).year <= year; next += 1) {
      government.set((held[next] as LandscapeElection).jurisdictionId, heldAt[next] as Held);
    }
    const rows = ordered.map((s): LandscapeState => ({ id: s.id, name: s.name, held: government.get(s.id) ?? null }));
    const tally = new Map<string, number>();
    for (const s of rows) {
      const key = s.held?.leader?.key;
      if (key === undefined) continue;
      tally.set(key, (tally.get(key) ?? 0) + 1);
      stops.set(key, (stops.get(key) ?? 0) + 1);
    }
    return {
      year,
      states: rows,
      tally: [...tally]
        .sort(([ka, na], [kb, nb]) => nb - na || byKey(ka, kb))
        .map(([key, n]) => ({ party: ref(key), states: n })),
      withResult: rows.filter((s) => s.held !== null).length,
    };
  });

  return {
    years,
    first: years[0] ?? null,
    last: years.at(-1) ?? null,
    byYear,
    // Stable: the order depends on the registry and on nothing the reader does, so a ribbon does not reshuffle as the scrubber moves.
    // Most states led over all the stops first (the party the ribbon is mostly made of), then by key.
    parties: [...stops].sort(([ka, na], [kb, nb]) => nb - na || byKey(ka, kb)).map(([key]) => ref(key)),
  };
}

/**
 * The landscape of the registry in `db`: three reads (the jurisdictions, the assembly elections with a result, the seats their parties
 * won) and a walk in memory. See the header for what each rule refuses.
 */
export function landscapeOverTime(db: DatabaseSync): Landscape {
  return read(() => {
    const states = jurisdictions(db).map((j) => ({ id: j.id, name: j.name }));
    const known = new Set(states.map((s) => s.id));
    const elections = all<LandscapeElection>(
      db,
      `SELECT e.id AS id, e.jurisdiction_place_id AS jurisdictionId, e.year AS year,
              (SELECT COUNT(*) FROM contest c WHERE c.election_id = e.id) AS seats
         FROM election e
        WHERE ${bodyIs("assembly")} AND ${fullHouse()} AND e.lifecycle IN (${RESULT_ON_RECORD})
        ORDER BY ${CHRONO_ASC}`,
    )
      // An election the page cannot place on the map would add a stop where nothing can change; an election with no contests has no
      // result (an announced one), and neither belongs on the scrubber.
      .filter((e) => e.seats > 0 && known.has(e.jurisdictionId));
    return landscapeFrom(states, elections, seatsWonBy(db, elections.map((e) => e.id)));
  });
}
