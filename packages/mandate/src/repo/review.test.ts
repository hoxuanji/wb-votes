// Tests for the merge review queue and, mostly, for its estimator.
//
// The estimator is the deliverable: it is the first number this project will publish about what the
// resolver MISSED, and a recall figure that is quietly biased is worse than no recall figure, because
// it retires the question. So these test the statistics, not the plumbing:
//   · an unsampled band must refuse to total, not contribute a zero
//   · a stratified estimate must weight by band size, not average the bands
//   · "cannot tell" must leave the denominator
//   · the interval must not be the naive normal one, which goes negative at p=0
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { openRead, DEV_DB_PATH } from "../db/open.ts";
import { migrate } from "../db/migrate.ts";
import {
  AUTO_MERGE_AT,
  BANDS,
  QUEUE_AT,
  TARGET_PER_BAND,
  nextForReview,
  progress,
  recallEstimate,
  recordDecision,
} from "./review.ts";

const HAVE_DB = existsSync(process.env["MANDATE_DB_PATH"] ?? DEV_DB_PATH);
const live = { skip: HAVE_DB ? false : "no .data/registry.db — run npm run registry:ingest" };
const NOW = "2026-08-09T00:00:00.000Z";

/** An in-memory registry with a synthetic queue, so the estimator's arithmetic is checked against
 *  numbers chosen to make a wrong weighting visible. */
function fixture(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  migrate(db, NOW);
  let n = 0;
  const add = (score: number, count: number): void => {
    for (let i = 0; i < count; i += 1) {
      n += 1;
      const a = `p${String(n).padStart(6, "0")}a`;
      const b = `p${String(n).padStart(6, "0")}b`;
      for (const id of [a, b]) {
        db.prepare(
          `INSERT INTO person (id, canonical_name, canonical_name_script, names, review_state,
                               created_at)
           VALUES (?, ?, 'latn', '{}', 'auto', ?)`,
        ).run(id, id.toUpperCase(), NOW);
      }
      db.prepare(
        `INSERT INTO person_merge_candidate
           (person_a_id, person_b_id, score, evidence, blocked_by, state, queued_at)
         VALUES (?, ?, ?, '{"nameSim":0.9}', 'name', 'pending', ?)`,
      ).run(a, b, score, NOW);
    }
  };
  // Deliberately lopsided, like the real queue: the biggest band is the least similar one.
  add(0.88, 100); // top band
  add(0.8, 100);
  add(0.7, 100);
  add(0.6, 1000); // 10x the others
  return db;
}

const decide = (db: DatabaseSync, score: number, same: number, diff: number, skip = 0): void => {
  const rows = db
    .prepare(
      `SELECT person_a_id a, person_b_id b FROM person_merge_candidate
        WHERE score = ? AND state = 'pending' ORDER BY person_a_id`,
    )
    .all(score) as { a: string; b: string }[];
  let i = 0;
  for (let k = 0; k < same; k += 1, i += 1)
    recordDecision(db, rows[i]!.a, rows[i]!.b, "merged", "t", NOW);
  for (let k = 0; k < diff; k += 1, i += 1)
    recordDecision(db, rows[i]!.a, rows[i]!.b, "rejected", "t", NOW);
  for (let k = 0; k < skip; k += 1, i += 1)
    recordDecision(db, rows[i]!.a, rows[i]!.b, "deferred", "t", NOW);
};

test("bands tile the space between the two thresholds without gaps or overlap", () => {
  const sorted = [...BANDS].sort((a, b) => a.lo - b.lo);
  assert.equal(sorted[0]?.lo, QUEUE_AT, "lowest band does not start at the queue floor");
  assert.equal(sorted.at(-1)?.hi, AUTO_MERGE_AT, "highest band does not end at the auto-merge line");
  for (let i = 1; i < sorted.length; i += 1) {
    assert.equal(sorted[i]?.lo, sorted[i - 1]?.hi, `gap or overlap at ${sorted[i]?.label}`);
  }
});

test("an unsampled band refuses to produce a total", () => {
  const db = fixture();
  decide(db, 0.88, 10, 30); // only the top band reviewed
  const e = recallEstimate(db);
  assert.equal(e.recallPct, null, "produced a recall figure from one of four bands");
  assert.equal(e.estimatedMisses, null);
  assert.equal(e.unsampled.length, 3);
  assert.equal(e.confirmedMisses, 10, "confirmed misses are still countable and still reported");
  db.close();
});

test("the estimate weights each band by its size, not by its sample", () => {
  const db = fixture();
  // Rates chosen so an unweighted mean and a weighted total are far apart: the huge band is clean.
  decide(db, 0.88, 20, 20); // 50% of 100  -> 50
  decide(db, 0.8, 10, 30); //  25% of 100  -> 25
  decide(db, 0.7, 4, 36); //   10% of 100  -> 10
  decide(db, 0.6, 0, 40); //    0% of 1000 ->  0
  const e = recallEstimate(db);
  assert.ok(e.estimatedMisses !== null);
  assert.equal(Math.round(e.estimatedMisses ?? 0), 85, "band sizes were not used as weights");

  // The unweighted mean of the four rates is 21.25%, which over 1,300 pairs would be ~276 — more than
  // three times the truth. This assertion is what stops that mistake coming back.
  assert.ok((e.estimatedMisses ?? 0) < 150, "looks like an average of rates rather than a total");

  // 1,160-equivalent: with 85 misses against the fixture's 0 auto-merges recall is 0, so check the
  // arithmetic directly instead.
  assert.equal(e.autoMerges, 0);
  assert.equal(e.recallPct, 0, "no merges made, so recall must be 0, not undefined or 100");
  db.close();
});

test("cannot-tell leaves the denominator instead of counting as different", () => {
  const db = fixture();
  decide(db, 0.88, 10, 10, 20); // 20 deferred
  const top = progress(db).find((b) => b.label === BANDS[0]?.label);
  assert.equal(top?.reviewed, 20, "deferred pairs were counted as reviewed");
  assert.equal(top?.sameCount, 10);
  assert.equal(top?.differentCount, 10);
  const e = recallEstimate(db);
  const band = e.bands.find((b) => b.label === BANDS[0]?.label);
  assert.equal(band?.ratePct, 50, "deferred pairs moved the rate");
  db.close();
});

test("a zero-duplicate band gets an interval that is not zero-width", () => {
  const db = fixture();
  decide(db, 0.88, 0, 40);
  decide(db, 0.8, 0, 40);
  decide(db, 0.7, 0, 40);
  decide(db, 0.6, 0, 40);
  const e = recallEstimate(db);
  assert.equal(e.estimatedMisses, 0, "no duplicates found, so the point estimate is 0");
  assert.ok(
    (e.estimatedMissesHigh ?? 0) > 0,
    "0 of 40 in every band was reported as certainly zero — the naive interval collapses at p=0, " +
      "which is exactly where this queue sits",
  );
  // 40 clean rows in a 1,000-pair band cannot bound it tightly, so the upper bound must be material.
  assert.ok((e.estimatedMissesHigh ?? 0) > 50, `upper bound ${e.estimatedMissesHigh} is implausibly tight`);
  db.close();
});

test("recall bounds cross over: more missed merges means less recall", () => {
  const db = fixture();
  db.prepare(
    `INSERT INTO person_merge (surviving_id, merged_id, score, decided_by, decided_at, evidence)
     VALUES ('p000001a', 'zzz', 0.99, 'auto:v3', ?, '{}')`,
  ).run(NOW);
  decide(db, 0.88, 5, 35);
  decide(db, 0.8, 5, 35);
  decide(db, 0.7, 5, 35);
  decide(db, 0.6, 5, 35);
  const e = recallEstimate(db);
  assert.ok(e.recallPct !== null && e.recallLowPct !== null && e.recallHighPct !== null);
  assert.ok(
    (e.recallLowPct ?? 0) <= (e.recallPct ?? 0) && (e.recallPct ?? 0) <= (e.recallHighPct ?? 0),
    `bounds are not ordered: ${e.recallLowPct} / ${e.recallPct} / ${e.recallHighPct}`,
  );
  // The high-misses end of the interval must be the LOW-recall end.
  assert.ok((e.estimatedMissesHigh ?? 0) > (e.estimatedMisses ?? 0));
  db.close();
});

test("a decision is idempotent and order-independent", () => {
  const db = fixture();
  const r = db
    .prepare(`SELECT person_a_id a, person_b_id b FROM person_merge_candidate LIMIT 1`)
    .get() as { a: string; b: string };
  assert.equal(recordDecision(db, r.a, r.b, "merged", "t", NOW), true);
  // Replay: a reloaded POST must not overwrite a considered judgement.
  assert.equal(recordDecision(db, r.a, r.b, "rejected", "t", NOW), false);
  // The table's CHECK enforces a < b, so a form that posts them the other way must still resolve.
  const s = db
    .prepare(`SELECT person_a_id a, person_b_id b FROM person_merge_candidate WHERE state='pending' LIMIT 1`)
    .get() as { a: string; b: string };
  assert.equal(recordDecision(db, s.b, s.a, "rejected", "t", NOW), true);
  db.close();
});

test("the queue serves the band with the largest shortfall, and never repeats a decided pair", () => {
  const db = fixture();
  const seen = new Set<string>();
  for (let i = 0; i < 12; i += 1) {
    const p = nextForReview(db);
    assert.ok(p !== null, `queue dried up after ${i} pairs with 1,300 pending`);
    const key = `${p.aId}|${p.bId}`;
    assert.ok(!seen.has(key), `served ${key} twice`);
    seen.add(key);
    recordDecision(db, p.aId, p.bId, "rejected", "t", NOW);
  }
  // 12 decisions over 4 bands, balanced allocation: every band must have been touched.
  const touched = progress(db).filter((b) => b.reviewed > 0);
  assert.equal(touched.length, BANDS.length, "allocation is not spreading across bands");
  db.close();
});

test("the live queue is reviewable and its pairs carry real evidence", live, () => {
  const db = openRead();
  const p = nextForReview(db);
  assert.ok(p !== null, "8,683 pairs are pending but the queue served none");
  assert.ok(p.score >= QUEUE_AT && p.score < AUTO_MERGE_AT, `score ${p.score} is outside the bands`);
  assert.notEqual(p.aId, p.bId);
  // A reviewer cannot judge sameness from two ids: both sides need a name and their contest history.
  for (const side of [p.a, p.b]) {
    assert.ok(side.canonicalName.length > 0, `${side.id} has no name to show`);
    assert.ok(side.aliases.length > 0, `${side.id} has no names on file`);
  }
  assert.ok(
    p.a.contests.length + p.b.contests.length > 0,
    "neither record has a contest, so there is nothing to compare",
  );
  const prog = progress(db);
  assert.equal(prog.length, BANDS.length);
  // Against a live COUNT, not a literal: this asserted 8,683 and broke the moment the Lok Sabha load
  // gave 42 MPs candidacies, which made the resolver score 20 more pairs. The invariant is that the
  // bands tile the queue, not that the queue is a particular size.
  const queued =
    (openRead().prepare(`SELECT count(*) AS n FROM person_merge_candidate
                          WHERE score >= ? AND score < ?`).get(QUEUE_AT, AUTO_MERGE_AT) as { n: number }).n;
  assert.equal(
    prog.reduce((n, b) => n + b.size, 0),
    queued,
    "the bands no longer cover every pair between the queue floor and the auto-merge line",
  );
  assert.ok(prog.every((b) => b.target <= TARGET_PER_BAND));
});
