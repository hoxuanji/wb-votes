import type { DatabaseSync } from "node:sqlite";
import type {
  BirthYearConfidence,
  CandidacyStatus,
  Names,
  Reservation,
  ReviewState,
  Script,
  Sex,
} from "../core/index.ts";
import { UNPARSEABLE_KEY, blockingKeys } from "../core/index.ts";
import { all, get } from "../db/index.ts";
import type { SourceRef } from "./index.ts";
import { loadSources, marks, read, yearOf } from "./index.ts";

export type PersonBrief = {
  person: {
    id: string;
    canonicalName: string;
    names: Names;
    sex: Sex | null;
    birthYear: number | null;
    birthYearConfidence: BirthYearConfidence | null;
    reviewState: ReviewState;
  };
  aliases: { name: string; script: Script; kind: string }[];
  /** Newest election first. */
  candidacies: {
    contestId: string;
    electionId: string;
    electionName: string;
    year: number;
    placeName: string;
    placeNumber: number | null;
    reservation: Reservation | null;
    partyShortName: string | null;
    partySymbolRef: string | null;
    status: CandidacyStatus;
    ageDeclared: number | null;
    educationDeclared: string | null;
    votes: number | null;
    voteShare: number | null;
    rank: number | null;
    isWinner: boolean;
    margin: number | null;
    turnoutPct: number | null;
  }[];
  /** Oldest first — this is a series, and a series read backwards is a wrong delta. */
  affidavitTrail: {
    year: number;
    filedOn: string | null;
    assetsTotal: number | null;
    liabilitiesTotal: number | null;
    movable: number | null;
    immovable: number | null;
    pendingCasesDeclared: number | null;
    sourceId: string;
  }[];
  mergeProvenance: {
    mergeId: number;
    absorbedId: string;
    score: number | null;
    decidedBy: string;
    decidedAt: string;
  }[];
  sources: SourceRef[];
};

export type PersonRow = {
  id: string;
  canonicalName: string;
  sex: Sex | null;
  reviewState: ReviewState;
  /** Most recent candidacy, which is what a list row renders. null only for a person with none. */
  latestElectionId: string | null;
  latestYear: number | null;
  latestPlaceName: string | null;
  latestPartyShortName: string | null;
  latestStatus: CandidacyStatus | null;
  latestVotes: number | null;
  latestVoteShare: number | null;
  isWinner: boolean;
  candidacyCount: number;
  /** P2 for a list row: the result row's source, or the source that first recorded the name.
   *  Never null in a migrated registry — every alias carries a source. */
  sourceId: string | null;
};

type PersonRowSql = {
  id: string;
  canonical_name: string;
  names: string;
  sex: Sex | null;
  birth_year: number | null;
  birth_year_confidence: BirthYearConfidence | null;
  review_state: ReviewState;
};

/**
 * Everything the Brief lens renders, in one call. SEVEN fixed queries — person, aliases,
 * candidacies, affidavits, person-level claims, merges, sources — never N+1 in the number of
 * candidacies, affidavits or sources. Asserted by person.test.ts's statement counter.
 */
export function getPersonBrief(db: DatabaseSync, slug: string): PersonBrief | null {
  return read(() => {
    const p = get<PersonRowSql>(
      db,
      `SELECT id, canonical_name, names, sex, birth_year, birth_year_confidence, review_state
         FROM person WHERE id = ?`,
      slug,
    );
    if (p === undefined) return null;

    const aliases = all<{ name: string; script: Script; kind: string }>(
      db,
      `SELECT DISTINCT name, script, kind FROM person_alias
        WHERE person_id = ? ORDER BY name, script, kind`,
      slug,
    );

    const cand = all<{
      candidacy_id: string;
      contest_id: string;
      election_id: string;
      election_name: string;
      place_name: string;
      number: number | null;
      reservation: Reservation | null;
      party_short_name: string | null;
      symbol_id: string | null;
      status: CandidacyStatus;
      age_declared: number | null;
      education_declared: string | null;
      votes: number | null;
      vote_share: number | null;
      rank: number | null;
      is_winner: number | null;
      margin: number | null;
      result_source_id: string | null;
      electors: number | null;
      voters: number | null;
      turnout_source_id: string | null;
    }>(
      db,
      `SELECT ca.id AS candidacy_id, c.id AS contest_id, c.election_id, e.name AS election_name,
              pl.canonical_name AS place_name, pv.number, pv.reservation,
              pt.short_name AS party_short_name,
              COALESCE(ca.symbol_id, pver.symbol_id) AS symbol_id,
              ca.status, ca.age_declared, ca.education_declared,
              r.votes, r.vote_share, r.rank, r.is_winner, r.margin,
              r.source_id AS result_source_id,
              t.electors, t.voters, t.source_id AS turnout_source_id
         FROM candidacy ca
         JOIN contest c ON c.id = ca.contest_id
         JOIN election e ON e.id = c.election_id
         JOIN place_version pv ON pv.id = c.place_version_id
         JOIN place pl ON pl.id = pv.place_id
         LEFT JOIN party_version pver ON pver.id = ca.party_version_id
         LEFT JOIN party pt ON pt.id = pver.party_id
         LEFT JOIN result r ON r.candidacy_id = ca.id
              AND r.revision = (SELECT MAX(r2.revision) FROM result r2 WHERE r2.candidacy_id = ca.id)
         LEFT JOIN turnout t ON t.contest_id = c.id AND t.scope = 'contest'
        WHERE ca.person_id = ?
        ORDER BY c.election_id DESC, c.id`,
      slug,
    );

    const aff = all<{
      id: string;
      election_id: string;
      filed_on: string | null;
      source_id: string;
      assets_total: number | null;
      liabilities_total: number | null;
      movable: number | null;
      immovable: number | null;
    }>(
      db,
      `SELECT a.id, c.election_id, a.filed_on, a.source_id,
              MAX(CASE WHEN f.path = 'assets.total'           THEN f.value_numeric END) AS assets_total,
              MAX(CASE WHEN f.path = 'liabilities.total'      THEN f.value_numeric END) AS liabilities_total,
              MAX(CASE WHEN f.path = 'assets.movable.total'   THEN f.value_numeric END) AS movable,
              MAX(CASE WHEN f.path = 'assets.immovable.total' THEN f.value_numeric END) AS immovable
         FROM affidavit a
         JOIN candidacy ca ON ca.id = a.candidacy_id
         JOIN contest c ON c.id = ca.contest_id
         LEFT JOIN affidavit_field f ON f.affidavit_id = a.id
        WHERE ca.person_id = ?
        GROUP BY a.id
        ORDER BY c.election_id, a.filed_on, a.id`,
      slug,
    );

    // Declared pending cases are person-level claims carrying the filing vintage in as_of, not
    // affidavit_field rows — so the trail row picks up the claim with its own year.
    const casesByYear = new Map<number, number>();
    for (const cl of all<{ object_value: string; as_of: string | null }>(
      db,
      `SELECT object_value, as_of FROM claim
        WHERE subject_ref = ? AND predicate = 'pending_cases_declared' ORDER BY as_of`,
      `person:${slug}`,
    )) {
      const n = Number(cl.object_value);
      if (Number.isFinite(n)) casesByYear.set(cl.as_of === null ? 0 : yearOf(cl.as_of), n);
    }

    const merges = all<{
      id: number;
      merged_id: string;
      score: number | null;
      decided_by: string;
      decided_at: string;
    }>(
      db,
      `SELECT id, merged_id, score, decided_by, decided_at FROM person_merge
        WHERE surviving_id = ? AND reverted_at IS NULL ORDER BY id`,
      slug,
    );

    const directIds = [
      ...cand.flatMap((c) => [c.result_source_id, c.turnout_source_id]),
      ...aff.map((a) => a.source_id),
    ].filter((id): id is string => id !== null);
    const subjectRefs = [`person:${slug}`, ...cand.map((c) => `candidacy:${c.candidacy_id}`)];

    return {
      person: {
        id: p.id,
        canonicalName: p.canonical_name,
        names: parseNames(p.names),
        sex: p.sex,
        birthYear: p.birth_year,
        birthYearConfidence: p.birth_year_confidence,
        reviewState: p.review_state,
      },
      aliases,
      candidacies: cand.map((c) => ({
        contestId: c.contest_id,
        electionId: c.election_id,
        electionName: c.election_name,
        year: yearOf(c.election_id),
        placeName: c.place_name,
        placeNumber: c.number,
        reservation: c.reservation,
        partyShortName: c.party_short_name,
        partySymbolRef: c.symbol_id,
        status: c.status,
        ageDeclared: c.age_declared,
        educationDeclared: c.education_declared,
        votes: counted(c.votes),
        voteShare: counted(c.vote_share),
        rank: c.rank,
        isWinner: c.is_winner === 1,
        margin: c.margin,
        turnoutPct: pct(c.voters, c.electors),
      })),
      affidavitTrail: aff.map((a) => {
        const year = yearOf(a.election_id);
        return {
          year,
          filedOn: a.filed_on,
          assetsTotal: a.assets_total,
          liabilitiesTotal: a.liabilities_total,
          movable: a.movable,
          immovable: a.immovable,
          pendingCasesDeclared: casesByYear.get(year) ?? null,
          sourceId: a.source_id,
        };
      }),
      mergeProvenance: merges.map((m) => ({
        mergeId: m.id,
        absorbedId: m.merged_id,
        score: m.score,
        decidedBy: m.decided_by,
        decidedAt: m.decided_at,
      })),
      sources: loadSources(db, directIds, subjectRefs),
    };
  });
}

/**
 * Name search through the entity-resolution blocking index. Unions EVERY key blockingKeys()
 * emits — matching only the first would miss the surname-first/given-name-first pair the blocking
 * design exists to catch — and drops the UNPARSEABLE_KEY bucket, which is a junk drawer, not a match.
 *
 * One correlated subquery picks the newest candidacy per person, so a list row costs no extra round
 * trip, and each row carries its own source id (P2: a name that leaves this process is cited).
 */
export function searchPersons(db: DatabaseSync, term: string, limit = 20): PersonRow[] {
  const keys = blockingKeys(term).filter((k) => k !== UNPARSEABLE_KEY);
  if (keys.length === 0) return [];
  return read(() =>
    all<PersonListSql>(
      db,
      `SELECT p.id, p.canonical_name, p.sex, p.review_state,
              (SELECT COUNT(*) FROM candidacy x WHERE x.person_id = p.id) AS candidacy_count,
              (SELECT a.source_id FROM person_alias a
                 WHERE a.person_id = p.id AND a.source_id IS NOT NULL
                 ORDER BY a.source_id LIMIT 1) AS name_source_id,
              latest.election_id, latest.place_name, latest.party_short_name,
              latest.status, latest.votes, latest.vote_share, latest.is_winner,
              latest.result_source_id
         FROM person p
         LEFT JOIN (
           SELECT ca.person_id, c.election_id, pl.canonical_name AS place_name,
                  pt.short_name AS party_short_name, ca.status,
                  r.votes, r.vote_share, r.is_winner, r.source_id AS result_source_id,
                  ROW_NUMBER() OVER (PARTITION BY ca.person_id
                                     ORDER BY c.election_id DESC, c.id) AS rn
             FROM candidacy ca
             JOIN contest c ON c.id = ca.contest_id
             JOIN place_version pv ON pv.id = c.place_version_id
             JOIN place pl ON pl.id = pv.place_id
             LEFT JOIN party_version pver ON pver.id = ca.party_version_id
             LEFT JOIN party pt ON pt.id = pver.party_id
             LEFT JOIN result r ON r.candidacy_id = ca.id AND r.revision = 0
         ) latest ON latest.person_id = p.id AND latest.rn = 1
        WHERE p.id IN (SELECT person_id FROM person_alias WHERE norm_key IN (${marks(keys.length)}))
        ORDER BY p.id
        LIMIT ?`,
      ...keys,
      Math.min(Math.max(limit, 1), 200),
    ).map(toPersonRow),
  );
}

type PersonListSql = {
  id: string;
  canonical_name: string;
  sex: Sex | null;
  review_state: ReviewState;
  candidacy_count: number;
  election_id: string | null;
  place_name: string | null;
  party_short_name: string | null;
  status: CandidacyStatus | null;
  votes: number | null;
  vote_share: number | null;
  is_winner: number | null;
  result_source_id: string | null;
  name_source_id: string | null;
};

function toPersonRow(r: PersonListSql): PersonRow {
  return {
    id: r.id,
    canonicalName: r.canonical_name,
    sex: r.sex,
    reviewState: r.review_state,
    latestElectionId: r.election_id,
    latestYear: r.election_id === null ? null : yearOf(r.election_id),
    latestPlaceName: r.place_name,
    latestPartyShortName: r.party_short_name,
    latestStatus: r.status,
    latestVotes: counted(r.votes),
    latestVoteShare: counted(r.vote_share),
    isWinner: r.is_winner === 1,
    candidacyCount: r.candidacy_count,
    sourceId: r.result_source_id ?? r.name_source_id,
  };
}

/**
 * A counted figure, or null when nothing was counted. The 2026 import writes votes = 0 and
 * vote_share = 0 for all 293 declared seats it never got counts for, so a 0 here means "not
 * reported", and publishing "0 votes" for a sitting winner would be a lie. Mapped once, in the
 * repo, so the API and the page cannot disagree about the same row.
 * ponytail: registry-wide rule keyed on the value, not on the election — revisit the day a real
 * zero-vote result is ingested (no candidate in this corpus has ever polled 0).
 */
export function counted(n: number | null): number | null {
  return n === null || n === 0 ? null : n;
}

export function parseNames(json: string): Names {
  try {
    const v: unknown = JSON.parse(json);
    return typeof v === "object" && v !== null ? (v as Names) : {};
  } catch {
    return {};
  }
}

export function pct(part: number | null, whole: number | null): number | null {
  if (part === null || whole === null || whole === 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}
