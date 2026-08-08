/**
 * Entity resolution v1 — tests. Every one of these fails without the code it covers.
 *
 * One in-memory fixture, 15 persons, aliases across Latin / Bengali / Devanagari, built through
 * the real migrations so the schema constraints (candidacy UNIQUE (contest_id, person_id) above
 * all) are the same ones production has. No mocks, no fixture files, no framework.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { DEV_DB_PATH, all, open } from "../../db/index.ts";
import { migrate } from "../../db/migrate.ts";
import { blockingKeys, phoneticKey } from "../../core/indic/index.ts";
import { blockPairs, loadPersons } from "./block.ts";
import { jaroWinkler, loadPartyClasses, scorePair } from "./score.ts";
import {
  AUTO_MERGE_AT,
  QUEUE_AT,
  auditSample,
  checkInvariants,
  resolvePersons,
  unmerge,
} from "./index.ts";

const NOW = "2026-08-07T00:00:00.000Z";

/** ac number -> district. Three districts so "distant districts" means something. */
const DISTRICTS: Record<string, string> = {
  "001": "d1", "002": "d1", "003": "d1", "004": "d1", "005": "d1",
  "006": "d2", "007": "d2", "008": "d2",
  "010": "d3", "011": "d3",
};

type Cand = { ac: string; year: number; age: number | null; party: string };
type Fix = { id: string; name: string; aliases?: [string, string][]; myneta?: string; cands: Cand[] };

/**
 * The fixture. Each entry is a person as the registry would hold it after ingest: one canonical
 * alias plus any extra-script aliases, an optional myneta id, and its candidacies.
 */
const PEOPLE: Fix[] = [
  // 1. the transliteration pair that must MERGE: honorifics differ, constituency and party agree,
  //    ages age correctly across five years, different contests.
  { id: "md-salim", name: "Md. Salim", myneta: "wb_1", cands: [{ ac: "001", year: 2016, age: 60, party: "CPIM" }] },
  { id: "mohammed-salim", name: "Mohammed Salim", myneta: "wb_2", cands: [{ ac: "001", year: 2021, age: 65, party: "CPIM" }] },

  // 2. the hard negative: identical names, ONE contest, two candidacies.
  { id: "ratan-roy-a", name: "Ratan Roy", cands: [{ ac: "002", year: 2021, age: 50, party: "AITC" }] },
  { id: "ratan-roy-b", name: "Ratan Roy", cands: [{ ac: "002", year: 2021, age: 51, party: "BJP" }] },

  // 3. same name, different districts, 25-year age gap.
  { id: "bimal-ghosh-nadia", name: "Bimal Ghosh", cands: [{ ac: "003", year: 2016, age: 40, party: "AITC" }] },
  { id: "bimal-ghosh-purulia", name: "Bimal Ghosh", cands: [{ ac: "010", year: 2016, age: 65, party: "BJP" }] },

  // 4. father and son: same name, same constituency, same party, ~28 years apart.
  { id: "ajit-mondal-sr", name: "Ajit Mondal", cands: [{ ac: "004", year: 2011, age: 62, party: "CPIM" }] },
  { id: "ajit-mondal-jr", name: "Ajit Mondal", cands: [{ ac: "004", year: 2021, age: 44, party: "CPIM" }] },

  // 5. Banerjee / Bandyopadhyay — one blocking bucket by design; scoring must decide.
  { id: "sujata-banerjee", name: "Sujata Banerjee", cands: [{ ac: "005", year: 2016, age: 50, party: "AITC" }] },
  { id: "sujata-bandyopadhyay", name: "Sujata Bandyopadhyay", cands: [{ ac: "005", year: 2021, age: 55, party: "AITC" }] },

  // 6. cross-script: a Bengali-only record must reach its Latin twin.
  {
    id: "mamata-banerjee",
    name: "Mamata Banerjee",
    aliases: [["মমতা ব্যানার্জী", "beng"], ["ममता बनर्जी", "deva"]],
    cands: [{ ac: "006", year: 2016, age: 61, party: "AITC" }],
  },
  {
    id: "mamata-beng",
    name: "মমতা ব্যানার্জী",
    cands: [{ ac: "006", year: 2021, age: 66, party: "AITC" }],
  },

  // 7. the transitivity trap: A and C are in ONE contest, B pairs strongly with both.
  { id: "nirmal-maji-a", name: "Nirmal Maji", cands: [{ ac: "007", year: 2016, age: 50, party: "AITC" }] },
  { id: "nirmal-maji-c", name: "Nirmal Maji", cands: [{ ac: "007", year: 2016, age: 52, party: "AITC" }] },
  { id: "nirmal-maji-b", name: "Nirmal Maji", cands: [{ ac: "007", year: 2021, age: 55, party: "AITC" }] },
];

const PARTIES = ["AITC", "BJP", "CPIM", "SS", "SS-UBT", "IND"];

/** `people` defaults to the 15-person fixture; the cycle-2 cases pass their own small cast so they
 *  cannot perturb the counts the tests above assert. */
function fixture(people: readonly Fix[] = PEOPLE): DatabaseSync {
  const db = open(":memory:");
  migrate(db, NOW);
  const run = (sql: string, ...p: (string | number | null)[]): void => {
    db.prepare(sql).run(...p);
  };

  run("INSERT INTO source (id, kind, retrieved_at, doc_hash) VALUES ('s1', 'static_module', ?, 'h1')", NOW);
  run("INSERT INTO boundary_epoch (id, name, effective_from) VALUES ('e1', 'delim-2008', '2008-02-19')");
  run("INSERT INTO place (id, kind, canonical_name) VALUES ('wb', 'state', 'West Bengal')");
  for (const d of ["d1", "d2", "d3"]) {
    run("INSERT INTO place (id, kind, parent_id, canonical_name) VALUES (?, 'district', 'wb', ?)", d, d);
  }
  const acs = [...new Set(people.flatMap((p) => p.cands.map((c) => c.ac)))].sort();
  let pvId = 1;
  const pvOf = new Map<string, number>();
  for (const ac of acs) {
    run("INSERT INTO place (id, kind, parent_id, canonical_name) VALUES (?, 'ac', ?, ?)", `ac.${ac}`, DISTRICTS[ac] ?? "d1", `AC ${ac}`);
    run("INSERT INTO place_version (id, place_id, epoch_id, number) VALUES (?, ?, 'e1', ?)", pvId, `ac.${ac}`, Number(ac));
    pvOf.set(ac, pvId);
    pvId += 1;
  }

  const years = [...new Set(people.flatMap((p) => p.cands.map((c) => c.year)))].sort();
  for (const y of years) {
    run(
      `INSERT INTO election (id, kind, level, jurisdiction_place_id, epoch_id, name, lifecycle)
         VALUES (?, 'assembly', 'state', 'wb', 'e1', ?, 'declared')`,
      `wb-assembly-${y}`,
      `WB ${y}`,
    );
    for (const ac of acs) {
      run(
        "INSERT INTO contest (id, election_id, place_version_id, lifecycle) VALUES (?, ?, ?, 'declared')",
        `wb-assembly-${y}:ac.${ac}`,
        `wb-assembly-${y}`,
        pvOf.get(ac) ?? 1,
      );
    }
  }

  let pvpId = 1;
  const partyVersion = new Map<string, number>();
  for (const p of PARTIES) {
    run(
      "INSERT INTO party (id, name, short_name, kind) VALUES (?, ?, ?, ?)",
      p, p, p, p === "IND" ? "independent" : "state",
    );
    run("INSERT INTO party_version (id, party_id, valid_from, name) VALUES (?, ?, '2011-01-01', ?)", pvpId, p, p);
    partyVersion.set(p, pvpId);
    pvpId += 1;
  }
  // A real split: SS -> SS-UBT. A party change across this edge must not penalise.
  run(
    "INSERT INTO party_lineage (from_party_id, to_party_id, kind, effective_on) VALUES ('SS', 'SS-UBT', 'split', '2022-06-21')",
  );

  for (const p of people) {
    run("INSERT INTO person (id, canonical_name, created_at) VALUES (?, ?, ?)", p.id, p.name, NOW);
    for (const [name, script] of [[p.name, "latn"] as [string, string], ...(p.aliases ?? [])]) {
      // One row PER BLOCKING KEY, which is what migration 005 and the real ingest write: the
      // same name arrives 1-3 times and loadPersons has to collapse it.
      for (const key of blockingKeys(name)) {
        run(
          "INSERT OR IGNORE INTO person_alias (person_id, name, script, norm_key, kind, source_id) VALUES (?, ?, ?, ?, 'eci_nomination', 's1')",
          p.id,
          name,
          script,
          key,
        );
      }
    }
    if (p.myneta !== undefined) {
      run("INSERT INTO person_identifier (person_id, scheme, value, source_id) VALUES (?, 'myneta_id', ?, 's1')", p.id, p.myneta);
    }
    for (const c of p.cands) {
      run(
        `INSERT INTO candidacy (id, contest_id, person_id, party_version_id, status, age_declared)
           VALUES (?, ?, ?, ?, 'contesting', ?)`,
        `wb-assembly-${c.year}:ac.${c.ac}:${p.id}`,
        `wb-assembly-${c.year}:ac.${c.ac}`,
        p.id,
        partyVersion.get(c.party) ?? 1,
        c.age,
      );
    }
  }
  return db;
}

function scoreOf(db: DatabaseSync, a: string, b: string): { score: number; features: ReturnType<typeof scorePair>["features"] } {
  const persons = loadPersons(db);
  const pa = persons.get(a);
  const pb = persons.get(b);
  assert.ok(pa !== undefined && pb !== undefined, `${a} / ${b} missing from fixture`);
  return scorePair(pa, pb, loadPartyClasses(db));
}

// ── jaro-winkler ─────────────────────────────────────────────────────────────

test("jaroWinkler: identical, disjoint, and the prefix bonus", () => {
  assert.equal(jaroWinkler("banerjee", "banerjee"), 1);
  assert.equal(jaroWinkler("", ""), 0);
  assert.equal(jaroWinkler("abc", ""), 0);
  assert.equal(jaroWinkler("abc", "xyz"), 0);
  // Prefix bonus: a shared prefix must score higher than the same edits at the front.
  assert.ok(jaroWinkler("banerjea", "banerjee") > jaroWinkler("xanerjea", "yanerjee"));
  assert.ok(jaroWinkler("dwayne", "duane") > 0.8 && jaroWinkler("dwayne", "duane") < 0.9);
});

// ── stage 1: blocking ────────────────────────────────────────────────────────

test("blocking: never emits the naive pair set, and reports its reduction", () => {
  const db = fixture();
  const { pairs, report } = blockPairs(db);
  assert.equal(report.persons, PEOPLE.length);
  assert.equal(report.naivePairs, (PEOPLE.length * (PEOPLE.length - 1)) / 2);
  assert.ok(report.pairs < report.naivePairs, "blocking produced the full pair set");
  assert.ok(report.reductionPct > 0);
  assert.equal(report.oversizedBuckets, 0);
  // Every pair is canonically ordered and unique.
  const seen = new Set(pairs.map((p) => `${p.a} ${p.b}`));
  assert.equal(seen.size, pairs.length);
  for (const p of pairs) assert.ok(p.a < p.b, `pair not canonically ordered: ${p.a} ${p.b}`);
  db.close();
});

test("blocking: Md. Salim and Mohammed Salim land in one bucket", () => {
  const db = fixture();
  const { pairs } = blockPairs(db);
  assert.ok(pairs.some((p) => p.a === "md-salim" && p.b === "mohammed-salim"));
  db.close();
});

test("blocking: a Bengali-only record reaches its Latin twin", () => {
  const db = fixture();
  const { pairs } = blockPairs(db);
  assert.ok(
    pairs.some((p) => (p.a === "mamata-banerjee" && p.b === "mamata-beng") || (p.a === "mamata-beng" && p.b === "mamata-banerjee")),
    "cross-script pair was not blocked together",
  );
  db.close();
});

test("blocking: Banerjee and Bandyopadhyay share a bucket — over-collapsing is intended", () => {
  const db = fixture();
  const { pairs } = blockPairs(db);
  assert.ok(pairs.some((p) => p.a === "sujata-bandyopadhyay" && p.b === "sujata-banerjee"));
  db.close();
});

// ── stage 2: scoring ─────────────────────────────────────────────────────────

test("scoring HARD NEGATIVE: two candidacies in one contest score 0, and no name score outvotes it", () => {
  const db = fixture();
  const s = scoreOf(db, "ratan-roy-a", "ratan-roy-b");
  assert.equal(s.score, 0);
  assert.equal(s.features.sameContest, true);
  assert.equal(s.features.sameContestId, "wb-assembly-2021:ac.002");
  // The short-circuit runs BEFORE any name feature: the vector carries no name evidence at all.
  assert.equal(s.features.nameSim, 0);
  assert.equal(s.features.phoneticEqual, false);
  // Names really are identical, so a scorer without the short-circuit would have merged them.
  assert.equal(jaroWinkler("ratan roy", "ratan roy"), 1);
  db.close();
});

test("scoring: age divergence pushes the score DOWN, not merely fails to raise it", () => {
  const db = fixture();
  const father = scoreOf(db, "ajit-mondal-jr", "ajit-mondal-sr");
  assert.equal(father.features.nameSim, 1);
  assert.equal(father.features.constituencyOverlap, 1);
  assert.equal(father.features.partyOverlap, 1);
  assert.equal(father.features.ageResidual, 28);
  assert.ok(father.features.ageScore < 0, `expected a negative age feature, got ${father.features.ageScore}`);
  // Same vector with a consistent age scores strictly higher — the age term is load-bearing.
  const consistent = scoreOf(db, "md-salim", "mohammed-salim");
  assert.ok(consistent.features.ageScore > 0);
  assert.ok(consistent.score > father.score);
  db.close();
});

test("scoring: party_lineage split does not penalise a party change", () => {
  const db = fixture();
  const classes = loadPartyClasses(db);
  assert.equal(classes.get("SS"), classes.get("SS-UBT"));
  db.close();
});

// ── stage 3: decide ──────────────────────────────────────────────────────────

test("Md. Salim vs Mohammed Salim, different contests, same constituency -> MERGED", () => {
  const db = fixture();
  const s = scoreOf(db, "md-salim", "mohammed-salim");
  assert.ok(s.score >= AUTO_MERGE_AT, `expected >= ${AUTO_MERGE_AT}, got ${s.score}`);
  resolvePersons(db, { nowIso: NOW });
  const survivors = all<{ id: string }>(db, "SELECT id FROM person WHERE id IN ('md-salim', 'mohammed-salim')");
  assert.equal(survivors.length, 1, "exactly one of the pair should survive");
  const m = all<{ surviving_id: string; merged_id: string; decided_by: string; decided_at: string; evidence: string }>(
    db,
    "SELECT surviving_id, merged_id, decided_by, decided_at, evidence FROM person_merge",
  ).filter((r) => r.merged_id === "mohammed-salim" || r.merged_id === "md-salim");
  assert.equal(m.length, 1);
  assert.equal(m[0]?.decided_by, "auto:v1");
  assert.equal(m[0]?.decided_at, NOW);
  const evidence = JSON.parse(m[0]?.evidence ?? "{}") as Record<string, unknown>;
  assert.equal(evidence.phoneticEqual, true);
  assert.equal(evidence.constituencyOverlap, 1);
  assert.equal(typeof evidence.ageResidual, "number");
  // Both candidacies now hang off the survivor.
  const kept = m[0]?.surviving_id ?? "";
  assert.equal(all(db, "SELECT id FROM candidacy WHERE person_id = ?", kept).length, 2);
  db.close();
});

test("two candidates in the SAME contest are NEVER merged, even with identical names", () => {
  const db = fixture();
  resolvePersons(db, { nowIso: NOW });
  assert.equal(all(db, "SELECT id FROM person WHERE id IN ('ratan-roy-a', 'ratan-roy-b')").length, 2);
  assert.equal(
    all(db, "SELECT id FROM person_merge WHERE merged_id IN ('ratan-roy-a', 'ratan-roy-b')").length,
    0,
  );
  // Nor is the pair even queued for a human: a hard negative is a rejection, not a question.
  assert.equal(
    all(db, "SELECT state FROM person_merge_candidate WHERE person_a_id = 'ratan-roy-a' AND person_b_id = 'ratan-roy-b'")
      .length,
    0,
  );
  db.close();
});

test("same name, distant districts, 25-year age gap -> not merged (rejected outright)", () => {
  const db = fixture();
  const s = scoreOf(db, "bimal-ghosh-nadia", "bimal-ghosh-purulia");
  assert.equal(s.features.ageResidual, 25);
  assert.ok(s.score < QUEUE_AT, `expected < ${QUEUE_AT} (reject), got ${s.score}`);
  resolvePersons(db, { nowIso: NOW });
  assert.equal(all(db, "SELECT id FROM person WHERE id LIKE 'bimal-ghosh%'").length, 2);
  db.close();
});

test("father/son: same name, same constituency, ~28y gap -> not merged, sent to a human", () => {
  const db = fixture();
  const s = scoreOf(db, "ajit-mondal-jr", "ajit-mondal-sr");
  assert.ok(s.score < AUTO_MERGE_AT, `expected < ${AUTO_MERGE_AT}, got ${s.score}`);
  resolvePersons(db, { nowIso: NOW });
  assert.equal(all(db, "SELECT id FROM person WHERE id LIKE 'ajit-mondal%'").length, 2);
  const q = all<{ state: string; score: number }>(
    db,
    "SELECT state, score FROM person_merge_candidate WHERE person_a_id = 'ajit-mondal-jr' AND person_b_id = 'ajit-mondal-sr'",
  );
  assert.equal(q.length, 1, "an identical-name pair with a 28y gap must reach the review queue");
  assert.equal(q[0]?.state, "pending");
  db.close();
});

test("Banerjee vs Bandyopadhyay: scoring queues it — it neither auto-merges nor is rejected", () => {
  const db = fixture();
  const s = scoreOf(db, "sujata-bandyopadhyay", "sujata-banerjee");
  assert.ok(
    s.score >= QUEUE_AT && s.score < AUTO_MERGE_AT,
    `expected the review band [${QUEUE_AT}, ${AUTO_MERGE_AT}), got ${s.score}`,
  );
  resolvePersons(db, { nowIso: NOW });
  assert.equal(all(db, "SELECT id FROM person WHERE id LIKE 'sujata-%'").length, 2);
  assert.equal(
    all(db, "SELECT state FROM person_merge_candidate WHERE person_a_id = 'sujata-bandyopadhyay' AND person_b_id = 'sujata-banerjee'")
      .length,
    1,
  );
  db.close();
});

test("TRANSITIVITY: A~B and B~C but A!~C refuses the whole cluster and queues it", () => {
  const db = fixture();
  const ab = scoreOf(db, "nirmal-maji-a", "nirmal-maji-b");
  const bc = scoreOf(db, "nirmal-maji-b", "nirmal-maji-c");
  const ac = scoreOf(db, "nirmal-maji-a", "nirmal-maji-c");
  assert.ok(ab.score >= AUTO_MERGE_AT, `A~B should auto-merge, got ${ab.score}`);
  assert.ok(bc.score >= AUTO_MERGE_AT, `B~C should auto-merge, got ${bc.score}`);
  assert.equal(ac.score, 0, "A~C must be the hard negative that makes the cluster contradictory");

  const r = resolvePersons(db, { nowIso: NOW });
  assert.equal(r.refusedClusters, 1);
  // Nothing fused: all three survive.
  assert.equal(all(db, "SELECT id FROM person WHERE id LIKE 'nirmal-maji%'").length, 3);
  const deferred = all<{ person_a_id: string; person_b_id: string }>(
    db,
    "SELECT person_a_id, person_b_id FROM person_merge_candidate WHERE state = 'deferred'",
  );
  assert.equal(deferred.length, 3, "all three internal pairs of the refused cluster go to a human");
  db.close();
});

test("resolvePersons twice -> zero new merges and zero new queue rows the second time", () => {
  const db = fixture();
  const first = resolvePersons(db, { nowIso: NOW });
  assert.ok(first.merged > 0, "the fixture must produce at least one merge for this to mean anything");
  const mergesAfterFirst = all(db, "SELECT id FROM person_merge").length;
  const queueAfterFirst = all(db, "SELECT score FROM person_merge_candidate").length;

  const second = resolvePersons(db, { nowIso: "2026-08-08T00:00:00.000Z" });
  assert.equal(second.merged, 0);
  assert.equal(second.queued, 0);
  assert.equal(all(db, "SELECT id FROM person_merge").length, mergesAfterFirst);
  assert.equal(all(db, "SELECT score FROM person_merge_candidate").length, queueAfterFirst);
  db.close();
});

test("dryRun writes nothing", () => {
  const db = fixture();
  const r = resolvePersons(db, { nowIso: NOW, dryRun: true });
  assert.equal(r.dryRun, 1);
  assert.ok(r.aboveAutoMerge > 0, "there was something to roll back");
  assert.equal(all(db, "SELECT id FROM person_merge").length, 0);
  assert.equal(all(db, "SELECT score FROM person_merge_candidate").length, 0);
  assert.equal(all(db, "SELECT id FROM person").length, PEOPLE.length);
  db.close();
});

// ── stage 4: reversibility and audit ─────────────────────────────────────────

/** Every row of every table ER touches, as comparable text. */
function snapshot(db: DatabaseSync): string {
  const dump = (sql: string): string => JSON.stringify(all(db, sql));
  return [
    dump("SELECT * FROM person ORDER BY id"),
    dump("SELECT * FROM person_alias ORDER BY person_id, name, script"),
    dump("SELECT * FROM person_identifier ORDER BY scheme, value"),
    dump("SELECT * FROM candidacy ORDER BY id"),
    dump("SELECT * FROM claim ORDER BY id"),
    dump("SELECT * FROM legal_case ORDER BY id"),
  ].join("\n");
}

test("a merge is reversible: unmerge restores the exact prior row set", () => {
  const db = fixture();
  // Give the absorbed person rows in every table a merge moves.
  db.prepare("INSERT INTO claim (id, subject_ref, predicate, object_value) VALUES (1, 'person:mohammed-salim', 'age_declared', '65')").run();
  db.prepare("INSERT INTO claim (id, subject_ref, predicate, object_value) VALUES (2, 'person:md-salim', 'age_declared', '60')").run();
  db.prepare(
    "INSERT INTO legal_case (id, person_id, stage, source_id) VALUES ('lc1', 'mohammed-salim', 'unknown', 's1')",
  ).run();
  const before = snapshot(db);

  resolvePersons(db, { nowIso: NOW });
  const merges = all<{ id: number; merged_id: string }>(db, "SELECT id, merged_id FROM person_merge ORDER BY id");
  assert.ok(merges.length > 0);
  assert.notEqual(snapshot(db), before, "the merge changed nothing — nothing to reverse");

  for (const m of [...merges].reverse()) unmerge(db, m.id, "2026-08-09T00:00:00.000Z");
  assert.equal(snapshot(db), before, "unmerge did not restore the exact prior row set");

  // The audit trail survives the reversal.
  const reverted = all<{ reverted_at: string | null }>(db, "SELECT reverted_at FROM person_merge");
  assert.ok(reverted.every((r) => r.reverted_at === "2026-08-09T00:00:00.000Z"));
  assert.throws(() => unmerge(db, merges[0]?.id ?? 0, NOW), /already reverted/);
  db.close();
});

// mulberry32 itself has no test: "auditSample is reproducible from its seed" below asserts
// same-seed equality and different-seed inequality on the real consumer, which is the property
// that matters and the only reason the generator exists.

test("auditSample is reproducible from its seed and reports checkable red flags", () => {
  const db = fixture();
  resolvePersons(db, { nowIso: NOW });
  const a = auditSample(db, 15, 7);
  const b = auditSample(db, 15, 7);
  assert.deepEqual(a.samples, b.samples, "same seed must draw the same sample");
  assert.notDeepEqual(a.samples, auditSample(db, 15, 8).samples);
  assert.equal(a.sampled, all(db, "SELECT id FROM person").length);
  assert.ok(a.merged > 0);
  assert.equal(
    a.errorRatePct,
    Number(((100 * a.suspectedWrong) / a.merged).toFixed(3)),
  );
  // No merge this resolver made may carry a same-contest flag: that is the invariant it enforces.
  assert.ok(a.samples.every((s) => !s.flags.includes("same_contest")));
  db.close();
});

test("auditSample's red flags actually fire on a bad merge — the error rate is not vacuous", () => {
  const db = fixture();
  // Force the merges the default thresholds refuse. Every one of these is a wrong merge, and the
  // audit must say so from the stored evidence, not from a guess.
  //
  // autoMergeAt has to drop BELOW the bad pair's own score (the two Bimal Ghoshes score 0.40), not
  // merely below it via a chain: a component may only merge when every internal pair clears
  // autoMergeAt on its own, so a pair reachable only through a chain is refused and deferred now.
  resolvePersons(db, { nowIso: NOW, autoMergeAt: 0.35, queueAt: 0.1 });
  const a = auditSample(db, 15, 3);
  assert.ok(a.suspectedWrong > 0, "a run that merged a 25-year age gap must report suspected errors");
  assert.ok(a.errorRatePct > 0);
  const flags = new Set(a.samples.flatMap((s) => s.flags));
  assert.ok(flags.has("age_divergence"), `expected age_divergence, saw ${[...flags].join(",")}`);
  assert.ok(flags.has("post_merge_age_span"), `expected post_merge_age_span, saw ${[...flags].join(",")}`);
  // The one flag reachable at the DEFAULT thresholds: the two Bimal Ghoshes contested different
  // constituencies in the same 2016 election, which one human does not do.
  assert.ok(flags.has("two_seats_one_election"), `expected two_seats_one_election, saw ${[...flags].join(",")}`);
  db.close();
});

test("the ADR-0001 cross-table invariants hold on the fixture, and the detectors bite", () => {
  const db = fixture();
  const names = checkInvariants(db).map((i) => i.name);
  for (const expected of [
    "convicted_requires_court_order",
    "vote_share_never_exceeds_100",
    "margin_is_rank1_minus_rank2",
    "contest_epoch_matches_election_epoch",
    "contested_place_version_has_crosswalk_to_current_epoch",
    "booth_votes_not_more_than_result_votes",
    "party_version_no_overlapping_validity",
    "party_version_no_two_open_ended_rows",
    "queued_pair_names_two_live_persons",
  ]) {
    assert.ok(names.includes(expected), `missing invariant ${expected}`);
  }
  assert.deepEqual(checkInvariants(db).filter((i) => !i.pass), [], "clean fixture must pass every invariant");

  // A TRUNCATED field — the only shape the real source has (top-5 of a 12-candidate contest) — must
  // PASS. Shares summing to 72 is missing tail, not corruption; asserting 100 +/- 0.5 here made the
  // invariant permanently red on real data and therefore worthless as a gate.
  const res = (cand: string, votes: number, share: number, rank: number, margin: number | null): void => {
    db.prepare(
      `INSERT INTO result (contest_id, candidacy_id, revision, votes, vote_share, "rank", is_winner, margin, source_id, ingested_at)
         VALUES ('wb-assembly-2021:ac.002', ?, 0, ?, ?, ?, ?, ?, 's1', ?)`,
    ).run(cand, votes, share, rank, rank === 1 ? 1 : 0, margin, NOW);
  };
  const cands = db
    .prepare("SELECT id FROM candidacy WHERE contest_id = 'wb-assembly-2021:ac.002' ORDER BY id")
    .all() as { id: string }[];
  const [c1, c2] = cands;
  assert.ok(c1 !== undefined && c2 !== undefined, "fixture must give ac.002 in 2021 two candidacies");
  res(c1.id, 5000, 50, 1, 3000);
  res(c2.id, 2000, 22, 2, null);
  assert.deepEqual(
    checkInvariants(db).filter((i) => !i.pass),
    [],
    "a truncated top-N field (shares summing to 72) is incomplete, not invalid",
  );

  // Over 100 is unreachable by truncation, so it is the half that carries information.
  db.prepare("UPDATE result SET vote_share = 60 WHERE candidacy_id = ?").run(c2.id);
  assert.ok(
    checkInvariants(db).filter((i) => !i.pass).map((i) => i.name).includes("vote_share_never_exceeds_100"),
    "shares summing to 110 must fail",
  );
  db.prepare("UPDATE result SET vote_share = 22 WHERE candidacy_id = ?").run(c2.id);
  db.prepare("UPDATE result SET margin = 999 WHERE candidacy_id = ?").run(c1.id);
  assert.ok(
    checkInvariants(db).filter((i) => !i.pass).map((i) => i.name).includes("margin_is_rank1_minus_rank2"),
    "margin that is not rank1 - rank2 must fail on its own name, not fused into the share count",
  );
  db.prepare("UPDATE result SET margin = 3000 WHERE candidacy_id = ?").run(c1.id);

  // Each detector must actually fire, or "0 rows" means nothing.
  db.prepare("INSERT INTO legal_case (id, person_id, stage, source_id) VALUES ('lc9', 'md-salim', 'convicted', 's1')").run();
  db.prepare("INSERT INTO party_version (id, party_id, valid_from, name) VALUES (99, 'AITC', '2015-01-01', 'AITC')").run();
  // Migration 006 dropped person_merge_candidate's person FKs, so this row inserts: a work item
  // naming a person that does not exist is exactly what no constraint catches any more.
  db.prepare(
    `INSERT INTO person_merge_candidate (person_a_id, person_b_id, score, evidence, blocked_by, state, queued_at)
       VALUES ('md-salim', 'zz-ghost', 0.9, '{}', 'name', 'pending', ?)`,
  ).run(NOW);
  const failed = checkInvariants(db).filter((i) => !i.pass).map((i) => i.name);
  assert.ok(failed.includes("convicted_requires_court_order"));
  assert.ok(failed.includes("party_version_no_overlapping_validity"));
  assert.ok(failed.includes("party_version_no_two_open_ended_rows"));
  assert.ok(failed.includes("queued_pair_names_two_live_persons"));
  db.close();
});

// ── the real corpus ──────────────────────────────────────────────────────────

test("blocking on the real registry: >99% reduction, no oversized bucket", { skip: !existsSync(DEV_DB_PATH) }, () => {
  const db = open(DEV_DB_PATH);
  const { report } = blockPairs(db);
  // 7,327 freshly ingested, 6,167 once `mandate resolve` has run — this asserts "the real corpus",
  // not "the corpus in one particular lifecycle state", because the dev db legitimately holds both.
  assert.ok(report.persons > 6000, `expected the real corpus, got ${report.persons} persons`);
  assert.ok(report.reductionPct > 99, `reduction ${report.reductionPct}% is below the 99% floor`);
  assert.equal(report.oversizedBuckets, 0, "a bucket exceeded MAX_BUCKET — investigate before raising the cap");
  assert.ok(report.pairs > 0);
  db.close();
});

// ── cycle 2: the fixes the second review round demanded ──────────────────────

/** Merges recorded against a survivor, oldest first. */
function mergesOf(db: DatabaseSync, survivor: string): { id: number; merged_id: string }[] {
  return all<{ id: number; merged_id: string }>(
    db,
    "SELECT id, merged_id FROM person_merge WHERE surviving_id = ? AND reverted_at IS NULL ORDER BY id",
    survivor,
  );
}

test("C1: a pair the scorer CAPPED for age divergence cannot merge through a chain", () => {
  // A(2011, 62) -> born 1949 and C(2021, 34) -> born 1987: 38 years apart, AGE_CAPPED_SCORE 0.60.
  // B declares no age, so A~B and B~C are both unobserved-age 0.95 edges. The cluster must be
  // refused whole: 0.60 is above QUEUE_AT, which is why testing the internal pairs against queueAt
  // let a father and a son fuse and recorded it as `auto:v1, score=0.6`.
  const db = fixture([
    { id: "ajoy-a-father", name: "Ajoy Mondal", cands: [{ ac: "008", year: 2011, age: 62, party: "AITC" }] },
    { id: "ajoy-b-middle", name: "Ajoy Mondal", cands: [{ ac: "008", year: 2016, age: null, party: "AITC" }] },
    { id: "ajoy-c-son", name: "Ajoy Mondal", cands: [{ ac: "008", year: 2021, age: 34, party: "AITC" }] },
  ]);
  const ac = scoreOf(db, "ajoy-a-father", "ajoy-c-son");
  assert.equal(ac.score, 0.6, "the A~C pair must still be the capped one this test is about");
  assert.ok(ac.score >= QUEUE_AT && ac.score < AUTO_MERGE_AT, "and it must sit inside the review band");
  assert.ok(scoreOf(db, "ajoy-a-father", "ajoy-b-middle").score >= AUTO_MERGE_AT);

  const r = resolvePersons(db, { nowIso: NOW });
  assert.equal(r.merged, 0, "nothing may merge in a cluster holding a capped pair");
  assert.equal(r.refusedClusters, 1);
  assert.equal(all(db, "SELECT id FROM person_merge").length, 0);
  assert.equal(all(db, "SELECT id FROM person").length, 3);
  assert.equal(all(db, "SELECT state FROM person_merge_candidate WHERE state = 'deferred'").length, 3);
  db.close();
});

test("C2: an unobserved age cannot publish 1.0 — the score is capped, and the pair still merges", () => {
  const db = fixture([
    { id: "kalyan-a", name: "Kalyan Ghosh", cands: [{ ac: "008", year: 2016, age: null, party: "AITC" }] },
    { id: "kalyan-b", name: "Kalyan Ghosh", cands: [{ ac: "008", year: 2021, age: null, party: "AITC" }] },
  ]);
  const s = scoreOf(db, "kalyan-a", "kalyan-b");
  assert.equal(s.features.ageResidual, null, "the whole point: age is unobservable for this pair");
  assert.equal(s.score, 0.95, "three agreeing features with the negative one unobservable is not certainty");
  assert.ok(s.score >= AUTO_MERGE_AT, "the ceiling is not a refusal");
  assert.equal(resolvePersons(db, { nowIso: NOW }).merged, 1);
  db.close();
});

test("C3: two independents do not share a party — 'IND' is an absent affiliation, not evidence", () => {
  const db = fixture([
    { id: "affan-a", name: "MD. AFFAN ALI", cands: [{ ac: "008", year: 2011, age: null, party: "IND" }] },
    { id: "affan-b", name: "MD. AFFAN ALI", cands: [{ ac: "008", year: 2016, age: null, party: "IND" }] },
    { id: "sardar-a", name: "Ranjit Sardar", cands: [{ ac: "011", year: 2011, age: null, party: "AITC" }] },
    { id: "sardar-b", name: "Ranjit Sardar", cands: [{ ac: "011", year: 2016, age: null, party: "AITC" }] },
  ]);
  const ind = scoreOf(db, "affan-a", "affan-b");
  assert.equal(ind.features.partyOverlap, 0, "two IND candidacies are not a shared party");
  assert.ok(ind.score < AUTO_MERGE_AT, `IND-only pair scored ${ind.score} and would auto-merge`);
  assert.ok(ind.score >= QUEUE_AT, "it is still a strong pair — it belongs in front of a human");
  // The identical case WITH a real party still merges, so this is not a blanket weakening.
  assert.equal(scoreOf(db, "sardar-a", "sardar-b").features.partyOverlap, 1);
  assert.ok(scoreOf(db, "sardar-a", "sardar-b").score >= AUTO_MERGE_AT);
  db.close();
});

test("C4: phonetic EQUALITY is per token — a concatenated-key collision is not a name match", () => {
  // The concatenated keys really are identical; that is the root cause, not a coincidence.
  assert.equal(phoneticKey("Abai Dullah"), phoneticKey("Abdul Hai"));
  const db = fixture([
    { id: "abai-dullah", name: "Abai Dullah", cands: [{ ac: "008", year: 2016, age: null, party: "AITC" }] },
    { id: "abdul-hai", name: "Abdul Hai", cands: [{ ac: "008", year: 2021, age: null, party: "AITC" }] },
  ]);
  const s = scoreOf(db, "abai-dullah", "abdul-hai");
  assert.equal(s.features.phoneticEqual, false, "ab|dlh and abdl|h are not the same name");
  assert.ok(s.features.nameSim < 1, `nameSim ${s.features.nameSim} is still the perfect score`);
  assert.ok(s.score < AUTO_MERGE_AT, `two different people scored ${s.score}`);
  db.close();
});

test("C4b: containment is anchored at token boundaries — 'kbsbs' is not inside 'ankhrl|hk|bsbs'", () => {
  const db = fixture([
    { id: "keya-biswas", name: "Keya Biswas", cands: [{ ac: "008", year: 2026, age: null, party: "IND" }] },
    { id: "anchharul-biswas", name: "ANCHHARUL HAQUE BISWAS", cands: [{ ac: "008", year: 2016, age: null, party: "IND" }] },
    { id: "narmada-short", name: "NARMADA CHANDRA", cands: [{ ac: "011", year: 2016, age: null, party: "AITC" }] },
    { id: "narmada-long", name: "NARMADA CHANDRA ROY", cands: [{ ac: "011", year: 2021, age: null, party: "AITC" }] },
  ]);
  assert.ok(phoneticKey("ANCHHARUL HAQUE BISWAS").includes(phoneticKey("Keya Biswas")), "root cause");
  const bad = scoreOf(db, "anchharul-biswas", "keya-biswas");
  assert.equal(bad.features.keyContained, false, "the containment crossed a token boundary");
  assert.ok(bad.score < QUEUE_AT, `unrelated pair scored ${bad.score} and is in the review queue`);
  // A real dropped token is still containment.
  assert.equal(scoreOf(db, "narmada-long", "narmada-short").features.keyContained, true);
  db.close();
});

test("C5: the containment band is decided uniformly, not by how long the extra surname is", () => {
  const db = fixture([
    { id: "narmada-short", name: "NARMADA CHANDRA", cands: [{ ac: "011", year: 2016, age: null, party: "AITC" }] },
    { id: "narmada-long", name: "NARMADA CHANDRA ROY", cands: [{ ac: "011", year: 2021, age: null, party: "AITC" }] },
    { id: "khaleque-short", name: "ABDUL KHALEQUE", cands: [{ ac: "008", year: 2016, age: null, party: "AITC" }] },
    { id: "khaleque-long", name: "ABDUL KHALEQUE MOLLA", cands: [{ ac: "008", year: 2021, age: null, party: "AITC" }] },
  ]);
  const a = scoreOf(db, "narmada-long", "narmada-short");
  const b = scoreOf(db, "khaleque-long", "khaleque-short");
  assert.equal(a.features.keyContained, true);
  assert.equal(b.features.keyContained, true);
  assert.equal(
    a.score,
    b.score,
    "identical evidence, so identical score — 'ROY' being shorter than 'MOLLA' is not evidence",
  );
  assert.ok(a.score < AUTO_MERGE_AT, "a dropped token is a reviewer's call, uniformly");
  db.close();
});

test("C6: an office-holder row with no candidacy can still be resolved", () => {
  const db = fixture([
    { id: "nayna-cands", name: "NAYNA BANDYOPADHYAY", cands: [{ ac: "008", year: 2021, age: null, party: "AITC" }] },
    { id: "nayna-mla", name: "NAYNA BANDYOPADHYAY", cands: [] },
  ]);
  // What the ingest writes for a sitting MLA: the seat and party as a claim, no candidacy row.
  db.prepare(
    `INSERT INTO claim (content_key, subject_ref, predicate, object_value)
       VALUES ('k1', 'person:nayna-mla', 'mla_term', ?)`,
  ).run(JSON.stringify({ term: "2021-2026", placeId: "ac.008", partyId: "AITC" }));

  const p = loadPersons(db).get("nayna-mla");
  assert.deepEqual(p?.terms, [{ placeId: "ac.008", partyId: "AITC" }]);
  const s = scoreOf(db, "nayna-cands", "nayna-mla");
  assert.equal(s.features.constituencyOverlap, 1, "a claimed seat corroborates a name match");
  assert.equal(s.features.partyOverlap, 1);
  assert.equal(resolvePersons(db, { nowIso: NOW }).merged, 1, "the sitting MLA is no longer a permanent duplicate");
  db.close();
});

test("C7: the survivor is the richest record, not the lexicographically smallest id", () => {
  const db = fixture([
    { id: "a-truncated", name: "BANDYOPADHYAY NAYNA", cands: [{ ac: "008", year: 2021, age: null, party: "AITC" }] },
    {
      id: "z-full",
      name: "NAYNA BANDYOPADHYAY",
      cands: [{ ac: "008", year: 2016, age: null, party: "AITC" }, { ac: "008", year: 2011, age: null, party: "AITC" }],
    },
  ]);
  assert.equal(resolvePersons(db, { nowIso: NOW }).merged, 1);
  const survivors = all<{ id: string }>(db, "SELECT id FROM person").map((r) => r.id);
  assert.deepEqual(survivors, ["z-full"], "the two-candidacy record must keep its id and its name");
  assert.equal(all<{ id: string }>(db, "SELECT id FROM candidacy WHERE person_id = 'z-full'").length, 3);
  db.close();
});

/** X holds two candidacies and absorbs Y and Z, who share one name. The 555/556 shape. */
const TWO_MERGES: Fix[] = [
  {
    id: "ratan-x",
    name: "Ratan Roy",
    cands: [{ ac: "011", year: 2011, age: null, party: "AITC" }, { ac: "011", year: 2026, age: null, party: "AITC" }],
  },
  { id: "ratan-y", name: "Roy Ratan", cands: [{ ac: "011", year: 2016, age: null, party: "AITC" }] },
  { id: "ratan-z", name: "Roy Ratan", cands: [{ ac: "011", year: 2021, age: null, party: "AITC" }] },
];

test("C8: reverting one of two merges keeps an alias the other merge still asserts", () => {
  const db = fixture(TWO_MERGES);
  assert.equal(resolvePersons(db, { nowIso: NOW }).merged, 2);
  const merges = mergesOf(db, "ratan-x");
  assert.equal(merges.length, 2);
  const first = merges[0];
  assert.ok(first !== undefined);
  unmerge(db, first.id, NOW);
  const aliases = all<{ name: string }>(
    db,
    "SELECT name FROM person_alias WHERE person_id = 'ratan-x' ORDER BY name",
  ).map((r) => r.name);
  assert.ok(
    aliases.includes("Roy Ratan"),
    `the still-active merge asserts "Roy Ratan"; survivor now has ${aliases.join(", ")}`,
  );
  db.close();
});

test("C9: review_state is recomputed on unmerge, not restored from a stale snapshot", () => {
  const db = fixture(TWO_MERGES);
  resolvePersons(db, { nowIso: NOW });
  const merges = mergesOf(db, "ratan-x");
  const state = (): string | undefined =>
    all<{ review_state: string }>(db, "SELECT review_state FROM person WHERE id = 'ratan-x'")[0]?.review_state;
  assert.equal(state(), "auto");
  // ASCENDING id order, which is what a reviewer working a queue does.
  for (const m of merges) unmerge(db, m.id, NOW);
  assert.equal(state(), "unreviewed", "no un-reverted machine decision remains, so nothing was auto-merged");
  db.close();
});

test("C10: the queue row for a decided pair survives the merge and reads 'merged'", () => {
  const db = fixture(TWO_MERGES);
  // A human queued this pair first; resolve then decides it. The work item must not vanish.
  db.prepare(
    `INSERT INTO person_merge_candidate (person_a_id, person_b_id, score, evidence, blocked_by, state, queued_at)
       VALUES ('ratan-x', 'ratan-y', 0.9, '{}', 'name', 'pending', ?)`,
  ).run(NOW);
  resolvePersons(db, { nowIso: NOW });
  const row = all<{ state: string; decided_by: string | null }>(
    db,
    "SELECT state, decided_by FROM person_merge_candidate WHERE person_a_id = 'ratan-x' AND person_b_id = 'ratan-y'",
  )[0];
  assert.equal(row?.state, "merged");
  assert.equal(row?.decided_by, "auto:v1");
  // And reverting the merge gives the reviewer their row back.
  const merge = mergesOf(db, "ratan-x").find((m) => m.merged_id === "ratan-y");
  assert.ok(merge !== undefined);
  unmerge(db, merge.id, NOW);
  assert.equal(
    all<{ state: string }>(
      db,
      "SELECT state FROM person_merge_candidate WHERE person_a_id = 'ratan-x' AND person_b_id = 'ratan-y'",
    )[0]?.state,
    "pending",
  );
  db.close();
});

test("C11: loadPersons collapses the 1-3 person_alias rows migration 005 writes per name", () => {
  const db = fixture();
  const rows = all<{ n: number }>(
    db,
    "SELECT COUNT(*) AS n FROM person_alias WHERE person_id = 'mamata-banerjee'",
  )[0];
  assert.ok(Number(rows?.n) > 3, "the fixture must hold several blocking-key rows per alias");
  const p = loadPersons(db).get("mamata-banerjee");
  assert.equal(p?.aliases.length, 3, "three distinct names, however many key rows they arrived on");
  assert.equal(p?.latin.length, 3);
  assert.equal(new Set(p?.aliases).size, p?.aliases.length);
  db.close();
});

// ── the audit exit code ──────────────────────────────────────────────────────

test("registry:audit EXITS NON-ZERO on a violated invariant — a red invariant is not a green build", () => {
  // ADR 0001: audit "is expected to fail the run when the view returns rows". Reporting
  // invariantsFailed in JSON under exit 0 means CI cannot gate on it, so this drives the CLI.
  // cwd is the only injection point needed: DEV_DB_PATH is relative, MIGRATIONS_DIR is not.
  const cwd = mkdtempSync(join(tmpdir(), "mandate-audit-"));
  const bin = fileURLToPath(new URL("../../../bin/mandate.ts", import.meta.url));
  const run = (): { status: number | null; out: string } => {
    const r = spawnSync(process.execPath, [bin, "audit", "--n=1"], { cwd, encoding: "utf8" });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  };

  const db = open(join(cwd, DEV_DB_PATH));
  migrate(db, NOW);
  db.close();
  const clean = run();
  assert.equal(clean.status, 0, `an empty registry violates nothing: ${clean.out}`);

  const bad = open(join(cwd, DEV_DB_PATH));
  bad.prepare("INSERT INTO party (id, name, short_name, kind) VALUES ('AITC', 'AITC', 'AITC', 'state')").run();
  for (const [id, from] of [[1, "2011-01-01"], [2, "2012-01-01"]] as [number, string][]) {
    bad.prepare("INSERT INTO party_version (id, party_id, valid_from, name) VALUES (?, 'AITC', ?, 'AITC')").run(id, from);
  }
  bad.close();
  const red = run();
  assert.equal(red.status, 1, `two open-ended party_versions must fail the run: ${red.out}`);
  assert.match(red.out, /invariant\(s\) violated/);
  rmSync(cwd, { recursive: true, force: true });
});
