// §4 Floor 2 — "How did it get this way?" — for ONE assembly constituency, in the shape a
// server-rendered chart can draw honestly: every figure arrives with its baseline, its rank, its
// fold, and the caveats of the measure that produced it.
//
// Nothing here computes a percentage of its own. turnout, share, margin, swing, enp and retention
// all come from semantic/measures.ts — that layer exists precisely so this file cannot become the
// second definition of turnout.
//
// FIVE fixed queries, whatever the number of elections or parties: place · contest×candidacy ·
// district+state turnout baselines · demographic claims · sources.

import type { DatabaseSync } from "node:sqlite";
import type { Reservation } from "../core/index.ts";
import { all, get } from "../db/index.ts";
import {
  enp,
  incumbency_retention,
  margin_pct,
  swing_pp,
  turnout_pct,
  vote_share_pct,
} from "../semantic/index.ts";
import type { Provenanced, SourceRef } from "./index.ts";
import { loadSources, read, yearOf } from "./index.ts";
import { counted } from "./person.ts";
import type { DemographicFigure } from "./place.ts";
import { demographicClaims, groupDemographics } from "./place.ts";

/** Exactly what the Analysis page's URL exposes. A fourth filter would be a parameter with no
 *  caller. */
export type PlaceAnalysisFilters = { fromYear?: number; toYear?: number; party?: string };

/** §24 caps entity-keyed colour at three hues on the dark surface (§05-craft, all-pairs CVD run),
 *  so three parties are named and the tail is folded — the fold is DATA, not the page's guess. */
export const PARTY_CAP = 3;

export type PartyPoint = {
  partyId: string;
  shortName: string;
  personName: string | null;
  votes: number | null;
  voteSharePct: number | null;
  rank: number | null;
  won: boolean;
};

export type TurnoutPoint = {
  electionId: string;
  year: number;
  electors: number | null;
  voters: number | null;
  turnoutPct: number | null;
  /** §6.5: a bare 96.6% says nothing. Same election, same measure, wider electorate. */
  districtTurnoutPct: number | null;
  stateTurnoutPct: number | null;
};

export type PartySharePoint = {
  electionId: string;
  year: number;
  /** At most PARTY_CAP, share-descending. */
  parties: PartyPoint[];
  /** null when nothing was folded. `count` is how many parties the bucket stands for. */
  others: { count: number; votes: number | null; voteSharePct: number | null } | null;
};

export type SwingPoint = {
  electionId: string;
  year: number;
  previousElectionId: string;
  previousYear: number;
  partyId: string;
  shortName: string;
  voteSharePct: number | null;
  previousVoteSharePct: number | null;
  /** null — never 0, never −100 — where the party did not contest the earlier election, or where its
   *  label repeats inside either election so no single predecessor is identifiable. */
  swingPp: number | null;
};

export type MarginPoint = {
  electionId: string;
  year: number;
  marginVotes: number | null;
  marginPct: number | null;
  winner: PartyPoint | null;
  runnerUp: PartyPoint | null;
};

export type EnpPoint = {
  electionId: string;
  year: number;
  enp: number | null;
  /** How many contestants the figure was computed over. The truncation bias is a function of this:
   *  enp over a top-5 field overstates concentration (see enp.caveats). */
  contestants: number;
};

export type RetentionPoint = {
  electionId: string;
  year: number;
  previousElectionId: string;
  previousYear: number;
  winningPartyId: string | null;
  previousWinningPartyId: string | null;
  /** 1 held · 0 changed hands · null unknown or across an epoch boundary. */
  held: number | null;
};

export type PlaceAnalysis = {
  place: {
    id: string;
    canonicalName: string;
    districtId: string | null;
    districtName: string | null;
    /** The state this seat sits in. Carried because the Analysis floor draws a state baseline and
     *  used to label that series "West Bengal" as a literal, which would have mislabelled the
     *  series rather than failed once a second state loaded. */
    stateName: string | null;
    stateId: string | null;
    number: number | null;
    reservation: Reservation | null;
    epochId: string | null;
    epochName: string | null;
  };
  filters: PlaceAnalysisFilters;
  /** Newest election first, and so is every series below it. */
  turnoutSeries: TurnoutPoint[];
  partyShareSeries: PartySharePoint[];
  swingSeries: SwingPoint[];
  marginSeries: MarginPoint[];
  enpSeries: EnpPoint[];
  retention: RetentionPoint[];
  demographics: Provenanced<DemographicFigure>[];
  /** Boundary epochs the retained series spans. More than one and swing/retention go null across
   *  the break. */
  epochIds: string[];
  /** The validity conditions of the measures actually used, plus the epoch break if there is one.
   *  §13.2: these render with the figures, not in a footnote nobody opens. */
  caveats: string[];
  /** The union of everything cited, including the sources behind the district and state baselines.
   *  Never empty for a non-null result. */
  sources: SourceRef[];
};

type PlaceSql = {
  id: string;
  place_version_id: number;
  canonical_name: string;
  parent_id: string | null;
  district_name: string | null;
  state_name: string | null;
  state_id: string | null;
  number: number | null;
  reservation: Reservation | null;
  epoch_id: string | null;
  epoch_name: string | null;
};

type RowSql = {
  contest_id: string;
  election_id: string;
  epoch_id: string;
  electors: number | null;
  voters: number | null;
  turnout_source_id: string | null;
  rank: number | null;
  votes: number | null;
  margin: number | null;
  result_source_id: string | null;
  person_name: string | null;
  party_id: string | null;
  party_short_name: string | null;
  party_raw: string | null;
};

type BaselineSql = {
  election_id: string;
  d_voters: number | null;
  d_electors: number | null;
  s_voters: number | null;
  s_electors: number | null;
  source_ids: string | null;
};

type Contest = {
  contestId: string;
  electionId: string;
  year: number;
  epochId: string;
  electors: number | null;
  voters: number | null;
  marginVotes: number | null;
  /** Rank order, so [0] is the winner where a result was declared. */
  runners: PartyPoint[];
};

/**
 * Place Analysis. `slug` is the place id ('wb.ac.001') or the constituency name ('Mekliganj'),
 * case-insensitive — the same two-candidate match getPlaceBrief uses.
 *
 * Series are computed over the FULL history and then narrowed by `filters`, so a swing at the edge
 * of the window still knows the election it is measured from (it carries `previousYear`).
 */
export function getPlaceAnalysis(
  db: DatabaseSync,
  slug: string,
  filters: PlaceAnalysisFilters = {},
): PlaceAnalysis | null {
  return read(() => {
    const p = get<PlaceSql>(
      db,
      // Named from the VERSION, and scoped to it: a seat number is not an identity across
      // delimitation, so both the name and the analysis belong to one set of boundaries. See
      // docs/model/electoral-geography.md.
      `SELECT pl.id, pv.id AS place_version_id, pv.canonical_name, pl.parent_id,
              d.canonical_name AS district_name, d.parent_id AS state_id,
              st.canonical_name AS state_name,
              pv.number, pv.reservation, pv.epoch_id, be.name AS epoch_name
         FROM place_version pv
         JOIN place pl ON pl.id = pv.place_id
         LEFT JOIN place d ON d.id = COALESCE(pv.district_place_id, pl.parent_id)
         LEFT JOIN place st ON st.id = d.parent_id
         LEFT JOIN boundary_epoch be ON be.id = pv.epoch_id
        WHERE pv.kind = 'ac' AND (pl.id = ? OR LOWER(pv.canonical_name) = LOWER(?))
        ORDER BY be.effective_from DESC, pv.id DESC
        LIMIT 1`,
      slug,
      slug,
    );
    if (p === undefined) return null;

    const rows = all<RowSql>(
      db,
      `SELECT c.id AS contest_id, c.election_id, pv.epoch_id,
              t.electors, t.voters, t.source_id AS turnout_source_id,
              r.rank, r.votes, r.margin, r.source_id AS result_source_id,
              per.canonical_name AS person_name,
              pt.id AS party_id, pt.short_name AS party_short_name, ca.party_raw
         FROM contest c
         JOIN election e ON e.id = c.election_id
         JOIN place_version pv ON pv.id = c.place_version_id
         LEFT JOIN turnout t ON t.contest_id = c.id AND t.scope = 'contest'
         LEFT JOIN result r ON r.contest_id = c.id AND r.revision = 0
         LEFT JOIN candidacy ca ON ca.id = r.candidacy_id
         LEFT JOIN person per ON per.id = ca.person_id
         LEFT JOIN party_version pver ON pver.id = ca.party_version_id
         LEFT JOIN party pt ON pt.id = pver.party_id
        WHERE c.place_version_id = ?
        ORDER BY e.year DESC, e.polling_month DESC, e.occurrence DESC, r.rank, r.candidacy_id`,
      p.place_version_id,
    );

    // The two baselines §6.5 asks for, in one grouped pass over the same turnout rows. Aggregated
    // through turnout_pct.compute like the seat figure, so all three columns are the same measure.
    const baselines = all<BaselineSql>(
      db,
      `SELECT c.election_id,
              SUM(CASE WHEN pl.parent_id = ? THEN t.voters END)   AS d_voters,
              SUM(CASE WHEN pl.parent_id = ? THEN t.electors END) AS d_electors,
              SUM(t.voters)   AS s_voters,
              SUM(t.electors) AS s_electors,
              GROUP_CONCAT(DISTINCT t.source_id) AS source_ids
         FROM contest c
         JOIN election e ON e.id = c.election_id
         JOIN place_version pv ON pv.id = c.place_version_id
         JOIN place pl ON pl.id = pv.place_id AND pl.kind = 'ac'
         JOIN place dist ON dist.id = pl.parent_id
         JOIN turnout t ON t.contest_id = c.id AND t.scope = 'contest'
        WHERE dist.parent_id = ?
        GROUP BY c.election_id
        ORDER BY MAX(e.year) DESC, MAX(e.polling_month) DESC, MAX(e.occurrence) DESC`,
      p.parent_id,
      p.parent_id,
      p.state_id,
    );
    const baseline = new Map(baselines.map((b) => [b.election_id, b]));

    const demoRows = demographicClaims(db, p.id);

    const sources = loadSources(
      db,
      [
        ...rows.flatMap((r) => [r.result_source_id, r.turnout_source_id]),
        ...demoRows.map((d) => d.source_id),
        ...baselines.flatMap((b) => (b.source_ids ?? "").split(",")),
      ].filter((id): id is string => id !== null && id !== ""),
      [`place:${p.id}`, ...new Set(rows.map((r) => `contest:${r.contest_id}`))],
    );

    const contests = groupContests(rows).filter(
      (c) =>
        (filters.fromYear === undefined || c.year >= filters.fromYear) &&
        (filters.toYear === undefined || c.year <= filters.toYear),
    );
    const pairs = contests
      .map((c, i) => [c, contests[i + 1]] as const)
      .filter((x): x is readonly [Contest, Contest] => x[1] !== undefined);
    const epochIds = [...new Set(contests.map((c) => c.epochId))].sort();

    return {
      place: {
        id: p.id,
        canonicalName: p.canonical_name,
        districtId: p.parent_id,
        districtName: p.district_name,
        stateName: p.state_name,
        stateId: p.state_id,
        number: p.number,
        reservation: p.reservation,
        epochId: p.epoch_id,
        epochName: p.epoch_name,
      },
      filters,
      turnoutSeries: contests.map((c) => {
        const b = baseline.get(c.electionId);
        return {
          electionId: c.electionId,
          year: c.year,
          electors: c.electors,
          voters: c.voters,
          turnoutPct: turnout_pct.compute({ voters: c.voters, electors: c.electors }),
          districtTurnoutPct:
            b === undefined
              ? null
              : turnout_pct.compute({ voters: b.d_voters, electors: b.d_electors }),
          stateTurnoutPct:
            b === undefined
              ? null
              : turnout_pct.compute({ voters: b.s_voters, electors: b.s_electors }),
        };
      }),
      partyShareSeries: contests.map((c) => fold(c, filters.party)),
      swingSeries: pairs.flatMap(([now, prev]) => swings(now, prev, filters.party)),
      marginSeries: contests.map((c) => ({
        electionId: c.electionId,
        year: c.year,
        marginVotes: c.marginVotes,
        // result.margin IS (rank-1 − rank-2) as published, so it is the measure's numerator. Going
        // through the two vote columns instead would lose 2026, where votes are 0 (declared, not
        // counted) but the margin is on record.
        marginPct: margin_pct.compute({
          rank1Votes: c.marginVotes,
          rank2Votes: 0,
          validVotes: c.voters,
        }),
        winner: c.runners.find((r) => r.won) ?? null,
        runnerUp: c.runners.find((r) => r.rank === 2) ?? null,
      })),
      enpSeries: contests.map((c) => {
        const shares = c.runners
          .map((r) => r.voteSharePct)
          .filter((s): s is number => s !== null);
        return {
          electionId: c.electionId,
          year: c.year,
          enp: enp.compute({ sharesPct: shares }),
          contestants: shares.length,
        };
      }),
      retention: pairs.map(([now, prev]) => {
        const w = now.runners.find((r) => r.won)?.partyId ?? null;
        const pw = prev.runners.find((r) => r.won)?.partyId ?? null;
        return {
          electionId: now.electionId,
          year: now.year,
          previousElectionId: prev.electionId,
          previousYear: prev.year,
          winningPartyId: w,
          previousWinningPartyId: pw,
          held: incumbency_retention.compute({
            winningPartyId: w,
            previousWinningPartyId: pw,
            sameEpoch: now.epochId === prev.epochId,
          }),
        };
      }),
      demographics: groupDemographics(demoRows, new Map(sources.map((s) => [s.id, s]))),
      epochIds,
      caveats: [
        ...new Set(
          [turnout_pct, vote_share_pct, margin_pct, swing_pp, enp, incumbency_retention].flatMap(
            (m) => m.caveats,
          ),
        ),
        ...(epochIds.length > 1
          ? [
              `This series spans ${epochIds.length} boundary epochs (${epochIds.join(", ")}): ` +
                "swing and retention are null across the break, because the two electorates are " +
                "not the same set of voters.",
            ]
          : []),
      ],
      sources,
    };
  });
}

function groupContests(rows: readonly RowSql[]): Contest[] {
  const out: Contest[] = [];
  for (const r of rows) {
    let c = out[out.length - 1];
    if (c === undefined || c.contestId !== r.contest_id) {
      c = {
        contestId: r.contest_id,
        electionId: r.election_id,
        year: yearOf(r.election_id),
        epochId: r.epoch_id,
        electors: r.electors,
        voters: r.voters,
        marginVotes: null,
        runners: [],
      };
      out.push(c);
    }
    if (r.rank === null) continue; // contest with no declared result: kept, with an empty field
    if (r.rank === 1) c.marginVotes = counted(r.margin);
    const votes = counted(r.votes);
    c.runners.push({
      partyId: r.party_id ?? r.party_raw ?? "unknown",
      shortName: r.party_short_name ?? r.party_raw ?? "Unknown",
      personName: r.person_name,
      votes,
      // The denominator is the contest's valid votes from the turnout row, never the sum of a
      // truncated field (vote_share_pct.formula).
      voteSharePct: vote_share_pct.compute({ votes, validVotes: r.voters }),
      rank: r.rank,
      won: r.rank === 1,
    });
  }
  return out;
}

/** Three named parties, the rest as one explicit bucket. `party` pins one party instead: the page's
 *  party filter is "show me this party against everyone else". */
function fold(c: Contest, party: string | undefined): PartySharePoint {
  const named =
    party === undefined
      ? c.runners.slice(0, PARTY_CAP)
      : c.runners.filter((r) => r.partyId === party || r.shortName === party);
  const rest = c.runners.filter((r) => !named.includes(r));
  const votes = rest.filter((r) => r.votes !== null);
  return {
    electionId: c.electionId,
    year: c.year,
    parties: named,
    others:
      rest.length === 0
        ? null
        : {
            count: rest.length,
            votes: votes.length === 0 ? null : votes.reduce((a, r) => a + (r.votes ?? 0), 0),
            // Summed from the shares actually on record, so it reconciles with `parties` and stays
            // silent about the missing tail rather than inventing a residual.
            voteSharePct: sumShares(rest),
          },
  };
}

function sumShares(runners: readonly PartyPoint[]): number | null {
  const s = runners.filter((r) => r.voteSharePct !== null);
  if (s.length === 0) return null;
  return Math.round(s.reduce((a, r) => a + (r.voteSharePct ?? 0), 0) * 10) / 10;
}

/** Swing for the parties that contested the NEWER election — the bars a swing chart draws. A party
 *  that dropped out has no bar to draw, only a previous share.
 *  ponytail: newer-election parties only — add the dropouts when a design asks for them. */
function swings(now: Contest, prev: Contest, party: string | undefined): SwingPoint[] {
  // A party id that repeats inside EITHER election cannot be matched across the pair: which of
  // Kalimpong 2016's four independents is the 2021 independent's predecessor is not on record. That is
  // unresolvable, so the swing is null and the earlier share blank — the alternative, keeping
  // whichever runner the map happened to write last, measured 251 rows in this registry from an
  // arbitrary predecessor and was out by up to 35 pp.
  // ponytail: id only, not the display label — no contest in the registry repeats a short name under
  // two different party ids (checked over all 4,357 result rows). Add the label if one ever does.
  const repeated = new Set(
    [now, prev].flatMap((c) => {
      const ids = c.runners.map((r) => r.partyId);
      return ids.filter((id, i) => ids.indexOf(id) !== i);
    }),
  );
  const before = new Map(prev.runners.map((r) => [r.partyId, r.voteSharePct]));
  return now.runners
    .filter((r) => party === undefined || r.partyId === party || r.shortName === party)
    .map((r) => {
      const previousVoteSharePct = repeated.has(r.partyId) ? null : (before.get(r.partyId) ?? null);
      return {
        electionId: now.electionId,
        year: now.year,
        previousElectionId: prev.electionId,
        previousYear: prev.year,
        partyId: r.partyId,
        shortName: r.shortName,
        voteSharePct: r.voteSharePct,
        previousVoteSharePct,
        swingPp: swing_pp.compute({
          sharePct: r.voteSharePct,
          previousSharePct: previousVoteSharePct,
          sameEpoch: now.epochId === prev.epochId,
        }),
      };
    });
}
