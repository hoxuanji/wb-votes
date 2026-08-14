// One election, one shape — for all 1,188 of them.
//
// The point of this module is that NOTHING here knows whether it is looking at a state assembly, a Lok
// Sabha election or a by-poll. An election is a jurisdiction, a set of contests, a set of winners and a
// previous election of the same kind; every surface in the product is built from that one shape, so
// adding a state or a cycle is a data question and never a component question.
//
// Everything is computed from the registry at request time. There is no curated list of elections in the
// codebase and there must not be one: the calendar the front page shows is `SELECT` over what has been
// loaded, which is why loading Kerala's history makes Kerala appear without a line of UI changing.
//
// TWO HONESTY RULES, both learned the hard way:
//  · Margin is a share of VOTES POLLED (turnout.voters), never of the sum of the result rows. For years
//    where only leading contestants are held, summing result rows inflates every margin.
//  · A vote share is null when the source published no counts. 2026's West Bengal rows carry a winner and
//    a margin and no tallies; a 0 there would be a fabrication.

import type { DatabaseSync } from "node:sqlite";
import { all, get } from "../db/index.ts";
import { loadSources, read } from "./index.ts";
import type { SourceRef } from "./index.ts";
import { placeHref } from "./place-page.ts";
import { JURISDICTIONS } from "../ingest/india.ts";

/**
 * Chronological order for elections, newest first — the ONLY ordering any surface may rank by.
 *
 * An election id is only accidentally chronological. It sorts by the middle of the string, so by id the
 * election after `wb-bypoll-ae-2021` is `wb-bypoll-ge-2016`, five years EARLIER, and `ka-bypoll-ge-2021`
 * outranks `ka-assembly-2023`. Every ranking in this file and in repo/home.ts binds this constant so the
 * defect cannot come back in one place while being fixed in another.
 *
 * `polling_month` is NULL for the elections whose month was never sourced (it is not derived from a
 * five-year term), so it is coalesced rather than allowed to reorder a year.
 */
export const CHRONO_DESC = "e.year DESC, COALESCE(e.polling_month, 0) DESC, e.occurrence DESC, e.id DESC";

/**
 * The contests of one election that lie INSIDE one jurisdiction — joins only, so it composes into
 * any query that has a `contest c` in scope.
 *
 * This is the whole reason a state page needs no state-specific code. Two shapes of place hang off a
 * jurisdiction and they hang off it at different depths: an assembly seat's parent is a district whose
 * parent is the state, a parliamentary seat's parent IS the state. Both are checked, so the same
 * predicate scopes an assembly election, a by-election and a Lok Sabha election — and a general
 * election, whose `jurisdiction_place_id` is the union, still resolves to the 28 seats it fought in
 * Karnataka rather than to all 543.
 *
 * Not `substr(pl.id, 1, instr(pl.id, '.') - 1)`: that reads the state out of the id STRING, which is a
 * naming convention, where parent_id is the modelled relationship.
 */
const INSIDE = `
       JOIN place_version pvv ON pvv.id = c.place_version_id
       JOIN place pl          ON pl.id = pvv.place_id
       LEFT JOIN place dis    ON dis.id = COALESCE(pvv.district_place_id, pl.parent_id)`;
/** Binds the jurisdiction id TWICE, once per depth. */
const IN_SCOPE = `(pl.parent_id = ? OR dis.parent_id = ?)`;

/** `WHERE c.election_id = ?` plus the scope, or just the election when no jurisdiction is given. */
function scope(jurisdictionId: string | undefined): { joins: string; where: string; binds: string[] } {
  return jurisdictionId === undefined
    ? { joins: "", where: "", binds: [] }
    : { joins: INSIDE, where: ` AND ${IN_SCOPE}`, binds: [jurisdictionId, jurisdictionId] };
}

export type PartyStanding = {
  /** party.id, or the raw label when a party row could not be resolved. */
  key: string;
  label: string;
  seats: number;
  /** Share of counted votes, or null where the source published no counts. */
  votePct: number | null;
};

export type CloseFight = {
  placeName: string;
  placeId: string;
  jurisdictionId: string;
  /**
   * The seat's own page, or the jurisdiction's when it has none.
   *
   * Built HERE rather than in a component, because the rule — state / district / slugged name — is the same
   * one `state-map.ts` and `place-page.ts` apply, and a fourth copy of it in JSX is a link that silently goes
   * nowhere. A parliamentary constituency hangs off the state rather than a district, so it has no
   * four-segment path; that is a fallback up the tree, not a broken URL.
   */
  href: string;
  winner: string;
  /** The party that came second, and its share. Null where the source holds only the winner. */
  runnerUp: string | null;
  runnerUpPct: number | null;
  /** Winner's votes as a share of votes polled. Null where the source published no counts. */
  winnerPct: number | null;
  marginPct: number;
  marginVotes: number | null;
  /** The election the margin belongs to, so a row can be traced without guessing from the year. */
  electionId: string;
  year: number;
};

export type ElectionSummary = {
  id: string;
  name: string;
  kind: string;
  jurisdictionId: string;
  jurisdictionName: string;
  year: number;
  seatsContested: number;
  /** Seats a majority needs, from the seats this election actually contested. */
  majority: number;
  parties: PartyStanding[];
  leader: PartyStanding | null;
  turnoutPct: number | null;
  /** Votes polled across the contests summarised — the denominator for every margin. */
  votesPolled: number | null;
  votesCounted: boolean;
  previousId: string | null;
};

const yearOf = (electionId: string): number => Number(/(\d{4})/.exec(electionId)?.[1] ?? 0);
/** 'in' is the union itself, which is not one of the 36 jurisdictions and is not called "in". */
const nameOf = (id: string): string =>
  id === "in" ? "India" : (JURISDICTIONS.find((j) => j.id === id)?.name ?? id);

/**
 * The party label a reader should see. `party.short_name` first because "TMC" is what a table column can
 * hold, then the full name, then the raw string the source printed — which is all there is for a party no
 * register lists, and is better than "unknown".
 */
const LABEL_SQL = `COALESCE(NULLIF(pt.short_name, ''), NULLIF(pt.name, ''), NULLIF(cd.party_raw, ''), 'Unattached')`;
const KEY_SQL = `COALESCE(pt.id, NULLIF(cd.party_raw, ''), 'unattached')`;

/** Winners by party for one election, with vote share where the source counted votes. Pass a
 *  jurisdiction to read only the part of the election fought inside it (see INSIDE). */
function standings(
  db: DatabaseSync,
  electionId: string,
  jurisdictionId?: string,
): { parties: PartyStanding[]; votesCounted: boolean } {
  const s = scope(jurisdictionId);
  const rows = all<{ key: string; label: string; seats: number; votes: number | null }>(
    db,
    `SELECT ${KEY_SQL} AS key, ${LABEL_SQL} AS label,
            SUM(CASE WHEN r.is_winner = 1 THEN 1 ELSE 0 END) AS seats,
            SUM(r.votes) AS votes
       FROM result r
       JOIN contest c        ON c.id = r.contest_id
       JOIN candidacy cd     ON cd.id = r.candidacy_id
       LEFT JOIN party_version pv ON pv.id = cd.party_version_id
       LEFT JOIN party pt         ON pt.id = pv.party_id${s.joins}
      WHERE r.revision = 0 AND c.election_id = ?${s.where}
      GROUP BY 1, 2
      ORDER BY seats DESC, votes DESC`,
    electionId,
    ...s.binds,
  );
  const counted = rows.reduce((t, r) => t + (r.votes ?? 0), 0);
  return {
    votesCounted: counted > 0,
    parties: rows
      .filter((r) => r.seats > 0 || (r.votes ?? 0) > 0)
      .map((r) => ({
        key: r.key,
        label: r.label,
        seats: r.seats,
        // FULL PRECISION, rounded by whatever displays it. Rounding here to one decimal turned SKM's real
        // 2024 national share into 0 — and a party that won a seat cannot be shown to have polled nothing.
        // A view that wants one decimal asks for one; a view that must distinguish "small" from "none"
        // cannot get that distinction back once it has been thrown away.
        votePct: counted > 0 && r.votes !== null ? (100 * r.votes) / counted : null,
      })),
  };
}

/**
 * The jurisdiction a seat sits in, from the place tree rather than from the id string.
 *
 * Two depths, because two shapes of place hang off a jurisdiction: an assembly seat's parent is usually a
 * district whose parent is the state, but 535 of them hang off the state directly, and a parliamentary
 * seat's parent IS the state. The CASE reads the district only when `dis` really is a district; taking
 * `dis.parent_id` unconditionally would answer 'in' for every parliamentary seat.
 */
const J_OF_SEAT = `CASE WHEN dis.kind = 'district' THEN dis.parent_id ELSE pl.parent_id END`;

export type SeatsByParty = {
  electionId: string;
  /** The jurisdiction the seats are in — 'ka' for Karnataka's 28 seats of a general election. */
  jurisdictionId: string;
  key: string;
  label: string;
  seats: number;
  /** Votes the party polled, or null where the source published no counts. */
  votes: number | null;
};

/**
 * Seats and votes by party for MANY elections at once, split by the jurisdiction each seat sits in.
 *
 * One query where `standings()` is one per election per jurisdiction. The national front page needs the
 * full party list for 31 jurisdictions' latest assemblies plus every state's slice of the latest Lok
 * Sabha; through `standings()` that is 60-odd scans of `result`, and the page had four sections each
 * paying for it again. This is the same GROUP BY with the election and the jurisdiction added to the key.
 *
 * `revision = 0` is not optional: revision is the supersession column, and without it a corrected result
 * would be counted alongside the row it replaced.
 */
export function seatsByParty(db: DatabaseSync, electionIds: readonly string[]): SeatsByParty[] {
  if (electionIds.length === 0) return [];
  return read(() =>
    all<SeatsByParty>(
      db,
      `SELECT c.election_id AS electionId, ${J_OF_SEAT} AS jurisdictionId,
              ${KEY_SQL} AS key, ${LABEL_SQL} AS label,
              SUM(CASE WHEN r.is_winner = 1 THEN 1 ELSE 0 END) AS seats,
              SUM(r.votes) AS votes
         FROM result r
         JOIN contest c        ON c.id = r.contest_id
         JOIN candidacy cd     ON cd.id = r.candidacy_id
         LEFT JOIN party_version pv ON pv.id = cd.party_version_id
         LEFT JOIN party pt         ON pt.id = pv.party_id
         JOIN place_version pvv ON pvv.id = c.place_version_id
         JOIN place pl          ON pl.id = pvv.place_id
         LEFT JOIN place dis    ON dis.id = COALESCE(pvv.district_place_id, pl.parent_id)
        WHERE r.revision = 0 AND c.election_id IN (${electionIds.map(() => "?").join(",")})
        GROUP BY 1, 2, 3, 4`,
      ...electionIds,
    ),
  );
}

export type SeatsWon = {
  electionId: string;
  jurisdictionId: string;
  key: string;
  label: string;
  seats: number;
};

/**
 * Seats WON by party, for many elections — winners only, and deliberately without votes.
 *
 * The cheap sibling of `seatsByParty`. A grid of 36 jurisdictions × 5 elections needs the leader of 155
 * elections; through `seatsByParty` that reads every losing row of all of them (~300,000) to compute a
 * vote share nothing on that surface displays. This reads the ~31,000 winners.
 *
 * No `votes` column, by design rather than by omission: the winners' votes are not a denominator for
 * anything, and a `votes` field here would eventually be divided by something and reported as a share.
 */
export function seatsWonBy(db: DatabaseSync, electionIds: readonly string[]): SeatsWon[] {
  if (electionIds.length === 0) return [];
  return read(() =>
    all<SeatsWon>(
      db,
      `SELECT c.election_id AS electionId, ${J_OF_SEAT} AS jurisdictionId,
              ${KEY_SQL} AS key, ${LABEL_SQL} AS label, COUNT(*) AS seats
         FROM result r
         JOIN contest c        ON c.id = r.contest_id
         JOIN candidacy cd     ON cd.id = r.candidacy_id
         LEFT JOIN party_version pv ON pv.id = cd.party_version_id
         LEFT JOIN party pt         ON pt.id = pv.party_id
         JOIN place_version pvv ON pvv.id = c.place_version_id
         JOIN place pl          ON pl.id = pvv.place_id
         LEFT JOIN place dis    ON dis.id = COALESCE(pvv.district_place_id, pl.parent_id)
        WHERE r.revision = 0 AND r.is_winner = 1
          AND c.election_id IN (${electionIds.map(() => "?").join(",")})
        GROUP BY 1, 2, 3, 4`,
      ...electionIds,
    ),
  );
}

/**
 * `seatsByParty` rows folded into the `PartyStanding` shape one election's readers expect.
 *
 * Share is of the votes COUNTED in the rows summed, and it is null when the source published none —
 * never 0, which would read as a party that contested and polled nothing.
 */export function foldStandings(rows: readonly SeatsByParty[]): { parties: PartyStanding[]; votesCounted: boolean } {
  const byParty = new Map<string, { label: string; seats: number; votes: number | null }>();
  for (const r of rows) {
    const at = byParty.get(r.key) ?? { label: r.label, seats: 0, votes: null };
    at.seats += r.seats;
    if (r.votes !== null) at.votes = (at.votes ?? 0) + r.votes;
    byParty.set(r.key, at);
  }
  const counted = [...byParty.values()].reduce((t, r) => t + (r.votes ?? 0), 0);
  return {
    votesCounted: counted > 0,
    parties: [...byParty]
      .filter(([, r]) => r.seats > 0 || (r.votes ?? 0) > 0)
      .map(([key, r]) => ({
        key,
        label: r.label,
        seats: r.seats,
        // FULL PRECISION, rounded by whatever displays it. Rounding here to one decimal turned SKM's real
        // 2024 national share into 0 — and a party that won a seat cannot be shown to have polled nothing.
        // A view that wants one decimal asks for one; a view that must distinguish "small" from "none"
        // cannot get that distinction back once it has been thrown away.
        votePct: counted > 0 && r.votes !== null ? (100 * r.votes) / counted : null,
      }))
      .sort((a, b) => b.seats - a.seats || (b.votePct ?? 0) - (a.votePct ?? 0)),
  };
}

/**
 * The previous election of the SAME KIND in the same jurisdiction. Cross-kind comparison is a lie.
 *
 * Ordered by YEAR, not by id, for the reason `recent` records: an id is only accidentally
 * chronological. Assembly ids are '<state>-assembly-<year>' so the two orderings agree there, but a
 * by-election is '<state>-bypoll-ae-<year>' / '-ge-<year>', and by id the election before
 * 'wb-bypoll-ge-2016' is 'wb-bypoll-ae-2021' — five years LATER. The (year, id) tuple keeps the
 * comparison chronological and still deterministic when a jurisdiction holds two in one year.
 */
export function previousElection(db: DatabaseSync, electionId: string): string | null {
  const row = get<{ id: string }>(
    db,
    // The columns, not substr(id, -4). Reading a year out of the id string worked only because every id
    // this registry holds happens to end in one; `election.year` is the modelled fact, and (year,
    // polling_month, occurrence) is the same tuple CHRONO_DESC ranks by, so "the previous election" and
    // "the newest election" can never disagree about which of two is earlier.
    `SELECT e2.id AS id FROM election e
       JOIN election e2 ON e2.jurisdiction_place_id = e.jurisdiction_place_id
                       AND e2.kind = e.kind
                       AND (e2.year, COALESCE(e2.polling_month, 0), e2.occurrence, e2.id)
                         < (e.year,  COALESCE(e.polling_month, 0),  e.occurrence,  e.id)
      WHERE e.id = ?
      ORDER BY e2.year DESC, COALESCE(e2.polling_month, 0) DESC, e2.occurrence DESC, e2.id DESC
      LIMIT 1`,
    electionId,
  );
  return row?.id ?? null;
}

/* ──────────────────────── the epoch gate: what may be compared seat by seat ──────────────────────── */

/**
 * A seat's identity FOR COMPARISON: the seat and the boundary it was drawn under, together.
 *
 * THIS IS THE FIX FOR A DEFECT, and it is a key rather than a check on purpose. `place.id` is a seat
 * NUMBER slot, not a territory — 4,077 of 4,493 assembly place_ids carry a different name in a different
 * delimitation, because every order renumbers from scratch (docs/model/electoral-geography.md). So
 * matching two elections' winners on `place_id` alone compares a number, not a place:
 *
 *   ka.ac.001   delim-1976  AURAD          INC        ka-assembly-2004
 *   ka.ac.001   delim-2008  NIPPANI        INC        ka-assembly-2008
 *   ka.ac.002   delim-1976  BHALKI         BJP
 *   ka.ac.002   delim-2008  CHIKKODI-SADALGA  INC
 *
 * Measured against the live registry: pairing Karnataka 2004 with 2008 on `place_id` matches 223 seats,
 * ALL 223 of which name a different constituency, and 170 of them differ in winning party — so the state
 * page would have printed "170 of 223 seats changed hands" about seats that never faced each other. 65 of
 * 324 consecutive assembly pairs cross a delimitation this way.
 *
 * Why a composite KEY and not an `if`: a check has to be remembered at every call site, and there are two
 * (`stateShifts`, `watchSignals`) with more to come. Keying the comparison on (epoch, place) makes the
 * wrong match UNREPRESENTABLE — a cross-epoch pair simply finds nothing, because the keys cannot collide.
 * Callers cannot opt out of it, which is the difference between a gate and a convention.
 *
 * A silent zero would be its own lie, though, so `partitionByEpoch` below counts what it refused and every
 * caller carries that count into the UI. "Not comparable" and "nothing changed" are different answers.
 *
 * A SPACE as the separator: an epoch id is `delim-<something>` and a place id is dotted lowercase, and
 * neither contains a space anywhere in the registry, so no two distinct pairs can collapse into one key.
 */
export function seatKey(placeId: string, epochId: string): string {
  return `${epochId}\u0000${placeId}`;
}

/** One side of a seat-level comparison, split into what may be compared and what may not. */
export type EpochSplit<T> = {
  /** Rows whose (place, epoch) key exists on BOTH sides. Safe to compare seat by seat. */
  comparable: T[];
  /** Rows with no counterpart under the same boundary. Reported, never compared, never counted as change. */
  incomparable: T[];
};

/**
 * Split `now` into the seats that have a counterpart in `then` under the SAME boundary, and the seats
 * that do not.
 *
 * Note what this does NOT do: it does not decide comparability per ELECTION. `ls-2024` holds 524 contests
 * under delim-2008, 5 under delim-2022-jk and 14 under delim-2023-as — so 19 of its 543 seats sit on
 * boundaries that did not exist in 2019, and an election-level flag would have called all 543 comparable.
 * Comparability is a property of a SEAT, so it is decided per seat.
 */
export function partitionByEpoch<T extends { placeId: string; epochId: string }>(
  now: readonly T[],
  then: readonly { placeId: string; epochId: string }[],
): EpochSplit<T> {
  const available = new Set(then.map((r) => seatKey(r.placeId, r.epochId)));
  const comparable: T[] = [];
  const incomparable: T[] = [];
  for (const r of now) {
    (available.has(seatKey(r.placeId, r.epochId)) ? comparable : incomparable).push(r);
  }
  return { comparable, incomparable };
}

export function electionSummary(
  db: DatabaseSync,
  electionId: string,
  jurisdictionId?: string,
): ElectionSummary | null {
  return read(() => {
    const e = get<{ id: string; name: string; kind: string; jurisdiction_place_id: string }>(
      db,
      "SELECT id, name, kind, jurisdiction_place_id FROM election WHERE id = ?",
      electionId,
    );
    if (e === undefined) return null;
    const s = scope(jurisdictionId);
    const seats =
      get<{ n: number }>(
        db,
        `SELECT COUNT(*) AS n FROM contest c${s.joins} WHERE c.election_id = ?${s.where}`,
        electionId,
        ...s.binds,
      )?.n ?? 0;
    const t = get<{ voters: number | null; electors: number | null }>(
      db,
      `SELECT SUM(t.voters) AS voters, SUM(t.electors) AS electors
         FROM turnout t JOIN contest c ON c.id = t.contest_id${s.joins}
        WHERE c.election_id = ? AND t.scope = 'contest'${s.where}`,
      electionId,
      ...s.binds,
    );
    const { parties, votesCounted } = standings(db, electionId, jurisdictionId);
    return {
      id: e.id,
      name: e.name,
      kind: e.kind,
      // The jurisdiction being READ, not the one that called the election: /pl/ka viewing ls-2019 is
      // Karnataka's 28 seats of it, and labelling that "India" would misdescribe every figure below.
      jurisdictionId: jurisdictionId ?? e.jurisdiction_place_id,
      jurisdictionName: nameOf(jurisdictionId ?? e.jurisdiction_place_id),
      year: yearOf(e.id),
      seatsContested: seats,
      majority: Math.floor(seats / 2) + 1,
      parties,
      leader: parties[0] ?? null,
      turnoutPct:
        t?.electors != null && t.electors > 0 && t.voters != null
          ? Number(((100 * t.voters) / t.electors).toFixed(1))
          : null,
      /** The denominator every margin on this election is a share of. */
      votesPolled: t?.voters ?? null,
      votesCounted,
      previousId: previousElection(db, electionId),
    };
  });
}

export type Standing = {
  jurisdictionId: string;
  jurisdictionName: string;
  electionId: string;
  year: number;
  seatsContested: number;
  leaderKey: string | null;
  leaderLabel: string | null;
  leaderSeats: number;
  /** True when the leader holds an outright majority of the seats contested. */
  majority: boolean;
};

export type LatestElection = {
  id: string;
  jurisdictionId: string;
  year: number;
  seatsContested: number;
};

/**
 * The most recent election of one kind in each jurisdiction, by real chronology.
 *
 * `ORDER BY e.id DESC` was here, and inside one kind it happened to agree with the calendar because an
 * assembly id ends in its year. It does not agree for by-elections: `wb-bypoll-ge-2016` sorts above
 * `wb-bypoll-ae-2021`, so "the current state of play" for that kind was a five-year-old result. Every
 * caller now ranks on CHRONO_DESC, and `year` comes off the column rather than out of the id.
 */
export function latestPerJurisdiction(db: DatabaseSync, kind = "assembly"): LatestElection[] {
  return read(() =>
    all<LatestElection>(
      db,
      `SELECT id, jurisdictionId, year, seatsContested FROM (
         SELECT e.id AS id, e.jurisdiction_place_id AS jurisdictionId, e.year AS year,
                (SELECT COUNT(*) FROM contest c WHERE c.election_id = e.id) AS seatsContested,
                row_number() OVER (PARTITION BY e.jurisdiction_place_id ORDER BY ${CHRONO_DESC}) AS rn
           FROM election e WHERE e.kind = ?
       ) WHERE rn = 1`,
      kind,
    ),
  );
}

/**
 * Where every jurisdiction stands now: its most recent election of this kind and who leads it.
 *
 * This is the national picture, and it is two queries rather than a curated table — or than the 62 it
 * used to be, one pair per jurisdiction. A state with no data loaded is absent rather than zeroed; the
 * caller pairs it against JURISDICTIONS to show the gap.
 */
export function currentStandings(db: DatabaseSync, kind = "assembly"): Standing[] {
  return read(() => {
    const latest = latestPerJurisdiction(db, kind);
    const byElection = new Map<string, SeatsByParty[]>();
    for (const r of seatsByParty(db, latest.map((l) => l.id))) {
      byElection.set(r.electionId, [...(byElection.get(r.electionId) ?? []), r]);
    }
    return latest
      .map((row): Standing => {
        const { parties } = foldStandings(byElection.get(row.id) ?? []);
        const top = parties[0] ?? null;
        return {
          jurisdictionId: row.jurisdictionId,
          jurisdictionName: nameOf(row.jurisdictionId),
          electionId: row.id,
          year: row.year,
          seatsContested: row.seatsContested,
          leaderKey: top?.key ?? null,
          leaderLabel: top?.label ?? null,
          leaderSeats: top?.seats ?? 0,
          majority: top !== null && row.seatsContested > 0 && top.seats > row.seatsContested / 2,
        };
      })
      .sort((a, b) => b.year - a.year || a.jurisdictionName.localeCompare(b.jurisdictionName));
  });
}

export type SwingRow = {
  key: string;
  label: string;
  nowPct: number | null;
  thenPct: number | null;
  changePp: number | null;
  nowSeats: number;
  thenSeats: number;
};

export type Swing = {
  jurisdictionId: string;
  jurisdictionName: string;
  nowId: string;
  thenId: string;
  year: number;
  thenYear: number;
  rows: SwingRow[];
};

/**
 * Vote share and seats in one election against another, party by party.
 *
 * Both elections must be the SAME KIND — the caller gets `thenId` from `previousElection`, which is
 * where that rule is enforced. `jurisdictionId` scopes both sides identically, so a state's slice of
 * two general elections compares like with like.
 *
 * A party absent from one of the two gets a null change rather than a -100: not contesting is not a
 * collapse, and the difference matters when a new party's first outing is being read.
 */
export function swingRows(
  db: DatabaseSync,
  nowId: string,
  thenId: string,
  o: { jurisdictionId?: string; minPct?: number; limit?: number } = {},
): SwingRow[] {
  const min = o.minPct ?? 0;
  const now = new Map(standings(db, nowId, o.jurisdictionId).parties.map((p) => [p.key, p]));
  const then = new Map(standings(db, thenId, o.jurisdictionId).parties.map((p) => [p.key, p]));
  const rows = [...new Set([...now.keys(), ...then.keys()])]
    .map((k): SwingRow => {
      const a = now.get(k);
      const b = then.get(k);
      const nowPct = a?.votePct ?? null;
      const thenPct = b?.votePct ?? null;
      return {
        key: k,
        label: a?.label ?? b?.label ?? k,
        nowPct,
        thenPct,
        changePp: nowPct === null || thenPct === null ? null : Number((nowPct - thenPct).toFixed(1)),
        nowSeats: a?.seats ?? 0,
        thenSeats: b?.seats ?? 0,
      };
    })
    // `minPct` of 0 keeps everything, including a row whose share is null on both sides: an election
    // with no published counts (West Bengal 2026) has null everywhere, and its seat change is the only
    // signal there is. The seat tie-break below is what orders those rows.
    .filter((r) => (r.nowPct ?? 0) >= min || (r.thenPct ?? 0) >= min)
    .sort((x, y) => (y.nowPct ?? 0) - (x.nowPct ?? 0) || y.nowSeats - x.nowSeats);
  return o.limit === undefined ? rows : rows.slice(0, o.limit);
}

/**
 * Vote share now against vote share last time, per jurisdiction, same kind of election.
 */
export function swings(db: DatabaseSync, kind = "assembly", limit = 8): Swing[] {
  return read(() =>
    currentStandings(db, kind)
      .slice(0, limit)
      .flatMap((s): Swing[] => {
        const thenId = previousElection(db, s.electionId);
        if (thenId === null) return [];
        const rows = swingRows(db, s.electionId, thenId, { minPct: 3, limit: 4 });
        // A swing table needs both sides counted. West Bengal 2026 publishes winners and margins and no
        // tallies, so every row read "-% (n/a)" — four rows of nothing at the top of the section. A
        // jurisdiction with no counts on either side is absent here and says so on its own page.
        if (!rows.some((r) => r.nowPct !== null && r.thenPct !== null)) return [];
        return rows.length === 0
          ? []
          : [
              {
                jurisdictionId: s.jurisdictionId,
                jurisdictionName: s.jurisdictionName,
                nowId: s.electionId,
                thenId,
                year: s.year,
                thenYear: yearOf(thenId),
                rows,
              },
            ];
      }),
  );
}

/** The tightest results in the country, from the most recent election of each jurisdiction. */
export function closeFights(db: DatabaseSync, kind = "assembly", limit = 12): CloseFight[] {
  return read(() => {
    const latest = latestPerJurisdiction(db, kind);
    if (latest.length === 0) return [];
    const ids = latest.map((l) => l.id);
    const holes = ids.map(() => "?").join(",");
    return all<CloseFight & { districtId: string | null }>(
      db,
      // The runner-up joins on rank = 2 of the SAME contest. A LEFT JOIN, because an election the source
      // published winners-only for has no second row — and "no runner-up recorded" is a different fact
      // from "unopposed", which is why it is null here rather than blank.
      `SELECT plv.canonical_name AS placeName, pl.id AS placeId, ${J_OF_SEAT} AS jurisdictionId,
              ${LABEL_SQL} AS winner,
              -- The district the seat sat in UNDER THIS VERSION, which is what a place path addresses. NULL
              -- for a parliamentary constituency, whose district join lands on the jurisdiction instead.
              CASE WHEN dis.kind = 'district' THEN dis.id ELSE NULL END AS districtId,
              CASE WHEN r2.candidacy_id IS NULL THEN NULL
                   ELSE COALESCE(NULLIF(pt2.short_name, ''), NULLIF(pt2.name, ''), NULLIF(cd2.party_raw, ''), 'Unattached')
              END AS runnerUp,
              ROUND(100.0 * r2.votes / t.voters, 1) AS runnerUpPct,
              ROUND(100.0 * r.votes / t.voters, 1) AS winnerPct,
              -- Two decimals, because the closest seats in India are decided by tens of votes and one
              -- decimal printed five different results as "0%".
              ROUND(100.0 * r.margin / t.voters, 2) AS marginPct,
              r.margin AS marginVotes,
              c.election_id AS electionId, e.year AS year
         FROM result r
         JOIN contest c        ON c.id = r.contest_id
         JOIN election e       ON e.id = c.election_id
         JOIN candidacy cd     ON cd.id = r.candidacy_id
         LEFT JOIN party_version pv ON pv.id = cd.party_version_id
         LEFT JOIN party pt         ON pt.id = pv.party_id
         LEFT JOIN result r2   ON r2.contest_id = c.id AND r2.revision = 0 AND r2.rank = 2
         LEFT JOIN candidacy cd2    ON cd2.id = r2.candidacy_id
         LEFT JOIN party_version pv2 ON pv2.id = cd2.party_version_id
         LEFT JOIN party pt2         ON pt2.id = pv2.party_id
         JOIN turnout t        ON t.contest_id = c.id AND t.scope = 'contest'
         JOIN place_version plv ON plv.id = c.place_version_id
         JOIN place pl          ON pl.id = plv.place_id
         LEFT JOIN place dis    ON dis.id = COALESCE(plv.district_place_id, pl.parent_id)
        WHERE r.revision = 0 AND r.is_winner = 1 AND r.margin IS NOT NULL AND t.voters > 0
          AND c.election_id IN (${holes})
        ORDER BY marginPct ASC, placeName
        LIMIT ?`,
      ...ids,
      limit,
    ).map(({ districtId, ...r }) => ({
      ...r,
      href:
        districtId !== null && districtId.startsWith(`${r.jurisdictionId}.`)
          ? `/pl/${r.jurisdictionId}/${districtId.slice(r.jurisdictionId.length + 1)}/${r.placeName
              .trim()
              .toLowerCase()
              .replace(/\s+/g, "-")}`
          : `/pl/${r.jurisdictionId}`,
    }));
  });
}

export type Dated = {
  id: string;
  name: string;
  jurisdictionId: string;
  jurisdictionName: string;
  kind: string;
  year: number;
  /** 'declared' for a result we hold; 'due' for a term expiring, which is derived, not announced. */
  status: "declared" | "due";
  leaderLabel: string | null;
  leaderSeats: number;
  seatsContested: number;
  /** 'ac' or 'pc' — which house was, or is to be, elected. */
  house: string;
  /**
   * A date the COMMISSION set, never one this codebase computed.
   *
   * `announced_on` is NULL for all 1,202 rows and `election_phase` holds none, so there is nothing
   * authoritative to prefer over the derived arithmetic today. These fields exist so that when the ECI
   * schedule is ingested the derived list GIVES WAY to it rather than being reconciled with it, and
   * `upcoming()` already reads them first.
   */
  announcedOn: string | null;
  countingOn: string | null;
  /** Votes polled as a share of electors, or null where the source published no turnout. */
  turnoutPct: number | null;
};

/** The most recent elections held, newest first — any kind, any jurisdiction. */
export function recent(db: DatabaseSync, limit = 6): Dated[] {
  return read(() => dated(db, "kind <> 'bypoll'", limit));
}

/** By-elections, which are their own election kind and their own story. */
export function bypolls(db: DatabaseSync, limit = 8): Dated[] {
  return read(() => dated(db, "kind = 'bypoll'", limit));
}

/**
 * The shape `recent` and `bypolls` both return, from one query plus one bulk standings read.
 *
 * BY CHRONOLOGY, not by id. `ORDER BY id DESC` is alphabetical by state, and the most recent elections in
 * India were, according to that ordering, four West Bengal elections in a row.
 */
function dated(db: DatabaseSync, where: string, limit: number): Dated[] {
  const rows = all<{
    id: string; name: string; kind: string; house: string; j: string; year: number; seats: number;
    announced: string | null; counting: string | null; voters: number | null; electors: number | null;
  }>(
    db,
    `SELECT e.id AS id, e.name AS name, e.kind AS kind, e.house AS house,
            e.jurisdiction_place_id AS j, e.year AS year,
            e.announced_on AS announced, e.counting_on AS counting,
            (SELECT COUNT(*) FROM contest c WHERE c.election_id = e.id) AS seats,
            (SELECT SUM(t.voters) FROM turnout t JOIN contest c2 ON c2.id = t.contest_id
              WHERE c2.election_id = e.id AND t.scope = 'contest') AS voters,
            (SELECT SUM(t.electors) FROM turnout t JOIN contest c3 ON c3.id = t.contest_id
              WHERE c3.election_id = e.id AND t.scope = 'contest') AS electors
       FROM election e WHERE ${where}
      ORDER BY ${CHRONO_DESC} LIMIT ?`,
    limit,
  );
  const byElection = new Map<string, SeatsByParty[]>();
  for (const r of seatsByParty(db, rows.map((e) => e.id))) {
    byElection.set(r.electionId, [...(byElection.get(r.electionId) ?? []), r]);
  }
  return rows.map((e) => {
    const { parties } = foldStandings(byElection.get(e.id) ?? []);
    return {
      id: e.id,
      name: e.name,
      jurisdictionId: e.j,
      jurisdictionName: nameOf(e.j),
      kind: e.kind,
      house: e.house,
      year: e.year,
      status: "declared" as const,
      leaderLabel: parties[0]?.label ?? null,
      leaderSeats: parties[0]?.seats ?? 0,
      seatsContested: e.seats,
      announcedOn: e.announced,
      countingOn: e.counting,
      turnoutPct:
        e.electors !== null && e.electors > 0 && e.voters !== null
          ? Number(((100 * e.voters) / e.electors).toFixed(1))
          : null,
    };
  });
}

/**
 * What is coming: elections the COMMISSION has announced, then terms this code derived.
 *
 * THE ORDER OF PREFERENCE IS THE POINT. An election row whose `announced_on` or `counting_on` is set is an
 * authoritative fact and comes first, marked `announced`. Only where none exists does the five-year term
 * arithmetic run, and every row it produces is marked `derived` — printing a term expiry as though the
 * Commission had set it is exactly the quiet fabrication the rest of this codebase refuses.
 *
 * Today the announced list is EMPTY: `announced_on` is NULL for all 1,202 rows and `election_phase` holds
 * none. So the panel is entirely derived and says so on every row. When the ECI schedule is ingested this
 * function starts answering with announced rows and the derived ones fall away for those jurisdictions —
 * no reconciliation, no merge, no "best guess" between the two.
 *
 * `thisYear` is an argument, not a call to the clock, so a page renders the same in a test as in a browser.
 * A term that expired BEFORE it is split out: "Jammu & Kashmir was due in 2019" is not an upcoming
 * election, it is a statement about where our data stops, and the two must not be printed as one list.
 */
export type Upcoming = {
  /** Announced by the Commission, with the date it set. Empty until the schedule is ingested. */
  announced: Dated[];
  /** A five-year term from the last election. DERIVED, and labelled that way wherever shown. */
  derived: Dated[];
  /** Terms that expired before `thisYear` — a fact about our coverage, not about a future election. */
  overdue: Dated[];
};

/** How many years a house runs before it must face the electorate again. */
export const TERM_YEARS = 5;

export function upcoming(db: DatabaseSync, thisYear: number, kind = "assembly", limit = 8): Upcoming {
  return read(() => {
    // Authoritative first. An election row that carries a date the Commission set, and has no results yet.
    const announced = all<{
      id: string; name: string; kind: string; house: string; j: string; year: number;
      announced: string | null; counting: string | null;
    }>(
      db,
      `SELECT e.id AS id, e.name AS name, e.kind AS kind, e.house AS house,
              e.jurisdiction_place_id AS j, e.year AS year,
              e.announced_on AS announced, e.counting_on AS counting
         FROM election e
        WHERE e.kind = ?
          AND (e.announced_on IS NOT NULL OR e.notified_on IS NOT NULL)
          AND e.year >= ?
        ORDER BY COALESCE(e.announced_on, e.notified_on), e.id
        LIMIT ?`,
      kind,
      thisYear,
      limit,
    ).map(
      (e): Dated => ({
        id: e.id,
        name: e.name,
        jurisdictionId: e.j,
        jurisdictionName: nameOf(e.j),
        kind: e.kind,
        house: e.house,
        year: e.year,
        status: "due",
        leaderLabel: null,
        leaderSeats: 0,
        seatsContested: 0,
        announcedOn: e.announced,
        countingOn: e.counting,
        turnoutPct: null,
      }),
    );
    const covered = new Set(announced.map((a) => a.jurisdictionId));

    const rows = currentStandings(db, kind)
      // A jurisdiction whose next election is already announced does not also get a derived guess at it.
      .filter((s) => !covered.has(s.jurisdictionId))
      .map(
        (s): Dated => ({
          id: s.electionId,
          name: `${s.jurisdictionName} — next ${kind === "assembly" ? "assembly" : "general"} election`,
          jurisdictionId: s.jurisdictionId,
          jurisdictionName: s.jurisdictionName,
          kind,
          house: kind === "assembly" ? "ac" : "pc",
          year: s.year + TERM_YEARS,
          status: "due",
          leaderLabel: s.leaderLabel,
          leaderSeats: s.leaderSeats,
          seatsContested: s.seatsContested,
          announcedOn: null,
          countingOn: null,
          turnoutPct: null,
        }),
      );
    const byYear = (a: Dated, b: Dated): number =>
      a.year - b.year || a.jurisdictionName.localeCompare(b.jurisdictionName);
    return {
      announced,
      derived: rows.filter((r) => r.year >= thisYear).sort(byYear).slice(0, limit),
      overdue: rows.filter((r) => r.year < thisYear).sort(byYear).slice(0, limit),
    };
  });
}

/** By-elections, which are their own election kind and their own story. */

export type ElectionRef = { id: string; name: string; kind: string; year: number };

/**
 * Every election a jurisdiction has on record, newest first — the year picker on a state's page.
 *
 * TWO SETS, unioned. The elections the jurisdiction CALLED (`jurisdiction_place_id`), which is its
 * assemblies and its by-elections; and the elections FOUGHT INSIDE it, which is how a general election
 * gets here at all — `ls-2019` belongs to the union, and Karnataka's 28 seats of it are as much a
 * Karnataka election as its assembly is. Neither set alone is the list a reader wants.
 *
 * BY YEAR, not by id. Ordering by id put 'ka-bypoll-ge-2021' above 'ka-assembly-2023' and made a
 * by-election the default view of Karnataka; ids sort by the middle of the string, not the end.
 */
export function electionsIn(db: DatabaseSync, jurisdictionId: string): ElectionRef[] {
  return read(() => {
    const rows = all<{ id: string; name: string; kind: string }>(
      db,
      `SELECT id, name, kind FROM election WHERE jurisdiction_place_id = ?
        UNION
       SELECT e.id, e.name, e.kind
         FROM election e
         JOIN contest c ON c.election_id = e.id${INSIDE}
        WHERE ${IN_SCOPE}`,
      jurisdictionId,
      jurisdictionId,
      jurisdictionId,
    );
    return rows
      .map((e) => ({ id: e.id, name: e.name, kind: e.kind, year: yearOf(e.id) }))
      .sort((a, b) => b.year - a.year || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  });
}

export type SeatRow = {
  placeId: string;
  placeName: string;
  /** The seat's own page, or null for a level /pl has no page for (a parliamentary seat). */
  href: string | null;
  districtName: string | null;
  number: number | null;
  reservation: string | null;
  winnerParty: string | null;
  winnerName: string | null;
  winnerPersonId: string | null;
  votes: number | null;
  /** Winner's votes as a share of votes polled, null where no count was published. */
  votePct: number | null;
  marginVotes: number | null;
  /** Margin over VOTES POLLED. Never over the sum of the result rows — see the header. */
  marginPct: number | null;
  turnoutPct: number | null;
};

type SeatSql = {
  placeId: string;
  placeName: string;
  parentId: string | null;
  parentKind: string | null;
  districtName: string | null;
  number: number | null;
  reservation: string | null;
  voters: number | null;
  electors: number | null;
  votes: number | null;
  marginVotes: number | null;
  winnerName: string | null;
  winnerPersonId: string | null;
  winnerParty: string | null;
};

/**
 * Every seat in one election inside one jurisdiction, with its winner and margin.
 *
 * ONE query for three sections: the constituency list, the closest seats (the caller sorts by
 * marginPct) and the margin distribution. A separate "closest seats" query would be the same scan
 * twice with an ORDER BY swapped.
 *
 * `is_winner = 1` rather than `rank = 1`: 2026's West Bengal rows are declarations that carry no rank.
 */
export function seatResults(db: DatabaseSync, electionId: string, jurisdictionId: string): SeatRow[] {
  return read(() =>
    all<SeatSql>(
      db,
      `SELECT pl.id AS placeId, pvv.canonical_name AS placeName,
              pl.parent_id AS parentId, dis.kind AS parentKind, dis.canonical_name AS districtName,
              pvv.number AS number, pvv.reservation AS reservation,
              t.voters AS voters, t.electors AS electors,
              r.votes AS votes, r.margin AS marginVotes,
              per.canonical_name AS winnerName, per.id AS winnerPersonId,
              -- Every column of the winner join is NULL when no result is declared, and COALESCE would
              -- turn that into 'Unattached' — a party name for a contest that has no winner.
              CASE WHEN r.candidacy_id IS NULL THEN NULL ELSE ${LABEL_SQL} END AS winnerParty
         FROM contest c${INSIDE}
         LEFT JOIN turnout t   ON t.contest_id = c.id AND t.scope = 'contest'
         LEFT JOIN result r    ON r.contest_id = c.id AND r.revision = 0 AND r.is_winner = 1
         LEFT JOIN candidacy cd ON cd.id = r.candidacy_id
         LEFT JOIN person per  ON per.id = cd.person_id
         LEFT JOIN party_version pv ON pv.id = cd.party_version_id
         LEFT JOIN party pt         ON pt.id = pv.party_id
        WHERE c.election_id = ? AND ${IN_SCOPE}
        ORDER BY pvv.number, pvv.canonical_name`,
      electionId,
      jurisdictionId,
      jurisdictionId,
    ).map((x): SeatRow => {
      const pct = (n: number | null, of: number | null): number | null =>
        n === null || of === null || of <= 0 ? null : Number(((100 * n) / of).toFixed(2));
      return {
        placeId: x.placeId,
        placeName: x.placeName,
        // Only a seat that hangs off a DISTRICT has a /pl/:state/:district/:seat path. A parliamentary
        // seat hangs off the state, and placeHref would answer '/pl/ka' for it — a link back to this
        // page dressed as a link to the seat.
        href:
          x.parentKind === "district"
            ? placeHref({
                kind: "ac",
                id: x.placeId,
                canonicalName: x.placeName,
                parentId: x.parentId,
              })
            : null,
        districtName: x.districtName,
        number: x.number,
        reservation: x.reservation,
        winnerParty: x.winnerParty,
        winnerName: x.winnerName,
        winnerPersonId: x.winnerPersonId,
        votes: x.votes,
        votePct: pct(x.votes, x.voters),
        marginVotes: x.marginVotes === null ? null : Math.abs(x.marginVotes),
        marginPct: pct(x.marginVotes === null ? null : Math.abs(x.marginVotes), x.voters),
        turnoutPct: pct(x.voters, x.electors),
      };
    }),
  );
}

export type StatePage = {
  /** Reference data, so a jurisdiction with nothing loaded still has a name and a denominator. */
  jurisdiction: { id: string; name: string; kind: "state" | "ut"; assemblySeats: number | null; lokSabhaSeats: number };
  /** Every election on record here, newest first. The year picker and the timeline read this. */
  timeline: ElectionRef[];
  /** The election being viewed, or null when nothing at all is loaded for this jurisdiction. */
  selected: ElectionSummary | null;
  /** True when ?election= named something this jurisdiction does not have and the default was used. */
  fellBack: boolean;
  /** The selected election and up to four before it, SAME KIND, newest first. [1] is `previousId`. */
  history: ElectionSummary[];
  /** Selected against the previous election of the same kind. Empty when there is no previous one. */
  swing: SwingRow[];
  seats: SeatRow[];
  /** Most recent ASSEMBLY election, whatever is being viewed — "who governs now" is a house question. */
  governing: ElectionSummary | null;
  sources: SourceRef[];
};

/** How many elections of the selected kind the history table shows, including the selected one. */
const HISTORY = 5;

/**
 * Everything a jurisdiction's page renders, for any of the 36 and any kind of election it holds.
 *
 * `segment` is the raw URL segment: an id ('ka') or a name slug ('west-bengal'), resolved against
 * JURISDICTIONS with no database read, so an unknown one is null (a 404) rather than an empty page.
 *
 * `electionId` is validated by MEMBERSHIP IN THE TIMELINE, which is why a malformed, unknown or
 * other-jurisdiction id cannot throw and cannot reach the SQL: it simply is not in the list, and the
 * default is used with `fellBack` set so the page can say so.
 *
 * The default is the most recent ASSEMBLY election where there is one. Not simply the newest: viewing
 * Karnataka should open on the house that governs it, and in 2024 the newest election touching
 * Karnataka is a general election. A jurisdiction with no assembly on record falls back to its newest
 * of any kind, which is the only honest answer for one.
 */
export function statePage(
  db: DatabaseSync,
  segment: string,
  electionId?: string,
): StatePage | null {
  const key = segment.trim().toLowerCase();
  const j = JURISDICTIONS.find(
    (x) => x.id === key || x.name.toLowerCase().replace(/\s+/g, "-") === key,
  );
  if (j === undefined) return null;
  const jurisdiction = {
    id: j.id,
    name: j.name,
    kind: j.kind,
    assemblySeats: j.assemblySeats,
    lokSabhaSeats: j.lokSabhaSeats,
  };

  return read(() => {
    const timeline = electionsIn(db, j.id);
    const fallback = timeline.find((e) => e.kind === "assembly") ?? timeline[0];
    if (fallback === undefined) {
      return { jurisdiction, timeline, selected: null, fellBack: false, history: [], swing: [], seats: [], governing: null, sources: [] };
    }
    const asked = electionId === undefined ? undefined : timeline.find((e) => e.id === electionId);
    const chosen = asked ?? fallback;

    // Same kind, this year or earlier, newest first — the run the selected election belongs to. Sliced
    // before any summary is computed, because each one is its own pass over the results.
    const history = timeline
      .filter((e) => e.kind === chosen.kind && (e.year < chosen.year || e.id === chosen.id))
      .slice(0, HISTORY)
      .map((e) => electionSummary(db, e.id, j.id))
      .filter((s): s is ElectionSummary => s !== null);
    const selected = history.at(0) ?? null;
    const then = history.at(1) ?? null;

    const assembly = timeline.find((e) => e.kind === "assembly");
    const governing =
      assembly === undefined
        ? null
        : assembly.id === selected?.id
          ? selected
          : electionSummary(db, assembly.id, j.id);

    const seats = selected === null ? [] : seatResults(db, selected.id, j.id);
    const ids = selected === null ? [] : sourceIds(db, selected.id, j.id);
    return {
      jurisdiction,
      timeline,
      selected,
      fellBack: electionId !== undefined && asked === undefined,
      history,
      swing:
        selected === null || then === null ? [] : swingRows(db, selected.id, then.id, { jurisdictionId: j.id }),
      seats,
      governing,
      sources: loadSources(db, ids, [`place:${j.id}`]),
    };
  });
}

/** The source rows behind the figures shown: every result and turnout row this view reads. */
function sourceIds(db: DatabaseSync, electionId: string, jurisdictionId: string): string[] {
  return all<{ id: string }>(
    db,
    `SELECT DISTINCT r.source_id AS id
       FROM result r JOIN contest c ON c.id = r.contest_id${INSIDE}
      WHERE c.election_id = ? AND ${IN_SCOPE}
      UNION
     SELECT DISTINCT t.source_id AS id
       FROM turnout t JOIN contest c ON c.id = t.contest_id${INSIDE}
      WHERE c.election_id = ? AND ${IN_SCOPE}`,
    electionId,
    jurisdictionId,
    jurisdictionId,
    electionId,
    jurisdictionId,
    jurisdictionId,
  ).map((r) => r.id);
}
