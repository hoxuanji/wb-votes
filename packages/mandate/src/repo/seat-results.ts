// Seat results: who won each contest of a set of elections, by how much, and on what turnout. Defined once.
//
// WHY THIS EXISTS. The same per-seat row was read six times, each time with its own answers to the same four
// questions, and the answers did not agree:
//
//  · WHO WON. The election map read its winner by `is_winner = 1` and its runner-up by `rank = 2`: two columns
//    that agree only because every importer happens to write them together.
//  · WHAT PARTY. The front page keyed a winner by `party.id` alone, so a winner the registry could only name by
//    the source's own string (`party_raw`) was "unknown"; the maps keyed by `COALESCE(pt.id, party_raw,
//    'unattached')`. The election map also forgot to guard the label, so a seat with no declared winner read as
//    a party called "Unattached" — a result we do not hold, printed as one.
//  · BY HOW MUCH. `result.margin` in some readers, the two vote counts in others.
//  · ON WHAT TURNOUT. Three modules refused an uncorroborated turnout (turnout-trust.ts); the rest divided by
//    it, so a margin "as a share of votes polled" printed a figure the same page had just declined to print.
//
// THE SHAPE. Set in, set out. `readSeats` reads a set of elections into plain, serializable `SeatResult[]`;
// `seatsFromRecords` is the same step over rows already in hand, which is what lets every rule below be tested
// on literal arrays; and turnout, the tally, the closest fights and the median margin share are free functions
// over arrays, so they work on any subset — a state's seats, one side of an epoch partition, a district's.
// There is deliberately no class: a seat book cannot be re-sliced after `compareSeats` hands back plain
// subsets, and it does not cross to a React prop.
//
// Two things a seat result does not hold are read here as well, under the same scope and the same party rule so
// that they cannot drift from it: what each party polled over EVERY candidate it ran (`partyVotes`), and the
// sources behind the results (`sourcesFor`).
//
// Turnout leaves a seat only as a READING (turnout-trust.ts): a value together with whether it has earned the
// right to be printed. For an unverified election the counts exist under `turnout.evidence` and nowhere else.

import type { DatabaseSync } from "node:sqlite";
import { all } from "../db/index.ts";
import { loadSources, marks, read } from "./index.ts";
import type { SourceRef } from "./index.ts";
import { turnoutReading, unverifiedTurnout } from "./turnout-trust.ts";
import type { Turnout } from "./turnout-trust.ts";

/**
 * The revision of a result that is read as the result.
 *
 * Whether a revision of 1 or more supersedes revision 0 has not been decided, so this is 0 exactly as every
 * other reader spells it today. The reads in this module take it from here, which is where the decision belongs
 * when it is made. `unverifiedTurnout` still spells its own 0, because turnout-trust.ts is imported here and
 * cannot import this.
 */
export const CURRENT_REVISION = 0;

/* ────────────────────────────── party ────────────────────────────── */

/** A party as a seat names it: a key that groups, and a label a reader reads. */
export type PartyRef = { key: string; label: string };

/** The columns a party is read from. Any of them may be missing, and a blank string is as missing as null. */
export type PartyColumns = { id: string | null; shortName: string | null; name: string | null; raw: string | null };

const present = (s: string | null): string | null => (s === null || s === "" ? null : s);

/**
 * The one party rule.
 *
 * The KEY is the party's id, else the string the source printed, else 'unattached': a winner no register lists
 * still groups with the other winners who share its string. The LABEL is `short_name` because "TMC" is what a
 * table column can hold, then the full name, then that raw string — all there is for a party no register lists,
 * and better than "unknown". 'Unattached' is what is left for a declared winner the source gave no party at
 * all; a seat with no declared winner has no party, which is `null` on the seat and never this word.
 */
export function partyRef(p: PartyColumns): PartyRef {
  const raw = present(p.raw);
  return {
    key: p.id ?? raw ?? "unattached",
    label: present(p.shortName) ?? present(p.name) ?? raw ?? "Unattached",
  };
}

/* ────────────────────────────── the records, and the results ────────────────────────────── */

/** One candidate's result row, with the party columns it is named by. */
export type CandidateRecord = { personId: string; name: string; party: PartyColumns; votes: number | null };

/**
 * One contest as the registry stores it: the seat, the rows of its winner and its runner-up, and its turnout.
 * Flat in the way one SELECT is flat. The raw `voters` and `electors` are the registry's: a `SeatResult` keeps
 * them as `counts` beside a verified reading, and for an unverified one only under `turnout.evidence`.
 */
export type SeatRecord = {
  electionId: string;
  contestId: string;
  placeId: string;
  versionId: number;
  epochId: string;
  name: string;
  number: number | null;
  reservation: string | null;
  jurisdictionId: string;
  districtId: string | null;
  districtName: string | null;
  /** The declared winner: the `is_winner = 1` row at the current revision. Null for an undeclared seat. */
  winner: CandidateRecord | null;
  /** The `rank = 2` row at the current revision. */
  runnerUp: CandidateRecord | null;
  /** The winner's own `result.margin`. */
  declaredMargin: number | null;
  voters: number | null;
  electors: number | null;
};

/**
 * Winner minus runner-up, and which of the two sources it came from.
 *
 * COUNTED when both rows carry a vote count, because that is the figure a reader can check. DECLARED when the
 * source published a margin and no counts, which is every West Bengal 2026 seat: a sourced margin is a fact
 * and is kept, labelled for what it is. Where both exist they agree (`margin_is_rank1_minus_rank2`).
 */
export type SeatMargin = { votes: number; basis: "declared" | "counted" };

export type SeatResult = {
  electionId: string;
  contestId: string;
  /** The seat's identity for comparison is `(placeId, epochId)` — see `seatKey` in elections.ts. */
  placeId: string;
  epochId: string;
  /** Repo-internal, for a geometry join. `place_version.id` is a surrogate and is not published. */
  versionId: number;
  name: string;
  number: number | null;
  reservation: string | null;
  /** Where the seat is: `place_version.jurisdiction_id`. */
  jurisdictionId: string;
  districtId: string | null;
  districtName: string | null;
  /** The declared winner, or null when none is declared. An undeclared seat is not a party's. */
  winner: { name: string; personId: string; party: PartyRef; votes: number | null } | null;
  runnerUp: { name: string; party: PartyRef; votes: number | null } | null;
  margin: SeatMargin | null;
  /**
   * The margin as a percentage of votes polled, or null when there is no margin, no votes polled, or the
   * election's turnout is unverified. Votes polled is the turnout figure, so a share of it is exactly as
   * trustworthy as the turnout is.
   */
  marginShare: number | null;
  /** What a page may print of this seat's turnout. */
  turnout: Turnout;
  /**
   * The two counts a `reported` turnout is made of, so that an aggregate sums counts instead of averaging
   * percentages. Null for an unverified election, whose counts live under `turnout.evidence` and nowhere else:
   * a field that held them would be a way to divide by them.
   */
  counts: { voters: number | null; electors: number | null } | null;
};

/** The margin from the two counts when both are held, else the one the source declared: the rule `marginOf` applies to a seat. */
export function marginFrom(won: number | null, second: number | null, declared: number | null): SeatMargin | null {
  if (won !== null && second !== null) return { votes: won - second, basis: "counted" };
  return declared === null ? null : { votes: declared, basis: "declared" };
}

function marginOf(r: SeatRecord): SeatMargin | null {
  if (r.winner === null) return null;
  return marginFrom(r.winner.votes, r.runnerUp?.votes ?? null, r.declaredMargin);
}

/**
 * Records to results.
 *
 * `unverified` is the set of election ids whose turnout has nothing to corroborate it (`unverifiedTurnout`),
 * decided once per election because the reason is per election. Those seats keep their margin in votes and
 * lose everything that divides by the uncorroborated votes polled.
 */
export function seatsFromRecords(records: readonly SeatRecord[], unverified: ReadonlySet<string>): SeatResult[] {
  return records.map((r): SeatResult => {
    const gated = unverified.has(r.electionId);
    const margin = marginOf(r);
    return {
      electionId: r.electionId,
      contestId: r.contestId,
      placeId: r.placeId,
      epochId: r.epochId,
      versionId: r.versionId,
      name: r.name,
      number: r.number,
      reservation: r.reservation,
      jurisdictionId: r.jurisdictionId,
      districtId: r.districtId,
      districtName: r.districtName,
      winner:
        r.winner === null
          ? null
          : { name: r.winner.name, personId: r.winner.personId, party: partyRef(r.winner.party), votes: r.winner.votes },
      runnerUp:
        r.runnerUp === null
          ? null
          : { name: r.runnerUp.name, party: partyRef(r.runnerUp.party), votes: r.runnerUp.votes },
      margin,
      marginShare:
        gated || margin === null || r.voters === null || r.voters <= 0
          ? null
          : (100 * Math.abs(margin.votes)) / r.voters,
      turnout: turnoutReading(r.voters, r.electors, gated),
      counts: gated ? null : { voters: r.voters, electors: r.electors },
    };
  });
}

/* ────────────────────────────── over a set of seats ────────────────────────────── */

/**
 * Turnout over these seats: the sum of votes polled against the sum of electors, never an average of the
 * seats' percentages. Unverified if any seat in the set is, because the sum then contains a count nothing
 * corroborates.
 */
export function turnoutOf(seats: readonly SeatResult[]): Turnout {
  let voters = 0;
  let electors = 0;
  let unverified = false;
  for (const s of seats) {
    if (s.turnout.state === "unverified") {
      unverified = true;
      voters += s.turnout.evidence.voters;
      electors += s.turnout.evidence.electors;
    } else if (s.counts !== null) {
      voters += s.counts.voters ?? 0;
      electors += s.counts.electors ?? 0;
    }
  }
  return turnoutReading(voters, electors, unverified);
}

export type PartySeats = { key: string; label: string; seats: number };

/** Seats won by party, biggest first. An undeclared seat is nobody's. */
export function tally(seats: readonly SeatResult[]): PartySeats[] {
  const by = new Map<string, PartySeats>();
  for (const s of seats) {
    if (s.winner === null) continue;
    const at = by.get(s.winner.party.key) ?? { key: s.winner.party.key, label: s.winner.party.label, seats: 0 };
    at.seats += 1;
    by.set(at.key, at);
  }
  return [...by.values()].sort((a, b) => b.seats - a.seats || a.key.localeCompare(b.key));
}

/** Binary order, which is what SQLite's default collation gives the `ORDER BY name` this stands in for. */
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export type JurisdictionPartySeats = PartySeats & { electionId: string; jurisdictionId: string };

/**
 * `tally` within each election and each jurisdiction the seats sit in, which is how a general election is
 * read as thirty-six state shares of itself. In election, jurisdiction, party order.
 */
export function tallyByJurisdiction(seats: readonly SeatResult[]): JurisdictionPartySeats[] {
  const groups = new Map<string, SeatResult[]>();
  for (const s of seats) {
    const key = `${s.electionId}\u0000${s.jurisdictionId}`;
    const at = groups.get(key);
    if (at === undefined) groups.set(key, [s]);
    else at.push(s);
  }
  return [...groups.values()]
    .flatMap((group) =>
      tally(group).map((p) => ({
        electionId: (group[0] as SeatResult).electionId,
        jurisdictionId: (group[0] as SeatResult).jurisdictionId,
        ...p,
      })),
    )
    .sort(
      (a, b) =>
        compare(a.electionId, b.electionId) || compare(a.jurisdictionId, b.jurisdictionId) || compare(a.key, b.key),
    );
}

/**
 * The `n` seats decided by the smallest share of votes polled. Seats with no margin share — undeclared,
 * unverified, or without votes polled — are not close, they are unknown, and are not ranked.
 */
export function closest(seats: readonly SeatResult[], n: number): SeatResult[] {
  return seats
    .filter((s): s is SeatResult & { marginShare: number } => s.marginShare !== null)
    .sort((a, b) => a.marginShare - b.marginShare || compare(a.name, b.name) || compare(a.placeId, b.placeId))
    .slice(0, n);
}

/** Median, or null for an empty set. The median rather than the mean: one uncontested landslide moves a
 *  mean by several points and says nothing about the typical seat. */
function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

/** The median margin share of the seats that have one, or null when none does. */
export function medianMarginShare(seats: readonly SeatResult[]): number | null {
  return median(seats.flatMap((s) => (s.marginShare === null ? [] : [s.marginShare])));
}

/* ────────────────────────────── the registry adapter ────────────────────────────── */

/**
 * Which seats to read: every contest of these elections, optionally only those inside one jurisdiction, or one
 * district of it.
 *
 * `within` is `place_version.jurisdiction_id` — where the SEAT is, which for a general election is not where
 * the election belongs ('in'). `district` is `place_version.district_place_id`, and a parliamentary seat has none.
 */
export type SeatScope = { elections: readonly string[]; within?: string; district?: string };

/** The WHERE terms a scope adds to a query over `contest c JOIN place_version pv`, and what they bind. */
function scoped(scope: SeatScope): { where: string; binds: string[] } {
  return {
    where:
      `c.election_id IN (${marks(scope.elections.length)})` +
      (scope.within === undefined ? "" : " AND pv.jurisdiction_id = ?") +
      (scope.district === undefined ? "" : " AND pv.district_place_id = ?"),
    binds: [
      ...scope.elections,
      ...(scope.within === undefined ? [] : [scope.within]),
      ...(scope.district === undefined ? [] : [scope.district]),
    ],
  };
}

type SeatRow = {
  electionId: string;
  contestId: string;
  placeId: string;
  versionId: number;
  epochId: string;
  name: string;
  number: number | null;
  reservation: string | null;
  jurisdictionId: string;
  districtId: string | null;
  districtName: string | null;
  declaredMargin: number | null;
  wPerson: string | null;
  wName: string | null;
  wPartyId: string | null;
  wPartyShort: string | null;
  wPartyName: string | null;
  wPartyRaw: string | null;
  wVotes: number | null;
  rPerson: string | null;
  rName: string | null;
  rPartyId: string | null;
  rPartyShort: string | null;
  rPartyName: string | null;
  rPartyRaw: string | null;
  rVotes: number | null;
  voters: number | null;
  electors: number | null;
};

/** A candidate's columns, or null when the LEFT JOIN found no such row. */
function candidate(
  person: string | null,
  name: string | null,
  partyId: string | null,
  short: string | null,
  partyName: string | null,
  raw: string | null,
  votes: number | null,
): CandidateRecord | null {
  // `candidacy.person_id` and `person.canonical_name` are NOT NULL, so a candidacy that exists has both.
  return person === null || name === null
    ? null
    : { personId: person, name, party: { id: partyId, shortName: short, name: partyName, raw }, votes };
}

function recordOf(r: SeatRow): SeatRecord {
  return {
    electionId: r.electionId,
    contestId: r.contestId,
    placeId: r.placeId,
    versionId: r.versionId,
    epochId: r.epochId,
    name: r.name,
    number: r.number,
    reservation: r.reservation,
    jurisdictionId: r.jurisdictionId,
    districtId: r.districtId,
    districtName: r.districtName,
    winner: candidate(r.wPerson, r.wName, r.wPartyId, r.wPartyShort, r.wPartyName, r.wPartyRaw, r.wVotes),
    runnerUp: candidate(r.rPerson, r.rName, r.rPartyId, r.rPartyShort, r.rPartyName, r.rPartyRaw, r.rVotes),
    declaredMargin: r.declaredMargin,
    voters: r.voters,
    electors: r.electors,
  };
}

/**
 * Every contest of the scope's elections, as a `SeatResult`, in election then seat order.
 *
 * Winner is the `is_winner = 1` row and runner-up is the `rank = 2` row, both at `CURRENT_REVISION`: the
 * `winner_is_rank1` invariant holds those two to the same ordering, so neither needs the other's column. A
 * contest with two winners would be read twice; ingest refuses that (elections/validate.ts, check 1).
 *
 * The unverified set is decided over the WHOLE election, whatever `within` narrows to: the reason an election's
 * turnout is distrusted is that the import published no vote counts, which is true of its Kerala seats whether
 * or not Kerala is the scope.
 */
export function readSeats(db: DatabaseSync, scope: SeatScope): SeatResult[] {
  if (scope.elections.length === 0) return [];
  return read(() => {
    const at = scoped(scope);
    const rows = all<SeatRow>(
      db,
      `SELECT c.election_id AS electionId, c.id AS contestId,
              pv.place_id AS placeId, pv.id AS versionId, pv.epoch_id AS epochId,
              pv.canonical_name AS name, pv.number AS number, pv.reservation AS reservation,
              pv.jurisdiction_id AS jurisdictionId,
              pv.district_place_id AS districtId, dis.canonical_name AS districtName,
              r.margin AS declaredMargin,
              per.id AS wPerson, per.canonical_name AS wName, pt.id AS wPartyId,
              pt.short_name AS wPartyShort, pt.name AS wPartyName, cd.party_raw AS wPartyRaw, r.votes AS wVotes,
              per2.id AS rPerson, per2.canonical_name AS rName, pt2.id AS rPartyId,
              pt2.short_name AS rPartyShort, pt2.name AS rPartyName, cd2.party_raw AS rPartyRaw, r2.votes AS rVotes,
              t.voters AS voters, t.electors AS electors
         FROM contest c
         JOIN place_version pv  ON pv.id = c.place_version_id
         LEFT JOIN place dis    ON dis.id = pv.district_place_id
         LEFT JOIN result r     ON r.contest_id = c.id AND r.revision = ${CURRENT_REVISION} AND r.is_winner = 1
         LEFT JOIN candidacy cd ON cd.id = r.candidacy_id
         LEFT JOIN person per   ON per.id = cd.person_id
         LEFT JOIN party_version pvv ON pvv.id = cd.party_version_id
         LEFT JOIN party pt          ON pt.id = pvv.party_id
         LEFT JOIN result r2    ON r2.contest_id = c.id AND r2.revision = ${CURRENT_REVISION} AND r2."rank" = 2
         LEFT JOIN candidacy cd2 ON cd2.id = r2.candidacy_id
         LEFT JOIN person per2   ON per2.id = cd2.person_id
         LEFT JOIN party_version pvv2 ON pvv2.id = cd2.party_version_id
         LEFT JOIN party pt2          ON pt2.id = pvv2.party_id
         LEFT JOIN turnout t    ON t.contest_id = c.id AND t.scope = 'contest'
        WHERE ${at.where}
        ORDER BY c.election_id, c.place_version_id`,
      ...at.binds,
    );
    return seatsFromRecords(rows.map(recordOf), unverifiedTurnout(db, scope.elections));
  });
}

/* ────────────────────────────── what a seat result does not hold ────────────────────────────── */

export type PartyVotes = { electionId: string; jurisdictionId: string; party: PartyRef; votes: number | null };

/**
 * The votes each party polled, over EVERY candidate it ran, in each election and each jurisdiction the seats
 * sit in. Null for a party none of whose rows carries a count: not published is not zero.
 *
 * Its own read because a `SeatResult` holds the winner and the runner-up, and a party's share of the vote is over
 * everyone it ran — a party can poll a fifth of a state's votes and win nothing. In election, jurisdiction,
 * party order.
 */
export function partyVotes(db: DatabaseSync, scope: SeatScope): PartyVotes[] {
  if (scope.elections.length === 0) return [];
  return read(() => {
    const at = scoped(scope);
    const rows = all<{
      electionId: string;
      jurisdictionId: string;
      partyId: string | null;
      shortName: string | null;
      name: string | null;
      raw: string | null;
      votes: number | null;
    }>(
      db,
      `SELECT c.election_id AS electionId, pv.jurisdiction_id AS jurisdictionId,
              pt.id AS partyId, pt.short_name AS shortName, pt.name AS name, cd.party_raw AS raw,
              SUM(r.votes) AS votes
         FROM contest c
         JOIN place_version pv ON pv.id = c.place_version_id
         JOIN result r         ON r.contest_id = c.id AND r.revision = ${CURRENT_REVISION}
         JOIN candidacy cd     ON cd.id = r.candidacy_id
         LEFT JOIN party_version pvv ON pvv.id = cd.party_version_id
         LEFT JOIN party pt          ON pt.id = pvv.party_id
        WHERE ${at.where}
        GROUP BY c.election_id, pv.jurisdiction_id, pt.id, pt.short_name, pt.name, cd.party_raw`,
      ...at.binds,
    );
    // Several rows can name one party: the same party id with different raw strings, or a blank raw and a missing one.
    const by = new Map<string, PartyVotes>();
    for (const r of rows) {
      const party = partyRef({ id: r.partyId, shortName: r.shortName, name: r.name, raw: r.raw });
      const id = `${r.electionId}\u0000${r.jurisdictionId}\u0000${party.key}`;
      const hit = by.get(id);
      if (hit === undefined) {
        by.set(id, { electionId: r.electionId, jurisdictionId: r.jurisdictionId, party, votes: r.votes });
      } else if (r.votes !== null) {
        hit.votes = (hit.votes ?? 0) + r.votes;
      }
    }
    return [...by.values()].sort(
      (a, b) =>
        compare(a.electionId, b.electionId) ||
        compare(a.jurisdictionId, b.jurisdictionId) ||
        compare(a.party.key, b.party.key),
    );
  });
}

export type ElectionPartyVotes = { electionId: string; party: PartyRef; votes: number | null };

/** `partyVotes` across jurisdictions: each party's votes in each election, in election then party order. */
export function votesByParty(votes: readonly PartyVotes[]): ElectionPartyVotes[] {
  const by = new Map<string, ElectionPartyVotes>();
  for (const v of votes) {
    const id = `${v.electionId}\u0000${v.party.key}`;
    const hit = by.get(id);
    if (hit === undefined) by.set(id, { electionId: v.electionId, party: v.party, votes: v.votes });
    else if (v.votes !== null) hit.votes = (hit.votes ?? 0) + v.votes;
  }
  return [...by.values()].sort((a, b) => compare(a.electionId, b.electionId) || compare(a.party.key, b.party.key));
}

/** Which kinds of fact besides the results a page cites. Its results are always cited. */
export type Cited = { turnout?: boolean; geometry?: boolean };

/**
 * The sources behind a scope: the sources of the result rows it reads, and of the turnout rows and outlines a page
 * says it also draws on. Results count at `CURRENT_REVISION` only, because a result nobody reads is not provenance.
 *
 * `limit` caps the list, smallest id first, for a panel that shows publishers rather than a bibliography: an import
 * can cite one source per row.
 */
export function sourcesFor(db: DatabaseSync, scope: SeatScope, cited: Cited = {}, limit?: number): SourceRef[] {
  return read(() => loadSources(db, sourceIdsFor(db, scope, cited, limit), []));
}

/** The ids `sourcesFor` resolves, for a caller that resolves them together with something else. */
export function sourceIdsFor(db: DatabaseSync, scope: SeatScope, cited: Cited = {}, limit?: number): string[] {
  if (scope.elections.length === 0) return [];
  return read(() => {
    const at = scoped(scope);
    const from = `FROM contest c JOIN place_version pv ON pv.id = c.place_version_id`;
    const parts = [
      `SELECT r.source_id AS id ${from}
         JOIN result r ON r.contest_id = c.id AND r.revision = ${CURRENT_REVISION} WHERE ${at.where}`,
    ];
    if (cited.turnout === true) {
      parts.push(
        `SELECT t.source_id AS id ${from}
           JOIN turnout t ON t.contest_id = c.id AND t.scope = 'contest' WHERE ${at.where}`,
      );
    }
    if (cited.geometry === true) {
      parts.push(
        `SELECT pg.source_id AS id ${from}
           JOIN place_geometry pg ON pg.place_version_id = pv.id WHERE ${at.where}`,
      );
    }
    const ids = all<{ id: string }>(
      db,
      `${parts.join("\n UNION\n ")}\n ORDER BY id${limit === undefined ? "" : " LIMIT ?"}`,
      ...parts.flatMap(() => at.binds),
      ...(limit === undefined ? [] : [limit]),
    );
    return ids.map((r) => r.id);
  });
}
