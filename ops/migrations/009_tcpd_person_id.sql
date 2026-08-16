-- 009_tcpd_person_id.sql — TCPD's stable person id is an identifier scheme.
-- Forward-only; 001-008 are shipped and untouched. Same portable subset (ADR 0001).
--
-- `person_identifier.scheme` allowed eci_candidate_id, myneta_id, prs_id, sansad_id, pan_masked and
-- affidavit_no. The Lokdhaba/TCPD datasets carry `pid` — a stable person id assigned by the Trivedi
-- Centre for Political Data and reused across every election in every state they publish. Bihar's
-- assembly file alone has 46,232 distinct pids.
--
-- This matters more than a column: the entity resolver in this project exists because India has no
-- national politician identifier, and the merge queue's recall has never been measurable because there
-- was no ground truth to measure against. A published, stable id is that ground truth. It does not retire
-- the resolver — the resolver's job is reconciling ACROSS sources, and an affidavit-derived person still
-- has to be matched to a TCPD-derived one — but it turns "we think this is 6,167 people" into something
-- checkable.
--
-- Safe to rebuild: person_identifier has a foreign key INTO person and nothing references it, so dropping
-- and recreating it cannot orphan a child row. (`source.kind` needs the same treatment for a
-- 'research_dataset' value and does NOT have that property — six tables hold foreign keys into source —
-- so that one waits for a migration that can move them together.)

CREATE TABLE person_identifier_v2 (
  person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  scheme    TEXT NOT NULL CHECK (scheme IN
              ('eci_candidate_id','myneta_id','prs_id','sansad_id','pan_masked','affidavit_no',
               -- Trivedi Centre for Political Data person id, e.g. 'AEBR1'. Stable across elections.
               'tcpd_pid')),
  value     TEXT NOT NULL,
  source_id TEXT NOT NULL REFERENCES source(id),      -- P2
  PRIMARY KEY (scheme, value)
);

INSERT INTO person_identifier_v2 (person_id, scheme, value, source_id)
SELECT person_id, scheme, value, source_id FROM person_identifier;

DROP TABLE person_identifier;
ALTER TABLE person_identifier_v2 RENAME TO person_identifier;

CREATE INDEX person_identifier_person_idx ON person_identifier (person_id);
