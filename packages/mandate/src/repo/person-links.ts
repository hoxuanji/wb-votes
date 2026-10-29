// Records the registry thinks may be one person, said as a doubt and never as a fact.
//
// `person_merge_candidate` holds 4,183 pending pairs, and most are different people with alike names. The pairs worth saying are the ones with the
// strongest evidence the registry has: pending, a score of at least 0.7, and a seat in common (`constituencyOverlap`), because the same name at the
// same seat is the case a reader would otherwise count as two people. Nothing here merges anything; nobody has decided.

import type { DatabaseSync } from "node:sqlite";
import { all } from "../db/index.ts";
import { read } from "./index.ts";
import { partyRef } from "./seat-results.ts";

export const SAME_SEAT_SCORE = 0.7;

export type SamePerson = {
  otherId: string;
  name: string;
  score: number;
  candidacies: { year: number; partyKey: string | null; partyLabel: string | null; status: string; rank: number | null }[];
};

export function possibleSamePerson(db: DatabaseSync, personId: string): SamePerson[] {
  return read(() => {
    const pairs = all<{ other: string; score: number }>(
      db,
      `SELECT CASE WHEN person_a_id = ? THEN person_b_id ELSE person_a_id END AS other, score
         FROM person_merge_candidate
        WHERE state = 'pending' AND score >= ? AND json_extract(evidence, '$.constituencyOverlap') = 1
          AND (person_a_id = ? OR person_b_id = ?)
        ORDER BY score DESC, other`,
      personId,
      SAME_SEAT_SCORE,
      personId,
      personId,
    );
    if (pairs.length === 0) return [];
    const ids = pairs.map((p) => p.other);
    const rows = all<{
      personId: string;
      name: string;
      year: number;
      partyId: string | null;
      shortName: string | null;
      partyName: string | null;
      raw: string | null;
      status: string;
      rank: number | null;
    }>(
      db,
      `SELECT ca.person_id AS personId, per.canonical_name AS name, e.year AS year, pt.id AS partyId, pt.short_name AS shortName,
              pt.name AS partyName, ca.party_raw AS raw, ca.status AS status, r."rank" AS rank
         FROM candidacy ca
         JOIN person per ON per.id = ca.person_id
         JOIN contest c ON c.id = ca.contest_id
         JOIN election e ON e.id = c.election_id
         LEFT JOIN party_version pver ON pver.id = ca.party_version_id
         LEFT JOIN party pt ON pt.id = pver.party_id
         LEFT JOIN result r ON r.candidacy_id = ca.id AND r.revision = 0
        WHERE ca.person_id IN (${ids.map(() => "?").join(",")})
        ORDER BY e.year, c.id`,
      ...ids,
    );
    return pairs.map((p) => {
      const mine = rows.filter((r) => r.personId === p.other);
      return {
        otherId: p.other,
        name: mine[0]?.name ?? p.other,
        score: p.score,
        candidacies: mine.map((r) => {
          const party = partyRef({ id: r.partyId, shortName: r.shortName, name: r.partyName, raw: r.raw });
          return { year: r.year, partyKey: party.key, partyLabel: party.label, status: r.status, rank: r.rank };
        }),
      };
    });
  });
}
