-- 012_place_version_name_required.sql — a constituency version without a name is not representable.
-- Forward-only; 001-011 are shipped and untouched. Same portable subset (ADR 0001).
-- migrate: foreign_keys=off
--
-- 011 added `canonical_name` nullable because the values arrive from `mandate geography backfill`, which
-- runs between the two migrations. With the backfill applied every one of the 16,804 versions carries a
-- name (measured: unnamed = 0), so the column can be required — and requiring it is the point. The defect
-- this repair exists to fix was a name silently inherited from another delimitation; the cheapest
-- guarantee that it cannot return is a schema that refuses a version with no name of its own, and an
-- importer that therefore has to supply one per epoch.
--
-- The second CHECK is the other half of the same invariant: an assembly or parliamentary constituency
-- always has a seat number in its delimitation. Districts keep NULL there, which is why the constraint is
-- conditional rather than a plain NOT NULL on the column.
--
-- foreign_keys=off for the same reason as 010 and 011: contest, place_geometry, place_crosswalk and now
-- place_version_link all hold foreign keys into this table, DROP TABLE is an implicit DELETE FROM of every
-- parent row, and ALTER TABLE RENAME rewrites children's REFERENCES clauses. The copy preserves ids, so
-- all 63,288 contests, 313 geometries and every link keep pointing at exactly the rows they pointed at.

CREATE TABLE place_version_v4 (
  id                      INTEGER PRIMARY KEY,
  place_id                TEXT NOT NULL REFERENCES place(id),
  jurisdiction_id         TEXT NOT NULL REFERENCES place(id),
  kind                    TEXT NOT NULL CHECK (kind IN
                            ('nation','state','ut','division','district','pc','ac','ward','booth')),
  epoch_id                TEXT NOT NULL REFERENCES boundary_epoch(id),
  number                  INTEGER,
  canonical_name          TEXT NOT NULL,
  district_place_id       TEXT REFERENCES place(id),
  reservation             TEXT CHECK (reservation IN ('general','sc','st','bl')),
  geometry_ref            TEXT,
  electors_at_creation    INTEGER,
  source_constituency_key TEXT,
  name_source_id          TEXT REFERENCES source(id),
  name_conflict           INTEGER NOT NULL DEFAULT 0 CHECK (name_conflict IN (0,1)),
  name_variants           TEXT NOT NULL DEFAULT '[]',
  UNIQUE (place_id, epoch_id),
  UNIQUE (jurisdiction_id, kind, epoch_id, number),
  CONSTRAINT place_version_name_nonempty CHECK (length(canonical_name) > 0),
  CONSTRAINT place_version_seat_numbered CHECK (kind NOT IN ('ac','pc') OR number IS NOT NULL)
);

INSERT INTO place_version_v4
  (id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, district_place_id,
   reservation, geometry_ref, electors_at_creation, source_constituency_key, name_source_id,
   name_conflict, name_variants)
SELECT id, place_id, jurisdiction_id, kind, epoch_id, number, canonical_name, district_place_id,
       reservation, geometry_ref, electors_at_creation, source_constituency_key, name_source_id,
       name_conflict, name_variants
  FROM place_version;

DROP TABLE place_version;
ALTER TABLE place_version_v4 RENAME TO place_version;

CREATE INDEX place_version_slot ON place_version (jurisdiction_id, kind, epoch_id, number);
