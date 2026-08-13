// Every current-epoch seat with no geometry, one row each, with the reason.
//
// Phase 3's closure asks for this by name: 367 seats are not drawable and a frozen foundation has to say
// which, why, and what would close each one. A total is not an audit — "4,445 of 4,812" hides whether the
// missing 367 are one state's whole assembly or four seats each in twelve states, and those are different
// problems with different answers.
//
// ── WHERE THE REASON COMES FROM ──
//
// Not from a list. Each seat is classified by asking the registry and the source manifest the same questions
// the import pipeline asked, and reporting which of them failed:
//
//   EPOCH-BLOCKED             the epoch has no geometry AT ALL and no declared source covers it. Assam's
//                             delim-2023-as and Jammu & Kashmir's delim-2022-jk: the only published form of
//                             either order is a raster scan, so there is nothing to match against.
//   NO-TRUSTWORTHY-GEOMETRY   a source covers the jurisdiction and house, the epoch has other polygons, and
//                             THIS seat matched nothing — a name the source spells differently, a polygon the
//                             containment check refused, a seat the source omits. The staged list in
//                             docs/geo/import.md names each one.
//   WRONG-FRAME               a polygon exists and is in a different projection from its neighbours, so it
//                             cannot be drawn beside them. West Bengal's 31 leftovers.
//   SECONDARY-SOURCE-CANDIDATE  the jurisdiction's epoch has no geometry, and a declared source claims to
//                             cover that jurisdiction and house for a compatible vintage. Work waiting.
//
// Nothing here imports anything. It is a report, and its whole value is that the numbers move only when the
// data does.

import type { DatabaseSync } from "node:sqlite";
import { all } from "../../db/index.ts";

export type MissingSeat = {
  jurisdictionId: string;
  jurisdictionName: string;
  house: "ac" | "pc";
  epochId: string;
  placeVersionId: number;
  number: number | null;
  name: string;
  /** Whether the registry holds a polygon that simply cannot be drawn with the others. */
  heldInAnotherFrame: boolean;
  /** Polygons the epoch does hold, so "nothing for this epoch" and "not this seat" are distinguishable. */
  epochDrawn: number;
  epochSeats: number;
  status: "EPOCH-BLOCKED" | "NO-TRUSTWORTHY-GEOMETRY" | "WRONG-FRAME" | "SECONDARY-SOURCE-CANDIDATE";
  reason: string;
};

export type MissingReport = {
  seats: MissingSeat[];
  byStatus: Record<string, number>;
  byJurisdiction: { jurisdictionId: string; jurisdictionName: string; house: string; epochId: string; missing: number; seats: number; status: string }[];
  totals: { currentSeats: number; drawn: number; missing: number };
};

type Row = {
  jurisdictionId: string;
  jurisdictionName: string;
  house: "ac" | "pc";
  epochId: string;
  placeVersionId: number;
  number: number | null;
  name: string;
  held: number;
  vb: string | null;
  mainFrame: string | null;
  epochDrawn: number;
  epochSeats: number;
};

/**
 * `vintages` maps `"<jurisdiction>:<house>"` to the NEWEST date a declared source claims to describe. Passed
 * in rather than read here, so the manifest stays the CLI's business and this module stays a query.
 *
 * IT IS A DATE, NOT A FLAG, and that is the whole distinction between two of the four statuses. Asking only
 * "does a source cover Assam's parliamentary seats" answers yes — one does, for 2014 — and would classify the
 * fourteen seats of `delim-2023-as` as work waiting for someone. They are not: that order takes effect in
 * 2023, no declared source describes anything after 2014, and the only published form of the order is a
 * raster scan. Comparing the epoch's own `effective_from` to the newest vintage says so.
 */
export function missingGeometry(db: DatabaseSync, vintages: ReadonlyMap<string, string> = new Map()): MissingReport {
  const rows = all<Row>(
    db,
    `WITH seat AS (
       SELECT DISTINCT pv.id AS version_id, pv.jurisdiction_id AS j, pv.kind AS house, pv.epoch_id AS epoch,
              pv.number AS number, pv.canonical_name AS name
         FROM contest c JOIN place_version pv ON pv.id = c.place_version_id
        WHERE pv.kind IN ('ac','pc')
     ),
     latest AS (
       -- The epoch each jurisdiction and house currently votes under: the one its newest election used.
       SELECT j, house, epoch FROM (
         SELECT s.j, s.house, s.epoch,
                ROW_NUMBER() OVER (PARTITION BY s.j, s.house ORDER BY MAX(e.year) DESC, s.epoch) AS rn
           FROM seat s
           JOIN contest c ON c.place_version_id = s.version_id
           JOIN election e ON e.id = c.election_id
          GROUP BY s.j, s.house, s.epoch)
        WHERE rn = 1
     ),
     gframe AS (
       SELECT s.j, s.house, s.epoch, g.view_box AS vb, COUNT(*) AS n
         FROM seat s JOIN place_geometry g ON g.place_version_id = s.version_id
        GROUP BY 1, 2, 3, 4
     ),
     mainframe AS (
       SELECT j, house, epoch, MIN(vb) AS vb FROM gframe f
        WHERE f.n = (SELECT MAX(x.n) FROM gframe x WHERE x.j = f.j AND x.house = f.house AND x.epoch = f.epoch)
        GROUP BY 1, 2, 3
     ),
     tally AS (
       SELECT s.j, s.house, s.epoch, COUNT(*) AS seats,
              SUM(CASE WHEN g.view_box IS NOT NULL AND g.view_box = mf.vb THEN 1 ELSE 0 END) AS drawn
         FROM seat s
         LEFT JOIN place_geometry g ON g.place_version_id = s.version_id
         LEFT JOIN mainframe mf ON mf.j = s.j AND mf.house = s.house AND mf.epoch = s.epoch
        GROUP BY 1, 2, 3
     )
     SELECT s.j AS jurisdictionId, p.canonical_name AS jurisdictionName, s.house AS house,
            s.epoch AS epochId, s.version_id AS placeVersionId, s.number AS number, s.name AS name,
            CASE WHEN g.place_version_id IS NULL THEN 0 ELSE 1 END AS held,
            g.view_box AS vb, mf.vb AS mainFrame,
            t.drawn AS epochDrawn, t.seats AS epochSeats
       FROM seat s
       JOIN latest l ON l.j = s.j AND l.house = s.house AND l.epoch = s.epoch
       JOIN place p ON p.id = s.j
       JOIN tally t ON t.j = s.j AND t.house = s.house AND t.epoch = s.epoch
       LEFT JOIN place_geometry g ON g.place_version_id = s.version_id
       LEFT JOIN mainframe mf ON mf.j = s.j AND mf.house = s.house AND mf.epoch = s.epoch
      ORDER BY p.canonical_name, s.house, s.number`,
  );

  const epochFrom = new Map(
    all<{ id: string; f: string }>(db, `SELECT id, effective_from AS f FROM boundary_epoch`).map((r) => [r.id, r.f]),
  );

  const seats: MissingSeat[] = [];
  for (const r of rows) {
    const drawable = r.held === 1 && r.vb === r.mainFrame;
    if (drawable) continue;
    const vintage = vintages.get(`${r.jurisdictionId}:${r.house}`) ?? null;
    const from = epochFrom.get(r.epochId) ?? "";
    // A source cannot describe boundaries an order drew after the source was published.
    const reachable = vintage !== null && from !== "" && from <= vintage;
    let status: MissingSeat["status"];
    let reason: string;
    if (r.held === 1) {
      status = "WRONG-FRAME";
      reason = `a polygon is held in projection "${r.vb}" while this epoch's others are in "${r.mainFrame}" — undrawable beside them rather than absent`;
    } else if (r.epochDrawn === 0 && !reachable) {
      status = "EPOCH-BLOCKED";
      reason =
        vintage === null
          ? `no declared source covers ${r.jurisdictionId} ${r.house} at all`
          : `this epoch takes effect ${from} and the newest declared source describes ${vintage} — no source can describe boundaries drawn after it`;
    } else if (r.epochDrawn === 0) {
      status = "SECONDARY-SOURCE-CANDIDATE";
      reason = `a declared source of the right vintage (${vintage}) covers ${r.jurisdictionId} ${r.house}, and nothing resolved to this epoch — the epoch, not the seat, is what failed`;
    } else {
      status = "NO-TRUSTWORTHY-GEOMETRY";
      reason = `the epoch draws ${r.epochDrawn} of ${r.epochSeats}; this seat matched no polygon on any pair of independent keys — see the staged list in docs/geo/import.md`;
    }
    seats.push({
      jurisdictionId: r.jurisdictionId,
      jurisdictionName: r.jurisdictionName,
      house: r.house,
      epochId: r.epochId,
      placeVersionId: r.placeVersionId,
      number: r.number,
      name: r.name,
      heldInAnotherFrame: r.held === 1,
      epochDrawn: r.epochDrawn,
      epochSeats: r.epochSeats,
      status,
      reason,
    });
  }

  const byStatus: Record<string, number> = {};
  for (const s of seats) byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;

  const groups = new Map<string, MissingReport["byJurisdiction"][number]>();
  for (const s of seats) {
    const k = `${s.jurisdictionId}:${s.house}:${s.epochId}`;
    const at = groups.get(k) ?? {
      jurisdictionId: s.jurisdictionId,
      jurisdictionName: s.jurisdictionName,
      house: s.house,
      epochId: s.epochId,
      missing: 0,
      seats: s.epochSeats,
      status: s.status,
    };
    at.missing += 1;
    // A group's status is the worst of its seats', in the order a reader cares about.
    const rank = ["EPOCH-BLOCKED", "SECONDARY-SOURCE-CANDIDATE", "NO-TRUSTWORTHY-GEOMETRY", "WRONG-FRAME"];
    if (rank.indexOf(s.status) < rank.indexOf(at.status)) at.status = s.status;
    groups.set(k, at);
  }

  return {
    seats,
    byStatus,
    byJurisdiction: [...groups.values()].sort((a, b) => b.missing - a.missing),
    totals: {
      currentSeats: rows.length,
      drawn: rows.length - seats.length,
      missing: seats.length,
    },
  };
}

/** The committed record. Every seat, because "367" is not an audit. */
export function markdownMissing(r: MissingReport): string {
  const out: string[] = [];
  out.push("# Geometry coverage — every current-epoch seat that is not drawable");
  out.push("");
  out.push(
    "**Generated — do not edit.** `npm run registry -- geography missing --write`. The totals are in " +
      "[coverage.md](coverage.md); this is the per-seat account behind the ones that are missing.",
  );
  out.push("");
  out.push(
    `**${r.totals.drawn} of ${r.totals.currentSeats} drawable. ${r.totals.missing} are not**, and each one is ` +
      "a row below with the reason it is not, taken from the registry rather than from a list.",
  );
  out.push("");
  out.push("| status | what it means | seats |");
  out.push("| --- | --- | --- |");
  const meanings: Record<string, string> = {
    "EPOCH-BLOCKED": "no declared source covers this jurisdiction and house, and the epoch holds no polygon at all. Nothing to match against, so nothing is guessed.",
    "SECONDARY-SOURCE-CANDIDATE": "a declared source covers the jurisdiction and house, and nothing resolved to this epoch. The epoch failed, not the seat.",
    "NO-TRUSTWORTHY-GEOMETRY": "the epoch draws most of its seats and this one matched no polygon on any pair of independent keys.",
    "WRONG-FRAME": "a polygon is held in a different projection from its neighbours, so it cannot be drawn beside them.",
  };
  for (const [k, n] of Object.entries(r.byStatus).sort((a, b) => b[1] - a[1])) {
    out.push(`| **${k}** | ${meanings[k] ?? ""} | ${n} |`);
  }

  out.push("");
  out.push("## By jurisdiction");
  out.push("");
  out.push("| Jurisdiction | House | Epoch | Missing | Of | Status |");
  out.push("| --- | --- | --- | --- | --- | --- |");
  for (const g of r.byJurisdiction) {
    out.push(
      `| ${g.jurisdictionName} | ${g.house.toUpperCase()} | \`${g.epochId}\` | ${g.missing} | ${g.seats} | ${g.status} |`,
    );
  }

  out.push("");
  out.push(`## Every seat — ${r.totals.missing} rows`);
  out.push("");
  out.push("| Jurisdiction | House | Epoch | place_version | No. | Official name | Status | Why |");
  out.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const s of r.seats) {
    out.push(
      `| ${s.jurisdictionName} | ${s.house.toUpperCase()} | \`${s.epochId}\` | ${s.placeVersionId} | ` +
        `${s.number ?? "—"} | ${s.name} | ${s.status} | ${s.reason} |`,
    );
  }
  out.push("");
  return out.join("\n");
}
