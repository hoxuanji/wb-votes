-- 017_voting_epoch.sql — which delimitation a jurisdiction's house is voting under, said once.
--
-- THREE PLACES ASKED, AND ANSWERED DIFFERENTLY. The geography validator, the missing-geometry report and the
-- geometry-coverage matrix each wanted "the epoch this jurisdiction's house currently votes under", and each
-- wrote its own query: one ranked contests by full chronology and let a tie fall where it fell, one ranked by
-- year and broke a tie toward the alphabetically older epoch id, one kept the first of equal years. All three
-- counted by-elections, so a single-seat by-poll could name a house's epoch.
--
-- THE RULE. The epoch of the seats in a (jurisdiction, house)'s newest FULL-HOUSE election, by chronology. A
-- by-election never counts: it fills a few vacant seats of a house that was elected under an earlier order
-- and cannot introduce a delimitation. The order of elections is core/election-kind.ts's chronoDesc() and
-- "not a by-election" is its fullHouse(), spelled out here because a migration is SQL and applied files do
-- not change; a test holds the two spellings equal. If one election straddles two epochs in one house (a
-- defect that `mandate geography validate` check 2 reports) the newer epoch is the answer, so it never
-- depends on row order.
--
-- THIS IS NOT "IN FORCE". What the law says on a date is core/epochs.ts's inForce(), and the two differ
-- whenever an order has taken effect that no election has yet been held under: an Assam assembly last elected
-- before delim-2023-as still votes under delim-2008 although that order is in force.
--
-- Written in the portable subset (ADR 0001): a window function and an aliased derived table, nothing
-- SQLite-only. A view and not a column, so there is nothing to backfill and nothing to drift; applying this
-- migration to an existing registry rebuilds nothing.

CREATE VIEW voting_epoch AS
SELECT jurisdiction_id, house, epoch_id
  FROM (
    SELECT pv.jurisdiction_id AS jurisdiction_id,
           pv.kind AS house,
           pv.epoch_id AS epoch_id,
           row_number() OVER (
             PARTITION BY pv.jurisdiction_id, pv.kind
             ORDER BY e.year DESC, COALESCE(e.polling_month, 0) DESC, e.occurrence DESC, e.id DESC,
                      be.effective_from DESC, be.id DESC) AS rn
      FROM contest c
      JOIN election e        ON e.id  = c.election_id
      JOIN place_version pv  ON pv.id = c.place_version_id
      JOIN boundary_epoch be ON be.id = pv.epoch_id
     WHERE pv.kind IN ('ac', 'pc')
       AND e.kind <> 'bypoll'
  ) ranked
 WHERE rn = 1;
