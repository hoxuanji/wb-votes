-- 018_current_result.sql — which result row of a contest is THE result, said once (decision D11, 2026-11-01).
--
-- THE RULE. A contest's current result is the whole field at its HIGHEST revision. A correction is a new row with
-- a higher revision (ADR 0001, D4: nothing is updated in place), and the earlier revision stays in the table as
-- the record of what was said before. wb-static writes a correction as ONE revision PER CONTEST, rewriting the
-- whole field (ingest/sources/wb-static.ts, `revisionFor`), so the highest revision is meaningful per contest
-- and never per candidacy: a candidate dropped from the field in a correction has only the old row, and reading
-- the highest revision per candidacy would keep showing that old row as if it were current.
--
-- THIS SUPERSEDES 002's WORDING. Migration 002 says "Current" = MAX(revision) per (contest_id, candidacy_id), the
-- reading it took from ClickHouse's ReplacingMergeTree(revision). wb-static's second cycle showed what that does:
-- correcting one candidate's vote_share made a "revision 1" holding a SINGLE row, the invariant that vote_share sums to
-- 100 per contest revision then read the contest as 73 points off, and a reader got one row instead of the field. Since
-- then a correction is a revision of the CONTEST. 002 is an applied file and does not change, so this file says it.
--
-- WHY A VIEW. Twenty-odd readers each spelled this as `revision = 0` (seven of them through repo/seat-results.ts's
-- CURRENT_REVISION, the rest inline) and two as MAX(revision), per contest in the resolver's invariant and per
-- candidacy in the person page. They agreed only because no registry holds a revision above 0 yet. Written once
-- here, a correction can be ingested and every page, validator and report moves with it together.
--
-- A view and not a column, so there is nothing to backfill and nothing to drift: applying this migration to an
-- existing registry rebuilds nothing, and on a registry where every row is revision 0 the view is `result`.
-- Portable subset (ADR 0001): a correlated MAX, nothing SQLite-only. The primary access path is the
-- (contest_id, ..., revision) key `result` already has.

CREATE VIEW current_result AS
SELECT r.*
  FROM result r
 WHERE r.revision = (SELECT MAX(r2.revision) FROM result r2 WHERE r2.contest_id = r.contest_id);
