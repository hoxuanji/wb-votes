-- 004_resolve_queue.sql — §12 stage 3's human gate, plus the undo tape stage 4 needs.
--
-- Portable subset, same rules as 001-003 (ADR 0001): TEXT + CHECK instead of enums, TEXT holding
-- JSON instead of jsonb, TEXT holding ISO-8601, every PK column explicitly NOT NULL, no DEFAULT
-- now() (the clock is always an argument).

-- The staffed queue. One row per candidate pair the resolver could not decide alone, carrying the
-- score and the feature vector that produced it — a reviewer must never have to re-derive why the
-- pair was proposed. Also the resolver's memo: a pair already sitting here is not re-queued, which
-- is what makes `mandate resolve` idempotent.
CREATE TABLE person_merge_candidate (
  person_a_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  person_b_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  score       NUMERIC NOT NULL,
  evidence    TEXT NOT NULL,                    -- JSON feature vector, same shape as person_merge.evidence
  blocked_by  TEXT NOT NULL,                    -- 'name' | 'district' | 'party' — which block produced the pair
  state       TEXT NOT NULL DEFAULT 'pending'
              CHECK (state IN ('pending','merged','rejected','deferred')),
  queued_at   TEXT NOT NULL,
  decided_by  TEXT,
  decided_at  TEXT,
  -- Pairs are unordered, so the ordering is forced into the key. Without this CHECK the same pair
  -- could sit in the queue twice under the two permutations and be reviewed twice, inconsistently.
  CHECK (person_a_id < person_b_id),
  PRIMARY KEY (person_a_id, person_b_id)
);
-- The queue's only read pattern: "what is pending, worst-first".
CREATE INDEX person_merge_candidate_state_idx ON person_merge_candidate (state, score);

-- The undo tape. §12 stage 4 requires every merge to be reversible; a merge moves rows out of the
-- absorbed person and then deletes it, so reversing needs the row set that existed before.
-- Separate table rather than more JSON in person_merge.evidence: evidence is the *explanation*
-- shown to a politician disputing their profile (§21 F8) and stays readable; this is machinery.
-- ponytail: one JSON blob, not five shadow tables — the payload is only ever read whole, by
-- unmerge(). Give it real columns when something needs to query across undo records.
CREATE TABLE person_merge_undo (
  merge_id INTEGER PRIMARY KEY NOT NULL REFERENCES person_merge(id),
  payload  TEXT NOT NULL                        -- JSON: the absorbed person row + every row that moved
);
