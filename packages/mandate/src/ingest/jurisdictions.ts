// The place tree's top: India, and the 28 states and 8 union territories under it.
//
// Every other place, epoch and election points at one of these rows, so an importer that writes seats or
// elections needs them first. wb-static was their only writer, which made it a hidden prerequisite of every
// other importer: Lokdhaba on a migrated database it had not filled failed on `place.parent_id`. They are
// reference data (ingest/india.ts), so this writes them from that table and any importer may call it.

import type { DatabaseSync } from "node:sqlite";
import type { Param } from "../db/index.ts";
import { putRows } from "../db/write.ts";
import { JURISDICTIONS } from "./india.ts";

/** India. The registry had no `nation` row: `wb` was a root with no parent, which made "national
 *  platform" true of the DDL and false of the data. A Lok Sabha election's jurisdiction is the union,
 *  so it needs somewhere to point. */
export const NATION_PLACE = "in";

/**
 * Make sure the registry holds a `place` row for India and for each of the 36 jurisdictions, from the table in
 * ingest/india.ts. Returns the number of rows written.
 *
 * Every call writes all of them, as wb-static always did: the table is the authority, so a row that has drifted
 * from it is put back, and a second call changes nothing.
 */
export function ensureJurisdictions(db: DatabaseSync): number {
  // A nation, and the states and union territories that hang off it. `place.kind` has permitted 'nation' and
  // 'pc' since 001 — the DDL was national from the start and nothing had ever exercised it.
  const rows: Param[][] = [[NATION_PLACE, "nation", null, "India", '{"hi":"भारत"}', null, null]];
  // All 36 jurisdictions, not just the one with data. A state with no results is still a real place and
  // an honest denominator; loading only West Bengal is what made "1 of 36" unverifiable. lgd_code is the
  // key every Indian government dataset joins on, so it is stored now rather than backfilled later.
  for (const j of JURISDICTIONS) {
    const names = j.id === "wb" ? '{"bn":"পশ্চিমবঙ্গ"}' : "{}";
    rows.push([j.id, j.kind, NATION_PLACE, j.name, names, j.lgd, null]);
  }
  return putRows(db, "place", ["id", "kind", "parent_id", "canonical_name", "names", "lgd_code", "eci_code"], ["id"], rows);
}
