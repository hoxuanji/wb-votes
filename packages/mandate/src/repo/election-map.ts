// The election map: every seat of one election, with what a reader would ask about it.
//
// GENERAL FROM THE START, because a general election and a state assembly are the same shape of thing. This
// module knows nothing about `kind`: it reads the contests of whatever election it is given, resolves each to
// the place_version the result was recorded under, and takes the polygon keyed to that version. A general
// election frames the country; an assembly frames its own state, from the bounding box of the polygons it
// actually holds. Neither branch exists in the code — the box is computed from what was loaded.
//
// WHAT IT ADDS OVER A LIST OF WINNERS, and each one is a question no surface has answered:
//
//   THE RUNNER-UP.  `result.margin` exists for winners only, but rank-1 and rank-2 vote counts exist for
//                   63,334 of 64,021 contests. So the margin AND who it was over are both computable, and
//                   the second half has never been shown anywhere.
//   THE FLIP.       Per seat, the party that held it before — THROUGH THE EPOCH GATE, so a seat whose
//                   boundary was redrawn is `comparable: false` and carries no flip rather than a false one.
//   VOTE TO SEATS.  Each party's share of the vote against its share of the seats. Karnataka 2023: INC
//                   43.2% of the vote and 60.3% of the seats; BJP 36.1% and 29.0%. Neither figure appears
//                   anywhere in the product today.
//   THE MARGIN'S SHAPE. 63,334 computable margins currently surface as a list of five. Binned here, so the
//                   distribution is drawable and a bin is addressable from a URL.
//
// ONE READ FOR THE SEATS, one for the previous election's winners, and everything else is folded in memory.
// The seat query carries four correlated subqueries for rank 2, each a point lookup on the primary key's
// prefix — measured at about 220 ms for 543 seats, which is a route-level cost on a route-level instrument.

import type { DatabaseSync } from "node:sqlite";
import { all, get } from "../db/index.ts";
import { loadSources, read } from "./index.ts";
import type { SourceRef } from "./index.ts";
import { CHRONO_DESC, partitionByEpoch, previousElection, seatKey } from "./elections.ts";
import type { Finding, PartyRef, SeatFlips, VoteSeatEfficiency } from "./findings.ts";
import { NATIONAL, parse, simplified } from "../viz/simplify.ts";

/** The frame the state outlines and every constituency outline share. Anything else cannot be overlaid. */
export const SHARED_FRAME = "2.1 2.7 597.3 666.8";

/** Margin bins, in percentage points of votes polled. Uniform width, so the bars are comparable. */
export const BIN_WIDTH = 2;
/** Everything at or above this lands in one overflow bin: a 60-point margin is not 30 bars of detail. */
export const BIN_MAX = 40;

/** Which bin a margin falls in. `null` for an unknown margin, which is not a bin. */
export function binOf(marginPct: number | null): number | null {
  if (marginPct === null) return null;
  if (marginPct >= BIN_MAX) return BIN_MAX;
  return Math.floor(marginPct / BIN_WIDTH) * BIN_WIDTH;
}

/** One bar of the margin distribution. `lo` doubles as the bin's URL key. */
export type MarginBin = {
  lo: number;
  hi: number | null;
  /** Null `hi` is the overflow bin. */
  n: number;
  overflow: boolean;
};

export type SeatFlip = {
  /** The party that held this seat at the previous election of the same house. */
  from: PartyRef;
  /** False when the winner is unchanged — a hold, which the map draws differently from a gain. */
  changed: boolean;
};

/** One constituency, as the map draws it and as the panels list it. */
export type ElectionSeat = {
  placeId: string;
  versionId: number;
  epochId: string;
  contestId: string;
  name: string;
  number: number | null;
  reservation: string | null;
  jurisdictionId: string | null;
  jurisdictionName: string | null;
  /**
   * The district this seat sits in, as a GROUPING and nothing more.
   *
   * A district does not elect anybody — its constituencies do — so nothing downstream may colour a
   * district by a winner. What it is good for is focus: selecting one reframes the map to the bounding box
   * of ITS OWN SEATS, which needs no district geometry at all. That matters, because the registry holds
   * district outlines for West Bengal only (19 of 25) and in a different projection from the
   * constituencies, so drawing them is not an option this data supports.
   */
  districtId: string | null;
  districtName: string | null;
  partyKey: string | null;
  partyLabel: string | null;
  winnerName: string | null;
  votes: number | null;
  runnerUpKey: string | null;
  runnerUpLabel: string | null;
  runnerUpName: string | null;
  runnerUpVotes: number | null;
  /** Winner minus runner-up, from the two vote counts rather than from `result.margin`. */
  marginVotes: number | null;
  /** Over votes polled, never over the sum of the result rows. */
  marginPct: number | null;
  /** `binOf(marginPct)`, carried so the map and the histogram agree without recomputing. */
  marginBin: number | null;
  turnoutPct: number | null;
  /**
   * Whether this seat could be compared with the previous election at all.
   *
   * False means the boundary was redrawn between the two, so there is no predecessor to have flipped from.
   * The map must not colour it as a hold — a redrawn seat is neither.
   */
  comparable: boolean;
  flip: SeatFlip | null;
  /** Simplified for this zoom. Null where the registry holds no polygon for this version. */
  path: string | null;
  href: string | null;
};

export type ElectionChoice = {
  id: string;
  name: string;
  year: number;
  house: string;
  kind: string;
  seats: number;
};

export type ElectionMapView = {
  election: (ElectionChoice & { jurisdictionId: string; jurisdictionName: string }) | null;
  /** Sibling elections of the same jurisdiction and house, newest first. The selector's options. */
  siblings: ElectionChoice[];
  previous: { id: string; year: number } | null;
  seats: ElectionSeat[];
  /** Parties that won a seat, biggest first. The contextual legend. */
  legend: { key: string; label: string; n: number }[];
  /** Seats a majority needs, from the seats this election actually contested. */
  majority: number;
  /** Turnout across the election, as a share of electors. Null where no source published one. */
  turnoutPct: number | null;
  voteSeat: VoteSeatEfficiency[];
  marginBins: MarginBin[];
  /** The flip summary and the refusal, both from `findings.ts`, both epoch-gated. */
  flips: SeatFlips | null;
  incomparableSeats: number;
  sources: SourceRef[];
  geometry: {
    /** The frame that fits the polygons actually held — the country, or one state. */
    viewBox: string;
    drawable: number;
    total: number;
    undrawableEpochs: string[];
    otherFrames: number;
    pathBytes: number;
  };
};

const KEY_SQL = `COALESCE(pt.id, NULLIF(cd.party_raw, ''), 'unattached')`;
const LABEL_SQL = `COALESCE(NULLIF(pt.short_name, ''), NULLIF(pt.name, ''), NULLIF(cd.party_raw, ''), 'Unattached')`;
const RUNNER = (col: string): string =>
  `(SELECT ${col} FROM result r2
      JOIN candidacy cd2 ON cd2.id = r2.candidacy_id
      LEFT JOIN person per2 ON per2.id = cd2.person_id
      LEFT JOIN party_version pv2 ON pv2.id = cd2.party_version_id
      LEFT JOIN party pt2 ON pt2.id = pv2.party_id
     WHERE r2.contest_id = c.id AND r2.revision = 0 AND r2.rank = 2)`;

type SeatSql = {
  placeId: string;
  versionId: number;
  epochId: string;
  contestId: string;
  name: string;
  number: number | null;
  reservation: string | null;
  jurisdictionId: string | null;
  jurisdictionName: string | null;
  districtId: string | null;
  districtName: string | null;
  partyKey: string | null;
  partyLabel: string | null;
  winnerName: string | null;
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

/** Every election addressable on this route, newest first. */
export function electionChoices(db: DatabaseSync, limit = 60): ElectionChoice[] {
  return read(() =>
    all<ElectionChoice>(
      db,
      `SELECT e.id AS id, e.name AS name, e.year AS year, e.house AS house, e.kind AS kind,
              (SELECT COUNT(*) FROM contest c WHERE c.election_id = e.id) AS seats
         FROM election e
        WHERE e.kind IN ('general', 'assembly')
        ORDER BY ${CHRONO_DESC}
        LIMIT ?`,
      limit,
    ),
  );
}

/** A frame that fits these paths, with a margin, in the shared projection. */
export function frameOf(paths: readonly string[]): string {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const d of paths) {
    const { subpaths, unsupported } = parse(d);
    if (unsupported) continue;
    for (const pts of subpaths) {
      for (const [x, y] of pts) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (!Number.isFinite(x0)) return SHARED_FRAME;
  const w = x1 - x0;
  const h = y1 - y0;
  // A margin proportional to the larger side, so a small state and the whole country both breathe equally.
  const m = Math.max(w, h) * 0.04;
  return `${(x0 - m).toFixed(1)} ${(y0 - m).toFixed(1)} ${(w + 2 * m).toFixed(1)} ${(h + 2 * m).toFixed(1)}`;
}

/**
 * Everything one election's map and panels need, from one open handle.
 *
 * `electionId` is validated by MEMBERSHIP against the elections this route serves, so an id from a URL that
 * names nothing comes back as a null election rather than reaching the SQL.
 */
export function electionMapView(db: DatabaseSync, electionId: string): ElectionMapView {
  return read(() => {
    const empty: ElectionMapView = {
      election: null,
      siblings: [],
      previous: null,
      seats: [],
      legend: [],
      majority: 0,
      turnoutPct: null,
      voteSeat: [],
      marginBins: [],
      flips: null,
      incomparableSeats: 0,
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

    const e = get<{
      id: string;
      name: string;
      year: number;
      house: string;
      kind: string;
      jurisdictionId: string;
      jurisdictionName: string;
    }>(
      db,
      `SELECT e.id AS id, e.name AS name, e.year AS year, e.house AS house, e.kind AS kind,
              e.jurisdiction_place_id AS jurisdictionId, p.canonical_name AS jurisdictionName
         FROM election e JOIN place p ON p.id = e.jurisdiction_place_id
        WHERE e.id = ? AND e.kind IN ('general', 'assembly')`,
      electionId,
    );
    if (e === undefined) return empty;

    const rows = all<SeatSql>(
      db,
      `SELECT pv.place_id AS placeId, pv.id AS versionId, pv.epoch_id AS epochId, c.id AS contestId,
              pv.canonical_name AS name, pv.number AS number, pv.reservation AS reservation,
              pv.jurisdiction_id AS jurisdictionId, j.canonical_name AS jurisdictionName,
              pv.district_place_id AS districtId, dis.canonical_name AS districtName,
              ${KEY_SQL} AS partyKey, ${LABEL_SQL} AS partyLabel,
              per.canonical_name AS winnerName, r.votes AS votes,
              ${RUNNER(`COALESCE(pt2.id, NULLIF(cd2.party_raw, ''), 'unattached')`)} AS runnerUpKey,
              ${RUNNER(`COALESCE(NULLIF(pt2.short_name, ''), NULLIF(pt2.name, ''), NULLIF(cd2.party_raw, ''), 'Unattached')`)} AS runnerUpLabel,
              ${RUNNER("per2.canonical_name")} AS runnerUpName,
              ${RUNNER("r2.votes")} AS runnerUpVotes,
              t.voters AS voters, t.electors AS electors,
              pg.path AS path, pg.view_box AS viewBox
         FROM contest c
         JOIN place_version pv ON pv.id = c.place_version_id
         LEFT JOIN place j     ON j.id = pv.jurisdiction_id
         LEFT JOIN place dis   ON dis.id = pv.district_place_id
         LEFT JOIN result r    ON r.contest_id = c.id AND r.revision = 0 AND r.is_winner = 1
         LEFT JOIN candidacy cd ON cd.id = r.candidacy_id
         LEFT JOIN person per   ON per.id = cd.person_id
         LEFT JOIN party_version pvv ON pvv.id = cd.party_version_id
         LEFT JOIN party pt          ON pt.id = pvv.party_id
         LEFT JOIN turnout t   ON t.contest_id = c.id AND t.scope = 'contest'
         LEFT JOIN place_geometry pg ON pg.place_version_id = pv.id
        WHERE c.election_id = ?
        ORDER BY pv.jurisdiction_id, pv.number`,
      electionId,
    );

    // The previous election of the same house, and its winners keyed by (epoch, place) — the gate.
    const previousId = previousElection(db, electionId);
    const before = new Map<string, PartyRef>();
    const beforeRows: { placeId: string; epochId: string }[] = [];
    if (previousId !== null) {
      for (const r of all<{ placeId: string; epochId: string; key: string; label: string }>(
        db,
        `SELECT pv.place_id AS placeId, pv.epoch_id AS epochId, ${KEY_SQL} AS key, ${LABEL_SQL} AS label
           FROM contest c
           JOIN place_version pv ON pv.id = c.place_version_id
           JOIN result r  ON r.contest_id = c.id AND r.revision = 0 AND r.is_winner = 1
           JOIN candidacy cd ON cd.id = r.candidacy_id
           LEFT JOIN party_version pvv ON pvv.id = cd.party_version_id
           LEFT JOIN party pt          ON pt.id = pvv.party_id
          WHERE c.election_id = ?`,
        previousId,
      )) {
        before.set(seatKey(r.placeId, r.epochId), { key: r.key, label: r.label });
        beforeRows.push({ placeId: r.placeId, epochId: r.epochId });
      }
    }
    const split = partitionByEpoch(
      rows.map((r) => ({ placeId: r.placeId, epochId: r.epochId })),
      beforeRows,
    );
    const comparableKeys = new Set(split.comparable.map((r) => seatKey(r.placeId, r.epochId)));

    let otherFrames = 0;
    let pathBytes = 0;
    const undrawable = new Set<string>();
    const kept: string[] = [];

    const seats: ElectionSeat[] = rows.map((r) => {
      // A polygon in another projection is WITHHELD, never drawn: two geometry sources need not share a
      // frame, and drawing one in the other's puts a seat somewhere it is not.
      const wrongFrame = r.path !== null && r.viewBox !== SHARED_FRAME;
      if (wrongFrame) otherFrames += 1;
      const usable = r.path !== null && !wrongFrame;
      if (!usable) undrawable.add(r.epochId);
      const path = usable ? simplified(r.path as string, NATIONAL) : null;
      if (path !== null) {
        pathBytes += path.length;
        kept.push(path);
      }

      const marginVotes = r.votes !== null && r.runnerUpVotes !== null ? r.votes - r.runnerUpVotes : null;
      const marginPct =
        marginVotes !== null && r.voters !== null && r.voters > 0 ? (100 * marginVotes) / r.voters : null;

      const key = seatKey(r.placeId, r.epochId);
      const comparable = comparableKeys.has(key);
      const was = comparable ? before.get(key) : undefined;

      return {
        placeId: r.placeId,
        versionId: r.versionId,
        epochId: r.epochId,
        contestId: r.contestId,
        name: r.name,
        number: r.number,
        reservation: r.reservation,
        jurisdictionId: r.jurisdictionId,
        jurisdictionName: r.jurisdictionName,
        districtId: r.districtId,
        districtName: r.districtName,
        partyKey: r.partyKey,
        partyLabel: r.partyLabel,
        winnerName: r.winnerName,
        votes: r.votes,
        runnerUpKey: r.runnerUpKey,
        runnerUpLabel: r.runnerUpLabel,
        runnerUpName: r.runnerUpName,
        runnerUpVotes: r.runnerUpVotes,
        marginVotes,
        marginPct,
        marginBin: binOf(marginPct),
        turnoutPct:
          r.electors !== null && r.electors > 0 && r.voters !== null ? (100 * r.voters) / r.electors : null,
        comparable,
        flip:
          was === undefined || r.partyKey === null
            ? null
            : { from: was, changed: was.key !== r.partyKey },
        path,
        href: r.jurisdictionId === null ? null : `/pl/${r.jurisdictionId}?seat=${slug(r.name)}`,
      };
    });

    /* ── party aggregates: seats, votes, and the gap between the two shares ── */

    const counts = new Map<string, { key: string; label: string; n: number }>();
    for (const s of seats) {
      if (s.partyKey === null) continue;
      const at = counts.get(s.partyKey) ?? { key: s.partyKey, label: s.partyLabel ?? s.partyKey, n: 0 };
      at.n += 1;
      counts.set(s.partyKey, at);
    }
    const legend = [...counts.values()].sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));

    // Votes per party across the whole election. Its own read: the seat query holds winners only, and a
    // party's vote share is over every candidate it ran, not just the ones who won.
    const partyVotes = all<{ key: string; label: string; votes: number | null }>(
      db,
      `SELECT ${KEY_SQL} AS key, ${LABEL_SQL} AS label, SUM(r.votes) AS votes
         FROM contest c
         JOIN result r  ON r.contest_id = c.id AND r.revision = 0
         JOIN candidacy cd ON cd.id = r.candidacy_id
         LEFT JOIN party_version pvv ON pvv.id = cd.party_version_id
         LEFT JOIN party pt          ON pt.id = pvv.party_id
        WHERE c.election_id = ?
        GROUP BY 1, 2`,
      electionId,
    );
    const totalVotes = partyVotes.reduce((t, r) => t + (r.votes ?? 0), 0);
    const contested = seats.length;
    const voteSeat: VoteSeatEfficiency[] = partyVotes
      .map((r) => {
        const seatsWon = counts.get(r.key)?.n ?? 0;
        const votePct = totalVotes > 0 && r.votes !== null ? (100 * r.votes) / totalVotes : null;
        const seatPct = contested > 0 ? (100 * seatsWon) / contested : 0;
        return {
          type: "vote_seat_efficiency" as const,
          party: { key: r.key, label: r.label },
          votePct,
          seatPct,
          deltaPp: votePct === null ? null : seatPct - votePct,
          seats: seatsWon,
          contested,
          seatsPerPoint: votePct === null || votePct === 0 ? null : seatsWon / votePct,
        };
      })
      // A party with no seats AND no measurable share is noise on a scatter plot.
      .filter((r) => r.seats > 0 || (r.votePct ?? 0) >= 1)
      .sort((a, b) => (b.votePct ?? 0) - (a.votePct ?? 0));

    /* ── the margin distribution ── */

    const binCounts = new Map<number, number>();
    for (const s of seats) {
      if (s.marginBin === null) continue;
      binCounts.set(s.marginBin, (binCounts.get(s.marginBin) ?? 0) + 1);
    }
    const marginBins: MarginBin[] = [];
    for (let lo = 0; lo < BIN_MAX; lo += BIN_WIDTH) {
      marginBins.push({ lo, hi: lo + BIN_WIDTH, n: binCounts.get(lo) ?? 0, overflow: false });
    }
    marginBins.push({ lo: BIN_MAX, hi: null, n: binCounts.get(BIN_MAX) ?? 0, overflow: true });

    /* ── flips, from the gated split ── */

    const changed = seats.filter((s) => s.flip !== null && s.flip.changed);
    const held = seats.filter((s) => s.flip !== null && !s.flip.changed);
    // One cell of the flip matrix, keyed by the party pair. NOT `seatKey`, which means something else —
    // reusing it here would read as if a party pair were a seat identity.
    const cellKey = (from: string, to: string): string => `${from}>${to}`;
    const pairMap = new Map<string, { from: PartyRef; to: PartyRef; count: number }>();
    for (const s of changed) {
      const from = s.flip?.from;
      if (from === undefined || s.partyKey === null) continue;
      const cell = cellKey(from.key, s.partyKey);
      const at = pairMap.get(cell);
      if (at === undefined) {
        pairMap.set(cell, { from, to: { key: s.partyKey, label: s.partyLabel ?? s.partyKey }, count: 1 });
      } else {
        at.count += 1;
      }
    }
    const comparableCount = changed.length + held.length;
    const previousYear =
      previousId === null
        ? null
        : (get<{ y: number }>(db, `SELECT year AS y FROM election WHERE id = ?`, previousId)?.y ?? null);

    const flips: SeatFlips | null =
      comparableCount === 0
        ? null
        : {
            type: "seat_flips",
            flipped: changed.length,
            held: held.length,
            comparable: comparableCount,
            pairs: [...pairMap.values()].sort(
              (a, b) => b.count - a.count || a.from.key.localeCompare(b.from.key),
            ),
            previousYear,
            year: e.year,
          };

    /* ── turnout across the election, and provenance ── */

    const turnout = get<{ voters: number | null; electors: number | null }>(
      db,
      `SELECT SUM(t.voters) AS voters, SUM(t.electors) AS electors
         FROM contest c JOIN turnout t ON t.contest_id = c.id AND t.scope = 'contest'
        WHERE c.election_id = ?`,
      electionId,
    );

    const sourceIds = all<{ id: string }>(
      db,
      `SELECT DISTINCT pg.source_id AS id FROM contest c
         JOIN place_geometry pg ON pg.place_version_id = c.place_version_id
        WHERE c.election_id = ?
       UNION
       SELECT DISTINCT r.source_id AS id FROM contest c
         JOIN result r ON r.contest_id = c.id AND r.revision = 0
        WHERE c.election_id = ?`,
      electionId,
      electionId,
    ).map((x) => x.id);

    const siblings = all<ElectionChoice>(
      db,
      `SELECT e.id AS id, e.name AS name, e.year AS year, e.house AS house, e.kind AS kind,
              (SELECT COUNT(*) FROM contest c WHERE c.election_id = e.id) AS seats
         FROM election e
        WHERE e.jurisdiction_place_id = ? AND e.house = ? AND e.kind = ?
        ORDER BY ${CHRONO_DESC}`,
      e.jurisdictionId,
      e.house,
      e.kind,
    );

    return {
      election: {
        id: e.id,
        name: e.name,
        year: e.year,
        house: e.house,
        kind: e.kind,
        seats: seats.length,
        jurisdictionId: e.jurisdictionId,
        jurisdictionName: e.jurisdictionName,
      },
      siblings,
      previous: previousId === null || previousYear === null ? null : { id: previousId, year: previousYear },
      seats,
      legend,
      majority: Math.floor(seats.length / 2) + 1,
      turnoutPct:
        turnout?.electors != null && turnout.electors > 0 && turnout.voters != null
          ? (100 * turnout.voters) / turnout.electors
          : null,
      voteSeat,
      marginBins,
      flips,
      incomparableSeats: split.incomparable.length,
      sources: loadSources(db, sourceIds, []),
      geometry: {
        // The country for a general election, one state for an assembly — computed, never branched on.
        viewBox: frameOf(kept),
        drawable: kept.length,
        total: seats.length,
        undrawableEpochs: [...undrawable].sort(),
        otherFrames,
        pathBytes,
      },
    };
  });
}


/* ───────────────────── competitiveness bands, and districts as groupings ───────────────────── */

/**
 * Named margin bands, for SELECTING rather than for comparing area.
 *
 * The 2-point histogram bins show the distribution's SHAPE and are uniform because area in a histogram is
 * read whether the axis invites it or not. These are a different instrument: a filter with five rungs a
 * reader already thinks in — under a point, a point or two, up to five, up to ten, and safe. They are
 * deliberately NOT uniform, which is exactly why they are drawn as a segmented bar of counts and never as
 * a histogram: the width of a segment here encodes how many seats fall in it, not how wide the band is.
 */
export const MARGIN_BANDS: readonly { key: string; label: string; lo: number; hi: number | null }[] = [
  { key: "under1", label: "under 1%", lo: 0, hi: 1 },
  { key: "1to2", label: "1–2%", lo: 1, hi: 2 },
  { key: "2to5", label: "2–5%", lo: 2, hi: 5 },
  { key: "5to10", label: "5–10%", lo: 5, hi: 10 },
  { key: "over10", label: "10% and safer", lo: 10, hi: null },
];

export function bandOf(marginPct: number | null): string | null {
  if (marginPct === null) return null;
  for (const b of MARGIN_BANDS) {
    if (marginPct >= b.lo && (b.hi === null || marginPct < b.hi)) return b.key;
  }
  return null;
}

export function isBand(v: string | undefined): boolean {
  return MARGIN_BANDS.some((b) => b.key === v);
}

export type BandCount = { key: string; label: string; n: number };

export function marginBandCounts(seats: readonly ElectionSeat[]): BandCount[] {
  const counts = new Map<string, number>();
  for (const s of seats) {
    const k = bandOf(s.marginPct);
    if (k !== null) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return MARGIN_BANDS.map((b) => ({ key: b.key, label: b.label, n: counts.get(b.key) ?? 0 }));
}

export function seatsInBand(seats: readonly ElectionSeat[], band: string | null): ElectionSeat[] {
  if (band === null) return [];
  return seats.filter((s) => bandOf(s.marginPct) === band);
}

/**
 * A district, as the set of seats inside it.
 *
 * Note what is absent, and it is the same absence `DistrictTally` has carried since the state map was
 * built: there is no `winner` field. A district elects nobody. `parties` is plural because the honest
 * sentence is "12 of 18 constituencies went to INC".
 */
export type DistrictGroup = {
  id: string;
  name: string;
  seats: number;
  parties: { key: string; label: string; n: number }[];
};

export function districtGroups(seats: readonly ElectionSeat[]): DistrictGroup[] {
  const byId = new Map<string, { id: string; name: string; rows: ElectionSeat[] }>();
  for (const s of seats) {
    if (s.districtId === null) continue;
    const at = byId.get(s.districtId) ?? {
      id: s.districtId,
      name: s.districtName ?? s.districtId,
      rows: [],
    };
    at.rows.push(s);
    byId.set(s.districtId, at);
  }
  return [...byId.values()]
    .map((d) => {
      const counts = new Map<string, { key: string; label: string; n: number }>();
      for (const r of d.rows) {
        if (r.partyKey === null) continue;
        const at = counts.get(r.partyKey) ?? { key: r.partyKey, label: r.partyLabel ?? r.partyKey, n: 0 };
        at.n += 1;
        counts.set(r.partyKey, at);
      }
      return {
        id: d.id,
        name: d.name,
        seats: d.rows.length,
        parties: [...counts.values()].sort((a, b) => b.n - a.n || a.key.localeCompare(b.key)),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The seats of one district, or every seat when nothing is focused. */
export function seatsInDistrict(seats: readonly ElectionSeat[], districtId: string | null): ElectionSeat[] {
  if (districtId === null) return [...seats];
  return seats.filter((s) => s.districtId === districtId);
}

/** The findings a header can state without re-deriving anything. */
export function headlineFindings(v: ElectionMapView): Finding[] {
  const out: Finding[] = [];
  const top = v.legend[0];
  if (top !== undefined) {
    out.push({
      type: "majority",
      party: { key: top.key, label: top.label },
      seats: top.n,
      contested: v.seats.length,
      needed: v.majority,
      holds: top.n >= v.majority,
    });
  }
  if (v.flips !== null) out.push(v.flips);
  if (v.incomparableSeats > 0) {
    out.push({
      type: "seats_incomparable",
      count: v.incomparableSeats,
      previousYear: v.previous?.year ?? null,
      previousEpochId: null,
      epochId: null,
    });
  }
  return out;
}

/** How wide the widest bar is, so a histogram can scale without the component doing arithmetic. */
export function peakBin(bins: readonly MarginBin[]): number {
  return bins.reduce((m, b) => (b.n > m ? b.n : m), 0);
}

/** Seats in one margin bin, for the map's highlight and the strip's list. */
export function seatsInBin(v: ElectionMapView, lo: number | null): ElectionSeat[] {
  if (lo === null) return [];
  return v.seats.filter((s) => s.marginBin === lo);
}

/** The closest contests, by margin over votes polled. */
export function tightest(v: ElectionMapView, n = 8): ElectionSeat[] {
  return v.seats
    .filter((s) => s.marginPct !== null && s.partyLabel !== null)
    .sort((a, b) => (a.marginPct as number) - (b.marginPct as number))
    .slice(0, n);
}
