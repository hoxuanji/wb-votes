// What a test that reads the dev registry asks of it. Imported by tests and by nothing that ships.
//
// The place resolver tells a seat's current version from its earlier ones one of two ways (`currentSeats`,
// place-resolve.ts): by migration 017's `voting_epoch` view when the registry has it, and by the newest version of each
// place when it does not. A test that picks its subject with SQL must pick by the same rule on whichever registry it
// meets, and a test in place-resolve.test.ts holds this to the loader.

import type { DatabaseSync } from "node:sqlite";
import { all, get } from "../db/index.ts";
import { migrate } from "../db/migrate.ts";

/** SQL that is true of a `place_version` row, aliased `a`, when the resolver calls that seat version current in `db`. */
export function currentSeat(db: DatabaseSync, a: string): string {
  if (get(db, `SELECT 1 FROM sqlite_master WHERE type = 'view' AND name = 'voting_epoch'`) !== undefined) {
    return `EXISTS (SELECT 1 FROM voting_epoch ve
                     WHERE ve.jurisdiction_id = ${a}.jurisdiction_id AND ve.house = ${a}.kind AND ve.epoch_id = ${a}.epoch_id)`;
  }
  return `${a}.id = (SELECT n.id FROM place_version n JOIN boundary_epoch ne ON ne.id = n.epoch_id
                      WHERE n.place_id = ${a}.place_id AND n.kind IN ('ac', 'pc')
                      ORDER BY ne.effective_from DESC, n.id DESC LIMIT 1)`;
}

/**
 * A registry built here, for the shape of seat the live registry may not hold: a West Bengal assembly seat (Bishnupur, number 154) whose three earlier
 * elections each have a contest and nobody in it, and whose 2026 contest has one candidate, named elected and declared the winner with a margin and no
 * counts, as 2026's source gave them. A registry built before the seed was complete held three such seats and one built from the committed seed holds none,
 * because the seed has every candidate of those elections: a test whose premise is "a contest with nobody in it" must not depend on which of the two it
 * meets. `db` is empty (a fresh file or ":memory:"); the seat's version id is returned for a reader that wants it, and the page is at `wb/assembly/154`.
 */
export function seatOfEmptyContests(db: DatabaseSync): { versionId: number } {
  migrate(db, "2026-08-12T00:00:00.000Z");
  db.exec(`
    INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('e1','Delimitation','2008-02-19');
    INSERT INTO source (id, kind, publisher, title, retrieved_at, doc_hash) VALUES ('s1','static_module','P','Results','2026-08-12','sha256:0');
    INSERT INTO place (id, kind, canonical_name) VALUES ('in','nation','India');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('wb','state','West Bengal','in');
    INSERT INTO place (id, kind, canonical_name, parent_id) VALUES ('wb.ac.154','ac','Bishnupur','wb');
    INSERT INTO place_version (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, reservation)
      VALUES (1,'wb.ac.154','wb','ac','e1',154,'Bishnupur','sc');
    INSERT INTO party (id, name, short_name) VALUES ('AITC','All India Trinamool Congress','TMC');
    INSERT INTO party_version (id, party_id, valid_from, name) VALUES (1,'AITC','1998-01-01','All India Trinamool Congress');
    INSERT INTO person (id, canonical_name, created_at) VALUES ('p1','DILIP MONDAL','2026-08-12');
  `);
  const election = db.prepare(
    `INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle, house, year, occurrence)
     VALUES (?, 'assembly', 'state', 'wb', 'e1', ?, 'declared', 'ac', ?, 1)`,
  );
  const contest = db.prepare(`INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES (?, ?, 1, 'declared')`);
  for (const year of [2011, 2016, 2021, 2026]) {
    election.run(`wb-assembly-${year}`, `WB ${year}`, year);
    contest.run(`c${year}`, `wb-assembly-${year}`);
  }
  db.exec(`
    INSERT INTO candidacy (id, contest_id, person_id, party_version_id, status) VALUES ('d2026','c2026','p1',1,'elected');
    INSERT INTO result (contest_id, candidacy_id, revision, votes, "rank", is_winner, margin, source_id, ingested_at)
      VALUES ('c2026','d2026',0,NULL,1,1,36925,'s1','2026-08-12');
  `);
  return { versionId: 1 };
}

/**
 * Where a seat's margin stands among its election's, from the rows and not through the readers a page is built from: a contest is ranked when it has a
 * declared winner and a margin (the two counts' difference when both are held, else the one the source declared), closest first by votes, ties by seat
 * number, within its state and election. A page prints this as "47th closest of 275", and what the registry holds decides both numbers: the committed
 * seed holds all 294 of West Bengal's 2021 seats and a registry built before it was complete held 288, so a rank written down as a constant was right for
 * one and wrong for the other. Null where the seat has no rankable margin in the election.
 */
export function marginRankBySql(db: DatabaseSync, placeId: string, electionId: string, stateId = "wb"): { rank: number; of: number } | null {
  const rows = all<{ placeId: string }>(
    db,
    `SELECT pv.place_id AS placeId
       FROM contest c
       JOIN place_version pv ON pv.id = c.place_version_id
       JOIN result w ON w.contest_id = c.id AND w.revision = 0 AND w.is_winner = 1
       LEFT JOIN result s ON s.contest_id = c.id AND s.revision = 0 AND s."rank" = 2
      WHERE c.election_id = ? AND pv.jurisdiction_id = ? AND (CASE WHEN w.votes IS NOT NULL AND s.votes IS NOT NULL THEN 1 ELSE w.margin IS NOT NULL END)
      ORDER BY ABS(CASE WHEN w.votes IS NOT NULL AND s.votes IS NOT NULL THEN w.votes - s.votes ELSE w.margin END), COALESCE(pv.number, 1000000), pv.id`,
    electionId,
    stateId,
  );
  const at = rows.findIndex((r) => r.placeId === placeId);
  return at < 0 ? null : { rank: at + 1, of: rows.length };
}
