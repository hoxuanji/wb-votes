// What the product can draw, and what it cannot — measured, never typed.
//
// Phase 3 stage 1. The brief asks for a coverage matrix over every jurisdiction with election data:
// does constituency geometry exist, for which house, for which election, under which boundary epoch,
// from which source, and can it be linked to results at all. This module answers those questions FROM
// THE REGISTRY, so the answer moves when the data moves and a stale table cannot be committed.
//
// ── THE UNIT IS (JURISDICTION, HOUSE, EPOCH), AND THAT IS THE WHOLE POINT ──
//
// Not "does Karnataka have a map". A boundary epoch is the thing geometry belongs to: Karnataka's 2023
// assembly result sits on a `delim-2008` constituency and its 1999 result sits on a `delim-1976` one, and
// those are different polygons of the same name. So a row here is one epoch of one house of one
// jurisdiction, and `seats` counts the place_versions that actually carry a contest — the seats the product
// would have to draw, rather than every version the registry has ever recorded.
//
// ── FOUR STATES, AND NEVER "SILENTLY ABSENT" ──
//
//   COMPLETE     every seat this epoch contests has a polygon
//   PARTIAL      some do
//   UNRESOLVED   the registry holds geometry for this jurisdiction and house in SOME epoch, and none for
//                this one — the geometry exists and the LINK to this epoch is what could not be made
//   UNAVAILABLE  the registry holds no geometry for this jurisdiction and house at all
//
// UNRESOLVED vs UNAVAILABLE is the distinction worth having, and both are derived from the registry rather
// than declared. "We have no map for Jharkhand" and "we have Jharkhand's pre-2008 boundaries and will not
// draw a 2019 result on them" are different admissions, and only the second is work waiting for someone.

import type { DatabaseSync } from "node:sqlite";
import { all } from "../../db/index.ts";

/** One (jurisdiction, house, epoch) — the unit a polygon can belong to. */
export type CoverageRow = {
  jurisdictionId: string;
  jurisdictionName: string;
  house: "ac" | "pc";
  epochId: string;
  /** Election events whose contests sit in this epoch, and the newest one's year. */
  elections: number;
  latestYear: number | null;
  /** Whether any of those elections is a full election rather than only by-polls. */
  fullElections: number;
  /** Seats this epoch actually contests — the denominator the map has to fill. */
  seats: number;
  /** Seats with a declared winner. A seat with no result is not a geometry problem. */
  decided: number;
  /**
   * Seats the registry holds a polygon for IN ONE COORDINATE SPACE — the space most of them are in.
   *
   * Not simply the row count. `place_geometry.view_box` is per row because two geometry sources need not
   * share a projection, and a map can only draw the polygons that agree about the plane. West Bengal held
   * 276 constituencies from a published boundary set and 31 left over from a repo module in the old
   * 400x580 frame; counting 307 would have reported COMPLETE for a map that draws 276.
   */
  drawn: number;
  /** Polygons in some other frame. Held, and undrawable beside the rest. */
  otherFrames: number;
  /** Distinct projection frames among those polygons. More than one cannot be drawn together. */
  frames: string[];
  /** Publishers behind those polygons, from `source`. */
  publishers: string[];
  status: "COMPLETE" | "PARTIAL" | "UNRESOLVED" | "UNAVAILABLE";
  /**
   * The epoch this jurisdiction's newest election of this house was held under — what a release is judged
   * on. Derived, because "delim-2008 is current" is false for Assam and Jammu & Kashmir, and hardcoding it
   * would print that falsehood on the front page.
   */
  currentEpoch: boolean;
};

/** One election, and whether the map can draw it. Answers the brief's "for which election". */
export type ElectionCoverage = {
  electionId: string;
  jurisdictionId: string;
  house: string;
  kind: string;
  year: number;
  epochs: string[];
  seats: number;
  drawn: number;
};

export type Coverage = {
  rows: CoverageRow[];
  elections: ElectionCoverage[];
  totals: {
    jurisdictions: number;
    /** Groups, and how many of them are each status. */
    groups: number;
    complete: number;
    partial: number;
    unresolved: number;
    unavailable: number;
    /** Seats, summed over groups. The headline: how much of India the product can draw. */
    seats: number;
    drawn: number;
    /** Only the current epoch of each house — what a release is actually judged on. */
    currentSeats: number;
    currentDrawn: number;
  };
};

type GroupSql = {
  jurisdictionId: string;
  jurisdictionName: string;
  house: "ac" | "pc";
  epochId: string;
  elections: number;
  latestYear: number | null;
  fullElections: number;
  seats: number;
  decided: number;
  held: number;
  drawn: number;
  mainFrame: string | null;
  frames: string | null;
  publishers: string | null;
};

/**
 * The matrix.
 *
 * One query per shape rather than one query with three left joins: counting contests, geometries and
 * elections in the same SELECT multiplies the rows and every count comes back wrong. That mistake was
 * made once already in this phase, on this data, and it produced 941 Karnataka constituencies.
 */
export function geometryCoverage(db: DatabaseSync): Coverage {
  const groups = all<GroupSql>(
    db,
    `WITH seat AS (
       SELECT DISTINCT pv.id AS version_id, pv.jurisdiction_id AS j, pv.kind AS house, pv.epoch_id AS epoch
         FROM contest c JOIN place_version pv ON pv.id = c.place_version_id
        WHERE pv.kind IN ('ac','pc')
     )
     SELECT s.j AS jurisdictionId, p.canonical_name AS jurisdictionName, s.house AS house,
            s.epoch AS epochId,
            (SELECT COUNT(DISTINCT c.election_id) FROM contest c JOIN place_version pv ON pv.id = c.place_version_id
              WHERE pv.jurisdiction_id = s.j AND pv.kind = s.house AND pv.epoch_id = s.epoch) AS elections,
            (SELECT MAX(e.year) FROM contest c JOIN place_version pv ON pv.id = c.place_version_id
                JOIN election e ON e.id = c.election_id
              WHERE pv.jurisdiction_id = s.j AND pv.kind = s.house AND pv.epoch_id = s.epoch) AS latestYear,
            (SELECT COUNT(DISTINCT c.election_id) FROM contest c JOIN place_version pv ON pv.id = c.place_version_id
                JOIN election e ON e.id = c.election_id
              WHERE pv.jurisdiction_id = s.j AND pv.kind = s.house AND pv.epoch_id = s.epoch
                AND e.kind <> 'bypoll') AS fullElections,
            COUNT(*) AS seats,
            SUM(CASE WHEN EXISTS (SELECT 1 FROM contest c JOIN result r ON r.contest_id = c.id
                                   WHERE c.place_version_id = s.version_id AND r.is_winner = 1)
                     THEN 1 ELSE 0 END) AS decided,
            SUM(CASE WHEN g.place_version_id IS NULL THEN 0 ELSE 1 END) AS held,
            -- The frame most of this group's polygons are in, and how many are in it. A map draws those.
            (SELECT g3.view_box FROM place_geometry g3 JOIN place_version pv3 ON pv3.id = g3.place_version_id
              WHERE pv3.jurisdiction_id = s.j AND pv3.kind = s.house AND pv3.epoch_id = s.epoch
              GROUP BY g3.view_box ORDER BY COUNT(*) DESC, g3.view_box LIMIT 1) AS mainFrame,
            SUM(CASE WHEN g.view_box IS NOT NULL AND g.view_box = (
                  SELECT g3.view_box FROM place_geometry g3 JOIN place_version pv3 ON pv3.id = g3.place_version_id
                   WHERE pv3.jurisdiction_id = s.j AND pv3.kind = s.house AND pv3.epoch_id = s.epoch
                   GROUP BY g3.view_box ORDER BY COUNT(*) DESC, g3.view_box LIMIT 1)
                THEN 1 ELSE 0 END) AS drawn,
            -- char(31) as the separator, not a comma: a source title contains commas, and splitting on
            -- one turned "WB assembly constituency outlines, projected SVG" into two publishers.
            -- GROUP_CONCAT(DISTINCT x) refuses a separator argument, hence the nested DISTINCT.
            (SELECT GROUP_CONCAT(v, char(31)) FROM (SELECT DISTINCT g2.view_box AS v
               FROM place_geometry g2 JOIN place_version pv2 ON pv2.id = g2.place_version_id
              WHERE pv2.jurisdiction_id = s.j AND pv2.kind = s.house AND pv2.epoch_id = s.epoch)) AS frames,
            (SELECT GROUP_CONCAT(v, char(31)) FROM (SELECT DISTINCT COALESCE(src.publisher, src.title) AS v
               FROM place_geometry g2 JOIN place_version pv2 ON pv2.id = g2.place_version_id
                    JOIN source src ON src.id = g2.source_id
              WHERE pv2.jurisdiction_id = s.j AND pv2.kind = s.house AND pv2.epoch_id = s.epoch)) AS publishers
       FROM seat s
       JOIN place p ON p.id = s.j
       LEFT JOIN place_geometry g ON g.place_version_id = s.version_id
      GROUP BY s.j, s.house, s.epoch
      ORDER BY p.canonical_name, s.house, s.epoch`,
  );

  // Where the registry holds ANY polygon for a jurisdiction and house, in any epoch. The difference
  // between "no map exists" and "a map exists for a different boundary".
  const held = new Set(
    all<{ k: string }>(
      db,
      `SELECT DISTINCT pv.jurisdiction_id || ':' || pv.kind AS k
         FROM place_geometry g JOIN place_version pv ON pv.id = g.place_version_id`,
    ).map((r) => r.k),
  );

  const rows: CoverageRow[] = groups.map((g) => ({
    jurisdictionId: g.jurisdictionId,
    jurisdictionName: g.jurisdictionName,
    house: g.house,
    epochId: g.epochId,
    elections: g.elections,
    latestYear: g.latestYear,
    fullElections: g.fullElections,
    seats: g.seats,
    decided: g.decided,
    drawn: g.drawn,
    otherFrames: g.held - g.drawn,
    frames: split(g.frames),
    publishers: split(g.publishers),
    status:
      g.drawn >= g.seats && g.seats > 0
        ? "COMPLETE"
        : g.drawn > 0
          ? "PARTIAL"
          : held.has(`${g.jurisdictionId}:${g.house}`)
            ? "UNRESOLVED"
            : "UNAVAILABLE",
    currentEpoch: false,
  }));

  // The current epoch of a house: the one its newest election used. One pass, highest year wins.
  const newest = new Map<string, CoverageRow>();
  for (const r of rows) {
    const key = `${r.jurisdictionId}:${r.house}`;
    const held = newest.get(key);
    if (held === undefined || (r.latestYear ?? -1) > (held.latestYear ?? -1)) newest.set(key, r);
  }
  for (const r of newest.values()) r.currentEpoch = true;

  const elections = all<Omit<ElectionCoverage, "epochs"> & { epochs: string }>(
    db,
    `SELECT e.id AS electionId, e.jurisdiction_place_id AS jurisdictionId, e.house AS house,
            e.kind AS kind, e.year AS year,
            GROUP_CONCAT(DISTINCT pv.epoch_id) AS epochs,
            COUNT(*) AS seats,
            SUM(CASE WHEN g.place_version_id IS NULL THEN 0 ELSE 1 END) AS drawn
       FROM election e
       JOIN contest c ON c.election_id = e.id
       JOIN place_version pv ON pv.id = c.place_version_id
       LEFT JOIN place_geometry g ON g.place_version_id = pv.id
      GROUP BY e.id
      ORDER BY e.year DESC, e.id`,
  ).map((r) => ({ ...r, epochs: splitCommas(r.epochs) }));

  return {
    rows,
    elections,
    totals: {
      jurisdictions: new Set(rows.map((r) => r.jurisdictionId)).size,
      groups: rows.length,
      complete: rows.filter((r) => r.status === "COMPLETE").length,
      partial: rows.filter((r) => r.status === "PARTIAL").length,
      unresolved: rows.filter((r) => r.status === "UNRESOLVED").length,
      unavailable: rows.filter((r) => r.status === "UNAVAILABLE").length,
      seats: sum(rows.map((r) => r.seats)),
      drawn: sum(rows.map((r) => r.drawn)),
      currentSeats: sum(rows.filter((r) => r.currentEpoch).map((r) => r.seats)),
      currentDrawn: sum(rows.filter((r) => r.currentEpoch).map((r) => r.drawn)),
    },
  };
}

/** GROUP_CONCAT with char(31): the separator, because a source title may itself contain a comma. */
const UNIT = "\u001f";

function split(s: string | null): string[] {
  return s === null || s === "" ? [] : [...new Set(s.split(UNIT))].sort();
}

/** GROUP_CONCAT's default separator, for values that cannot contain one — epoch ids. */
function splitCommas(s: string | null): string[] {
  return s === null || s === "" ? [] : [...new Set(s.split(","))].sort();
}

function sum(ns: readonly number[]): number {
  return ns.reduce((a, b) => a + b, 0);
}

export const COVERAGE_PREFACE = `# Electoral geometry coverage

**Generated — do not edit.** \`npm run registry -- geography coverage --write\`.

A row is one boundary epoch of one house of one jurisdiction, because that is the unit a polygon belongs
to: the same constituency name means a different shape under \`delim-1976\` and \`delim-2008\`. \`Seats\` counts
the place_versions that actually carry a contest, so it is what the map would have to draw and not every
version the registry has ever recorded.

| status | meaning |
| --- | --- |
| COMPLETE | every seat this epoch contests has a polygon |
| PARTIAL | some do |
| UNRESOLVED | the registry holds geometry for this jurisdiction and house in another epoch, and none for this one — the geometry exists and the LINK to this epoch is what could not be made |
| UNAVAILABLE | the registry holds no geometry for this jurisdiction and house at all |

Nothing is ever silently absent. UNRESOLVED and UNAVAILABLE are different admissions and only the first is
work waiting for someone.`;

/**
 * The matrix as markdown, for docs/geo/coverage.md.
 *
 * Generated because the brief says so — "do not manually type the final coverage table" — and because a
 * typed table is a claim nobody re-checks. `only` narrows to the epochs a release is judged on; the whole
 * matrix is 200 rows and most of them are 1962.
 */
export function formatCoverage(c: Coverage, opts: { only?: "current" } = {}): string {
  const shown = opts.only === "current" ? c.rows.filter((r) => r.currentEpoch) : c.rows;

  const head = "| Jurisdiction | House | Epoch | Elections | Latest | Seats | Drawn | Source | Status |";
  const rule = "| --- | --- | --- | --- | --- | --- | --- | --- | --- |";
  const body = shown.map(
    (r) =>
      `| ${r.jurisdictionName} | ${r.house.toUpperCase()} | \`${r.epochId}\` | ${r.elections} | ` +
      `${r.latestYear ?? "—"} | ${r.seats} | ${r.drawn} | ${r.publishers.join(", ") || "—"} | ${r.status} |`,
  );
  const t = c.totals;
  return [
    head,
    rule,
    ...body,
    "",
    `${t.groups} groups over ${t.jurisdictions} jurisdictions — ` +
      `${t.complete} COMPLETE, ${t.partial} PARTIAL, ${t.unresolved} UNRESOLVED, ${t.unavailable} UNAVAILABLE.`,
    `${t.drawn} of ${t.seats} contested seats drawable across every epoch; ` +
      `${t.currentDrawn} of ${t.currentSeats} in the epoch each jurisdiction currently votes under.`,
  ].join("\n");
}
