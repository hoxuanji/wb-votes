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
import { read } from "./index.ts";
import { JURISDICTIONS } from "../ingest/india.ts";

/** How many years a house runs before it must face the electorate again. */
const TERM_YEARS = 5;

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
  winner: string;
  marginPct: number;
  marginVotes: number | null;
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

/** Winners by party for one election, with vote share where the source counted votes. */
function standings(db: DatabaseSync, electionId: string): { parties: PartyStanding[]; votesCounted: boolean } {
  const rows = all<{ key: string; label: string; seats: number; votes: number | null }>(
    db,
    `SELECT ${KEY_SQL} AS key, ${LABEL_SQL} AS label,
            SUM(CASE WHEN r.is_winner = 1 THEN 1 ELSE 0 END) AS seats,
            SUM(r.votes) AS votes
       FROM result r
       JOIN contest c        ON c.id = r.contest_id
       JOIN candidacy cd     ON cd.id = r.candidacy_id
       LEFT JOIN party_version pv ON pv.id = cd.party_version_id
       LEFT JOIN party pt         ON pt.id = pv.party_id
      WHERE c.election_id = ?
      GROUP BY 1, 2
      ORDER BY seats DESC, votes DESC`,
    electionId,
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
        votePct: counted > 0 && r.votes !== null ? Number(((100 * r.votes) / counted).toFixed(1)) : null,
      })),
  };
}

/** The previous election of the SAME KIND in the same jurisdiction. Cross-kind comparison is a lie. */
export function previousElection(db: DatabaseSync, electionId: string): string | null {
  const row = get<{ id: string }>(
    db,
    `SELECT e2.id AS id FROM election e
       JOIN election e2 ON e2.jurisdiction_place_id = e.jurisdiction_place_id
                       AND e2.kind = e.kind AND e2.id < e.id
      WHERE e.id = ?
      ORDER BY e2.id DESC LIMIT 1`,
    electionId,
  );
  return row?.id ?? null;
}

export function electionSummary(db: DatabaseSync, electionId: string): ElectionSummary | null {
  return read(() => {
    const e = get<{ id: string; name: string; kind: string; jurisdiction_place_id: string }>(
      db,
      "SELECT id, name, kind, jurisdiction_place_id FROM election WHERE id = ?",
      electionId,
    );
    if (e === undefined) return null;
    const seats =
      get<{ n: number }>(db, "SELECT COUNT(*) AS n FROM contest WHERE election_id = ?", electionId)?.n ?? 0;
    const t = get<{ voters: number | null; electors: number | null }>(
      db,
      `SELECT SUM(t.voters) AS voters, SUM(t.electors) AS electors
         FROM turnout t JOIN contest c ON c.id = t.contest_id
        WHERE c.election_id = ? AND t.scope = 'contest'`,
      electionId,
    );
    const { parties, votesCounted } = standings(db, electionId);
    return {
      id: e.id,
      name: e.name,
      kind: e.kind,
      jurisdictionId: e.jurisdiction_place_id,
      jurisdictionName: nameOf(e.jurisdiction_place_id),
      year: yearOf(e.id),
      seatsContested: seats,
      majority: Math.floor(seats / 2) + 1,
      parties,
      leader: parties[0] ?? null,
      turnoutPct:
        t?.electors != null && t.electors > 0 && t.voters != null
          ? Number(((100 * t.voters) / t.electors).toFixed(1))
          : null,
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

/**
 * Where every jurisdiction stands now: its most recent election of this kind and who leads it.
 *
 * This is the national picture, and it is one query plus one per state rather than a curated table. A
 * state with no data loaded is absent rather than zeroed — the caller pairs it against JURISDICTIONS to
 * show the gap.
 */
export function currentStandings(db: DatabaseSync, kind = "assembly"): Standing[] {
  return read(() => {
    const latest = all<{ id: string; jurisdiction_place_id: string }>(
      db,
      `SELECT id, jurisdiction_place_id FROM (
         SELECT e.id, e.jurisdiction_place_id,
                row_number() OVER (PARTITION BY e.jurisdiction_place_id ORDER BY e.id DESC) AS rn
           FROM election e WHERE e.kind = ?
       ) WHERE rn = 1`,
      kind,
    );
    return latest
      .map((row): Standing => {
        const { parties } = standings(db, row.id);
        const seats =
          get<{ n: number }>(db, "SELECT COUNT(*) AS n FROM contest WHERE election_id = ?", row.id)?.n ?? 0;
        const top = parties[0] ?? null;
        return {
          jurisdictionId: row.jurisdiction_place_id,
          jurisdictionName: nameOf(row.jurisdiction_place_id),
          electionId: row.id,
          year: yearOf(row.id),
          seatsContested: seats,
          leaderKey: top?.key ?? null,
          leaderLabel: top?.label ?? null,
          leaderSeats: top?.seats ?? 0,
          majority: top !== null && seats > 0 && top.seats > seats / 2,
        };
      })
      .sort((a, b) => b.year - a.year || a.jurisdictionName.localeCompare(b.jurisdictionName));
  });
}

export type Swing = {
  jurisdictionId: string;
  jurisdictionName: string;
  nowId: string;
  thenId: string;
  year: number;
  thenYear: number;
  rows: { key: string; label: string; nowPct: number | null; thenPct: number | null; changePp: number | null }[];
};

/**
 * Vote share now against vote share last time, per jurisdiction, same kind of election.
 *
 * A party absent from one of the two elections gets a null change rather than a -100: not contesting is
 * not a collapse, and the difference matters when a new party's first outing is being read.
 */
export function swings(db: DatabaseSync, kind = "assembly", limit = 8): Swing[] {
  return read(() =>
    currentStandings(db, kind)
      .slice(0, limit)
      .flatMap((s): Swing[] => {
        const thenId = previousElection(db, s.electionId);
        if (thenId === null) return [];
        const now = new Map(standings(db, s.electionId).parties.map((p) => [p.key, p]));
        const then = new Map(standings(db, thenId).parties.map((p) => [p.key, p]));
        const keys = [...new Set([...now.keys(), ...then.keys()])];
        const rows = keys
          .map((k) => {
            const a = now.get(k);
            const b = then.get(k);
            const nowPct = a?.votePct ?? null;
            const thenPct = b?.votePct ?? null;
            return {
              key: k,
              label: a?.label ?? b?.label ?? k,
              nowPct,
              thenPct,
              changePp:
                nowPct === null || thenPct === null ? null : Number((nowPct - thenPct).toFixed(1)),
            };
          })
          .filter((r) => (r.nowPct ?? 0) >= 3 || (r.thenPct ?? 0) >= 3)
          .sort((x, y) => (y.nowPct ?? 0) - (x.nowPct ?? 0))
          .slice(0, 4);
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
    const ids = currentStandings(db, kind).map((s) => s.electionId);
    if (ids.length === 0) return [];
    return all<CloseFight>(
      db,
      `SELECT pl.canonical_name AS placeName, pl.id AS placeId,
              substr(pl.id, 1, instr(pl.id, '.') - 1) AS jurisdictionId,
              ${LABEL_SQL} AS winner,
              -- Two decimals, because the closest seats in India are decided by tens of votes and one
              -- decimal printed five different results as "0%".
              ROUND(100.0 * r.margin / t.voters, 2) AS marginPct,
              r.margin AS marginVotes
         FROM result r
         JOIN contest c        ON c.id = r.contest_id
         JOIN candidacy cd     ON cd.id = r.candidacy_id
         LEFT JOIN party_version pv ON pv.id = cd.party_version_id
         LEFT JOIN party pt         ON pt.id = pv.party_id
         JOIN turnout t        ON t.contest_id = c.id AND t.scope = 'contest'
         JOIN place_version plv ON plv.id = c.place_version_id
         JOIN place pl          ON pl.id = plv.place_id
        WHERE r.is_winner = 1 AND r.margin IS NOT NULL AND t.voters > 0
          AND c.election_id IN (${ids.map(() => "?").join(",")})
        ORDER BY marginPct ASC
        LIMIT ?`,
      ...ids,
      limit,
    );
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
};

/** The most recent elections held, newest first — any kind, any jurisdiction. */
export function recent(db: DatabaseSync, limit = 6): Dated[] {
  return read(() =>
    all<{ id: string; name: string; kind: string; jurisdiction_place_id: string }>(
      db,
      // BY YEAR, not by id. Election ids are '<state>-assembly-<year>', so ORDER BY id DESC is
      // alphabetical by state and returned nothing but West Bengal — the most recent elections in India
      // were, according to that ordering, four West Bengal elections in a row.
      `SELECT id, name, kind, jurisdiction_place_id FROM election
        WHERE kind <> 'bypoll' ORDER BY substr(id, -4) DESC, jurisdiction_place_id LIMIT ?`,
      limit,
    ).map((e) => {
      const { parties } = standings(db, e.id);
      return {
        id: e.id,
        name: e.name,
        jurisdictionId: e.jurisdiction_place_id,
        jurisdictionName: nameOf(e.jurisdiction_place_id),
        kind: e.kind,
        year: yearOf(e.id),
        status: "declared" as const,
        leaderLabel: parties[0]?.label ?? null,
        leaderSeats: parties[0]?.seats ?? 0,
        seatsContested:
          get<{ n: number }>(db, "SELECT COUNT(*) AS n FROM contest WHERE election_id = ?", e.id)?.n ?? 0,
      };
    }),
  );
}

/**
 * When each house is next DUE, derived from the last election plus a five-year term.
 *
 * DERIVED, and labelled as such everywhere it is shown. The Election Commission announces dates; this
 * registry does not hold them, and printing a derived date as an announced one would be exactly the kind
 * of quiet fabrication the rest of this codebase refuses.
 *
 * `thisYear` is an argument, not a call to the clock, so a page renders the same in a test as in a
 * browser. A term that expired BEFORE it splits the list in two, because "Jammu & Kashmir was due in
 * 2019" is not an upcoming election — it is a statement about where our data stops, and the two must not
 * be printed as one list. Past-due rows sort most-overdue first; upcoming rows sort soonest first.
 */
export function due(db: DatabaseSync, thisYear: number, kind = "assembly", limit = 8): { upcoming: Dated[]; overdue: Dated[] } {
  return read(() => {
    const rows = currentStandings(db, kind).map((s) => ({
      id: s.electionId,
      name: `${s.jurisdictionName} — next ${kind === "assembly" ? "assembly" : "general"} election`,
      jurisdictionId: s.jurisdictionId,
      jurisdictionName: s.jurisdictionName,
      kind,
      year: s.year + TERM_YEARS,
      status: "due" as const,
      leaderLabel: s.leaderLabel,
      leaderSeats: s.leaderSeats,
      seatsContested: s.seatsContested,
    }));
    const byYear = (a: Dated, b: Dated): number =>
      a.year - b.year || a.jurisdictionName.localeCompare(b.jurisdictionName);
    return {
      upcoming: rows.filter((r) => r.year >= thisYear).sort(byYear).slice(0, limit),
      overdue: rows.filter((r) => r.year < thisYear).sort(byYear).slice(0, limit),
    };
  });
}

/** By-elections, which are their own election kind and their own story. */
export function bypolls(db: DatabaseSync, limit = 8): Dated[] {
  return read(() =>
    all<{ id: string; name: string; jurisdiction_place_id: string }>(
      db,
      `SELECT id, name, jurisdiction_place_id FROM election WHERE kind = 'bypoll'
        ORDER BY substr(id, -4) DESC, jurisdiction_place_id LIMIT ?`,
      limit,
    ).map((e) => {
      const { parties } = standings(db, e.id);
      return {
        id: e.id,
        name: e.name,
        jurisdictionId: e.jurisdiction_place_id,
        jurisdictionName: nameOf(e.jurisdiction_place_id),
        kind: "bypoll",
        year: yearOf(e.id),
        status: "declared" as const,
        leaderLabel: parties[0]?.label ?? null,
        leaderSeats: parties[0]?.seats ?? 0,
        seatsContested:
          get<{ n: number }>(db, "SELECT COUNT(*) AS n FROM contest WHERE election_id = ?", e.id)?.n ?? 0,
      };
    }),
  );
}

/** Every election a jurisdiction has, newest first — the year picker on a state's page. */
export function electionsIn(db: DatabaseSync, jurisdictionId: string): { id: string; year: number; kind: string }[] {
  return read(() =>
    all<{ id: string; kind: string }>(
      db,
      "SELECT id, kind FROM election WHERE jurisdiction_place_id = ? ORDER BY id DESC",
      jurisdictionId,
    ).map((e) => ({ id: e.id, year: yearOf(e.id), kind: e.kind })),
  );
}
