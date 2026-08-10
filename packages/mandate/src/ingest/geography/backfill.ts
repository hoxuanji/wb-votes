/**
 * Restoring each constituency's own name, per delimitation.
 *
 * Reads the reconstruction (see reconstruct.ts — 62 hash-verified source files, 16,772 seats, keyed on the
 * source's own `(file jurisdiction, house, DelimID, Constituency_No)`) and writes it onto `place_version`,
 * which migration 011 made the constituency's identity row.
 *
 * THE RULE THAT MATTERS. A name is not applied by seat number alone. For each version the backfill asks
 * which source owns the RESULTS attached to it, because the name and the result have to come from a
 * consistent account of the seat:
 *
 *   - the source names it and owns the results  → apply the source's name. 11,279 versions; the
 *     Karnataka class, and the whole point of the exercise.
 *   - the names already agree                   → apply anyway, now with provenance. 5,272 versions.
 *   - a DIFFERENT cited source owns the results and names the slot differently → keep the owning
 *     source's name, record the other, set name_conflict. 221 versions, all West Bengal.
 *   - no source row for the slot                → keep the existing name, attributed to whoever owns the
 *     results. 13 versions, all West Bengal.
 *
 * The third bucket is not a technicality. West Bengal's seed numbered its 294 assembly seats across the
 * range 1-307, so from seat 100 on, its numbers drift from ECI's: the seed's Habra is 104, the source's
 * HABRA is 100. The seed's (number, name, winner) triples are internally consistent and correct per named
 * seat — Moloy Ghatak at Asansol Uttar, verified — and 1,413 of West Bengal's 1,534 results for 2021 are
 * the seed's. Applying the source's name by number would have written MURARAI over the row holding
 * Asansol Uttar's result: the very defect being repaired, recreated in the flagship state. A name-join
 * from seed numbering to source numbering was tested and rejected — 278 of 294, with 16 transliteration
 * differences and one collision — because a 94.6% fuzzy match is not a mapping to renumber a state on.
 * Resolving West Bengal needs the ECI's own constituency list, and is deliberately not done here.
 *
 * RECOVERABILITY. This writes only the columns 011 added, and never touches `place.canonical_name` or any
 * pre-existing column. The prior state is therefore recoverable in one statement —
 * `UPDATE place_version SET canonical_name = NULL, name_source_id = NULL, name_conflict = 0,
 * name_variants = '[]', source_constituency_key = NULL` — and every run writes a row-level before/after
 * audit to .data/reports/ before it commits.
 */

import type { DatabaseSync } from "node:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import { all } from "../../db/index.ts";
import { readManifest, reconstruct, type SourceSeat } from "./reconstruct.ts";

export const MANIFEST_PATH = ".data/cache/lokdhaba/refetch-manifest.tsv";

/** Which bucket a version fell into. Every version lands in exactly one, and the counts are the report. */
export type Bucket =
  | "corrected"
  | "already_correct"
  | "conflict_kept_owner"
  | "unreconstructed"
  | "not_a_constituency";

export type Change = {
  placeVersionId: number;
  placeId: string;
  jurisdictionId: string;
  kind: string;
  epochId: string;
  number: number | null;
  before: string | null;
  after: string | null;
  bucket: Bucket;
  nameConflict: boolean;
  sourceName: string | null;
  ambiguous: boolean;
};

export type BackfillReport = {
  applied: boolean;
  versions: number;
  buckets: Record<Bucket, number>;
  /** Versions where the source itself carries more than one spelling for the slot. */
  ambiguousNames: number;
  nameConflicts: number;
  /** Versions left with no name at all — must be zero before 012 can tighten the column. */
  unnamed: number;
  nameMatchLinks: number;
  byJurisdiction: Record<string, { corrected: number; conflict: number; unreconstructed: number }>;
  reportPath: string | null;
};

const normName = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

type VersionRow = {
  id: number;
  place_id: string;
  jurisdiction_id: string;
  kind: string;
  epoch_id: string;
  number: number | null;
  place_name: string;
};

/**
 * Which source's results sit on a version, and how many.
 *
 * A version can carry rows from more than one source; the majority wins, and a tie goes to the
 * non-Lokdhaba side because the seed is the more specific, curated account where it exists at all.
 */
function resultOwners(db: DatabaseSync): Map<number, { sourceId: string; fromSource: boolean }> {
  const rows = all<{ vid: number; source_id: string; n: number }>(
    db,
    `SELECT c.place_version_id AS vid, r.source_id, COUNT(*) AS n
       FROM contest c
       JOIN result r ON r.contest_id = c.id AND r.revision = 0
      GROUP BY c.place_version_id, r.source_id`,
  );
  const best = new Map<number, { sourceId: string; n: number }>();
  const tally = new Map<number, { lok: number; other: number; lokId: string | null; otherId: string | null }>();
  for (const r of rows) {
    const cur = best.get(r.vid);
    if (cur === undefined || r.n > cur.n) best.set(r.vid, { sourceId: r.source_id, n: r.n });
    const t = tally.get(r.vid) ?? { lok: 0, other: 0, lokId: null, otherId: null };
    if (r.source_id.startsWith("lokdhaba")) {
      t.lok += r.n;
      t.lokId = r.source_id;
    } else {
      t.other += r.n;
      t.otherId = r.source_id;
    }
    tally.set(r.vid, t);
  }
  const out = new Map<number, { sourceId: string; fromSource: boolean }>();
  for (const [vid, t] of tally) {
    const fromSource = t.lok > t.other;
    const id = (fromSource ? t.lokId : t.otherId) ?? best.get(vid)?.sourceId ?? "";
    out.set(vid, { sourceId: id, fromSource });
  }
  return out;
}

/** The seat's every observed spelling, as the JSON that goes in `name_variants`. */
function variantsJson(seat: SourceSeat | undefined, kept: { name: string; sourceId: string } | null): string {
  const out: unknown[] = [];
  if (kept !== null) out.push({ name: kept.name, source_id: kept.sourceId, in_force: true });
  for (const v of seat?.names ?? []) {
    out.push({
      name: v.name,
      source_id: seat?.sourceIds[0] ?? null,
      first_year: v.firstYear,
      last_year: v.lastYear,
      rows: v.rows,
      ...(kept === null ? {} : { in_force: false }),
    });
  }
  return JSON.stringify(out);
}

export function backfillGeography(
  db: DatabaseSync,
  opts: { apply: boolean; manifestPath?: string; reportDir?: string },
): BackfillReport {
  const { usable, unusable } = readManifest(opts.manifestPath ?? MANIFEST_PATH);
  if (unusable.length > 0) {
    throw new Error(
      `${unusable.length} source file(s) no longer match the sha256 recorded at import. ` +
        `Reconstructing from different bytes than the rows being repaired would be a new assertion, ` +
        `not a repair. Files: ${unusable.map((u) => u.sourceId).join(", ")}`,
    );
  }
  const { seats } = reconstruct(usable);
  const bySlot = new Map<string, SourceSeat>();
  for (const s of seats) bySlot.set(`${s.jurisdictionId} ${s.kind} ${s.epochId} ${s.number}`, s);

  const owners = resultOwners(db);
  const versions = all<VersionRow>(
    db,
    `SELECT v.id, v.place_id, v.jurisdiction_id, v.kind, v.epoch_id, v.number,
            p.canonical_name AS place_name
       FROM place_version v
       JOIN place p ON p.id = v.place_id`,
  );

  const report: BackfillReport = {
    applied: opts.apply,
    versions: versions.length,
    buckets: {
      corrected: 0,
      already_correct: 0,
      conflict_kept_owner: 0,
      unreconstructed: 0,
      not_a_constituency: 0,
    },
    ambiguousNames: 0,
    nameConflicts: 0,
    unnamed: 0,
    nameMatchLinks: 0,
    byJurisdiction: {},
    reportPath: null,
  };
  const changes: Change[] = [];
  const writes: [string, string | null, number, string, string, number][] = [];

  for (const v of versions) {
    const isSeat = v.kind === "ac" || v.kind === "pc";
    const seat = isSeat && v.number !== null
      ? bySlot.get(`${v.jurisdiction_id} ${v.kind} ${v.epoch_id} ${v.number}`)
      : undefined;
    const owner = owners.get(v.id);

    let bucket: Bucket;
    let after: string;
    let conflict = false;
    let sourceKey = "";

    if (!isSeat) {
      // Districts hold versions for their geometry. They are not delimitation-scoped constituencies and
      // the source files do not describe them, so the existing name stands.
      bucket = "not_a_constituency";
      after = v.place_name;
    } else if (seat === undefined) {
      bucket = "unreconstructed";
      after = v.place_name;
    } else {
      sourceKey = seat.sourceKey;
      const agrees = normName(seat.canonicalName) === normName(v.place_name);
      if (agrees) {
        // Same name — so keep the spelling already in the registry rather than the source's. TCPD ships
        // every constituency in capitals; West Bengal's seed ships "Mekliganj" and "Cooch Behar". Writing
        // the source's casing over an identical name would have shouted 294 seat names for no gain, and
        // the source's exact spelling is recorded in name_variants either way.
        bucket = "already_correct";
        after = v.place_name;
      } else if (owner === undefined || owner.fromSource) {
        bucket = "corrected";
        after = seat.canonicalName;
      } else {
        // A different cited source owns the results here and names the slot differently. Its name stays;
        // the source's name is recorded beside it.
        bucket = "conflict_kept_owner";
        after = v.place_name;
        conflict = true;
      }
      if (seat.ambiguous) report.ambiguousNames += 1;
    }

    const nameSourceId = bucket === "corrected" || bucket === "already_correct"
      ? (seat?.sourceIds[0] ?? owner?.sourceId ?? null)
      : (owner?.sourceId ?? null);

    report.buckets[bucket] += 1;
    if (conflict) report.nameConflicts += 1;
    if (after === "") report.unnamed += 1;
    if (isSeat) {
      const j = (report.byJurisdiction[v.jurisdiction_id] ??= { corrected: 0, conflict: 0, unreconstructed: 0 });
      if (bucket === "corrected") j.corrected += 1;
      if (bucket === "conflict_kept_owner") j.conflict += 1;
      if (bucket === "unreconstructed") j.unreconstructed += 1;
    }

    changes.push({
      placeVersionId: v.id,
      placeId: v.place_id,
      jurisdictionId: v.jurisdiction_id,
      kind: v.kind,
      epochId: v.epoch_id,
      number: v.number,
      before: v.place_name,
      after,
      bucket,
      nameConflict: conflict,
      sourceName: seat?.canonicalName ?? null,
      ambiguous: seat?.ambiguous ?? false,
    });
    writes.push([
      after,
      nameSourceId,
      conflict ? 1 : 0,
      variantsJson(seat, conflict ? { name: after, sourceId: nameSourceId ?? "" } : null),
      sourceKey,
      v.id,
    ]);
  }

  // A before/after row per version, written whether or not this run applies. The audit is the recovery
  // path and the evidence for the report at once.
  const dir = opts.reportDir ?? ".data/reports";
  mkdirSync(dir, { recursive: true });
  const path = `${dir}/geography-backfill${opts.apply ? "" : "-dryrun"}.json`;
  writeFileSync(path, `${JSON.stringify({ report: { ...report, reportPath: path }, changes }, null, 1)}\n`);
  report.reportPath = path;

  if (!opts.apply) return report;

  db.exec("SAVEPOINT geography_backfill");
  try {
    const stmt = db.prepare(
      `UPDATE place_version
          SET canonical_name = ?, name_source_id = ?, name_conflict = ?, name_variants = ?,
              source_constituency_key = NULLIF(?, '')
        WHERE id = ?`,
    );
    for (const w of writes) stmt.run(...w);
    report.nameMatchLinks = linkAdjacentNameMatches(db);
    db.exec("RELEASE geography_backfill");
  } catch (e) {
    db.exec("ROLLBACK TO geography_backfill");
    db.exec("RELEASE geography_backfill");
    throw e;
  }
  return report;
}

/**
 * Record where a name survives from one delimitation into the next.
 *
 * This is the ONLY relationship this repair asserts, and it is deliberately the weakest one available:
 * `name_match` says a constituency of this name existed in the adjacent delimitation, which is a fact
 * about the source documents. It does not say the territory is the same — a seat can keep its name and be
 * redrawn beyond recognition, and a name can move to a different area entirely. Succession, splits and
 * merges live in `place_crosswalk` and in the succession kinds, which migration 011 makes impossible to
 * write without a cited source. None of those is populated here, because no source for them is in hand.
 */
export function linkAdjacentNameMatches(db: DatabaseSync): number {
  const epochs = all<{ id: string }>(db, "SELECT id FROM boundary_epoch ORDER BY effective_from").map((r) => r.id);
  let n = 0;
  const insert = db.prepare(
    `INSERT OR IGNORE INTO place_version_link
       (from_place_version_id, to_place_version_id, kind, basis, source_id)
     VALUES (?, ?, 'name_match', ?, NULL)`,
  );
  for (let i = 0; i + 1 < epochs.length; i += 1) {
    const older = epochs[i] ?? "";
    const newer = epochs[i + 1] ?? "";
    const rows = all<{ from_id: number; to_id: number; nm: string }>(
      db,
      `SELECT a.id AS from_id, b.id AS to_id, b.canonical_name AS nm
         FROM place_version a
         JOIN place_version b
           ON b.jurisdiction_id = a.jurisdiction_id
          AND b.kind = a.kind
          AND b.epoch_id = ?
          AND UPPER(REPLACE(REPLACE(b.canonical_name, ' ', ''), '-', ''))
            = UPPER(REPLACE(REPLACE(a.canonical_name, ' ', ''), '-', ''))
        WHERE a.epoch_id = ?
          AND a.kind IN ('ac','pc')
          AND a.canonical_name IS NOT NULL
          AND b.canonical_name IS NOT NULL`,
      newer,
      older,
    );
    for (const r of rows) {
      insert.run(r.from_id, r.to_id, `source name identical in the adjacent delimitation (${older} → ${newer})`);
      n += 1;
    }
  }
  return n;
}
