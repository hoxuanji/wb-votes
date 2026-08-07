-- 002_facts.sql — MANDATE Ring 2 (facts), ported from §19's ClickHouse DDL.
--
-- Production keeps these in ClickHouse; dev keeps them beside Rings 1 and 3 in one SQLite file so
-- a single `registry:migrate` gives a whole working database. What ClickHouse does with engines,
-- this port does with keys:
--   ReplacingMergeTree(revision)  ->  revision is IN the primary key, so a revised figure is a new
--                                     row and the prior row stays readable (the correction ledger
--                                     in §6.10 depends on that). "Current" = MAX(revision) per
--                                     (contest_id, candidacy_id), never an UPDATE in place.
--   LowCardinality(String)        ->  TEXT
--   PARTITION BY / ORDER BY       ->  dropped; the PRIMARY KEY index covers dev-scale reads.
-- P2 is a schema constraint here, not a convention: source_id is NOT NULL in all four tables.

CREATE TABLE result (
  contest_id   TEXT NOT NULL REFERENCES contest(id),
  candidacy_id TEXT NOT NULL REFERENCES candidacy(id),
  revision     INTEGER NOT NULL DEFAULT 0,
  votes        INTEGER NOT NULL,
  postal_votes INTEGER,
  evm_votes    INTEGER,
  vote_share   NUMERIC,
  rank         INTEGER,
  is_winner    INTEGER NOT NULL DEFAULT 0 CHECK (is_winner IN (0, 1)),
  margin       INTEGER,
  source_id    TEXT NOT NULL REFERENCES source(id),      -- P2
  ingested_at  TEXT NOT NULL,
  PRIMARY KEY (contest_id, candidacy_id, revision)
);
-- No index on result(contest_id): the PRIMARY KEY indexes that prefix already. candidacy_id is the
-- one a person's result history reads by, and the PK does not cover it.
CREATE INDEX result_candidacy_idx ON result (candidacy_id);

CREATE TABLE round_result (
  contest_id       TEXT NOT NULL REFERENCES contest(id),
  round_no         INTEGER NOT NULL,
  candidacy_id     TEXT NOT NULL REFERENCES candidacy(id),
  votes_cumulative INTEGER NOT NULL,
  source_id        TEXT NOT NULL REFERENCES source(id),  -- P2
  observed_at      TEXT NOT NULL,
  PRIMARY KEY (contest_id, round_no, candidacy_id)
);

CREATE TABLE booth_result (
  contest_id     TEXT NOT NULL REFERENCES contest(id),
  booth_place_id TEXT NOT NULL REFERENCES place(id),
  candidacy_id   TEXT NOT NULL REFERENCES candidacy(id),
  votes          INTEGER NOT NULL,
  source_id      TEXT NOT NULL REFERENCES source(id),    -- P2
  PRIMARY KEY (contest_id, booth_place_id, candidacy_id)
);

CREATE TABLE turnout (
  contest_id   TEXT NOT NULL REFERENCES contest(id),
  scope        TEXT NOT NULL,                            -- 'contest' | 'phase' | a booth place id
  electors     INTEGER,
  voters       INTEGER,
  male         INTEGER,
  female       INTEGER,
  third_gender INTEGER,
  postal       INTEGER,
  nota         INTEGER,
  source_id    TEXT NOT NULL REFERENCES source(id),      -- P2
  PRIMARY KEY (contest_id, scope)
);
