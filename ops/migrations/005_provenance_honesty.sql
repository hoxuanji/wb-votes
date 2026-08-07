-- 005_provenance_honesty.sql — cycle-2 repairs to the ingest's provenance and its keys.
-- Forward-only. 001-003 are shipped and untouched; same portable subset (SQLite dev / Postgres
-- prod, ADR 0001). Four independent changes, each closing one cycle-1 finding:
--
--   source.hash_kind / source.retrieval_kind
--     We have never fetched 99.7% of the documents we cite. Cycle 1 said so by prefixing
--     doc_hash with 'unfetched:' and asserting a retrieved_at anyway. Both facts belong in
--     columns a query can filter on, not in a string prefix and an overstated timestamp.
--
--   claim.content_key
--     A claim is identified by WHAT IT CLAIMS. Cycle 1 keyed it on a per-run positional counter,
--     so re-ingesting changed input rebound a claim id to a different fact while the previous
--     run's citation row survived — the registry then asserted that a document supports a value
--     it does not contain, and the uncited-value gate could not see it. UNIQUE rather than the
--     PRIMARY KEY because citation.claim_id is an INTEGER foreign key. Nullable because rings
--     1-3 predate the column and a future pipeline may key its claims some other way.
--
--   party_version (party_id, valid_from) UNIQUE
--     The version's natural key. Cycle 1 upserted on a positional id, so a shrinking party
--     register left stale rows at high ids and a party ended up with two open-ended versions.
--     This is the portable half of §19's dropped EXCLUDE constraint; party_version_overlap
--     (001_registry.sql) stays as the detector for the rest.
--
--   person_alias PRIMARY KEY widened to include norm_key
--     core/indic.blockingKeys() returns 1-3 keys per name and every one has to be indexed, or
--     this data's surname-first / given-name-first split never gets compared. The old PK
--     (person_id, name, script) allowed exactly one key per alias.

ALTER TABLE source ADD COLUMN hash_kind TEXT NOT NULL DEFAULT 'url_only'
  CHECK (hash_kind IN ('document_bytes', 'url_only'));
ALTER TABLE source ADD COLUMN retrieval_kind TEXT NOT NULL DEFAULT 'asserted_by_upstream'
  CHECK (retrieval_kind IN ('fetched', 'asserted_by_upstream'));

ALTER TABLE claim ADD COLUMN content_key TEXT;
CREATE UNIQUE INDEX claim_content_key_idx ON claim (content_key);

CREATE UNIQUE INDEX party_version_key_idx ON party_version (party_id, valid_from);

-- Table rebuild, not ALTER: neither engine widens a PRIMARY KEY in place with one portable
-- statement. Copying is safe here — person_alias is derived data, rewritten by every ingest.
CREATE TABLE person_alias_v2 (
  person_id  TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  script     TEXT NOT NULL,
  norm_key   TEXT NOT NULL,                      -- one row per core/indic blocking key
  kind       TEXT NOT NULL,
  first_seen TEXT,
  source_id  TEXT REFERENCES source(id),
  PRIMARY KEY (person_id, name, script, norm_key)
);
INSERT INTO person_alias_v2 (person_id, name, script, norm_key, kind, first_seen, source_id)
  SELECT person_id, name, script, norm_key, kind, first_seen, source_id FROM person_alias;
DROP TABLE person_alias;
ALTER TABLE person_alias_v2 RENAME TO person_alias;
CREATE INDEX person_alias_norm_key_idx ON person_alias (norm_key);   -- the ER blocking index
