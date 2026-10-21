// What a test that reads the dev registry asks of it. Imported by tests and by nothing that ships.
//
// The place resolver tells a seat's current version from its earlier ones one of two ways (`currentSeats`,
// place-resolve.ts): by migration 017's `voting_epoch` view when the registry has it, and by the newest version of each
// place when it does not. A test that picks its subject with SQL must pick by the same rule on whichever registry it
// meets, and a test in place-resolve.test.ts holds this to the loader.

import type { DatabaseSync } from "node:sqlite";
import { get } from "../db/index.ts";

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
