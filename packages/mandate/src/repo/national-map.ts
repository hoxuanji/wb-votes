// The national electoral map: one polygon per parliamentary constituency, coloured by who won it.
//
// WHAT THIS IS, AND WHY IT IS NOT THE ASSEMBLY MAP.
//
// The India map has always coloured a state by its GOVERNMENT — one figure for a whole state, and not a
// claim about any area inside it. That layer stays, because "who governs where" is a real question. What it
// cannot do is answer "who won", and the registry has held the answer all along: 526 parliamentary outlines
// in the same projection as the state borders, keyed to the place_version each result was recorded under.
//
// THE UNIT IS THE PARLIAMENTARY SEAT, MEASURED RATHER THAN ASSUMED. The registry also holds 3,936 assembly
// outlines for the current delimitation, and drawing those nationally was the first thing tried. It is the
// wrong map twice over:
//
//                              polygons   path bytes    simplified   size on a 1,000px frame
//   assembly, delim-2008          3,936      4,071 KB      1,059 KB   about 2 px across
//   parliamentary, delim-2008       526      2,432 KB        442 KB   about 9 px across
//
// At two pixels a constituency is not something a reader can point at, hover, compare or navigate to — and
// this codebase already made that argument once, when it deleted 726 district hairlines from the national
// map for the same reason. Progressive geographic disclosure is the rule: the country shows parliamentary
// seats, and a state's own 224 assembly seats appear when that state is opened, which `stateMapView`
// already does. So the assembly detail is not lost, it is one level down where it is legible.
//
// THE EPOCH GATE IS STRUCTURAL HERE TOO. `place_geometry` is keyed by `place_version_id` and a contest names
// its own `place_version`, so the only polygon a result can be drawn on is the boundary that result was
// recorded under. ls-2024 is the case that proves it matters: 5 of its seats sit under `delim-2022-jk` and
// 14 under `delim-2023-as`, neither of which the registry holds geometry for, so those 19 come back
// undrawable and counted rather than drawn on the boundaries they replaced.
//
// THE RUNNER-UP IS HERE BECAUSE IT WAS NEVER ANYWHERE. `result.margin` is populated for winners only, but
// rank-1 and rank-2 vote counts exist for 63,334 of 64,021 contests — so the margin AND who it was over are
// both available, and no surface has ever shown the second half. A seat's card carries both.

import type { DatabaseSync } from "node:sqlite";
import { all } from "../db/index.ts";
import { loadSources, read } from "./index.ts";
import type { SourceRef } from "./index.ts";
import { CHRONO_DESC } from "./elections.ts";
import { NATIONAL, simplified } from "../viz/simplify.ts";

/** The frame the state outlines and the constituency outlines share. Anything else cannot be overlaid. */
export const SHARED_FRAME = "2.1 2.7 597.3 666.8";

/** One parliamentary constituency, as the national map draws it. */
export type NationalSeat = {
  placeId: string;
  /** The version the result was recorded under — the only geometry it may legally be drawn on. */
  versionId: number;
  epochId: string;
  name: string;
  number: number | null;
  reservation: string | null;
  jurisdictionId: string | null;
  jurisdictionName: string | null;
  partyKey: string | null;
  partyLabel: string | null;
  winnerName: string | null;
  winnerPersonId: string | null;
  votes: number | null;
  /** Runner-up, from rank 2. The half of every margin no surface has shown. */
  runnerUpKey: string | null;
  runnerUpLabel: string | null;
  runnerUpName: string | null;
  runnerUpVotes: number | null;
  /** Winner minus runner-up, computed from the two vote counts rather than read from `result.margin`. */
  marginVotes: number | null;
  /** Over votes polled, never over the sum of the result rows. */
  marginPct: number | null;
  turnoutPct: number | null;
  /** Simplified for this zoom. Null where the registry holds no polygon for this version. */
  path: string | null;
  href: string | null;
};

export type NationalElection = {
  id: string;
  name: string;
  year: number;
  seats: number;
};

export type NationalMapView = {
  election: NationalElection | null;
  /** Every general election on record, newest first. The selector's options. */
  elections: NationalElection[];
  seats: NationalSeat[];
  /** The parties this election's winners actually include, biggest first. The contextual legend. */
  legend: { key: string; label: string; n: number }[];
  sources: SourceRef[];
  geometry: {
    viewBox: string;
    drawable: number;
    total: number;
    /** Seats whose boundary the registry holds no polygon for, and the epochs they sit under. */
    undrawableEpochs: string[];
    /** Polygons withheld for being in a different coordinate space from the rest. */
    otherFrames: number;
    /** Path bytes actually emitted, so a page can state its own weight instead of guessing. */
    pathBytes: number;
  };
};

const KEY_SQL = `COALESCE(pt.id, NULLIF(cd.party_raw, ''), 'unattached')`;
const LABEL_SQL = `COALESCE(NULLIF(pt.short_name, ''), NULLIF(pt.name, ''), NULLIF(cd.party_raw, ''), 'Unattached')`;

type SeatSql = {
  placeId: string;
  versionId: number;
  epochId: string;
  name: string;
  number: number | null;
  reservation: string | null;
  jurisdictionId: string | null;
  jurisdictionName: string | null;
  partyKey: string | null;
  partyLabel: string | null;
  winnerName: string | null;
  winnerPersonId: string | null;
  votes: number | null;
  runnerUpKey: string | null;
  runnerUpLabel: string | null;
  runnerUpName: string | null;
  runnerUpVotes: number | null;
  voters: number | null;
  electors: number | null;
  path: string | null;
  viewBox: string | null;
};

/** The name slug a place path uses. Same rule as place-page.ts's, and it has to stay the same rule. */
function slug(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

/** Every general election on record, newest first. */
export function generalElections(db: DatabaseSync): NationalElection[] {
  return read(() =>
    all<NationalElection>(
      db,
      `SELECT e.id AS id, e.name AS name, e.year AS year,
              (SELECT COUNT(*) FROM contest c WHERE c.election_id = e.id) AS seats
         FROM election e
        WHERE e.kind = 'general' AND e.house = 'pc'
        ORDER BY ${CHRONO_DESC}`,
    ),
  );
}

/**
 * The national map for one general election.
 *
 * `election` is validated by MEMBERSHIP against the general elections on record — an id from a URL that is
 * not one of them falls back to the newest rather than reaching the SQL or drawing an empty country.
 *
 * ONE QUERY for 543 seats, with the runner-up folded in by two correlated subqueries rather than a second
 * pass over `result`. Rank is indexed by the primary key's prefix, so each is a point lookup.
 */
export function nationalMapView(
  db: DatabaseSync,
  p: { election?: string | undefined } = {},
): NationalMapView {
  return read(() => {
    const elections = generalElections(db);
    const chosen = elections.find((e) => e.id === p.election) ?? elections[0] ?? null;
    const empty: NationalMapView = {
      election: null,
      elections,
      seats: [],
      legend: [],
      sources: [],
      geometry: {
        viewBox: SHARED_FRAME,
        drawable: 0,
        total: 0,
        undrawableEpochs: [],
        otherFrames: 0,
        pathBytes: 0,
      },
    };
    if (chosen === null) return empty;

    const rows = all<SeatSql>(
      db,
      `SELECT pv.place_id AS placeId, pv.id AS versionId, pv.epoch_id AS epochId,
              pv.canonical_name AS name, pv.number AS number, pv.reservation AS reservation,
              pv.jurisdiction_id AS jurisdictionId, j.canonical_name AS jurisdictionName,
              ${KEY_SQL} AS partyKey, ${LABEL_SQL} AS partyLabel,
              per.canonical_name AS winnerName, per.id AS winnerPersonId,
              r.votes AS votes,
              (SELECT COALESCE(pt2.id, NULLIF(cd2.party_raw, ''), 'unattached')
                 FROM result r2 JOIN candidacy cd2 ON cd2.id = r2.candidacy_id
                 LEFT JOIN party_version pv2 ON pv2.id = cd2.party_version_id
                 LEFT JOIN party pt2 ON pt2.id = pv2.party_id
                WHERE r2.contest_id = c.id AND r2.revision = 0 AND r2.rank = 2) AS runnerUpKey,
              (SELECT COALESCE(NULLIF(pt2.short_name, ''), NULLIF(pt2.name, ''), NULLIF(cd2.party_raw, ''), 'Unattached')
                 FROM result r2 JOIN candidacy cd2 ON cd2.id = r2.candidacy_id
                 LEFT JOIN party_version pv2 ON pv2.id = cd2.party_version_id
                 LEFT JOIN party pt2 ON pt2.id = pv2.party_id
                WHERE r2.contest_id = c.id AND r2.revision = 0 AND r2.rank = 2) AS runnerUpLabel,
              (SELECT per2.canonical_name FROM result r2
                 JOIN candidacy cd2 ON cd2.id = r2.candidacy_id
                 JOIN person per2 ON per2.id = cd2.person_id
                WHERE r2.contest_id = c.id AND r2.revision = 0 AND r2.rank = 2) AS runnerUpName,
              (SELECT r2.votes FROM result r2
                WHERE r2.contest_id = c.id AND r2.revision = 0 AND r2.rank = 2) AS runnerUpVotes,
              t.voters AS voters, t.electors AS electors,
              pg.path AS path, pg.view_box AS viewBox
         FROM contest c
         JOIN place_version pv ON pv.id = c.place_version_id
         LEFT JOIN place j     ON j.id = pv.jurisdiction_id
         LEFT JOIN result r    ON r.contest_id = c.id AND r.revision = 0 AND r.is_winner = 1
         LEFT JOIN candidacy cd ON cd.id = r.candidacy_id
         LEFT JOIN person per   ON per.id = cd.person_id
         LEFT JOIN party_version pvv ON pvv.id = cd.party_version_id
         LEFT JOIN party pt          ON pt.id = pvv.party_id
         LEFT JOIN turnout t   ON t.contest_id = c.id AND t.scope = 'contest'
         LEFT JOIN place_geometry pg ON pg.place_version_id = pv.id
        WHERE c.election_id = ?
        ORDER BY pv.jurisdiction_id, pv.number`,
      chosen.id,
    );

    let otherFrames = 0;
    let pathBytes = 0;
    const undrawable = new Set<string>();

    const seats: NationalSeat[] = rows.map((r) => {
      // A polygon in another projection is WITHHELD, never drawn: two geometry sources need not share a
      // frame, and drawing one in the other's puts a seat somewhere it is not.
      const wrongFrame = r.path !== null && r.viewBox !== SHARED_FRAME;
      if (wrongFrame) otherFrames += 1;
      const usable = r.path !== null && !wrongFrame;
      if (!usable) undrawable.add(r.epochId);
      const path = usable ? simplified(r.path as string, NATIONAL) : null;
      if (path !== null) pathBytes += path.length;

      // The margin from the two vote counts, not from `result.margin` — which exists for winners only and
      // cannot say who the margin was over.
      const marginVotes =
        r.votes !== null && r.runnerUpVotes !== null ? r.votes - r.runnerUpVotes : null;
      const marginPct =
        marginVotes !== null && r.voters !== null && r.voters > 0
          ? (100 * marginVotes) / r.voters
          : null;

      return {
        placeId: r.placeId,
        versionId: r.versionId,
        epochId: r.epochId,
        name: r.name,
        number: r.number,
        reservation: r.reservation,
        jurisdictionId: r.jurisdictionId,
        jurisdictionName: r.jurisdictionName,
        partyKey: r.partyKey,
        partyLabel: r.partyLabel,
        winnerName: r.winnerName,
        winnerPersonId: r.winnerPersonId,
        votes: r.votes,
        runnerUpKey: r.runnerUpKey,
        runnerUpLabel: r.runnerUpLabel,
        runnerUpName: r.runnerUpName,
        runnerUpVotes: r.runnerUpVotes,
        marginVotes,
        marginPct,
        // A share of ELECTORS, so it is comparable across a roll that grew — India's has, by about a
        // third over this registry's span.
        turnoutPct:
          r.electors !== null && r.electors > 0 && r.voters !== null
            ? (100 * r.voters) / r.electors
            : null,
        path,
        href:
          r.jurisdictionId === null ? null : `/pl/${r.jurisdictionId}?house=pc&seat=${slug(r.name)}`,
      };
    });

    const counts = new Map<string, { key: string; label: string; n: number }>();
    for (const s of seats) {
      if (s.partyKey === null) continue;
      const at = counts.get(s.partyKey) ?? { key: s.partyKey, label: s.partyLabel ?? s.partyKey, n: 0 };
      at.n += 1;
      counts.set(s.partyKey, at);
    }

    const sourceIds = all<{ id: string }>(
      db,
      `SELECT DISTINCT pg.source_id AS id FROM contest c
         JOIN place_geometry pg ON pg.place_version_id = c.place_version_id
        WHERE c.election_id = ?
       UNION
       SELECT DISTINCT r.source_id AS id FROM contest c
         JOIN result r ON r.contest_id = c.id AND r.revision = 0
        WHERE c.election_id = ?`,
      chosen.id,
      chosen.id,
    ).map((x) => x.id);

    return {
      election: chosen,
      elections,
      seats,
      legend: [...counts.values()].sort((a, b) => b.n - a.n || a.key.localeCompare(b.key)),
      sources: loadSources(db, sourceIds, []),
      geometry: {
        viewBox: SHARED_FRAME,
        drawable: seats.filter((s) => s.path !== null).length,
        total: seats.length,
        undrawableEpochs: [...undrawable].sort(),
        otherFrames,
        pathBytes,
      },
    };
  });
}

/** The seat count a majority needs, from the seats this election actually contested. */
export function majorityOf(view: NationalMapView): number {
  return Math.floor(view.seats.length / 2) + 1;
}

/** Whether an election published candidate vote counts at all — the gate on every margin and share. */
export function counted(view: NationalMapView): boolean {
  return view.seats.some((s) => s.votes !== null);
}
