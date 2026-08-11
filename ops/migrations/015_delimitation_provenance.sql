-- 015_delimitation_provenance.sql — say which order created a boundary epoch, and what its date means.
--
-- Phase 1.5 needed to record two delimitations the registry had no way to express, and the attempt exposed
-- that `boundary_epoch` could not answer three questions a reader of any epoch has to be able to ask:
--
--   WHOSE is it?   DPACO 2008 is national. The 2023 Assam delimitation and the 2022 Jammu & Kashmir orders
--                  are not: they redraw one jurisdiction and leave the rest alone. Without a jurisdiction a
--                  state-specific order either becomes a national epoch (false) or cannot be stored.
--
--   WHAT DATE is effective_from?  For J&K it is a legal effective date the Central Government appointed by
--                  S.O. 2223(E). For Assam it is the date the ECI published the final notification, because
--                  the notification is a scanned image and its own date cannot be read. Those are not the
--                  same kind of fact, and a column that holds both without saying which is a column that
--                  invites a reader to assume the stronger one.
--
--   WHEN was the order MADE?  Distinct from when it took effect: J&K's Order No. 2 is dated 5 May 2022 and
--                  took effect on 20 May 2022. Collapsing them loses fifteen days and the reason for them.
--
-- The publication date deliberately does NOT get a column here: `source.published_on` already holds it, on
-- the row for the document itself, which is where a document's own publication date belongs.
--
-- place_version_link gains 'derived_from', for the case this phase discovered. DPACO 2008 contains a Part
-- for Assam, Arunachal Pradesh, Manipur, Nagaland and Jammu & Kashmir, and each Part states that its
-- content is an earlier order carried forward unchanged — Assam, Manipur and Nagaland from the 1976 order,
-- Arunachal from the ECI's 1989 order under the State of Arunachal Pradesh Act 1986, J&K's parliamentary
-- seats from the 1976 order as applied to J&K and its assembly seats from the J&K Delimitation Commission's
-- Order No. 1 of 27 April 1995. So those seats are genuinely in force under the 2008 order AND are the
-- earlier seats; the registry held the first fact and not the second. 'derived_from' is the second.
--
-- 'name_match' is exempt from the source requirement because it is an observation about spelling; every
-- other kind, including this one, must cite the document that establishes it.

-- migrate: foreign_keys=off

ALTER TABLE boundary_epoch ADD COLUMN jurisdiction_id TEXT REFERENCES place(id);
ALTER TABLE boundary_epoch ADD COLUMN order_date TEXT;
ALTER TABLE boundary_epoch ADD COLUMN order_reference TEXT;
-- What effective_from actually is. Defaults to 'not_established' so every pre-existing epoch says so
-- honestly: 1952, 1963 and 1976 carry January-of-the-order-year dates the Lokdhaba importer chose because
-- the real day was not on record, and DPACO 2008's row predates this phase.
ALTER TABLE boundary_epoch ADD COLUMN effective_date_basis TEXT NOT NULL DEFAULT 'not_established'
  CHECK (effective_date_basis IN ('legal_effective_date', 'order_date', 'publication_date', 'not_established'));

CREATE INDEX boundary_epoch_jurisdiction ON boundary_epoch (jurisdiction_id, effective_from);

-- Table rebuild: SQLite cannot widen a CHECK in place. Safe to copy — place_version_link is derived data
-- with no children, and the copy preserves every row.
CREATE TABLE place_version_link_v2 (
  from_place_version_id INTEGER NOT NULL REFERENCES place_version(id),
  to_place_version_id   INTEGER NOT NULL REFERENCES place_version(id),
  kind                  TEXT NOT NULL CHECK (kind IN
                          ('name_match','renamed_to','successor','predecessor','split_into',
                           'merged_from','boundary_changed','derived_from')),
  basis                 TEXT NOT NULL,
  source_id             TEXT REFERENCES source(id),
  PRIMARY KEY (from_place_version_id, to_place_version_id, kind),
  CONSTRAINT place_version_link_needs_source CHECK (kind = 'name_match' OR source_id IS NOT NULL)
);
INSERT INTO place_version_link_v2 (from_place_version_id, to_place_version_id, kind, basis, source_id)
  SELECT from_place_version_id, to_place_version_id, kind, basis, source_id FROM place_version_link;
DROP TABLE place_version_link;
ALTER TABLE place_version_link_v2 RENAME TO place_version_link;
