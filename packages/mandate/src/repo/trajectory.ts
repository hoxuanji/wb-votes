// A state's political trajectory: what each party has done, election after election.
//
// THE ONE RULE THIS MODULE EXISTS TO ENFORCE. A line through a party's seat counts implies the seats are
// comparable across every point on it. They are not. `place.id` is a seat NUMBER, every delimitation
// renumbers from scratch, and `place_crosswalk` is empty — so Karnataka's 224 seats in 2008 are not the same
// 224 territories as in 2004. A trajectory that draws one unbroken line across that boundary is making the
// exact claim the epoch gate exists to refuse, in a form a reader cannot argue with.
//
// So every point carries its epoch, and `segments()` splits the series wherever the epoch changes. The
// renderer draws each segment separately and leaves the gap visible.
//
// WHAT SURVIVES A REDRAW AND WHAT DOES NOT, because the distinction is the whole design:
//
//   SEAT COUNTS       comparable only inside one epoch. 224 of 224 is a real quantity in both 2004 and
//                     2008; "the same seat" is not.
//   VOTE SHARE        comparable ACROSS epochs. It is a ratio over a whole state's votes, and a state's
//                     electorate is a real population whatever the boundaries inside it. This is why the
//                     vote-share series is drawn unbroken while the seat series breaks.
//   TURNOUT           same argument as vote share.
//
// That asymmetry is not a compromise; it is the honest reading of what the numbers mean.

import type { DatabaseSync } from "node:sqlite";
import { all } from "../db/index.ts";
import { read } from "./index.ts";
import { CHRONO_DESC } from "./elections.ts";

/** One election in a state's run, for one party. */
export type TrajectoryPoint = {
  electionId: string;
  year: number;
  epochId: string;
  seats: number;
  /** Of the seats contested at that election — so a house that grew is still readable. */
  seatPct: number | null;
  votePct: number | null;
};

export type PartyTrajectory = {
  key: string;
  label: string;
  /** Oldest first, so a renderer reads left to right. */
  points: TrajectoryPoint[];
  /** Seats at the most recent election, for ranking. */
  latestSeats: number;
  /** Elections in which this party won at least one seat. */
  contested: number;
};

export type StateTrajectory = {
  jurisdictionId: string;
  house: string;
  /** Every election in the run, oldest first. The x axis. */
  elections: { id: string; year: number; epochId: string; seats: number; turnoutPct: number | null }[];
  parties: PartyTrajectory[];
  /** Boundaries where the electoral geography changed, so the renderer knows where to break. */
  epochBreaks: { afterYear: number; fromEpoch: string; toEpoch: string }[];
};

/** How many of the most recent elections count as "now" for the presence test below. */
const RECENT = 3;
/** Vote share that earns a party a row even with no seats. A party this size is a fact about the state. */
const PRESENT_PCT = 5;

/**
 * Split a party's points wherever the epoch changes.
 *
 * Returned as arrays of points rather than as indices, so a renderer cannot accidentally draw across a
 * break by iterating the flat list.
 */
export function segments(points: readonly TrajectoryPoint[]): TrajectoryPoint[][] {
  const out: TrajectoryPoint[][] = [];
  let run: TrajectoryPoint[] = [];
  for (const p of points) {
    const prev = run.at(-1);
    if (prev !== undefined && prev.epochId !== p.epochId) {
      out.push(run);
      run = [];
    }
    run.push(p);
  }
  if (run.length > 0) out.push(run);
  return out;
}

/**
 * A state's whole run for one house.
 *
 * `limit` caps the parties returned, ranked by their seats at the most recent election and then by how many
 * elections they have won a seat in — so a party that governs now leads, and a long-standing presence beats
 * a single historical fluke. Everything else is dropped rather than folded into an "others" line, because an
 * others line on a trajectory chart is a sum of unrelated parties pretending to be a trend.
 */
export function stateTrajectory(
  db: DatabaseSync,
  jurisdictionId: string,
  house = "ac",
  limit = 6,
): StateTrajectory {
  return read(() => {
    const elections = all<{ id: string; year: number; epochId: string; seats: number; voters: number | null; electors: number | null }>(
      db,
      `SELECT e.id AS id, e.year AS year, e.epoch_id AS epochId,
              (SELECT COUNT(*) FROM contest c WHERE c.election_id = e.id) AS seats,
              (SELECT SUM(t.voters) FROM contest c JOIN turnout t ON t.contest_id = c.id AND t.scope = 'contest'
                WHERE c.election_id = e.id) AS voters,
              (SELECT SUM(t.electors) FROM contest c JOIN turnout t ON t.contest_id = c.id AND t.scope = 'contest'
                WHERE c.election_id = e.id) AS electors
         FROM election e
        WHERE e.jurisdiction_place_id = ? AND e.house = ? AND e.kind <> 'bypoll'
        ORDER BY ${CHRONO_DESC}`,
      jurisdictionId,
      house,
    ).reverse();

    if (elections.length === 0) {
      return { jurisdictionId, house, elections: [], parties: [], epochBreaks: [] };
    }

    const ids = elections.map((e) => e.id);
    const marks = ids.map(() => "?").join(",");

    // Seats won per party per election, and total votes per party per election, in two reads over the run.
    const seatRows = all<{ electionId: string; key: string; label: string; n: number }>(
      db,
      `SELECT c.election_id AS electionId,
              COALESCE(pt.id, NULLIF(cd.party_raw, ''), 'unattached') AS key,
              COALESCE(NULLIF(pt.short_name, ''), NULLIF(pt.name, ''), NULLIF(cd.party_raw, ''), 'Unattached') AS label,
              COUNT(*) AS n
         FROM contest c
         JOIN result r  ON r.contest_id = c.id AND r.revision = 0 AND r.is_winner = 1
         JOIN candidacy cd ON cd.id = r.candidacy_id
         LEFT JOIN party_version pvv ON pvv.id = cd.party_version_id
         LEFT JOIN party pt          ON pt.id = pvv.party_id
        WHERE c.election_id IN (${marks})
        GROUP BY 1, 2, 3`,
      ...ids,
    );

    const voteRows = all<{ electionId: string; key: string; votes: number | null }>(
      db,
      `SELECT c.election_id AS electionId,
              COALESCE(pt.id, NULLIF(cd.party_raw, ''), 'unattached') AS key,
              SUM(r.votes) AS votes
         FROM contest c
         JOIN result r  ON r.contest_id = c.id AND r.revision = 0
         JOIN candidacy cd ON cd.id = r.candidacy_id
         LEFT JOIN party_version pvv ON pvv.id = cd.party_version_id
         LEFT JOIN party pt          ON pt.id = pvv.party_id
        WHERE c.election_id IN (${marks})
        GROUP BY 1, 2`,
      ...ids,
    );

    const totalVotes = new Map<string, number>();
    for (const r of voteRows) {
      totalVotes.set(r.electionId, (totalVotes.get(r.electionId) ?? 0) + (r.votes ?? 0));
    }
    const voteOf = new Map(voteRows.map((r) => [`${r.electionId}|${r.key}`, r.votes]));
    const seatOf = new Map(seatRows.map((r) => [`${r.electionId}|${r.key}`, r.n]));
    const labelOf = new Map<string, string>();
    for (const r of seatRows) labelOf.set(r.key, r.label);
    for (const r of voteRows) if (!labelOf.has(r.key)) labelOf.set(r.key, r.key);

    const latestId = elections.at(-1)?.id ?? "";
    const keys = [...new Set(seatRows.map((r) => r.key))];

    const parties: PartyTrajectory[] = keys
      .map((key) => {
        const points: TrajectoryPoint[] = elections.map((e) => {
          const seats = seatOf.get(`${e.id}|${key}`) ?? 0;
          const votes = voteOf.get(`${e.id}|${key}`) ?? null;
          const total = totalVotes.get(e.id) ?? 0;
          return {
            electionId: e.id,
            year: e.year,
            epochId: e.epochId,
            seats,
            seatPct: e.seats > 0 ? (100 * seats) / e.seats : null,
            votePct: total > 0 && votes !== null ? (100 * votes) / total : null,
          };
        });
        return {
          key,
          label: labelOf.get(key) ?? key,
          points,
          latestSeats: seatOf.get(`${latestId}|${key}`) ?? 0,
          contested: points.filter((p) => p.seats > 0).length,
        };
      })
      // Independents are not a party and a trajectory for "IND" is a trajectory for nobody.
      .filter((p) => p.key !== "IND" && p.key !== "unattached")
      /**
       * A TRAJECTORY NEEDS MORE THAN ONE POINT.
       *
       * A party that won a seat at exactly one election has no trajectory — it has an event. Karnataka 2023
       * returned two of them (Kalyana Rajya Pragathi Paksha and Sarvodaya Karnataka Paksha, one seat each),
       * and ranking by latest seats put both ABOVE the CPM, which has won seats across decades. The result
       * was two rows drawing a single dot beside rows drawing forty years.
       *
       * So: seats in at least two elections. That is "meaningful historical participation" stated as a rule
       * rather than as a seat threshold, which would have cut small-but-persistent regional parties — the
       * ones a state page exists to show.
       */
      .filter((p) => p.contested >= 2)
      /**
       * AND PRESENT IN LIVING MEMORY, which `contested >= 2` does not require.
       *
       * Karnataka's chart rendered six rows and THREE OF THEM WERE FLAT LINES AT ZERO — CPM, ADMK and CPI,
       * whose last Karnataka seats were won in the 1970s and 80s. They passed `contested >= 2` on that
       * ancient record and then out-ranked nobody, because ranking falls to `contested` once `latestSeats`
       * ties at zero and a party with a long dead past has a lot of it. Half the figure was empty rows, and
       * an empty row is worse than an absent one: it spends a line of the reader's attention saying nothing.
       *
       * NOT A SEAT TEST, deliberately. A party polling 18% and winning nothing is one of the most
       * interesting things a state chart can show — it is the exact asymmetry the vote-vs-seat plot beside
       * this one exists for — so vote share earns a row on its own. What is excluded is a party that has
       * neither seats nor votes now, which is a party this chart has nothing to draw.
       */
      .filter((p) => {
        const window = p.points.slice(-RECENT);
        return window.some((pt) => pt.seats > 0 || (pt.votePct ?? 0) >= PRESENT_PCT);
      })
      .sort((a, b) => b.latestSeats - a.latestSeats || b.contested - a.contested || a.key.localeCompare(b.key))
      .slice(0, limit);

    const epochBreaks: StateTrajectory["epochBreaks"] = [];
    for (let i = 1; i < elections.length; i += 1) {
      const prev = elections[i - 1] as (typeof elections)[number];
      const now = elections[i] as (typeof elections)[number];
      if (prev.epochId !== now.epochId) {
        epochBreaks.push({ afterYear: prev.year, fromEpoch: prev.epochId, toEpoch: now.epochId });
      }
    }

    return {
      jurisdictionId,
      house,
      elections: elections.map((e) => ({
        id: e.id,
        year: e.year,
        epochId: e.epochId,
        seats: e.seats,
        turnoutPct:
          e.electors !== null && e.electors > 0 && e.voters !== null ? (100 * e.voters) / e.electors : null,
      })),
      parties,
      epochBreaks,
    };
  });
}
