-- 011_place_version_identity.sql — a constituency is a place version, with its own name.
-- Forward-only; 001-010 are shipped and untouched. Same portable subset (ADR 0001).
-- migrate: foreign_keys=off
--
-- WHAT THIS FIXES. The importer identified a constituency as (jurisdiction, house, seat number) and wrote
-- its name only when creating the row, so whichever delimitation was imported first won the name for all
-- the others. Seat numbers are not stable across delimitation: Karnataka parliamentary seat 1 is BIDAR
-- under the 1976 order and CHIKKODI under the 2008 order, and the registry called it Bidar in both —
-- putting Chikkodi's 2019 winner beside Bidar's name. Measured: 52,875 of 63,288 contests named a seat
-- from a delimitation other than their own; 11,500 of 16,785 constituency versions held the wrong name.
-- Full account, with the rejected alternatives, in docs/model/electoral-geography.md.
--
-- WHY THE CONTESTS ARE NOT TOUCHED. contest.place_version_id already pointed at the right
-- (place, epoch) row for its election — the links were never wrong, only the level the name was read
-- from. place_version gains identity; all 63,288 contests keep their ids and their targets.
--
-- THE NEW COLUMNS
--   jurisdiction_id          explicit, so nothing has to parse a state out of an id string. Derived here
--                            from the containment tree: a seat's parent is its district or its state.
--   kind                     'ac' | 'pc' for constituencies; the 19 West Bengal district versions that
--                            exist for their geometry keep kind 'district'.
--   canonical_name           THE name, per epoch. Nullable in this migration and required by 012, because
--                            the values arrive from `mandate geography backfill` in between.
--   district_place_id        district membership changes with delimitation too, so it belongs per version.
--   source_constituency_key  the source's own identity for the seat, verbatim, for audit.
--   name_source_id           P2: the source that asserted this name.
--   name_conflict            another cited source names this same slot differently — see West Bengal in
--                            the doc. Recorded, not resolved.
--   name_variants            JSON array of every spelling observed, with years and row counts. A rename
--                            and a transliteration drift look identical in aggregate; both are kept.
--
-- UNIQUE (jurisdiction_id, kind, epoch_id, number) is the constraint that makes the old defect
-- unrepresentable: a seat number is unique only inside one house of one jurisdiction in one delimitation.
-- Verified against the live data before writing this: zero violations. Number is NULL for the district
-- versions, and SQLite treats NULLs as distinct, which is the wanted behaviour.
--
-- WHY foreign_keys=off, as in 010: contest, place_geometry and place_crosswalk hold foreign keys into
-- place_version, DROP TABLE is an implicit DELETE FROM of every parent row, and ALTER TABLE RENAME
-- rewrites children's REFERENCES clauses. migrate() runs this with enforcement off inside a transaction
-- and a PRAGMA foreign_key_check afterwards. The copy preserves ids, so every child keeps its target.

CREATE TABLE place_version_v3 (
  id                      INTEGER PRIMARY KEY,
  -- Retained for audit and reversibility ONLY. For a constituency this is a legacy seat-number grouping,
  -- not an entity: nothing may take a name or a history from it. See docs/model/electoral-geography.md.
  place_id                TEXT NOT NULL REFERENCES place(id),
  jurisdiction_id         TEXT NOT NULL REFERENCES place(id),
  kind                    TEXT NOT NULL CHECK (kind IN
                            ('nation','state','ut','division','district','pc','ac','ward','booth')),
  epoch_id                TEXT NOT NULL REFERENCES boundary_epoch(id),
  number                  INTEGER,
  canonical_name          TEXT,
  district_place_id       TEXT REFERENCES place(id),
  reservation             TEXT CHECK (reservation IN ('general','sc','st','bl')),
  geometry_ref            TEXT,
  electors_at_creation    INTEGER,
  source_constituency_key TEXT,
  name_source_id          TEXT REFERENCES source(id),
  name_conflict           INTEGER NOT NULL DEFAULT 0 CHECK (name_conflict IN (0,1)),
  name_variants           TEXT NOT NULL DEFAULT '[]',
  UNIQUE (place_id, epoch_id),
  UNIQUE (jurisdiction_id, kind, epoch_id, number)
);

INSERT INTO place_version_v3
  (id, place_id, jurisdiction_id, kind, epoch_id, number, district_place_id,
   reservation, geometry_ref, electors_at_creation)
SELECT v.id,
       v.place_id,
       CASE WHEN par.kind IN ('state','ut') THEN par.id ELSE gp.id END,
       p.kind,
       v.epoch_id,
       v.number,
       CASE WHEN par.kind = 'district' THEN par.id ELSE NULL END,
       v.reservation, v.geometry_ref, v.electors_at_creation
  FROM place_version v
  JOIN place p        ON p.id   = v.place_id
  LEFT JOIN place par ON par.id = p.parent_id
  LEFT JOIN place gp  ON gp.id  = par.parent_id;

DROP TABLE place_version;
ALTER TABLE place_version_v3 RENAME TO place_version;

-- Nominal relationships between constituencies in different delimitations.
--
-- place_crosswalk already models the QUANTITATIVE relation — what share of one seat's area, population or
-- electors went to another — and requires an areal computation, a booth reassignment or an official order.
-- It holds zero rows and this migration adds none.
--
-- This table is the nominal one, and the CHECK is the point: any relationship other than a plain name
-- match is structurally impossible without a cited source, so the schema itself cannot hold a fabricated
-- succession. `name_match` means only "a constituency of this name existed in that delimitation" — a fact
-- about the documents, not a claim that the territory is the same.
CREATE TABLE place_version_link (
  from_place_version_id INTEGER NOT NULL REFERENCES place_version(id),
  to_place_version_id   INTEGER NOT NULL REFERENCES place_version(id),
  kind                  TEXT NOT NULL CHECK (kind IN
                          ('name_match','renamed_to','successor','predecessor','split_into',
                           'merged_from','boundary_changed')),
  -- How the link was established, in words, so a reader never has to guess what evidence stands behind it.
  basis                 TEXT NOT NULL,
  source_id             TEXT REFERENCES source(id),
  PRIMARY KEY (from_place_version_id, to_place_version_id, kind),
  CONSTRAINT place_version_link_needs_source CHECK (kind = 'name_match' OR source_id IS NOT NULL)
);

CREATE INDEX place_version_link_to ON place_version_link (to_place_version_id);
