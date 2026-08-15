import type { DatabaseSync } from "node:sqlite";
import type { Names, Reservation } from "../core/index.ts";
import { all, get } from "../db/index.ts";
import type { Provenanced, SourceRef } from "./index.ts";
import { loadSources, read, yearOf } from "./index.ts";
import { counted, parseNames, pct } from "./person.ts";
import { turnoutReading, unverifiedTurnout } from "./turnout-trust.ts";
import type { Turnout } from "./turnout-trust.ts";

type Runner = {
  candidacyId: string;
  personId: string;
  personName: string;
  partyShortName: string | null;
  /** null when the source reported no count — see repo/person.ts `counted`. */
  votes: number | null;
  voteShare: number | null;
};

/** §6.5: a demographic figure without its census year is a lie by omission, so `sourceYear` is a
 *  required property of the value, not something the UI has to go looking for. */
export type DemographicFigure = {
  key: string;
  value: number | string;
  unit: string | null;
  sourceYear: number | null;
};

export type PlaceBrief = {
  place: {
    id: string;
    /** 'ac' or 'pc' — which body this seat elects to. The one thing that differs between the two. */
    kind: string;
    /** The state or union territory. The ancestor BOTH bodies have, and what a canonical URL needs. */
    jurisdictionId: string | null;
    canonicalName: string;
    names: Names;
    districtId: string | null;
    districtName: string | null;
    number: number | null;
    reservation: Reservation | null;
    epochId: string | null;
    epochName: string | null;
    electors: number | null;
  };
  /** Newest election first. */
  contests: {
    contestId: string;
    electionId: string;
    electionName: string;
    year: number;
    electors: number | null;
    voters: number | null;
    /** This contest's turnout and its standing — see `turnout-trust.ts`. A reading, not a bare number. */
    turnout: Turnout;
    winner: Runner | null;
    runnerUp: Runner | null;
    margin: number | null;
  }[];
  /** The winner of the newest contest. There is no separate sitting-member table and no need for
   *  one: a term ends when the next result lands. */
  sittingMember: { personId: string; personName: string; partyShortName: string | null; year: number } | null;
  demographics: Provenanced<DemographicFigure>[];
  sources: SourceRef[];
};

type PlaceSql = {
  id: string;
  kind: string;
  jurisdiction_id: string | null;
  place_version_id: number;
  canonical_name: string;
  names: string;
  parent_id: string | null;
  district_name: string | null;
  number: number | null;
  reservation: Reservation | null;
  epoch_id: string | null;
  epoch_name: string | null;
  electors_at_creation: number | null;
};

type ContestSql = {
  contest_id: string;
  election_id: string;
  election_name: string;
  electors: number | null;
  voters: number | null;
  turnout_source_id: string | null;
  candidacy_id: string | null;
  rank: number | null;
  votes: number | null;
  vote_share: number | null;
  margin: number | null;
  result_source_id: string | null;
  person_id: string | null;
  person_name: string | null;
  party_short_name: string | null;
};

/**
 * Assembly constituency Brief. FOUR fixed queries — place, contest history (top two per contest),
 * demographic claims with their citations, sources — regardless of how many elections it has.
 *
 * `slug` is the place id ('wb.ac.001') or the constituency name ('Mekliganj'), case-insensitive.
 * ponytail: no separate slug column; two candidate matches on an indexed PK and a name is cheaper
 * than a migration. Add one when a name collides across states.
 *
 * SCOPED TO ONE DELIMITATION, deliberately. The name and the history both come from the newest
 * `place_version` for the seat, not from `place`: a place is keyed by seat number, and a seat number is
 * not an identity across delimitation. Reading the history as `WHERE pv.place_id = ?` returned every
 * election ever held under that NUMBER — sixteen of them for Mekliganj, spanning four different sets of
 * boundaries — presented as one seat's record. Karnataka's parliamentary seat 1 was Bidar until 2008 and
 * Chikkodi after it; those are not one constituency with a long history, and a page that adds their
 * results together is asserting a continuity no source supports. Matching a name resolves in the same
 * scope, so 'Mekliganj' means the seat that carries the name now.
 */
export function getPlaceBrief(db: DatabaseSync, slug: string): PlaceBrief | null {
  return read(() => {
    const p = get<PlaceSql>(
      db,
      `SELECT pl.id, pv.kind, pv.jurisdiction_id, pv.id AS place_version_id, pv.canonical_name, pl.names,
              -- A PARLIAMENTARY SEAT HAS NO DISTRICT, and the COALESCE onto pl.parent_id is an assembly-era
              -- fallback that handed one a district anyway: district_place_id is NULL on all 2,065 pc
              -- versions because a Lok Sabha seat spans districts by design, so the fallback fired every
              -- time and produced an ancestor no source asserts.
              CASE WHEN pv.kind = 'pc' THEN pv.district_place_id
                   ELSE COALESCE(pv.district_place_id, pl.parent_id) END AS parent_id,
              d.canonical_name AS district_name,
              pv.number, pv.reservation, pv.epoch_id, be.name AS epoch_name,
              pv.electors_at_creation
         FROM place_version pv
         JOIN place pl ON pl.id = pv.place_id
         LEFT JOIN place d ON d.id = CASE WHEN pv.kind = 'pc' THEN pv.district_place_id
                                          ELSE COALESCE(pv.district_place_id, pl.parent_id) END
         LEFT JOIN boundary_epoch be ON be.id = pv.epoch_id
        -- EITHER BODY. This was kind = 'ac', which is why a Lok Sabha seat had no page: 606 parliamentary
        -- constituencies across six delimitations were in the registry and unreachable through the one
        -- function that renders a constituency.
        WHERE pv.kind IN ('ac', 'pc') AND (pl.id = ? OR LOWER(pv.canonical_name) = LOWER(?))
        ORDER BY be.effective_from DESC, pv.id DESC
        LIMIT 1`,
      slug,
      slug,
    );
    if (p === undefined) return null;

    const rows = all<ContestSql>(
      db,
      `SELECT c.id AS contest_id, c.election_id, e.name AS election_name,
              t.electors, t.voters, t.source_id AS turnout_source_id,
              r.candidacy_id, r.rank, r.votes, r.vote_share, r.margin,
              r.source_id AS result_source_id,
              per.id AS person_id, per.canonical_name AS person_name,
              pt.short_name AS party_short_name
         FROM contest c
         JOIN election e ON e.id = c.election_id
         LEFT JOIN turnout t ON t.contest_id = c.id AND t.scope = 'contest'
         LEFT JOIN result r ON r.contest_id = c.id AND r.revision = 0 AND r.rank <= 2
         LEFT JOIN candidacy ca ON ca.id = r.candidacy_id
         LEFT JOIN person per ON per.id = ca.person_id
         LEFT JOIN party_version pver ON pver.id = ca.party_version_id
         LEFT JOIN party pt ON pt.id = pver.party_id
        WHERE c.place_version_id = ?
        ORDER BY e.year DESC, e.polling_month DESC, e.occurrence DESC, r.rank, r.candidacy_id`,
      p.place_version_id,
    );

    const demoRows = demographicClaims(db, p.id);

    const directIds = rows
      .flatMap((r) => [r.result_source_id, r.turnout_source_id])
      .concat(demoRows.map((d) => d.source_id))
      .filter((id): id is string => id !== null);
    const sources = loadSources(db, directIds, [
      `place:${p.id}`,
      ...new Set(rows.map((r) => `contest:${r.contest_id}`)),
    ]);
    const byId = new Map(sources.map((s) => [s.id, s]));

    const contests = groupContests(
      rows,
      unverifiedTurnout(db, [...new Set(rows.map((r) => r.election_id))]),
    );
    const latest = contests[0];
    const sitting = latest?.winner ?? null;

    return {
      place: {
        id: p.id,
        kind: p.kind,
        jurisdictionId: p.jurisdiction_id,
        canonicalName: p.canonical_name,
        names: parseNames(p.names),
        districtId: p.parent_id,
        districtName: p.district_name,
        number: p.number,
        reservation: p.reservation,
        epochId: p.epoch_id,
        epochName: p.epoch_name,
        electors: p.electors_at_creation ?? latest?.electors ?? null,
      },
      contests,
      sittingMember:
        sitting === null || latest === undefined
          ? null
          : {
              personId: sitting.personId,
              personName: sitting.personName,
              partyShortName: sitting.partyShortName,
              year: latest.year,
            },
      demographics: groupDemographics(demoRows, byId),
      sources,
    };
  });
}

function groupContests(
  rows: readonly ContestSql[],
  /** The elections whose turnout the registry cannot corroborate. Decided once, by the caller. */
  unverified: ReadonlySet<string>,
): PlaceBrief["contests"] {
  const out: PlaceBrief["contests"] = [];
  for (const r of rows) {
    let c = out[out.length - 1];
    if (c === undefined || c.contestId !== r.contest_id) {
      c = {
        contestId: r.contest_id,
        electionId: r.election_id,
        electionName: r.election_name,
        year: yearOf(r.election_id),
        electors: r.electors,
        voters: r.voters,
        turnout: turnoutReading(r.voters, r.electors, unverified.has(r.election_id)),
        winner: null,
        runnerUp: null,
        margin: null,
      };
      out.push(c);
    }
    if (r.candidacy_id === null || r.person_id === null) continue;
    const runner: Runner = {
      candidacyId: r.candidacy_id,
      personId: r.person_id,
      personName: r.person_name ?? r.person_id,
      partyShortName: r.party_short_name,
      votes: counted(r.votes),
      voteShare: counted(r.vote_share),
    };
    if (r.rank === 1) {
      c.winner = runner;
      c.margin = r.margin;
    } else if (r.rank === 2 && c.runnerUp === null) c.runnerUp = runner;
  }
  return out;
}

/** A demographic claim row with the source that carries it. */
export type DemoClaimRow = {
  predicate: string;
  object_value: string;
  unit: string | null;
  as_of: string | null;
  source_id: string;
};

/** Every 'demographics.*' claim about a place, with its citation. Shared with place-analysis.ts —
 *  §6.5's vintage rule applies to both surfaces, so it is read one way. */
export function demographicClaims(db: DatabaseSync, placeId: string): DemoClaimRow[] {
  return all<DemoClaimRow>(
    db,
    `SELECT cl.predicate, cl.object_value, cl.unit, cl.as_of, ci.source_id
       FROM claim cl
       JOIN citation ci ON ci.claim_id = cl.id
      WHERE cl.subject_ref = ? AND cl.predicate LIKE 'demographics.%'
      ORDER BY cl.predicate, ci.source_id`,
    `place:${placeId}`,
  );
}

export function groupDemographics(
  rows: readonly DemoClaimRow[],
  byId: ReadonlyMap<string, SourceRef>,
): Provenanced<DemographicFigure>[] {
  const out: Provenanced<DemographicFigure>[] = [];
  for (const r of rows) {
    const key = r.predicate.slice("demographics.".length);
    const last = out[out.length - 1];
    if (last !== undefined && last.value.key === key) {
      const s = byId.get(r.source_id);
      if (s !== undefined && !last.sources.some((x) => x.id === s.id)) last.sources.push(s);
      continue;
    }
    const s = byId.get(r.source_id);
    out.push({
      value: {
        key,
        value: parseValue(r.object_value),
        unit: r.unit,
        sourceYear: r.as_of === null ? null : yearOf(r.as_of),
      },
      sources: s === undefined ? [] : [s],
    });
  }
  return out;
}

/** claim.object_value is JSON text: `2819086` for a count, `"district proxy"` for a note. */
function parseValue(json: string): number | string {
  try {
    const v: unknown = JSON.parse(json);
    return typeof v === "number" || typeof v === "string" ? v : json;
  } catch {
    return json;
  }
}
