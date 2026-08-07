-- 003_provenance.sql — MANDATE Ring 3 (provenance), ported from §19.
-- `source` itself is in 001 (it is the FK parent of half the registry); everything that hangs
-- off it is here. The provenance invariant (§12): every rendered value resolves to >=1 citation
-- with a source_id. Level one of three lives in this file — citation.source_id NOT NULL.

CREATE TABLE source_page (
  source_id      TEXT NOT NULL REFERENCES source(id),
  page_no        INTEGER NOT NULL,
  ocr_text       TEXT,
  ocr_confidence NUMERIC,
  PRIMARY KEY (source_id, page_no)
);

CREATE TABLE claim (
  id           INTEGER PRIMARY KEY,
  subject_ref  TEXT NOT NULL,                    -- 'person:mamata-banerjee', 'place:wb.ac.084'
  predicate    TEXT NOT NULL,
  object_value TEXT NOT NULL,                    -- JSON
  unit         TEXT,
  -- as_of carries source vintage: a 2011 census figure is a 2011 claim whatever year we ingest
  -- it, and the UI is required to label demographics with it.
  as_of        TEXT,
  confidence   TEXT NOT NULL DEFAULT 'verified'
               CHECK (confidence IN ('verified','provisional','disputed','retracted'))
);
CREATE INDEX claim_subject_idx ON claim (subject_ref, predicate);

CREATE TABLE citation (
  claim_id       INTEGER NOT NULL REFERENCES claim(id),
  source_id      TEXT NOT NULL REFERENCES source(id),    -- P2, at the schema level
  -- page_no is in the PK, so it cannot be NULL (Postgres forbids it; SQLite would allow it and
  -- silently admit duplicate citations). 0 means "the whole document", e.g. a data module.
  page_no        INTEGER NOT NULL DEFAULT 0,
  rect           TEXT,                           -- JSON — the page anchor the viewer highlights
  parser_version TEXT NOT NULL,
  extracted_at   TEXT NOT NULL,
  PRIMARY KEY (claim_id, source_id, page_no)
);
-- No index on citation(claim_id): the PRIMARY KEY indexes that prefix. source_id is what the
-- /src/[source] surface ("what does this document support?") reads by.
CREATE INDEX citation_source_idx ON citation (source_id);

CREATE TABLE ingest_run (
  id             INTEGER PRIMARY KEY,
  pipeline       TEXT NOT NULL,                  -- 'static:candidates'
  parser_version TEXT NOT NULL,
  started_at     TEXT NOT NULL,
  finished_at    TEXT,
  rows_in        INTEGER,
  rows_out       INTEGER,
  anomalies      TEXT NOT NULL DEFAULT '[]',     -- JSON array; unresolved party strings land here
  status         TEXT NOT NULL CHECK (status IN ('running','ok','partial','failed'))
);

CREATE TABLE correction (
  id           INTEGER PRIMARY KEY,
  entity_ref   TEXT NOT NULL,
  field        TEXT NOT NULL,
  old_value    TEXT,                             -- JSON
  new_value    TEXT,                             -- JSON
  reason       TEXT NOT NULL,
  source_id    TEXT REFERENCES source(id),
  corrected_at TEXT NOT NULL,
  public_slug  TEXT NOT NULL UNIQUE              -- the public correction ledger URL
);
