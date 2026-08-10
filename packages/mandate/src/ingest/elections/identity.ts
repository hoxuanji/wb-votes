/**
 * Election events: identity, and the split of the ones that collapsed.
 *
 * THE DEFECT. An election's identity was `(jurisdiction, house, year)` held in an id string. Bihar held two
 * assembly elections in 2005 — the 13th assembly in February, the 14th in November, 243 seats each — and
 * both became `br-assembly-2005`. `contest` is UNIQUE (election_id, place_version_id), so 486 contests
 * became 243, and a candidacy id derives from (contest, person), so the 618 candidates who stood in the
 * same seat at both elections collided and one row overwrote the other. docs/model/election-identity.md.
 *
 * THE KEY, from the source's own columns:
 *
 *     (jurisdiction, house, year, Assembly_No, Poll_No)
 *
 * `month` is deliberately excluded. Indian polling is phased — 2019's Lok Sabha election ran across April
 * and May — so keying on the month would split one election into one event per phase. `Assembly_No` is a
 * fact about the event (which house it constituted) and is exactly what separates Bihar's two: 13 and 14.
 * Verified over all 62 files: under this key no event spans more than one polling month.
 *
 * ONE ID SCHEME, USED TWICE. Both the importer and the repair derive ids from `electionIdOf` here, because
 * two implementations of an id scheme are two id schemes.
 */

import type { DatabaseSync } from "node:sqlite";
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { all, get } from "../../db/index.ts";
import { readRows } from "../sources/lokdhaba.ts";
import { readManifest, type Manifest } from "../geography/reconstruct.ts";
import {
  chronological,
  electionIdOf,
  eventKey,
  eventsFromRows,
  groupKey,
  type House,
  type SourceElection,
} from "./event.ts";

export type { House, SourceElection } from "./event.ts";

/** Every electoral event the source files describe, read from the hash-verified cache. Each file is
 *  byte-identical to the sha256 recorded on its `source` row at import, so an event asserted here is
 *  traceable to the document that produced the rows being repaired. */
export function sourceElections(manifest: readonly Manifest[]): {
  events: SourceElection[];
  groups: Map<string, SourceElection[]>;
} {
  // Merged by event key, not concatenated: one national parliamentary election is described by all 30
  // state files, and counting it thirty times is how 1,188 elections became 1,571 "events".
  const merged = new Map<string, SourceElection>();
  for (const m of manifest) {
    const jurisdictionId = m.sourceId.split(":")[1] ?? "";
    const { rows } = readRows(gunzipSync(readFileSync(m.path)).toString("utf8"));
    for (const e of eventsFromRows(jurisdictionId, rows, m.sourceId).events) {
      const k = eventKey(e);
      const cur = merged.get(k);
      if (cur === undefined) merged.set(k, { ...e });
      else {
        cur.seats += e.seats;
        cur.rows += e.rows;
        if (e.month !== null && (cur.month === null || e.month < cur.month)) cur.month = e.month;
      }
    }
  }
  const events = [...merged.values()];
  const groups = new Map<string, SourceElection[]>();
  for (const e of events) {
    const g = groups.get(groupKey(e)) ?? [];
    g.push(e);
    groups.set(groupKey(e), g);
  }
  for (const g of groups.values()) g.sort(chronological);
  return { events, groups };
}

export type PlannedElection = SourceElection & {
  /** The id this event should have. */
  id: string;
  /** 1-based chronological position within its group. */
  occurrence: number;
  /** The id the registry currently holds for it, when that differs. */
  currentId: string | null;
};

/** Every event with its id and occurrence resolved. */
export function planElections(manifest: readonly Manifest[]): PlannedElection[] {
  const { groups } = sourceElections(manifest);
  const out: PlannedElection[] = [];
  for (const g of groups.values()) {
    g.forEach((e, i) => {
      const id = electionIdOf(e, g);
      // The collapsed id is the one the group WOULD have had as a single event — that is what the registry
      // holds today for a group that needs splitting.
      const collapsed = electionIdOf(e, [e]);
      out.push({ ...e, id, occurrence: i + 1, currentId: id === collapsed ? id : collapsed });
    });
  }
  return out;
}

export type ElectionBackfillReport = {
  applied: boolean;
  events: number;
  /** Elections in the registry that the plan matched by id and updated in place. */
  updated: number;
  /** Plan entries whose id is not in the registry — the halves of a split that must be imported. */
  missing: { id: string; from: string | null; seats: number; rows: number }[];
  /** Registry elections the plan does not describe: the seed's, and the collapsed ids being replaced. */
  unmatched: string[];
  /** Groups holding more than one event. */
  collisions: { group: string; ids: string[] }[];
  reportPath: string | null;
};

/**
 * Write the model onto the elections that already exist, and say what is missing.
 *
 * Deliberately does NOT create or delete anything. The halves of a split cannot be conjured — 618 of
 * Bihar's candidate rows were never stored — so this reports them and `mandate elections repair` does the
 * delete-and-re-import, in that order and only after the counts have been checked on a copy.
 */
export function backfillElections(
  db: DatabaseSync,
  opts: { apply: boolean; manifestPath?: string },
): ElectionBackfillReport {
  const { usable, unusable } = readManifest(opts.manifestPath ?? ".data/cache/lokdhaba/refetch-manifest.tsv");
  if (unusable.length > 0) {
    throw new Error(
      `${unusable.length} source file(s) no longer match the sha256 recorded at import; ` +
        `asserting election events from different bytes would be a new claim, not a repair`,
    );
  }
  const plan = planElections(usable);
  const known = new Set(all<{ id: string }>(db, "SELECT id FROM election").map((r) => r.id));

  const report: ElectionBackfillReport = {
    applied: opts.apply,
    events: plan.length,
    updated: 0,
    missing: [],
    unmatched: [],
    collisions: [],
    reportPath: null,
  };
  const byGroup = new Map<string, string[]>();
  for (const p of plan) {
    const g = groupKey(p);
    byGroup.set(g, (byGroup.get(g) ?? []).concat(p.id));
  }
  for (const [g, ids] of byGroup) if (ids.length > 1) report.collisions.push({ group: g, ids });

  const seen = new Set<string>();
  const writes: PlannedElection[] = [];
  for (const p of plan) {
    if (known.has(p.id)) {
      writes.push(p);
      seen.add(p.id);
      report.updated += 1;
    } else {
      report.missing.push({ id: p.id, from: p.currentId, seats: p.seats, rows: p.rows });
      if (p.currentId !== null) seen.add(p.currentId);
    }
  }
  report.unmatched = [...known].filter((id) => !seen.has(id)).sort();

  if (opts.apply) {
    db.exec("SAVEPOINT elections_backfill");
    try {
      const stmt = db.prepare(
        `UPDATE election
            SET house = ?, year = ?, polling_month = ?, house_ordinal = ?, poll_no = ?,
                occurrence = ?, source_id = ?
          WHERE id = ?`,
      );
      for (const p of writes) {
        stmt.run(p.house, p.year, p.month, p.houseOrdinal, p.pollNo, p.occurrence, p.sourceId, p.id);
      }
      db.exec("RELEASE elections_backfill");
    } catch (e) {
      db.exec("ROLLBACK TO elections_backfill");
      db.exec("RELEASE elections_backfill");
      throw e;
    }
  }
  return report;
}

export type RepairPlan = {
  /** The collapsed election to remove, and the events that replace it. */
  collapsedId: string;
  replacements: string[];
  jurisdictionId: string;
  house: House;
  contests: number;
  candidacies: number;
  results: number;
  turnout: number;
  /** Rows in the source for the whole group, against what the registry holds. */
  sourceRows: number;
};

/** What `repair` would remove, and what has to be re-imported to replace it. */
export function repairPlan(db: DatabaseSync, manifestPath?: string): RepairPlan[] {
  const { usable } = readManifest(manifestPath ?? ".data/cache/lokdhaba/refetch-manifest.tsv");
  const plan = planElections(usable);
  const groups = new Map<string, PlannedElection[]>();
  for (const p of plan) {
    const g = groupKey(p);
    groups.set(g, (groups.get(g) ?? []).concat(p));
  }
  const out: RepairPlan[] = [];
  for (const [, g] of groups) {
    if (g.length <= 1) continue;
    const collapsedId = g[0]?.currentId ?? "";
    if (collapsedId === "" || !existsElection(db, collapsedId)) continue;
    const count = (sql: string): number =>
      Number(Object.values(get<Record<string, unknown>>(db, sql, collapsedId) ?? {})[0] ?? 0);
    out.push({
      collapsedId,
      replacements: g.map((x) => x.id),
      jurisdictionId: g[0]?.jurisdictionId ?? "",
      house: g[0]?.house ?? "ac",
      contests: count("SELECT COUNT(*) n FROM contest WHERE election_id = ?"),
      candidacies: count(
        "SELECT COUNT(*) n FROM candidacy ca JOIN contest c ON c.id = ca.contest_id WHERE c.election_id = ?",
      ),
      results: count(
        "SELECT COUNT(*) n FROM result r JOIN contest c ON c.id = r.contest_id WHERE c.election_id = ?",
      ),
      turnout: count(
        "SELECT COUNT(*) n FROM turnout t JOIN contest c ON c.id = t.contest_id WHERE c.election_id = ?",
      ),
      sourceRows: g.reduce((n, x) => n + x.rows, 0),
    });
  }
  return out.sort((a, b) => a.collapsedId.localeCompare(b.collapsedId));
}

function existsElection(db: DatabaseSync, id: string): boolean {
  return get<{ n: number }>(db, "SELECT COUNT(*) AS n FROM election WHERE id = ?", id)?.n === 1;
}

/**
 * Remove a collapsed election, recording the replacement in the public correction ledger first.
 *
 * Order matters and is deliberate: the rename is written to `correction` BEFORE anything is deleted, so a
 * failure halfway leaves a record of intent rather than a silent hole. The delete is bottom-up through the
 * foreign keys — result, turnout, candidacy, contest, election — and runs inside one savepoint.
 *
 * `person` rows are NOT deleted. A person whose only candidacy was in the collapsed election survives with
 * no candidacies until the re-import re-attaches them, and the re-import derives the same person ids from
 * the same TCPD pids, so they are re-attached rather than duplicated. Deleting people here would also
 * silently discard the merge decisions in `person_merge_candidate`, which keys on persons.
 */
export function removeCollapsedElection(
  db: DatabaseSync,
  p: RepairPlan,
  opts: { nowIso: string; sourceId: string | null },
): { deleted: Record<string, number> } {
  const deleted: Record<string, number> = {};
  db.exec("SAVEPOINT elections_repair");
  try {
    // INSERT OR IGNORE, keyed by the unique public slug: if a previous attempt recorded the rename and
    // then failed before the delete, a retry must not die on its own audit row. The first record stands —
    // the ledger is a history of what was decided, not of how many times it was attempted.
    db.prepare(
      `INSERT OR IGNORE INTO correction
         (entity_ref, field, old_value, new_value, reason, source_id, corrected_at, public_slug)
       VALUES (?, 'id', ?, ?, ?, ?, ?, ?)`,
    ).run(
      `election:${p.collapsedId}`,
      JSON.stringify(p.collapsedId),
      JSON.stringify(p.replacements),
      `One id held ${p.replacements.length} distinct electoral events. An election's identity was ` +
        `(jurisdiction, house, year), and a year is not a permanent identity: the source records these as ` +
        `separate events by Assembly_No / Poll_No. The collapsed election's ${p.contests} contests, ` +
        `${p.candidacies} candidacies and ${p.results} results are removed and re-imported as ` +
        `${p.replacements.join(" and ")} from the same hash-verified source file. ` +
        `See docs/model/election-identity.md.`,
      opts.sourceId,
      opts.nowIso,
      `election-identity-${p.collapsedId}`,
    );

    const del = (table: string, sql: string): void => {
      deleted[table] = Number(db.prepare(sql).run(p.collapsedId).changes);
    };
    del(
      "result",
      "DELETE FROM result WHERE contest_id IN (SELECT id FROM contest WHERE election_id = ?)",
    );
    del(
      "round_result",
      "DELETE FROM round_result WHERE contest_id IN (SELECT id FROM contest WHERE election_id = ?)",
    );
    del(
      "booth_result",
      "DELETE FROM booth_result WHERE contest_id IN (SELECT id FROM contest WHERE election_id = ?)",
    );
    del(
      "turnout",
      "DELETE FROM turnout WHERE contest_id IN (SELECT id FROM contest WHERE election_id = ?)",
    );
    del(
      "affidavit",
      "DELETE FROM affidavit WHERE candidacy_id IN (SELECT ca.id FROM candidacy ca JOIN contest c ON c.id = ca.contest_id WHERE c.election_id = ?)",
    );
    del(
      "candidacy",
      "DELETE FROM candidacy WHERE contest_id IN (SELECT id FROM contest WHERE election_id = ?)",
    );
    del("contest", "DELETE FROM contest WHERE election_id = ?");
    del("election_phase", "DELETE FROM election_phase WHERE election_id = ?");
    del("election", "DELETE FROM election WHERE id = ?");
    db.exec("RELEASE elections_repair");
  } catch (e) {
    db.exec("ROLLBACK TO elections_repair");
    db.exec("RELEASE elections_repair");
    throw e;
  }
  return { deleted };
}

export type RepairResult = {
  collapsedId: string;
  replacements: string[];
  deleted: Record<string, number>;
  imported: { contests: number; candidacies: number; results: number } | null;
};

/**
 * Split every collapsed election, one hash-verified file at a time.
 *
 * DELETE THEN RE-IMPORT, in that order, and only ever inside one savepoint per group. The order is forced
 * by the data rather than chosen: 618 of Bihar's candidate rows were never written, so there is nothing to
 * move — the second event has to be read from the source again. Re-importing first and deleting afterwards
 * would leave the registry double-counting a whole election in between, and a failure at that point is the
 * worst of the two states to be left in.
 *
 * The rename lands in the `correction` ledger before anything is removed, so a failure leaves a record of
 * intent rather than a hole. `person` rows survive the delete (see removeCollapsedElection): the re-import
 * derives the same ids from the same TCPD pids and re-attaches them.
 */
export function repairElections(
  db: DatabaseSync,
  opts: {
    apply: boolean;
    nowIso: string;
    manifestPath?: string;
    /** Injected so this module never imports the importer, which imports the id scheme. */
    reimport: (jurisdictionId: string, sourceId: string, path: string) => { contests: number; candidacies: number; results: number };
  },
): RepairResult[] {
  const manifestPath = opts.manifestPath ?? ".data/cache/lokdhaba/refetch-manifest.tsv";
  const { usable } = readManifest(manifestPath);
  const byId = new Map(usable.map((m) => [m.sourceId, m]));
  const plan = planElections(usable);
  const plans = repairPlan(db, manifestPath);

  // GROUPED BY FILE, and every collapsed election in a file is deleted before that file is re-imported.
  //
  // Not an optimisation. Re-importing a file rewrites every election it describes, so if Andhra Pradesh's
  // 1998 by-election group is split first and the file re-imported immediately, that import also tries to
  // insert 'ap-bypoll-ae-2008-p1' while the collapsed 'ap-bypoll-ae-2008' is still present — two rows
  // claiming (ap, bypoll, ac, 2008, occurrence 1), which the UNIQUE constraint refuses. It was right to.
  const byFile = new Map<string, { path: string; jurisdictionId: string; sourceId: string; plans: RepairPlan[] }>();
  for (const p2 of plans) {
    const ev = plan.find((x) => x.currentId === p2.collapsedId);
    const file = ev === undefined ? undefined : byId.get(ev.sourceId);
    if (ev === undefined || file === undefined) continue;
    const cur = byFile.get(ev.sourceId) ?? {
      path: file.path,
      // A parliamentary general election is national ('in'), but the FILE it came from is a state's.
      jurisdictionId: file.sourceId.split(":")[1] ?? ev.jurisdictionId,
      sourceId: ev.sourceId,
      plans: [],
    };
    cur.plans.push(p2);
    byFile.set(ev.sourceId, cur);
  }

  const out: RepairResult[] = [];
  for (const f of byFile.values()) {
    if (!opts.apply) {
      for (const p2 of f.plans) {
        out.push({ collapsedId: p2.collapsedId, replacements: p2.replacements, deleted: {}, imported: null });
      }
      continue;
    }
    const deletions = f.plans.map((p2) => ({
      plan: p2,
      ...removeCollapsedElection(db, p2, { nowIso: opts.nowIso, sourceId: f.sourceId }),
    }));
    const imported = opts.reimport(f.jurisdictionId, f.sourceId, f.path);
    for (const d of deletions) {
      out.push({
        collapsedId: d.plan.collapsedId,
        replacements: d.plan.replacements,
        deleted: d.deleted,
        // The import figure is per FILE, not per group, and says so rather than being divided up.
        imported,
      });
    }
  }
  return out;
}
