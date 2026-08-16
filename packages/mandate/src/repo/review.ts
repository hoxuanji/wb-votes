// The merge review queue — the surface that turns "6,167 people" from an assumption into a measurement.
//
// WHAT IS AND IS NOT MEASURABLE HERE, stated first because the number is the point.
//
// Cycle 1's audit sampled the merges the resolver MADE and found 0 errors in the sample. That is
// PRECISION. It says nothing about the merges it did NOT make, and 8,683 candidate pairs scored above
// the queue floor (0.55) and below the auto-merge threshold (0.92) were left pending with no way for a
// human to look at them. Until someone does, every "6,167 people" figure this project publishes is an
// upper bound with no error bar.
//
// This module measures RECALL WITHIN CANDIDATE PAIRS. Two duplicates that never shared a blocking key
// were never compared and are invisible to it, so the recall it reports is itself an upper bound on
// true recall. That limit is not fixable by reviewing harder — it is a property of blocking — and
// `recallEstimate` returns it as a field rather than a footnote so a caller cannot print the number
// without it.
//
// SAMPLING. 7,114 of the 8,683 pending pairs sit in the lowest band, just above the queue floor. A
// uniform random sample would be 82% low-band, would burn a reviewer's attention where nearly every
// pair is a non-match, and would estimate the high band — where the resolver's threshold decision
// actually lives — from a handful of rows. So the queue is STRATIFIED by score band with an equal
// target per band, and the population total is reassembled by weighting each band's observed rate by
// that band's size. Equal allocation is deliberate: it minimises the worst per-band interval, which is
// what a threshold argument needs, at the cost of a slightly wider interval on the total.

import type { DatabaseSync } from "node:sqlite";
import { all, get } from "../db/index.ts";
import { read } from "./index.ts";

/** The auto-merge and queue thresholds from ADR 0003. Bands are cut between them. */
export const AUTO_MERGE_AT = 0.92;
export const QUEUE_AT = 0.55;

/** Reviews wanted per band. Four bands, so 160 decisions for a full estimate. Equal allocation, not
 *  proportional: the top band has 338 pairs and the bottom 7,114, and a proportional sample would
 *  give the top band 6 rows. */
export const TARGET_PER_BAND = 40;

export type Band = { lo: number; hi: number; label: string };

/** Cut at tenths between the two thresholds. The top band ends at AUTO_MERGE_AT because anything at
 *  or above it was merged automatically and is a precision question, not a recall one. */
export const BANDS: readonly Band[] = [
  { lo: 0.85, hi: AUTO_MERGE_AT, label: "0.85–0.92" },
  { lo: 0.75, hi: 0.85, label: "0.75–0.85" },
  { lo: 0.65, hi: 0.75, label: "0.65–0.75" },
  { lo: QUEUE_AT, hi: 0.65, label: "0.55–0.65" },
];

export type Decision = "merged" | "rejected" | "deferred";

/** One side of a pair, with everything a human needs to judge sameness and nothing else. */
export type Candidate = {
  id: string;
  canonicalName: string;
  aliases: string[];
  birthYear: number | null;
  birthYearConfidence: string | null;
  sex: string | null;
  contests: {
    year: number;
    place: string;
    party: string | null;
    status: string;
    isWinner: boolean;
    ageDeclared: number | null;
  }[];
};

export type Pair = {
  aId: string;
  bId: string;
  score: number;
  band: string;
  blockedBy: string;
  /** The scorer's own feature breakdown, as recorded when the pair was queued. */
  evidence: unknown;
  a: Candidate;
  b: Candidate;
};

export type BandProgress = {
  label: string;
  size: number;
  reviewed: number;
  target: number;
  sameCount: number;
  differentCount: number;
};

function bandOf(score: number): Band | undefined {
  return BANDS.find((b) => score >= b.lo && score < b.hi);
}

function loadCandidate(db: DatabaseSync, id: string): Candidate {
  const p = get<{
    canonical_name: string;
    birth_year: number | null;
    birth_year_confidence: string | null;
    sex: string | null;
  }>(
    db,
    `SELECT canonical_name, birth_year, birth_year_confidence, sex FROM person WHERE id = ?`,
    id,
  );
  const aliases = all<{ name: string }>(
    db,
    `SELECT DISTINCT name FROM person_alias WHERE person_id = ? ORDER BY name`,
    id,
  ).map((r) => r.name);
  const contests = all<{
    election_id: string;
    place: string;
    party: string | null;
    status: string;
    is_winner: number | null;
    age_declared: number | null;
  }>(
    db,
    `SELECT c.election_id, pv.canonical_name AS place, pt.short_name AS party, ca.status,
            r.is_winner, ca.age_declared
       FROM candidacy ca
       JOIN contest c ON c.id = ca.contest_id
       JOIN election e ON e.id = c.election_id
       JOIN place_version pv ON pv.id = c.place_version_id
       JOIN place pl ON pl.id = pv.place_id
       LEFT JOIN party_version pver ON pver.id = ca.party_version_id
       LEFT JOIN party pt ON pt.id = pver.party_id
       LEFT JOIN result r ON r.candidacy_id = ca.id AND r.revision = 0
      WHERE ca.person_id = ?
      ORDER BY e.year DESC, e.polling_month DESC, e.occurrence DESC`,
    id,
  );
  return {
    id,
    canonicalName: p?.canonical_name ?? id,
    aliases,
    birthYear: p?.birth_year ?? null,
    birthYearConfidence: p?.birth_year_confidence ?? null,
    sex: p?.sex ?? null,
    contests: contests.map((c) => ({
      year: Number(/(\d{4})/.exec(c.election_id)?.[1] ?? 0),
      place: c.place,
      party: c.party,
      status: c.status,
      isWinner: c.is_winner === 1,
      ageDeclared: c.age_declared,
    })),
  };
}

/**
 * Per-band population size and review progress. `size` counts the whole band, decided or not, because
 * it is the weight the estimate multiplies by.
 */
export function progress(db: DatabaseSync): BandProgress[] {
  return read(() =>
    BANDS.map((b) => {
      const row = get<{
        size: number;
        reviewed: number;
        same: number;
        diff: number;
      }>(
        db,
        `SELECT count(*) AS size,
                sum(CASE WHEN state IN ('merged','rejected') THEN 1 ELSE 0 END) AS reviewed,
                sum(CASE WHEN state = 'merged'   THEN 1 ELSE 0 END) AS same,
                sum(CASE WHEN state = 'rejected' THEN 1 ELSE 0 END) AS diff
           FROM person_merge_candidate
          WHERE score >= ? AND score < ?`,
        b.lo,
        b.hi,
      );
      return {
        label: b.label,
        size: row?.size ?? 0,
        reviewed: row?.reviewed ?? 0,
        target: Math.min(TARGET_PER_BAND, row?.size ?? 0),
        sameCount: row?.same ?? 0,
        differentCount: row?.diff ?? 0,
      };
    }),
  );
}

/**
 * The next pair to show, chosen so the sample stays balanced across bands.
 *
 * Picks the band with the largest shortfall against its target, then the lowest-scoring undecided pair
 * in it — deterministic, so a reload shows the same pair and two reviewers working the queue do not
 * silently diverge. `deferred` rows are skipped rather than re-served: a pair a human could not decide
 * is evidence about the pair, and re-asking produces the same non-answer.
 */
export function nextForReview(db: DatabaseSync): Pair | null {
  return read(() => {
    const prog = progress(db);
    const ranked = BANDS.map((b, i) => ({
      band: b,
      deficit: (prog[i]?.target ?? 0) - (prog[i]?.reviewed ?? 0),
    }))
      .filter((x) => x.deficit > 0)
      .sort((a, b) => b.deficit - a.deficit);

    // Every band met its target — fall back to any pending pair so the queue never dead-ends while
    // 8,683 rows are undecided.
    const order = ranked.length > 0 ? ranked.map((x) => x.band) : BANDS;

    for (const b of order) {
      const row = get<{
        person_a_id: string;
        person_b_id: string;
        score: number;
        blocked_by: string;
        evidence: string;
      }>(
        db,
        `SELECT person_a_id, person_b_id, score, blocked_by, evidence
           FROM person_merge_candidate
          WHERE state = 'pending' AND score >= ? AND score < ?
          ORDER BY score DESC, person_a_id, person_b_id
          LIMIT 1`,
        b.lo,
        b.hi,
      );
      if (row === undefined) continue;
      let evidence: unknown = row.evidence;
      try {
        evidence = JSON.parse(row.evidence);
      } catch {
        // Stored evidence is JSON by convention, not by constraint. A malformed row is still
        // reviewable — the two people are what matters — so it travels as the raw string.
      }
      return {
        aId: row.person_a_id,
        bId: row.person_b_id,
        score: row.score,
        band: b.label,
        blockedBy: row.blocked_by,
        evidence,
        a: loadCandidate(db, row.person_a_id),
        b: loadCandidate(db, row.person_b_id),
      };
    }
    return null;
  });
}

/**
 * Record a human judgement. **This does not merge anything.**
 *
 * The separation is deliberate: measuring recall needs recorded judgements, and mutating 6,167 person
 * rows from an HTTP handler needs a plan for the undo tape, the claims that move, and the ids that
 * die. `mandate resolve --apply-reviewed` is where that belongs. So this writes a decision and stops,
 * and the estimate below reads decisions, not merges.
 */
export function recordDecision(
  db: DatabaseSync,
  aId: string,
  bId: string,
  decision: Decision,
  reviewer: string,
  nowIso: string,
): boolean {
  // The table's own CHECK enforces person_a_id < person_b_id, so an out-of-order pair from a form
  // would never match a row and would silently record nothing.
  const [lo, hi] = aId < bId ? [aId, bId] : [bId, aId];
  const res = db
    .prepare(
      `UPDATE person_merge_candidate
          SET state = ?, decided_by = ?, decided_at = ?
        WHERE person_a_id = ? AND person_b_id = ? AND state = 'pending'`,
    )
    .run(decision, `user:${reviewer}`, nowIso, lo, hi);
  return Number(res.changes) === 1;
}

export type Estimate = {
  /** Merges the resolver made automatically. */
  autoMerges: number;
  reviewed: number;
  /** Pairs a reviewer said were the same person and the resolver had left alone. */
  confirmedMisses: number;
  /** Missed merges across the whole pending population, from the band-weighted rates. */
  estimatedMisses: number | null;
  estimatedMissesLow: number | null;
  estimatedMissesHigh: number | null;
  /** autoMerges / (autoMerges + estimatedMisses). Null until every band has a review. */
  recallPct: number | null;
  recallLowPct: number | null;
  recallHighPct: number | null;
  bands: (BandProgress & { ratePct: number | null; weighted: number | null })[];
  /** Bands still with no reviewed pair. While this is non-empty the estimate is partial. */
  unsampled: string[];
  /** Always true, and always published with the number: pairs that never shared a blocking key were
   *  never candidates, so they cannot appear in any of this. */
  candidatePairsOnly: true;
};

/**
 * Wilson score interval. The naive p ± z·√(p(1−p)/n) is wrong exactly where this queue lives: at
 * n = 40 with p near 0 it produces a lower bound below zero and a spuriously tight width, and "0 of
 * 40 were duplicates" must not be reported as "0%, certainly".
 */
function wilson(successes: number, n: number, z = 1.96): { low: number; high: number } {
  if (n === 0) return { low: 0, high: 1 };
  const p = successes / n;
  const d = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const half = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { low: Math.max(0, (centre - half) / d), high: Math.min(1, (centre + half) / d) };
}

export function recallEstimate(db: DatabaseSync): Estimate {
  return read(() => {
    const autoMerges =
      get<{ n: number }>(db, `SELECT count(*) AS n FROM person_merge WHERE reverted_at IS NULL`)
        ?.n ?? 0;
    const prog = progress(db);

    const bands = prog.map((b) => {
      const n = b.sameCount + b.differentCount;
      return {
        ...b,
        ratePct: n === 0 ? null : (100 * b.sameCount) / n,
        weighted: n === 0 ? null : (b.sameCount / n) * b.size,
      };
    });

    const unsampled = bands.filter((b) => b.reviewed === 0 && b.size > 0).map((b) => b.label);
    const reviewed = bands.reduce((n, b) => n + b.reviewed, 0);
    const confirmedMisses = bands.reduce((n, b) => n + b.sameCount, 0);

    // A band with no review contributes an unknown, not a zero. Refusing to total is the honest
    // response: a partial sum would read as a population estimate and would be biased low by exactly
    // the bands nobody has looked at.
    if (unsampled.length > 0) {
      return {
        autoMerges,
        reviewed,
        confirmedMisses,
        estimatedMisses: null,
        estimatedMissesLow: null,
        estimatedMissesHigh: null,
        recallPct: null,
        recallLowPct: null,
        recallHighPct: null,
        bands,
        unsampled,
        candidatePairsOnly: true,
      };
    }

    let point = 0;
    let low = 0;
    let high = 0;
    for (const b of bands) {
      const n = b.sameCount + b.differentCount;
      const ci = wilson(b.sameCount, n);
      point += (b.sameCount / n) * b.size;
      low += ci.low * b.size;
      high += ci.high * b.size;
    }

    const recall = (misses: number): number => (100 * autoMerges) / (autoMerges + misses);
    return {
      autoMerges,
      reviewed,
      confirmedMisses,
      estimatedMisses: point,
      estimatedMissesLow: low,
      estimatedMissesHigh: high,
      recallPct: recall(point),
      // More missed merges means LOWER recall, so the bounds cross over.
      recallLowPct: recall(high),
      recallHighPct: recall(low),
      bands,
      unsampled,
      candidatePairsOnly: true,
    };
  });
}
