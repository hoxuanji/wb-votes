-- 006_merge_queue_survives_merge.sql — person_merge_candidate is a DECISION LEDGER, not a view
-- over live persons. Forward-only; 001-005 are shipped and untouched. Same portable subset (ADR 0001).
--
-- 004 gave both columns ON DELETE CASCADE to person. A merge deletes the absorbed person row, so
-- the queue row for the pair that merged was cascade-deleted — which made three things untrue:
--   * state 'merged' was unreachable. After 948 merges on the real registry,
--     COUNT(*) WHERE state = 'merged' was 0, and the queue lost every decided pair.
--   * unmerge()'s "restore the row to 'pending'" step matched 0 rows, so reverting a merge did not
--     give the reviewer their work item back.
--   * reported `queued` and `queueDepth` disagreed (18,079 vs 18,077): rows queued in pass 1
--     disappeared when their person merged in pass 2.
-- A pair that has been decided must stay decided and readable — that is the whole point of a queue
-- a human works. So the person FKs go: one of the two ids in a decided row deliberately names a
-- person that no longer exists, and resolvePersons already refuses to queue a 'pending' pair unless
-- both persons are live.
-- ponytail: no FK at all rather than a rewrite-to-survivor trigger — the ledger is append-and-stamp
-- and nothing joins it back to person except a reviewer surface, which can LEFT JOIN.

CREATE TABLE person_merge_candidate_v2 (
  person_a_id TEXT NOT NULL,
  person_b_id TEXT NOT NULL,
  score       NUMERIC NOT NULL,
  evidence    TEXT NOT NULL,
  blocked_by  TEXT NOT NULL,
  state       TEXT NOT NULL DEFAULT 'pending'
              CHECK (state IN ('pending','merged','rejected','deferred')),
  queued_at   TEXT NOT NULL,
  decided_by  TEXT,
  decided_at  TEXT,
  CHECK (person_a_id < person_b_id),
  PRIMARY KEY (person_a_id, person_b_id)
);
INSERT INTO person_merge_candidate_v2
  SELECT person_a_id, person_b_id, score, evidence, blocked_by, state, queued_at, decided_by, decided_at
    FROM person_merge_candidate;
DROP TABLE person_merge_candidate;
ALTER TABLE person_merge_candidate_v2 RENAME TO person_merge_candidate;
CREATE INDEX person_merge_candidate_state_idx ON person_merge_candidate (state, score);
