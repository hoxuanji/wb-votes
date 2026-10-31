-- 019_claim_identity.sql — one identity for a claim, and ECI's sentences out of `unit` (decision D29, 2026-11-01).
--
-- A CLAIM IS WHAT IS CLAIMED, NOT WHAT IT IS CLAIMED TO BE. Its identity (`content_key`) is the subject, the
-- predicate, the date it holds as of, and its unit; the value is not in it, so a corrected value is the same claim
-- restated and not a second claim that a citation of the old value could survive on. Four spellings had grown up:
--
--   wb-static          a hash of (subject, predicate, as_of, unit)
--   ECI                subject | predicate | VALUE, so a corrected value was a second claim
--   delimitation chain subject | predicate, with no date and no unit
--   (and ECI kept a free-text sentence in `unit`, which is part of the identity and is read by nothing)
--
-- THE KEY. subject || char(31) || predicate || char(31) || COALESCE(as_of, '') || char(31) || COALESCE(unit, ''),
-- written once in TypeScript as core/ids.ts `claimKey`; a test holds the two spellings equal. char(31) is the ASCII
-- unit separator, which does not occur in any of the four, so two claims never share a key by one's text ending where
-- another's begins. Readable and not a hash on purpose: SQLite cannot hash in a migration, and the key is the claim's
-- address in an audit.
--
-- WHAT THIS DOES.
--   1. ECI's sentence about an unopposed result (which lived in `unit`) becomes a claim of its own,
--      `elected_unopposed.eci_note`, cited by what cited the result, and the result's `unit` is cleared. The
--      "registry X vs ECI Y" sentence on a name variant restates the two spellings the claim and the place version
--      already hold, so that `unit` is only cleared.
--   2. Every claim is re-keyed to the one scheme, including the legacy rows that had no key.
--
-- ONE LIMIT, STATED. wb-static rewrites a claim's subject_ref when two people are merged and keeps the content_key it
-- computed from the raw subject, so that a re-ingest matches the same row. This migration computes the key from the
-- subject as it stands, so a claim whose subject was rewritten by a merge gets a key a re-ingest would not compute.
-- `registry:ingest` is not idempotent over a working registry in any case (DEPLOYMENT.md): the authoritative path to
-- keys exactly as the importers write them is a rebuild, and this migration keeps a registry that cannot be
-- rebuilt consistent until then.
--
-- IF A COLLISION EXISTS the UPDATE fails on the unique index and the migration aborts, which is the right answer:
-- two claims of one subject, predicate, date and unit are one fact stated twice with two values, and which value is
-- true is not for a migration to pick. Rebuild instead. None exists in a registry built by these importers.
--
-- The one JSON value written is quoted by hand (backslash, quote, newline, return) because no migration before this
-- one depends on SQLite's JSON functions.

INSERT INTO claim (subject_ref, predicate, object_value, unit, as_of, confidence, content_key)
SELECT subject_ref,
       'elected_unopposed.eci_note',
       '"' || REPLACE(REPLACE(REPLACE(REPLACE(unit, char(92), char(92) || char(92)), '"', char(92) || '"'),
                              char(10), char(92) || 'n'), char(13), char(92) || 'r') || '"',
       NULL,
       as_of,
       confidence,
       subject_ref || char(31) || 'elected_unopposed.eci_note' || char(31) || COALESCE(as_of, '') || char(31)
  FROM claim
 WHERE predicate = 'elected_unopposed' AND unit IS NOT NULL AND unit <> ''
ON CONFLICT (content_key) DO NOTHING;

INSERT INTO citation (claim_id, source_id, page_no, rect, parser_version, extracted_at)
SELECT n.id, ci.source_id, ci.page_no, ci.rect, ci.parser_version, ci.extracted_at
  FROM claim o
  JOIN claim n    ON n.subject_ref = o.subject_ref AND n.predicate = 'elected_unopposed.eci_note'
  JOIN citation ci ON ci.claim_id = o.id
 WHERE o.predicate = 'elected_unopposed'
ON CONFLICT DO NOTHING;

UPDATE claim SET unit = NULL WHERE predicate IN ('elected_unopposed', 'name_variant_eci_2024');

UPDATE claim
   SET content_key = subject_ref || char(31) || predicate || char(31) || COALESCE(as_of, '') || char(31) || COALESCE(unit, '');
