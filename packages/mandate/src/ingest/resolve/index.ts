/**
 * §12 stages 3 and 4 — DECIDE and AUDIT.
 *
 * resolvePersons(db, opts) blocks, scores, and then does one of three things with every pair:
 * auto-merge, queue for a human, or reject silently. auditSample(db, n, seed) draws a reproducible
 * sample of persons, computes the published error rate from checkable red flags, and runs the nine
 * cross-table invariants ADR 0001 promises `registry:audit` enforces.
 *
 * TRANSITIVITY, stated explicitly because a silent chain fusing three politicians into one is the
 * worst failure this module can have:
 *   Auto-merge edges are unioned into components. Before any component is merged, EVERY internal
 *   pair is scored — not just the edges that built it — and every one of them must clear
 *   autoMergeAt on its own. If any internal pair is a same-contest hard negative, or scores below
 *   autoMergeAt, the ENTIRE COMPONENT IS REFUSED: nothing merges, and every internal pair is
 *   written to person_merge_candidate with state 'deferred' for a human. The rule is "refuse and
 *   queue the cluster", not "merge anyway and hope". Testing internal pairs against queueAt instead
 *   let a pair the SCORER had explicitly capped (father/son, 38 years of age divergence) merge
 *   through a chain and be recorded as a machine decision at score 0.60.
 *
 *   The survivor of a merged component is chosen by EVIDENCE (most candidacies, then the most name
 *   tokens, then the longest name, then the id), not by id sort: rooting at the lexicographically
 *   smallest member made a truncated source row the canonical name of a sitting MLA.
 *
 * Determinism: no Math.random, no Date.now. nowIso is an argument; the audit sample's randomness is
 * mulberry32 seeded by the caller. `opts.nowIso` is REQUIRED whenever anything is written — the
 * signature makes it optional because the CLI's shape does, but a merge with a fabricated
 * decided_at is a corrupt audit trail, so its absence throws rather than guessing a clock.
 */

import type { DatabaseSync } from "node:sqlite";
import { all, get } from "../../db/index.ts";
import type { BlockReport, PersonRec } from "./block.ts";
import { blockPairs, loadPersons } from "./block.ts";
import type { Features } from "./score.ts";
import { AGE_HARD_LIMIT, loadPartyClasses, scorePair, unionFind } from "./score.ts";

/** Score at or above which a pair is merged with no human in the loop. See ADR 0003. */
export const AUTO_MERGE_AT = 0.92;
/** Score below which a pair is rejected outright and not queued. See ADR 0003. */
export const QUEUE_AT = 0.55;
/**
 * Bound on the fixed-point loop. Every pass strictly reduces the person count, so the loop always
 * terminates on its own; exiting on THIS bound instead of on `merged === 0` means it never reached
 * the fixed point, which resolvePersons throws on rather than reporting a partial run. The real
 * corpus converges in 2 passes (measured 2026-08-08).
 */
export const MAX_PASSES = 10;

export type ResolveOptions = {
  autoMergeAt?: number;
  queueAt?: number;
  nowIso?: string;
  dryRun?: boolean;
};

export type ResolveReport = {
  persons: number;
  /** Persons remaining once the resolver reached its fixed point. */
  personsAfter: number;
  pairs: number;
  naivePairs: number;
  buckets: number;
  maxBucket: number;
  oversizedBuckets: number;
  /** Term claims whose object_value is not parseable JSON, so their seat and party were skipped. */
  unparseableTerms: number;
  reductionPct: number;
  /** Block -> score -> decide passes run, including the final no-op one that proved convergence. */
  passes: number;
  scored: number;
  /** Pairs at or above autoMergeAt in the FINAL pass — last-pass semantics, like the three below. */
  aboveAutoMerge: number;
  /** Persons absorbed into another person. One person_merge row each. A dry run reports what it
   *  would have merged, then rolls it back: a preview that reports 0 is not a preview. */
  merged: number;
  /** Components refused by the transitivity rule. */
  refusedClusters: number;
  /** Rows newly written to person_merge_candidate. Zero on a second run. */
  queued: number;
  /** Pairs below queueAt, dropped. */
  rejected: number;
  /** Rows in person_merge_candidate with state 'pending' or 'deferred', after the run. */
  queueDepth: number;
  hardNegatives: number;
  dryRun: number;
  durationMs: number;
};

// ── merge / unmerge ──────────────────────────────────────────────────────────

type PersonRow = {
  id: string;
  canonical_name: string;
  canonical_name_script: string | null;
  names: string;
  sex: string | null;
  birth_year: number | null;
  birth_year_confidence: string | null;
  review_state: string;
  created_at: string;
};

type AliasRow = {
  person_id: string;
  name: string;
  script: string;
  norm_key: string;
  kind: string;
  first_seen: string | null;
  source_id: string | null;
};

type UndoPayload = {
  person: PersonRow;
  aliases: AliasRow[];
  /** (name, script) pairs this merge ADDED to the survivor — the ones unmerge must remove. */
  addedAliases: [string, string][];
  identifiers: [string, string][];
  candidacies: string[];
  legalCases: string[];
  claims: number[];
};

const ALIAS_COLS = "person_id, name, script, norm_key, kind, first_seen, source_id";

/** Canonical (a, b) ordering for person_merge_candidate, whose CHECK demands person_a_id < person_b_id. */
function pairKey(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x];
}

/** Absorb `mergedId` into `survivingId`, writing person_merge + the undo tape. Not transactional on its own. */
function mergeOne(
  db: DatabaseSync,
  mergeId: number,
  survivingId: string,
  mergedId: string,
  score: number,
  features: Features,
  nowIso: string,
): void {
  const person = get<PersonRow>(db, "SELECT * FROM person WHERE id = ?", mergedId);
  if (person === undefined) throw new Error(`mergeOne: person ${mergedId} does not exist`);

  const aliases = all<AliasRow>(db, `SELECT ${ALIAS_COLS} FROM person_alias WHERE person_id = ?`, mergedId);
  const survivorHas = new Set(
    all<{ name: string; script: string }>(db, "SELECT name, script FROM person_alias WHERE person_id = ?", survivingId)
      .map((r) => `${r.name}\u0000${r.script}`),
  );
  const addedAliases: [string, string][] = aliases
    .filter((a) => !survivorHas.has(`${a.name}\u0000${a.script}`))
    .map((a) => [a.name, a.script]);

  const identifiers = all<{ scheme: string; value: string }>(
    db,
    "SELECT scheme, value FROM person_identifier WHERE person_id = ?",
    mergedId,
  ).map((r) => [r.scheme, r.value] as [string, string]);
  const candidacies = all<{ id: string }>(db, "SELECT id FROM candidacy WHERE person_id = ?", mergedId).map((r) => r.id);
  const legalCases = all<{ id: string }>(db, "SELECT id FROM legal_case WHERE person_id = ?", mergedId).map((r) => r.id);
  const claims = all<{ id: number }>(db, "SELECT id FROM claim WHERE subject_ref = ?", `person:${mergedId}`).map(
    (r) => r.id,
  );

  db.prepare(
    `INSERT OR IGNORE INTO person_alias (${ALIAS_COLS})
       SELECT ?, name, script, norm_key, kind, first_seen, source_id FROM person_alias WHERE person_id = ?`,
  ).run(survivingId, mergedId);
  db.prepare("UPDATE person_identifier SET person_id = ? WHERE person_id = ?").run(survivingId, mergedId);
  db.prepare("UPDATE candidacy SET person_id = ? WHERE person_id = ?").run(survivingId, mergedId);
  db.prepare("UPDATE legal_case SET person_id = ? WHERE person_id = ?").run(survivingId, mergedId);
  db.prepare("UPDATE claim SET subject_ref = ? WHERE subject_ref = ?").run(
    `person:${survivingId}`,
    `person:${mergedId}`,
  );
  db.prepare("UPDATE person SET review_state = 'auto' WHERE id = ?").run(survivingId);
  // The queue row for this pair is DECIDED, not deleted. person_merge_candidate's FKs are
  // ON DELETE CASCADE, so the row vanishes the moment the absorbed person row does — which made
  // state 'merged' unreachable, lost the reviewer's work item, and made unmerge's restore-to-
  // 'pending' step dead code. Stamp it while the person still exists.
  const [qa, qb] = pairKey(survivingId, mergedId);
  db.prepare(
    `UPDATE person_merge_candidate SET state = 'merged', decided_by = 'auto:v1', decided_at = ?
       WHERE person_a_id = ? AND person_b_id = ?`,
  ).run(nowIso, qa, qb);
  // candidacy.id still embeds the absorbed person's slug. Deliberate: the id is cited from
  // result / affidavit / claim rows and rewriting it would break every citation to it.
  // ponytail: a stale slug inside an opaque id — give candidacy a rewrite pass when a surface
  // starts parsing ids instead of joining on them.
  db.prepare("DELETE FROM person WHERE id = ?").run(mergedId);

  db.prepare(
    `INSERT INTO person_merge (id, surviving_id, merged_id, score, decided_by, decided_at, evidence)
       VALUES (?, ?, ?, ?, 'auto:v1', ?, ?)`,
  ).run(mergeId, survivingId, mergedId, score, nowIso, JSON.stringify(features));

  const payload: UndoPayload = {
    person,
    aliases,
    addedAliases,
    identifiers,
    candidacies,
    legalCases,
    claims,
  };
  db.prepare("INSERT INTO person_merge_undo (merge_id, payload) VALUES (?, ?)").run(mergeId, JSON.stringify(payload));
}

/**
 * Reverse merge `mergeId`, restoring the exact prior row set: the absorbed person row, its
 * person_alias rows, and every person_identifier / candidacy / legal_case / claim row that moved.
 * Idempotent-ish by refusal: a merge already reverted throws rather than double-restoring.
 */
export function unmerge(db: DatabaseSync, mergeId: number, nowIso: string): void {
  const m = get<{ surviving_id: string; merged_id: string; reverted_at: string | null }>(
    db,
    "SELECT surviving_id, merged_id, reverted_at FROM person_merge WHERE id = ?",
    mergeId,
  );
  if (m === undefined) throw new Error(`unmerge: no person_merge with id ${mergeId}`);
  if (m.reverted_at !== null) throw new Error(`unmerge: merge ${mergeId} was already reverted at ${m.reverted_at}`);
  const undo = get<{ payload: string }>(db, "SELECT payload FROM person_merge_undo WHERE merge_id = ?", mergeId);
  if (undo === undefined) throw new Error(`unmerge: merge ${mergeId} has no undo payload`);
  const p = JSON.parse(undo.payload) as UndoPayload;

  db.exec("SAVEPOINT unmerge");
  try {
    const r = p.person;
    db.prepare(
      `INSERT INTO person (id, canonical_name, canonical_name_script, names, sex, birth_year,
                           birth_year_confidence, review_state, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      r.id,
      r.canonical_name,
      r.canonical_name_script,
      r.names,
      r.sex,
      r.birth_year,
      r.birth_year_confidence,
      r.review_state,
      r.created_at,
    );

    // An addedAlias may ALSO have been contributed by another merge into this survivor that is
    // still active: merge 555 recorded ("NARMADA CHANDRA ROY","latn") as added, merge 556's list is
    // empty because 555 had already put it there. Dropping it on unmerge(555) left the survivor
    // unsearchable under the name it still holds candidacies for. So drop only what nothing else
    // still asserts.
    const stillAsserted = new Set<string>();
    for (const row of all<{ payload: string }>(
      db,
      `SELECT u.payload FROM person_merge m JOIN person_merge_undo u ON u.merge_id = m.id
        WHERE m.surviving_id = ? AND m.reverted_at IS NULL AND m.id <> ?`,
      m.surviving_id,
      mergeId,
    )) {
      for (const a of (JSON.parse(row.payload) as UndoPayload).aliases) {
        stillAsserted.add(`${a.name}\x00${a.script}`);
      }
    }
    const drop = db.prepare("DELETE FROM person_alias WHERE person_id = ? AND name = ? AND script = ?");
    for (const [name, script] of p.addedAliases) {
      if (!stillAsserted.has(`${name}\x00${script}`)) drop.run(m.surviving_id, name, script);
    }
    const addAlias = db.prepare(`INSERT OR IGNORE INTO person_alias (${ALIAS_COLS}) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const a of p.aliases) addAlias.run(r.id, a.name, a.script, a.norm_key, a.kind, a.first_seen, a.source_id);

    const backId = db.prepare("UPDATE person_identifier SET person_id = ? WHERE scheme = ? AND value = ?");
    for (const [scheme, value] of p.identifiers) backId.run(r.id, scheme, value);
    const backCand = db.prepare("UPDATE candidacy SET person_id = ? WHERE id = ?");
    for (const id of p.candidacies) backCand.run(r.id, id);
    const backCase = db.prepare("UPDATE legal_case SET person_id = ? WHERE id = ?");
    for (const id of p.legalCases) backCase.run(r.id, id);
    const backClaim = db.prepare("UPDATE claim SET subject_ref = ? WHERE id = ?");
    for (const id of p.claims) backClaim.run(`person:${r.id}`, id);

    db.prepare("UPDATE person_merge SET reverted_at = ? WHERE id = ?").run(nowIso, mergeId);
    // review_state is RECOMPUTED, never restored from a snapshot. A survivor that absorbed two
    // people got 'auto' stamped by the first merge, so the second merge's tape recorded 'auto' as
    // the "prior" state — and reverting them in ascending id order left the person reading
    // auto-merged with no un-reverted machine decision behind it. 'reviewed' is a human's word and
    // is never overwritten here.
    const stillMerged = Number(
      get<{ n: number }>(
        db,
        "SELECT COUNT(*) AS n FROM person_merge WHERE surviving_id = ? AND reverted_at IS NULL",
        m.surviving_id,
      )?.n ?? 0,
    );
    if (stillMerged === 0) {
      db.prepare("UPDATE person SET review_state = 'unreviewed' WHERE id = ? AND review_state = 'auto'").run(
        m.surviving_id,
      );
    }
    const [a, b] = pairKey(m.surviving_id, m.merged_id);
    db.prepare(
      "UPDATE person_merge_candidate SET state = 'pending', decided_by = NULL, decided_at = NULL WHERE person_a_id = ? AND person_b_id = ?",
    ).run(a, b);
    db.exec("RELEASE unmerge");
  } catch (cause) {
    db.exec("ROLLBACK TO unmerge");
    db.exec("RELEASE unmerge");
    throw cause;
  }
}

// ── stage 3: decide ──────────────────────────────────────────────────────────

/** Union-find over auto-merge edges, grouped by the lexicographically smallest member. Which member
 *  SURVIVES is a separate, evidence-based decision — see pickSurvivor. */
function components(edges: readonly [string, string][]): Map<string, string[]> {
  const { find, union } = unionFind();
  for (const [x, y] of edges) union(x, y);
  const out = new Map<string, string[]>();
  // Members visited in sorted order, so every list comes out sorted without a second pass.
  for (const member of [...new Set(edges.flat())].sort()) {
    const root = find(member);
    const list = out.get(root) ?? [];
    list.push(member);
    out.set(root, list);
  }
  return out;
}

/**
 * Which member of a cluster keeps its id, its canonical_name and everything else's rows. Most
 * candidacies (the richest record), then most name tokens, then longest name, then id — the last
 * term is what keeps the choice deterministic.
 */
function pickSurvivor(members: readonly string[], rec: (id: string) => PersonRec): string | undefined {
  const tokens = (s: string): number => s.trim().split(/[\s-]+/u).filter(Boolean).length;
  return [...members].sort((x, y) => {
    const px = rec(x);
    const py = rec(y);
    return (
      py.cands.length - px.cands.length ||
      tokens(py.canonicalName) - tokens(px.canonicalName) ||
      py.canonicalName.length - px.canonicalName.length ||
      (x < y ? -1 : 1)
    );
  })[0];
}

/**
 * One block -> score -> decide pass. Writes; the caller owns the transaction. Split out only so
 * resolvePersons can iterate it to a fixed point.
 */
function onePass(
  db: DatabaseSync,
  autoMergeAt: number,
  queueAt: number,
  nowIso: string,
): {
  blocking: BlockReport;
  scored: number;
  aboveAutoMerge: number;
  merged: number;
  refusedClusters: number;
  queued: number;
  rejected: number;
  hardNegatives: number;
} {
  const persons = loadPersons(db);
  const { pairs, report: blocking } = blockPairs(db, persons);
  const partyClasses = loadPartyClasses(db);

  const rec = (id: string): PersonRec => {
    const p = persons.get(id);
    if (p === undefined) throw new Error(`resolvePersons: unknown person ${id}`);
    return p;
  };
  const scoreOf = new Map<string, { score: number; features: Features }>();
  const scoreCached = (a: string, b: string): { score: number; features: Features } => {
    const key = a < b ? `${a} ${b}` : `${b} ${a}`;
    let s = scoreOf.get(key);
    if (s === undefined) scoreOf.set(key, (s = scorePair(rec(a), rec(b), partyClasses)));
    return s;
  };

  const edges: [string, string][] = [];
  const band: { a: string; b: string; via: string; score: number; features: Features }[] = [];
  let rejected = 0;
  let hardNegatives = 0;
  for (const pair of pairs) {
    const s = scoreCached(pair.a, pair.b);
    if (s.features.sameContest) hardNegatives += 1;
    if (s.score >= autoMergeAt) edges.push([pair.a, pair.b]);
    else if (s.score >= queueAt) band.push({ ...pair, score: s.score, features: s.features });
    else rejected += 1;
  }

  let merged = 0;
  let refusedClusters = 0;
  let queued = 0;
  const enqueue = db.prepare(
    `INSERT INTO person_merge_candidate (person_a_id, person_b_id, score, evidence, blocked_by, state, queued_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (person_a_id, person_b_id) DO NOTHING`,
  );
  const queue = (a: string, b: string, via: string, score: number, features: Features, state: string): void => {
    queued += Number(enqueue.run(a, b, score, JSON.stringify(features), via, state, nowIso).changes);
  };

  let nextMergeId = Number(get<{ n: number }>(db, "SELECT COALESCE(MAX(id), 0) AS n FROM person_merge")?.n ?? 0) + 1;

  for (const [root, members] of [...components(edges)].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
    // The transitivity rule: EVERY internal pair is scored, not just the edges that built the
    // component, and every one of them has to clear the AUTO-MERGE bar on its own. Testing against
    // queueAt instead let a pair the scorer had explicitly CAPPED merge through a chain: three
    // "Ajoy Mondal" rows where A~B = B~C = 1.00 but A~C = 0.60 because the implied birth years are
    // 38 years apart — AGE_CAPPED_SCORE, imposed precisely to stop that merge — fused a father and
    // a son into one person and recorded it as `decided_by='auto:v1', score=0.6`. Anything in the
    // review band belongs in the deferred queue the branch below already writes.
    let contradictory = false;
    for (const [i, a] of members.entries()) {
      for (const b of members.slice(i + 1)) {
        const s = scoreCached(a, b);
        if (s.features.sameContest || s.score < autoMergeAt) {
          contradictory = true;
          break;
        }
      }
      if (contradictory) break;
    }
    if (contradictory) {
      refusedClusters += 1;
      for (const [i, a] of members.entries()) {
        for (const b of members.slice(i + 1)) {
          const s = scoreCached(a, b);
          // A pair inside a refused cluster can be below queueAt (that is often WHY the cluster was
          // refused). It still goes in front of a human: the refusal is the interesting fact.
          queue(a, b, "cluster", s.score, s.features, "deferred");
        }
      }
      continue;
    }
    // Survivor by EVIDENCE, not by id sort. components() roots each cluster at its lexicographically
    // smallest member, which made a truncated Lokdhaba row ("BANDYOPADHYAY", a bare surname) the
    // canonical name of a sitting MLA and demoted "NAYNA BANDYOPADHYAY" to an alias. Most
    // candidacies first, then the most name tokens, then the longest name, then the id so the
    // choice stays deterministic.
    const survivor = pickSurvivor(members, rec) ?? root;
    for (const member of members) {
      if (member === survivor) continue;
      const s = scoreCached(survivor, member);
      mergeOne(db, nextMergeId, survivor, member, s.score, s.features, nowIso);
      nextMergeId += 1;
      merged += 1;
    }
  }

  for (const p of band) {
    // A person absorbed above no longer exists; the queue's FK would fail.
    if (get<{ n: number }>(db, "SELECT COUNT(*) AS n FROM person WHERE id IN (?, ?)", p.a, p.b)?.n !== 2) continue;
    queue(p.a, p.b, p.via, p.score, p.features, "pending");
  }

  return { blocking, scored: scoreOf.size, aboveAutoMerge: edges.length, merged, refusedClusters, queued, rejected, hardNegatives };
}

export function resolvePersons(db: DatabaseSync, opts: ResolveOptions = {}): ResolveReport {
  const t0 = performance.now();
  const autoMergeAt = opts.autoMergeAt ?? AUTO_MERGE_AT;
  const queueAt = opts.queueAt ?? QUEUE_AT;
  const nowIso = opts.nowIso;
  if (nowIso === undefined) {
    throw new Error("resolvePersons: opts.nowIso is required — a merge with a fabricated decided_at is not auditable");
  }

  db.exec("SAVEPOINT resolve");
  let passes = 0;
  let merged = 0;
  let refusedClusters = 0;
  let queued = 0;
  let scored = 0;
  let rejected = 0;
  let hardNegatives = 0;
  let aboveAutoMerge = 0;
  let first: BlockReport | undefined;
  let last: BlockReport | undefined;
  try {
    // Merging enriches the surviving record with the absorbed one's constituencies, parties and
    // declared ages, so pairs that scored below autoMergeAt can clear it on the next pass. Iterating
    // to a fixed point is what makes `resolve` twice in a row produce zero new merges — and it is
    // NOT blind transitivity: every pass re-scores from scratch and re-applies the cluster refusal,
    // so A and C only ever merge on the evidence they actually have after absorbing B.
    // Each pass strictly reduces the person count, so the loop terminates; MAX_PASSES is a tripwire.
    for (; passes < MAX_PASSES; passes += 1) {
      const p = onePass(db, autoMergeAt, queueAt, nowIso);
      if (first === undefined) first = p.blocking;
      last = p.blocking;
      merged += p.merged;
      refusedClusters = p.refusedClusters;
      queued += p.queued;
      scored += p.scored;
      rejected = p.rejected;
      hardNegatives = p.hardNegatives;
      aboveAutoMerge = p.aboveAutoMerge;
      if (p.merged === 0) break;
    }
    // Not a comment about a bound, a check on it: exiting on MAX_PASSES instead of on merged === 0
    // means the resolver never reached its fixed point, so `resolve` is not idempotent and every
    // count below is a partial run reported under a green exit code.
    if (passes === MAX_PASSES) throw new Error(`resolvePersons: no fixed point in ${MAX_PASSES} passes`);
    if (opts.dryRun === true) db.exec("ROLLBACK TO resolve");
    db.exec("RELEASE resolve");
  } catch (cause) {
    db.exec("ROLLBACK TO resolve");
    db.exec("RELEASE resolve");
    throw cause;
  }

  // MAX_PASSES >= 1, so the loop body ran and both are assigned.
  if (first === undefined || last === undefined) throw new Error("resolvePersons: MAX_PASSES must be at least 1");
  const blocking = first;
  const queueDepth = Number(
    get<{ n: number }>(db, "SELECT COUNT(*) AS n FROM person_merge_candidate WHERE state IN ('pending','deferred')")?.n ??
      0,
  );
  return {
    persons: blocking.persons,
    personsAfter: last.persons,
    pairs: blocking.pairs,
    naivePairs: blocking.naivePairs,
    buckets: blocking.buckets,
    maxBucket: blocking.maxBucket,
    oversizedBuckets: blocking.oversizedBuckets,
    unparseableTerms: blocking.unparseableTerms,
    reductionPct: blocking.reductionPct,
    passes: passes + 1,
    scored,
    aboveAutoMerge,
    merged,
    refusedClusters,
    queued,
    rejected,
    queueDepth,
    hardNegatives,
    dryRun: opts.dryRun === true ? 1 : 0,
    durationMs: Math.round(performance.now() - t0),
  };
}

// ── stage 4: audit ───────────────────────────────────────────────────────────

/** mulberry32. Math.random is forbidden here: a published error rate has to be reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Invariant = { name: string; rows: number; pass: boolean; sql: string };

export type AuditSampleRow = {
  personId: string;
  canonicalName: string;
  mergeIds: number[];
  flags: string[];
};

export type AuditReport = {
  sampled: number;
  merged: number;
  suspectedWrong: number;
  errorRatePct: number;
  samples: AuditSampleRow[];
  invariants: Invariant[];
  invariantsFailed: number;
};

/**
 * ADR 0001's "what is still not enforced by the schema" list, verbatim, as SQL. Every query counts
 * VIOLATIONS, so 0 rows == invariant holds. Two are D2's: the party_version overlap view the dropped
 * Postgres EXCLUDE was replaced by, and the open-ended-duplicate case a reviewer proved reachable
 * through it. The last is 006's: it dropped person_merge_candidate's two person FKs and nothing
 * replaced them.
 */
export const INVARIANTS: ReadonlyArray<{ name: string; sql: string }> = [
  {
    name: "convicted_requires_court_order",
    sql: `SELECT COUNT(*) AS n FROM legal_case lc
            LEFT JOIN source s ON s.id = lc.source_id
           WHERE lc.stage = 'convicted' AND COALESCE(s.kind, '') <> 'court_order'`,
  },
  // ADR 0001 words this as "vote_share sums to 100 +/- 0.5 per contest revision", which is
  // UNSATISFIABLE on the only input that exists: historical-results.ts publishes a truncated top-5
  // field, so 1,009 of 1,135 contest revisions are short by their missing tail (avg sum 72.9%). An
  // invariant that is red by construction gates nothing — it just trains people to ignore the gate.
  // What IS checkable on a truncated field is the one-sided half: a partial field can only sum to
  // LESS than 100, never more, so >100.5 means double-counted or corrupted rows. The shortfall is
  // already reported, per contest, as the ingest's `incomplete_contestant_field` anomaly.
  // ponytail: one-sided bound — restore the two-sided one when full candidate-level results land
  // (then the shortfall itself becomes the defect, and the ingest anomaly becomes this invariant).
  {
    name: "vote_share_never_exceeds_100",
    sql: `SELECT COUNT(*) AS n FROM (
            SELECT contest_id, revision FROM result
             WHERE vote_share IS NOT NULL
             GROUP BY contest_id, revision
            HAVING SUM(vote_share) > 100.5)`,
  },
  {
    // Split out of the share check: fused into one count, this half's 0 violations were invisible
    // behind the share half's 1,009 and could have regressed to red unnoticed.
    name: "margin_is_rank1_minus_rank2",
    sql: `SELECT COUNT(*) AS n FROM result r
           WHERE r.rank = 1 AND r.margin IS NOT NULL
             AND r.margin <> (
               SELECT r.votes - r2.votes FROM result r2
                WHERE r2.contest_id = r.contest_id AND r2.revision = r.revision AND r2.rank = 2)`,
  },
  {
    name: "contest_epoch_matches_election_epoch",
    sql: `SELECT COUNT(*) AS n FROM contest c
            JOIN election e       ON e.id = c.election_id
            JOIN place_version pv ON pv.id = c.place_version_id
           WHERE pv.epoch_id <> e.epoch_id`,
  },
  {
    name: "contested_place_version_has_crosswalk_to_current_epoch",
    sql: `SELECT COUNT(DISTINCT pv.id) AS n FROM contest c
            JOIN place_version pv  ON pv.id = c.place_version_id
            JOIN boundary_epoch be ON be.id = pv.epoch_id
           WHERE be.effective_to IS NOT NULL
             AND NOT EXISTS (
               SELECT 1 FROM place_crosswalk x
                 JOIN place_version t   ON t.id = x.to_place_version_id
                 JOIN boundary_epoch tb ON tb.id = t.epoch_id
                WHERE x.from_place_version_id = pv.id AND tb.effective_to IS NULL)`,
  },
  {
    name: "booth_votes_not_more_than_result_votes",
    sql: `SELECT COUNT(*) AS n FROM (
            SELECT b.contest_id FROM booth_result b
             GROUP BY b.contest_id
            HAVING SUM(b.votes) > COALESCE((
              SELECT SUM(r.votes) FROM result r
               WHERE r.contest_id = b.contest_id
                 AND r.revision = (SELECT MAX(revision) FROM result WHERE contest_id = b.contest_id)), 0))`,
  },
  { name: "party_version_no_overlapping_validity", sql: "SELECT COUNT(*) AS n FROM party_version_overlap" },
  {
    name: "party_version_no_two_open_ended_rows",
    sql: `SELECT COUNT(*) AS n FROM (
            SELECT party_id FROM party_version WHERE valid_to IS NULL GROUP BY party_id HAVING COUNT(*) > 1)`,
  },
  {
    // Migration 006 rebuilt person_merge_candidate WITHOUT the two person FKs (they cascaded the
    // reviewer's work item away the moment a merge deleted the absorbed person). Nothing replaced
    // them, so "a row awaiting a human names two live persons" was enforced by one `if` in onePass
    // and by no schema constraint — a hand-written or future-writer row that dangles was invisible.
    name: "queued_pair_names_two_live_persons",
    sql: `SELECT COUNT(*) AS n FROM person_merge_candidate q
           WHERE q.state IN ('pending', 'deferred')
             AND (NOT EXISTS (SELECT 1 FROM person p WHERE p.id = q.person_a_id)
               OR NOT EXISTS (SELECT 1 FROM person p WHERE p.id = q.person_b_id))`,
  },
];

export function checkInvariants(db: DatabaseSync): Invariant[] {
  return INVARIANTS.map(({ name, sql }) => {
    const rows = Number(get<{ n: number }>(db, sql)?.n ?? 0);
    return { name, rows, pass: rows === 0, sql: sql.replace(/\s+/gu, " ").trim() };
  });
}

/**
 * Draw n persons deterministically from `seed` and report the merge error rate over them.
 *
 * suspectedWrong is computed from red flags that are actually checkable — never from a guess:
 *   same_contest        the stored evidence says the pair collided in one contest (must never happen)
 *   age_divergence      the stored ageResidual exceeds AGE_HARD_LIMIT
 *   no_shared_history   the merge had neither a shared constituency nor a shared party
 *   post_merge_age_span the surviving person's candidacies now imply birth years more than
 *                       AGE_HARD_LIMIT apart — the live check that catches a transitive chain
 *   two_seats_one_election the surviving person now contests two constituencies in ONE election.
 *                       The only red flag that is REACHABLE at the auto:v1 thresholds, and so the
 *                       only one carrying information about them: the other three describe states
 *                       the scorer refuses to create, which makes them a check on the merge LEDGER
 *                       (human decisions, a future scorer, a lowered threshold) rather than on v1.
 */
export function auditSample(db: DatabaseSync, n: number, seed: number): AuditReport {
  type Drawn = { id: string; canonical_name: string };
  const ids = all<Drawn>(db, "SELECT id, canonical_name FROM person ORDER BY id");
  const rng = mulberry32(seed);
  // Partial Fisher-Yates on a copy: n draws, no rejection loop, no duplicates. `take` is clamped
  // because n crosses a CLI boundary: auditSample(db, -3, 1) reported sampled:-3 while drawing
  // pool.slice(0, -3) — every person but the last three — so the published error rate's denominator
  // was computed over a set that was not the set it reported.
  const pool = [...ids];
  const take = Math.min(Math.max(0, Math.trunc(n)), pool.length);
  for (let i = 0; i < take; i += 1) {
    const j = i + Math.floor(rng() * (pool.length - i));
    // i < take <= pool.length and i <= j < pool.length, so both are rows.
    const a = pool[i] as Drawn;
    const b = pool[j] as Drawn;
    pool[i] = b;
    pool[j] = a;
  }
  const drawn = pool.slice(0, take);

  const samples: AuditSampleRow[] = [];
  let mergedCount = 0;
  let suspectedWrong = 0;
  for (const p of drawn) {
    const merges = all<{ id: number; evidence: string }>(
      db,
      "SELECT id, evidence FROM person_merge WHERE surviving_id = ? AND reverted_at IS NULL ORDER BY id",
      p.id,
    );
    if (merges.length === 0) continue;
    mergedCount += 1;
    const flags = new Set<string>();
    for (const m of merges) {
      const f = JSON.parse(m.evidence) as Partial<Features>;
      if (f.sameContest === true) flags.add("same_contest");
      if (typeof f.ageResidual === "number" && f.ageResidual > AGE_HARD_LIMIT) flags.add("age_divergence");
      if (f.constituencyOverlap === 0 && f.partyOverlap === 0) flags.add("no_shared_history");
    }
    const years = all<{ y: number }>(
      db,
      `SELECT CAST(SUBSTR(ct.election_id, -4) AS INTEGER) - c.age_declared AS y
         FROM candidacy c JOIN contest ct ON ct.id = c.contest_id
        WHERE c.person_id = ? AND c.age_declared IS NOT NULL`,
      p.id,
    ).map((r) => r.y);
    if (years.length > 1 && Math.max(...years) - Math.min(...years) > AGE_HARD_LIMIT) {
      flags.add("post_merge_age_span");
    }
    const doubleSeat = Number(
      get<{ n: number }>(
        db,
        `SELECT COUNT(*) AS n FROM (
           SELECT ct.election_id FROM candidacy c JOIN contest ct ON ct.id = c.contest_id
            WHERE c.person_id = ?
            GROUP BY ct.election_id HAVING COUNT(DISTINCT ct.place_version_id) > 1)`,
        p.id,
      )?.n ?? 0,
    );
    if (doubleSeat > 0) flags.add("two_seats_one_election");
    if (flags.size > 0) suspectedWrong += 1;
    samples.push({ personId: p.id, canonicalName: p.canonical_name, mergeIds: merges.map((m) => m.id), flags: [...flags] });
  }

  const invariants = checkInvariants(db);
  return {
    sampled: take,
    merged: mergedCount,
    suspectedWrong,
    errorRatePct: mergedCount === 0 ? 0 : Number(((100 * suspectedWrong) / mergedCount).toFixed(3)),
    samples,
    invariants,
    invariantsFailed: invariants.filter((i) => !i.pass).length,
  };
}
