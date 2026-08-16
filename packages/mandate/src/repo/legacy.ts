// Resolvers for the WB Votes URLs that MANDATE has replaced. One function per old route shape.
//
// These live here rather than inline in the page files for the reason cycle 2 learned the hard way:
// logic inside an app-router page that webpack cannot statically see compiles to `undefined` and
// returns a 500 for every slug, while the build still prints "Compiled successfully".
//
// The constituency mapping goes through `place_version.number`, the AC number, NOT through the
// numeric tail of the old id. `c0001` and `wb.ac.001` do happen to agree on all 294 seats — that was
// measured, not assumed — but agreeing today is not a mapping, and a delimitation that renumbers a
// seat would silently redirect readers to the wrong constituency.

import type { DatabaseSync } from "node:sqlite";
import { constituencyHref } from "./routes.ts";
import { get } from "../db/index.ts";
import { read } from "./index.ts";

/** `c0042` -> 42. Null for anything that is not that shape, including `c0000`. */
export function acNumber(legacyId: string): number | null {
  const m = /^c0*(\d{1,3})$/i.exec(legacyId.trim());
  if (m?.[1] === undefined) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 999 ? n : null;
}

/** "Cooch Behar" -> "cooch-behar". Duplicated from situation.ts on purpose: that one is a page
 *  concern and this one is a redirect concern, and a shared slug helper is the kind of thing that
 *  later gets "improved" for one caller and breaks the other's URLs. */
function slug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type PathSql = { ac: string; district: string | null };

/**
 * `/constituency/c0001` -> `/pl/wb/cooch-behar/mekliganj`.
 *
 * The newest boundary epoch wins: a seat number belongs to a delimitation, so resolving without
 * ordering by epoch would return whichever row sqlite happened to reach first once a second epoch
 * exists.
 */
export function placePathForLegacyId(db: DatabaseSync, legacyId: string): string | null {
  const n = acNumber(legacyId);
  if (n === null) return null;
  return read(() => {
    const row = get<PathSql>(
      db,
      `SELECT ac.canonical_name AS ac, d.canonical_name AS district
         FROM place_version pv
         JOIN place ac      ON ac.id = pv.place_id
         LEFT JOIN place d  ON d.id = ac.parent_id
        WHERE pv.number = ? AND ac.kind = 'ac'
        ORDER BY pv.epoch_id DESC
        LIMIT 1`,
      n,
    );
    if (row === undefined || row.district === null) return null;
    // Canonical, so an old WB Votes id redirects ONCE rather than into the compatibility layer and out again.
    // The previous product held West Bengal ASSEMBLY seats only, which is why the body is known here.
    return constituencyHref({ jurisdictionId: "wb", kind: "ac", canonicalName: row.ac });
  });
}

/**
 * `/candidate/wb26_52` -> `/p/hiten-barman-ca794e`.
 *
 * `person_identifier` carries the affidavit id that the old app used as its primary key, for all
 * 2,920 of them. Resolution survives entity resolution: a merge rewrites the identifier's
 * person_id, so an old link follows the person to whichever record absorbed them.
 */
export function personForMynetaId(db: DatabaseSync, mynetaId: string): string | null {
  const v = mynetaId.trim();
  if (v === "") return null;
  return read(
    () =>
      get<{ person_id: string }>(
        db,
        `SELECT person_id FROM person_identifier WHERE scheme = 'myneta_id' AND value = ?`,
        v,
      )?.person_id ?? null,
  );
}

/**
 * `/mla/c0001` -> the sitting member's person page.
 *
 * The old route keyed an MLA profile by *constituency*, so the equivalent is "whoever won the most
 * recent election here". Ordering is on election_id descending, which sorts correctly because every
 * id ends in its year.
 */
export function sittingMemberForLegacyId(db: DatabaseSync, legacyId: string): string | null {
  const n = acNumber(legacyId);
  if (n === null) return null;
  return read(
    () =>
      get<{ person_id: string }>(
        db,
        `SELECT ca.person_id
           FROM contest c
           JOIN election e       ON e.id = c.election_id
           JOIN place_version pv ON pv.id = c.place_version_id
           JOIN result r         ON r.contest_id = c.id AND r.is_winner = 1 AND r.revision = 0
           JOIN candidacy ca     ON ca.id = r.candidacy_id
          WHERE pv.number = ?
          ORDER BY e.year DESC, e.polling_month DESC, e.occurrence DESC
          LIMIT 1`,
        n,
      )?.person_id ?? null,
  );
}
