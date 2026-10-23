// A party's open-ended version, for an importer that needs one to bind a candidacy to.
//
// The registry keeps at most one party_version with no end date per party (invariant
// `party_version_no_two_open_ended_rows`, and the overlap view behind `party_version_no_overlapping_validity`).
// The seed writes one for every party it names, from 2011-01-01. An importer that wrote its own beside it, from
// a different date, left every such party with two open-ended rows that overlap, and bound its candidacies to
// whichever one a read-back without an ORDER BY returned first.
//
// Not exported through db/index.ts, which the Next bundle imports and the app never writes through.

import type { DatabaseSync } from "node:sqlite";
import { get } from "../db/index.ts";

/**
 * The id of `partyId`'s open-ended version. The party's own is returned as it is and never rewritten: a version
 * another source wrote carries the party's full name and its symbol, and the label an importer holds is only an
 * abbreviation. Only a party with no open-ended version gets one written, from `validFrom`.
 *
 * Where a registry already holds two, the one with the earliest `validFrom` is returned and none is added. That
 * is the row the importer's read-back used to find, so a re-import onto such a registry binds what it bound
 * before; repairing the second row is a rebuild's work and not this function's.
 *
 * Throws, writing nothing, when the party has a closed version that starts on `validFrom`: its natural key is
 * taken, and an open-ended version on the same date would overlap it.
 */
export function partyVersion(
  db: DatabaseSync,
  partyId: string,
  v: { validFrom: string; name: string; symbolId?: string | null },
): number {
  const open = get<{ id: number }>(
    db,
    "SELECT id FROM party_version WHERE party_id = ? AND valid_to IS NULL ORDER BY valid_from, id LIMIT 1",
    partyId,
  );
  if (open !== undefined) return open.id;
  const made = get<{ id: number }>(
    db,
    "INSERT INTO party_version (party_id, valid_from, valid_to, name, symbol_id) VALUES (?, ?, NULL, ?, ?) RETURNING id",
    partyId,
    v.validFrom,
    v.name,
    v.symbolId ?? null,
  );
  if (made === undefined) throw new Error(`party_version insert for ${partyId} returned no id`);
  return made.id;
}
