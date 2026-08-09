-- 007_votes_may_be_unknown.sql — a result may record a margin without a vote count.
-- Forward-only; 001-006 are shipped and untouched. Same portable subset (ADR 0001).
--
-- `result.votes INTEGER NOT NULL` encoded an assumption that turns out to be false about Indian
-- election sources: that anything reporting a winner also reports how many votes they got. It does
-- not, and the constraint has now forced a fabricated number twice.
--
--   * WB assembly 2026. The source gives a winner, a margin, a turnout and a total, and no candidate
--     vote counts. The ingest wrote votes = 0 and vote_share = 0 for all 293 declared seats. Those
--     zeros then had to be defended against downstream by `counted()` in the repo layer, and one of
--     them still escaped into the Situation Room's first draft as a 0.00% vote share for every party.
--   * Lok Sabha 2024, the 42 WB MPs. Same shape: name, party, constituency, margin, elected-on date.
--     No vote counts. Loading them under the old constraint would have written 42 more zeros.
--
-- A NOT NULL column that callers satisfy with a placeholder is not a constraint, it is a lie with
-- enforcement. Absence gets its own value, and a real 0 stays available for the case that deserves
-- it — a candidate who genuinely polled nothing.
--
-- What replaces it: a row must still SAY something. `result_has_a_figure` requires at least one of
-- votes / margin / vote_share, so an empty result row is still rejected. That is the constraint the
-- old one was reaching for.
--
-- ponytail: table rebuild rather than an ALTER, because SQLite cannot drop a NOT NULL in place. The
-- copy is the whole point of the migration, so there is nothing cheaper to do.

CREATE TABLE result_v2 (
  contest_id   TEXT NOT NULL REFERENCES contest(id),
  candidacy_id TEXT NOT NULL REFERENCES candidacy(id),
  revision     INTEGER NOT NULL DEFAULT 0,
  -- NULL means the source did not report a count. 0 means it reported none.
  votes        INTEGER,
  postal_votes INTEGER,
  evm_votes    INTEGER,
  vote_share   NUMERIC,
  rank         INTEGER,
  is_winner    INTEGER NOT NULL DEFAULT 0 CHECK (is_winner IN (0, 1)),
  margin       INTEGER,
  source_id    TEXT NOT NULL REFERENCES source(id),      -- P2
  ingested_at  TEXT NOT NULL,
  PRIMARY KEY (contest_id, candidacy_id, revision),
  CONSTRAINT result_has_a_figure CHECK (
    votes IS NOT NULL OR margin IS NOT NULL OR vote_share IS NOT NULL
  )
);

-- The backfill. Scoped to exactly the rows the old constraint fabricated: a WINNER with 0 votes and a
-- real margin. Verified against the live registry before writing this — 293 such rows, all with
-- vote_share = 0 as well, and NOT ONE genuine votes = 0 anywhere in the table (0 non-winners at 0, 0
-- rows at 0 without a margin). So this cannot erase a real zero, because there are none to erase.
INSERT INTO result_v2 (contest_id, candidacy_id, revision, votes, postal_votes, evm_votes,
                       vote_share, rank, is_winner, margin, source_id, ingested_at)
SELECT contest_id, candidacy_id, revision,
       CASE WHEN is_winner = 1 AND votes = 0 AND margin IS NOT NULL THEN NULL ELSE votes END,
       postal_votes, evm_votes,
       CASE WHEN is_winner = 1 AND votes = 0 AND margin IS NOT NULL AND vote_share = 0
            THEN NULL ELSE vote_share END,
       rank, is_winner, margin, source_id, ingested_at
  FROM result;

DROP TABLE result;
ALTER TABLE result_v2 RENAME TO result;

CREATE INDEX result_candidacy_idx ON result (candidacy_id);
