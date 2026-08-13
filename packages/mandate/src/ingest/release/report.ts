// The national coverage report: what the registry holds, and what it does not, in one pass.
//
// Phase 3 stage 10. The brief asks for a release-readiness report over data, geography, sources and
// unresolved entities, with every metric generated FROM THE REGISTRY and no hardcoded counts. This is that
// query set, and RC-1.md is written from its output rather than beside it.
//
// ── WHY THE STATES ARE THE POINT ──
//
// Every entity gets COMPLETE, PARTIAL, UNRESOLVED or UNAVAILABLE, and never "silently absent". That is the
// difference between a coverage report and a marketing page: an election with 59 of 60 seats loaded is
// PARTIAL and says so, an epoch whose geometry exists for a different boundary is UNRESOLVED, and a
// jurisdiction whose 2024 assembly nobody publishes is UNAVAILABLE with the reason attached.
//
// Nothing here interprets. It counts, classifies against a stated rule, and prints. The judgement about
// whether the numbers are good enough to release belongs in the release candidate document, signed.

import type { DatabaseSync } from "node:sqlite";
import { all, get } from "../../db/index.ts";
import { geometryCoverage } from "../geography/geometry-coverage.ts";

export type Row = { label: string; value: number | string; note?: string };

export type ElectionRow = {
  id: string;
  jurisdiction: string;
  house: string;
  kind: string;
  year: number;
  epoch: string;
  seats: number;
  /** Seats with a declared winner. */
  decided: number;
  /** Seats with more than one declared winner — always a defect. */
  duplicateWinners: number;
  candidates: number;
  drawn: number;
  results: "COMPLETE" | "PARTIAL" | "UNAVAILABLE";
  geometry: "COMPLETE" | "PARTIAL" | "UNAVAILABLE";
};

export type Release = {
  registry: Row[];
  sources: Row[];
  entities: Row[];
  geography: Row[];
  /** The newest full election of each house of each jurisdiction — what a release is judged on. */
  headline: ElectionRow[];
  caveats: { kind: string; n: number; detail: string }[];
};

const n = (db: DatabaseSync, sql: string, ...p: (string | number)[]): number =>
  get<{ n: number }>(db, sql, ...p)?.n ?? 0;

export function releaseReport(db: DatabaseSync): Release {
  const geo = geometryCoverage(db);

  const registry: Row[] = [
    ["jurisdictions with results", n(db, `SELECT COUNT(DISTINCT jurisdiction_place_id) AS n FROM election`)],
    ["election events", n(db, `SELECT COUNT(*) AS n FROM election`)],
    ["  of those, assembly", n(db, `SELECT COUNT(*) AS n FROM election WHERE kind = 'assembly'`)],
    ["  of those, general (Lok Sabha)", n(db, `SELECT COUNT(*) AS n FROM election WHERE kind = 'general'`)],
    ["  of those, by-elections", n(db, `SELECT COUNT(*) AS n FROM election WHERE kind = 'bypoll'`)],
    ["contests", n(db, `SELECT COUNT(*) AS n FROM contest`)],
    ["candidacies", n(db, `SELECT COUNT(*) AS n FROM candidacy`)],
    ["result rows", n(db, `SELECT COUNT(*) AS n FROM result`)],
    ["declared winners", n(db, `SELECT COUNT(*) AS n FROM result WHERE is_winner = 1`)],
    ["persons", n(db, `SELECT COUNT(*) AS n FROM person`)],
    ["parties", n(db, `SELECT COUNT(*) AS n FROM party`)],
    ["places", n(db, `SELECT COUNT(*) AS n FROM place`)],
    ["place versions", n(db, `SELECT COUNT(*) AS n FROM place_version`)],
    ["boundary epochs", n(db, `SELECT COUNT(*) AS n FROM boundary_epoch`)],
    ["turnout rows", n(db, `SELECT COUNT(*) AS n FROM turnout`)],
    ["affidavits", n(db, `SELECT COUNT(*) AS n FROM affidavit`)],
  ].map(([label, value]) => ({ label: label as string, value: value as number }));

  const sourceRows = n(db, `SELECT COUNT(*) AS n FROM source`);
  const sources: Row[] = [
    { label: "sources", value: sourceRows },
    {
      label: "  bytes fetched and hashed",
      value: n(db, `SELECT COUNT(*) AS n FROM source WHERE hash_kind = 'document_bytes'`),
      note: "the rest are cited by locator and have never been held",
    },
    {
      label: "  never fetched (url_only)",
      value: n(db, `SELECT COUNT(*) AS n FROM source WHERE hash_kind = 'url_only'`),
    },
    {
      label: "  a repo module rather than a publication",
      value: n(db, `SELECT COUNT(*) AS n FROM source WHERE kind = 'static_module'`),
    },
    {
      label: "  boundary datasets",
      value: n(db, `SELECT COUNT(*) AS n FROM source WHERE kind = 'boundary_geometry'`),
    },
    {
      label: "results carrying a source",
      value: n(db, `SELECT COUNT(*) AS n FROM result WHERE source_id IS NOT NULL`),
      note: `of ${n(db, `SELECT COUNT(*) AS n FROM result`)}`,
    },
    {
      label: "claims with a citation",
      value: n(db, `SELECT COUNT(*) AS n FROM claim c WHERE EXISTS (SELECT 1 FROM citation ci WHERE ci.claim_id = c.id)`),
      note: `of ${n(db, `SELECT COUNT(*) AS n FROM claim`)}`,
    },
  ];

  const entities: Row[] = [
    { label: "candidacies with an unresolved party string", value: n(db, `SELECT COUNT(*) AS n FROM candidacy WHERE party_raw IS NOT NULL AND party_raw <> ''`) },
    { label: "person merges applied", value: n(db, `SELECT COUNT(*) AS n FROM person_merge`) },
    { label: "merge candidates awaiting review", value: n(db, `SELECT COUNT(*) AS n FROM person_merge_candidate WHERE decided_at IS NULL`) },
    {
      label: "place versions two sources disagree about",
      value: n(db, `SELECT COUNT(*) AS n FROM place_version WHERE name_conflict = 1`),
      note: "the name at a seat number differs between sources",
    },
    {
      label: "party ids differing from another only in case",
      value: n(
        db,
        `SELECT COUNT(*) AS n FROM party a WHERE EXISTS (
           SELECT 1 FROM party b WHERE b.id <> a.id AND LOWER(b.id) = LOWER(a.id))`,
      ),
    },
  ];

  const geography: Row[] = [
    { label: "constituency polygons", value: n(db, `SELECT COUNT(*) AS n FROM place_geometry`) },
    { label: "  coordinate spaces they are in", value: n(db, `SELECT COUNT(DISTINCT view_box) AS n FROM place_geometry`), note: "more than one cannot be drawn together" },
    { label: "seats contested in the current epoch", value: geo.totals.currentSeats },
    { label: "  of those, drawable", value: geo.totals.currentDrawn },
    { label: "seats contested in any epoch", value: geo.totals.seats },
    { label: "  of those, drawable", value: geo.totals.drawn },
    { label: "groups COMPLETE", value: geo.totals.complete },
    { label: "groups PARTIAL", value: geo.totals.partial },
    { label: "groups UNRESOLVED", value: geo.totals.unresolved, note: "geometry held for another epoch of the same house" },
    { label: "groups UNAVAILABLE", value: geo.totals.unavailable },
  ];

  // THE HEADLINE SET: the newest full election of each house of each jurisdiction. A by-election is not what
  // a release is judged on, and neither is 1962.
  const headline = all<ElectionRow>(
    db,
    `WITH newest AS (
       SELECT e.jurisdiction_place_id AS j, e.house AS house, MAX(e.year) AS y
         FROM election e WHERE e.kind IN ('assembly','general') GROUP BY 1, 2)
     SELECT e.id AS id, p.canonical_name AS jurisdiction, e.house AS house, e.kind AS kind, e.year AS year,
            e.epoch_id AS epoch,
            (SELECT COUNT(*) FROM contest c WHERE c.election_id = e.id) AS seats,
            (SELECT COUNT(*) FROM contest c WHERE c.election_id = e.id
              AND EXISTS (SELECT 1 FROM result r WHERE r.contest_id = c.id AND r.is_winner = 1)) AS decided,
            (SELECT COUNT(*) FROM (
               SELECT c.id FROM contest c JOIN result r ON r.contest_id = c.id AND r.is_winner = 1
                WHERE c.election_id = e.id GROUP BY c.id HAVING COUNT(*) > 1)) AS duplicateWinners,
            (SELECT COUNT(*) FROM candidacy cd JOIN contest c ON c.id = cd.contest_id
              WHERE c.election_id = e.id) AS candidates,
            -- DRAWN MEANS DRAWN TOGETHER. A polygon in a different projection from the rest of the
            -- election's polygons cannot be put in the same SVG, so it is held rather than counted — the
            -- same rule stateMapView applies. Counting rows made West Bengal 2026 report 294 of 294 for a
            -- map that draws 263.
            (SELECT COUNT(*) FROM contest c JOIN place_geometry g ON g.place_version_id = c.place_version_id
              WHERE c.election_id = e.id
                AND g.view_box = (SELECT g2.view_box FROM contest c2 JOIN place_geometry g2 ON g2.place_version_id = c2.place_version_id
                                   WHERE c2.election_id = e.id GROUP BY g2.view_box ORDER BY COUNT(*) DESC, g2.view_box LIMIT 1)) AS drawn,
            '' AS results, '' AS geometry
       FROM election e
       JOIN newest nw ON nw.j = e.jurisdiction_place_id AND nw.house = e.house AND nw.y = e.year
       JOIN place p ON p.id = e.jurisdiction_place_id
      WHERE e.kind IN ('assembly','general')
      ORDER BY p.canonical_name, e.house`,
  ).map((r) => ({
    ...r,
    results: (r.decided >= r.seats && r.seats > 0 ? "COMPLETE" : r.decided > 0 ? "PARTIAL" : "UNAVAILABLE") as ElectionRow["results"],
    geometry: (r.drawn >= r.seats && r.seats > 0 ? "COMPLETE" : r.drawn > 0 ? "PARTIAL" : "UNAVAILABLE") as ElectionRow["geometry"],
  }));

  const caveats: Release["caveats"] = [];
  const dup = n(
    db,
    `SELECT COUNT(*) AS n FROM (
       SELECT c.id FROM contest c JOIN result r ON r.contest_id = c.id AND r.is_winner = 1
        GROUP BY c.id HAVING COUNT(*) > 1)`,
  );
  if (dup > 0) caveats.push({ kind: "contests with more than one declared winner", n: dup, detail: "a defect wherever it appears" });

  // ONE SEAT HELD BY TWO PLACE_VERSIONS. This is the shape of the West Bengal defect: two sources built the
  // same constituency under different numbers, so the epoch holds 307 versions for a 294-seat house and
  // three elections report thirteen seats twice.
  //
  // THE DISCRIMINATOR IS THE DISTRICT, and it took two attempts to get right. A gap in a numbering is not
  // this — Assam's 1963 set skips a number and is sound. Nor is a repeated NAME: India really does have two
  // constituencies called Bishnupur in West Bengal, which is why a seat's URL needs its district, and a
  // name-only rule reported 115 for Andhra Pradesh. Two genuinely distinct seats of one name are in
  // DIFFERENT districts; two versions of one seat are in the same one.
  for (const r of all<{ j: string; epoch: string; kind: string; dupes: number; example: string }>(
    db,
    `WITH keyed AS (
       SELECT DISTINCT pv.id, pv.jurisdiction_id AS j, pv.epoch_id AS epoch, pv.kind AS kind,
              pv.district_place_id AS dist,
              REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(UPPER(pv.canonical_name),
                '(SC)',''),'(ST)',''),' ',''),'-',''),'.','') AS nk
         FROM place_version pv JOIN contest c ON c.place_version_id = pv.id
        WHERE pv.kind IN ('ac','pc') AND pv.district_place_id IS NOT NULL)
     SELECT j, epoch, kind, COUNT(*) AS dupes, MIN(nk) AS example FROM (
       SELECT j, epoch, kind, nk FROM keyed GROUP BY j, epoch, kind, dist, nk HAVING COUNT(*) > 1)
      GROUP BY j, epoch, kind ORDER BY dupes DESC`,
  )) {
    caveats.push({
      kind: "one constituency held by two place_versions",
      n: r.dupes,
      detail: `${r.j} ${r.kind} ${r.epoch}, e.g. ${r.example} — same name, same district, two versions`,
    });
  }

  const noYear = n(db, `SELECT COUNT(*) AS n FROM election WHERE year IS NULL`);
  if (noYear > 0) caveats.push({ kind: "elections with no year", n: noYear, detail: "year-only identity was the defect Phase 1 removed" });

  const unnamed = n(db, `SELECT COUNT(*) AS n FROM place_version WHERE kind IN ('ac','pc') AND canonical_name = ''`);
  if (unnamed > 0) caveats.push({ kind: "constituencies with no name", n: unnamed, detail: "seat-number-only identity" });

  return { registry, sources, entities, geography, headline, caveats };
}

/** Two columns, and the notes in a third. Same shape as every other CLI report in this repo. */
export function formatRelease(r: Release): string {
  const out: string[] = [];
  const section = (title: string, rows: readonly Row[]): void => {
    out.push("");
    out.push(title);
    const w = Math.max(...rows.map((x) => x.label.length));
    for (const x of rows) {
      out.push(`  ${x.label.padEnd(w)}  ${String(x.value).padStart(9)}${x.note === undefined ? "" : `   ${x.note}`}`);
    }
  };
  section("registry", r.registry);
  section("sources", r.sources);
  section("entity resolution", r.entities);
  section("electoral geography", r.geography);

  out.push("");
  out.push("the newest full election of each house of each jurisdiction");
  out.push("  jurisdiction              house  year  seats  decided  drawn  results   geometry");
  for (const e of r.headline) {
    out.push(
      `  ${e.jurisdiction.slice(0, 24).padEnd(24)}  ${e.house.padEnd(5)}  ${e.year}  ` +
        `${String(e.seats).padStart(5)}  ${String(e.decided).padStart(7)}  ${String(e.drawn).padStart(5)}  ` +
        `${e.results.padEnd(9)} ${e.geometry}`,
    );
  }
  out.push("");
  out.push(r.caveats.length === 0 ? "no caveats" : "caveats");
  for (const c of r.caveats) out.push(`  ${String(c.n).padStart(6)}  ${c.kind} — ${c.detail}`);
  return out.join("\n");
}

/** The same numbers as markdown, for the release candidate document to include rather than restate. */
export function markdownRelease(r: Release): string {
  const table = (title: string, rows: readonly Row[]): string =>
    [
      `### ${title}`,
      "",
      "| | |",
      "| --- | --- |",
      ...rows.map(
        (x) => `| ${x.label.replace(/^ {2}/, "&nbsp;&nbsp;")} | **${x.value}**${x.note === undefined ? "" : ` — ${x.note}`} |`,
      ),
      "",
    ].join("\n");

  return [
    "## What the registry holds",
    "",
    "**Generated — do not edit.** `npm run release:report`. Every figure is a query; none is typed.",
    "",
    table("Registry", r.registry),
    table("Sources", r.sources),
    table("Entity resolution", r.entities),
    table("Electoral geography", r.geography),
    "### The newest full election of each house of each jurisdiction",
    "",
    "| Jurisdiction | House | Year | Epoch | Seats | Decided | Drawn | Results | Geometry |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...r.headline.map(
      (e) =>
        `| ${e.jurisdiction} | ${e.house.toUpperCase()} | ${e.year} | \`${e.epoch}\` | ${e.seats} | ` +
        `${e.decided} | ${e.drawn} | ${e.results} | ${e.geometry} |`,
    ),
    "",
    "### Caveats the registry can see in itself",
    "",
    r.caveats.length === 0
      ? "None."
      : ["| n | what | detail |", "| --- | --- | --- |", ...r.caveats.map((c) => `| ${c.n} | ${c.kind} | ${c.detail} |`)].join("\n"),
    "",
  ].join("\n");
}
