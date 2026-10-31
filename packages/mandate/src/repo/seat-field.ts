// Everyone who stood in a seat, election by election, with what each declared about themselves: the data of the seat page's panels and roster.
//
// The seat's history (seat-history.ts) is built from RESULT rows, so an election that published no counts shows only its winner. The people who
// stood are CANDIDACIES, and the registry holds all of them with party, age, education, and the affidavit the source filed (assets, liabilities,
// occupation, cases declared pending), so this reads them from there.
//
// WHAT IS NEVER SET HERE: a rank, a share or a vote count for a candidate whose election published none. `rank`, `votes` and `share` are null for
// every 2026 candidate, and the winner is the one `result.is_winner` names (never a candidacy's status, which is a claim: one seat's candidacy says
// elected and has no result row at all, and that is carried apart as `namedAsElected`).
//
// IDENTITY IS RESOLVED ONLY INSIDE A SEAT. `elsewhere` is the same `person_id` at the seat's other elections; two records the registry has not joined
// are two people here, and `lookAlikes` says that records with similar names exist and nothing more.

import type { DatabaseSync } from "node:sqlite";
import { chronoDesc, facetOf } from "../core/election-kind.ts";
import { all } from "../db/index.ts";
import { displayName } from "./display-name.ts";
import { read, yearOf } from "./index.ts";
import { counted } from "./person.ts";
import { CURRENT_REVISION, partyRef } from "./seat-results.ts";
import type { PartyRef } from "./seat-results.ts";

export type Elsewhere = { year: number; contestId: string; rank: number | null; won: boolean };

export type FieldCandidate = {
  candidacyId: string;
  personId: string;
  name: string;
  /** Title Case, parentage cut: for display only. The registry's own spelling is `name`. */
  display: string;
  party: PartyRef;
  /** The source's rank, or null where the election published none. */
  rank: number | null;
  votes: number | null;
  /** Percent of the votes polled: the published share, else votes over votes polled; null where neither exists. */
  share: number | null;
  /** The declared winner: the `is_winner` row, never the candidacy's status. */
  isWinner: boolean;
  /** The candidacy record says elected but no result row declares a winner for the contest. */
  namedAsElected: boolean;
  age: number | null;
  education: string | null;
  occupation: string | null;
  assets: number | null;
  liabilities: number | null;
  cases: number | null;
  /** The affidavit's own claim that they sat as the member; a claim, so it is worded as one. */
  sittingMember: boolean;
  /** The same person at this seat's other elections, oldest first. */
  elsewhere: Elsewhere[];
};

export type FieldElection = {
  contestId: string;
  electionId: string;
  year: number;
  byPoll: boolean;
  /** Candidate vote counts; a declared winner and no counts; candidates and neither; or nobody. */
  evidence: "counted" | "declared" | "roster" | "none";
  votesPolled: number | null;
  /** The date the affidavits of this election were sworn, where the registry holds any (the claims' `as_of`). */
  declaredAsOf: string | null;
  /** Winner first, then by the source's rank where it has one, then A to Z. */
  candidates: FieldCandidate[];
  winner: FieldCandidate | null;
  namedAsElected: FieldCandidate | null;
  /** The winner's own declared margin (`result.margin`), which needs no counts. */
  declaredMargin: number | null;
};

/** Records of one seat whose names are alike but whose `person_id`s differ: nothing joins them, and nothing says they are one person. */
export type LookAlike = { name: string; records: { personId: string; name: string; years: number[] }[] };

export type SeatField = { elections: FieldElection[]; lookAlikes: LookAlike[] };

type Row = {
  contestId: string;
  electionId: string;
  house: string;
  kind: string;
  voters: number | null;
  candidacyId: string | null;
  personId: string | null;
  status: string | null;
  age: number | null;
  education: string | null;
  raw: string | null;
  name: string | null;
  partyId: string | null;
  shortName: string | null;
  partyName: string | null;
  rank: number | null;
  votes: number | null;
  voteShare: number | null;
  margin: number | null;
  isWinner: number | null;
};

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** A claim's value: the JSON the registry stores it as, or null where it is not valid JSON. */
function valueOf(raw: string): string | number | null {
  try {
    const v: unknown = JSON.parse(raw);
    return typeof v === "string" || typeof v === "number" ? v : null;
  } catch {
    return null;
  }
}

/** The words of a name, lower case, letters only, for finding records that read alike. */
const words = (name: string): string[] => displayName(name).toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);

export function readSeatField(db: DatabaseSync, versionId: number): SeatField {
  return read(() => {
    const rows = all<Row>(
      db,
      `SELECT c.id AS contestId, c.election_id AS electionId, e.house AS house, e.kind AS kind, t.voters AS voters,
              ca.id AS candidacyId, ca.person_id AS personId, ca.status AS status, ca.age_declared AS age,
              ca.education_declared AS education, ca.party_raw AS raw,
              per.canonical_name AS name, pt.id AS partyId, pt.short_name AS shortName, pt.name AS partyName,
              r."rank" AS rank, r.votes AS votes, r.vote_share AS voteShare, r.margin AS margin, r.is_winner AS isWinner
         FROM contest c
         JOIN election e ON e.id = c.election_id
         LEFT JOIN turnout t ON t.contest_id = c.id AND t.scope = 'contest'
         LEFT JOIN candidacy ca ON ca.contest_id = c.id
         LEFT JOIN person per ON per.id = ca.person_id
         LEFT JOIN party_version pver ON pver.id = ca.party_version_id
         LEFT JOIN party pt ON pt.id = pver.party_id
         LEFT JOIN result r ON r.candidacy_id = ca.id AND r.revision = ${CURRENT_REVISION}
        WHERE c.place_version_id = ?
        ORDER BY ${chronoDesc()}, c.id`,
      versionId,
    );

    // The affidavit and the self-declared facts are claims: on the candidacy for the figures of one filing, on the person for the rest, each with
    // the year it was made in, so a 2026 figure is never shown against a 2021 election.
    const refs = [...new Set(rows.flatMap((r) => (r.candidacyId === null ? [] : [`candidacy:${r.candidacyId}`, `person:${r.personId}`])))];
    const claims = new Map<string, string | number>();
    const asOf = new Map<number, string>();
    for (let i = 0; i < refs.length; i += 400) {
      const chunk = refs.slice(i, i + 400);
      for (const c of all<{ subject_ref: string; predicate: string; object_value: string; as_of: string | null }>(
        db,
        `SELECT subject_ref, predicate, object_value, as_of FROM claim
          WHERE subject_ref IN (${chunk.map(() => "?").join(",")})
            AND predicate IN ('affidavit.assets.total', 'affidavit.liabilities.total', 'pending_cases_declared',
                              'occupation_declared', 'education_declared', 'age_declared', 'incumbent_years_declared')`,
        ...chunk,
      )) {
        const v = valueOf(c.object_value);
        if (v !== null) claims.set(`${c.subject_ref}|${c.predicate}|${c.as_of === null ? "" : yearOf(c.as_of)}`, v);
        if (v !== null && c.as_of !== null && (asOf.get(yearOf(c.as_of)) ?? "") < c.as_of) asOf.set(yearOf(c.as_of), c.as_of);
      }
    }

    const byContest = new Map<string, Row[]>();
    for (const r of rows) byContest.set(r.contestId, [...(byContest.get(r.contestId) ?? []), r]);
    const yearOfContest = new Map(rows.map((r) => [r.contestId, yearOf(r.electionId)]));

    // Where each person stood in this seat, for the trails.
    const stood = new Map<string, Elsewhere[]>();
    for (const r of rows) {
      if (r.personId === null) continue;
      stood.set(r.personId, [
        ...(stood.get(r.personId) ?? []),
        { year: yearOfContest.get(r.contestId) ?? 0, contestId: r.contestId, rank: r.rank, won: r.isWinner === 1 },
      ]);
    }

    const elections: FieldElection[] = [...byContest.entries()].map(([contestId, group]) => {
      const head = group[0]!;
      const year = yearOf(head.electionId);
      const polled = head.voters !== null && head.voters > 0 ? head.voters : null;
      const people = group.filter((r) => r.candidacyId !== null && r.personId !== null && r.name !== null);
      const decided = people.some((r) => r.isWinner === 1);
      const candidates: FieldCandidate[] = people.map((r) => {
        const cand = `candidacy:${r.candidacyId}`;
        const per = `person:${r.personId}`;
        const claim = (ref: string, predicate: string): string | number | null => claims.get(`${ref}|${predicate}|${year}`) ?? null;
        const num = (v: string | number | null): number | null => (typeof v === "number" ? v : typeof v === "string" && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
        const votes = counted(r.votes);
        const published = counted(r.voteShare);
        const age = r.age ?? num(claim(per, "age_declared"));
        const education = r.education ?? claim(per, "education_declared");
        const occupation = claim(per, "occupation_declared");
        return {
          candidacyId: r.candidacyId as string,
          personId: r.personId as string,
          name: r.name as string,
          display: displayName(r.name as string),
          party: partyRef({ id: r.partyId, shortName: r.shortName, name: r.partyName, raw: r.raw }),
          rank: r.rank,
          votes,
          share: published ?? (votes !== null && polled !== null ? (100 * votes) / polled : null),
          isWinner: r.isWinner === 1,
          namedAsElected: !decided && r.status === "elected",
          age,
          education: typeof education === "string" && education !== "" ? education : null,
          occupation: typeof occupation === "string" && occupation !== "" ? occupation : null,
          assets: num(claim(cand, "affidavit.assets.total")),
          liabilities: num(claim(cand, "affidavit.liabilities.total")),
          cases: num(claim(per, "pending_cases_declared")),
          sittingMember: claim(cand, "incumbent_years_declared") !== null,
          elsewhere: (stood.get(r.personId as string) ?? [])
            .filter((e) => e.contestId !== contestId)
            .sort((a, b) => a.year - b.year),
        };
      });
      candidates.sort(
        (a, b) =>
          Number(b.isWinner) - Number(a.isWinner) ||
          (a.rank === null ? 1 : 0) - (b.rank === null ? 1 : 0) ||
          (a.rank ?? 0) - (b.rank ?? 0) ||
          compare(a.display, b.display),
      );
      const counts = candidates.some((c) => c.votes !== null || c.share !== null);
      const winner = candidates.find((c) => c.isWinner) ?? null;
      return {
        contestId,
        electionId: head.electionId,
        year,
        byPoll: facetOf(head.house, head.kind).fill === "bypoll",
        evidence: counts ? "counted" : winner !== null ? "declared" : candidates.length > 0 ? "roster" : "none",
        votesPolled: polled,
        declaredAsOf: candidates.some((c) => c.assets !== null || c.cases !== null || c.age !== null) ? (asOf.get(year) ?? null) : null,
        candidates,
        winner,
        namedAsElected: candidates.find((c) => c.namedAsElected) ?? null,
        declaredMargin: people.find((r) => r.isWinner === 1)?.margin ?? null,
      };
    });

    // Look-alikes: two records, at different elections, whose first two words agree. Said as records that exist, never as one person.
    const groups = new Map<string, Map<string, { name: string; years: Set<number> }>>();
    for (const e of elections) {
      for (const c of e.candidates) {
        const w = words(c.name);
        if (w.length < 2) continue;
        const key = w.slice(0, 2).join(" ");
        const g = groups.get(key) ?? new Map();
        const rec = g.get(c.personId) ?? { name: c.display, years: new Set<number>() };
        rec.years.add(e.year);
        g.set(c.personId, rec);
        groups.set(key, g);
      }
    }
    const lookAlikes: LookAlike[] = [...groups.values()]
      .filter((g) => g.size >= 2)
      .map((g) => ({
        name: [...g.values()][0]!.name,
        records: [...g.entries()].map(([personId, r]) => ({ personId, name: r.name, years: [...r.years].sort((a, b) => a - b) })),
      }))
      // Two records that stood at the same election are two people on one ballot; only records that never did could be one person.
      .filter((l) => l.records.some((a, i) => l.records.some((b, j) => i < j && a.years.every((y) => !b.years.includes(y)))))
      .sort((a, b) => compare(a.name, b.name));

    return { elections, lookAlikes };
  });
}
