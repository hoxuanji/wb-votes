-- 010_reservation_bl.sql — Sikkim reserves seats the schema's vocabulary did not have.
-- Forward-only; 001-009 are shipped and untouched. Same portable subset (ADR 0001).
-- migrate: foreign_keys=off
--
-- `place_version.reservation` allowed general / sc / st, which is the whole vocabulary for 35 of the 36
-- jurisdictions. Sikkim's assembly is different by statute: of its 32 seats, 12 are reserved for the
-- Bhutia-Lepcha communities and 2 for Scheduled Castes, under the Representation of the People
-- (Amendment) Act 1980. TCPD codes those seats `BL`, the import failed this CHECK, and the failure was
-- correct — mapping them onto 'st' would have recorded a reservation Sikkim does not have.
--
-- A scan of all 29 published state assembly files, using the importer's own RFC-4180 reader rather than a
-- naive comma split, found BL in Sikkim and nowhere else, and no other value outside general/sc/st in any
-- state. So this widens the vocabulary by exactly one value.
--
-- Sangha — Sikkim's non-territorial constituency, elected by the state's monasteries rather than by a
-- territory — is coded GEN by TCPD and is not a reservation category. It is a constituency with no
-- geography, which the place tree cannot yet express. That is a modelling question for
-- docs/platform/00-model.md, not a CHECK value.
--
-- WHY THIS NEEDS foreign_keys=off, unlike 009. contest, place_geometry and place_crosswalk all hold
-- foreign keys into place_version. Two orders were measured before this one:
--   create-copy-DROP-rename   the DROP is an implicit DELETE FROM of every parent row and fails once per
--                             child row, with foreign keys on.
--   rename-create-copy-DROP   ALTER TABLE RENAME rewrites the children to REFERENCES "place_version_old",
--                             so the drop fails for the same reason. `PRAGMA legacy_alter_table = ON`
--                             does NOT prevent that rewrite — measured, not assumed.
-- So this is SQLite's documented recipe, and migrate() runs it with enforcement off inside a transaction
-- and a PRAGMA foreign_key_check afterwards. The ids are preserved by the copy, so contest,
-- place_geometry and place_crosswalk keep pointing at exactly the rows they pointed at.
--
-- 001 declared no index on place_version beyond its UNIQUE, and this adds none.

CREATE TABLE place_version_v2 (
  id                   INTEGER PRIMARY KEY,
  place_id             TEXT NOT NULL REFERENCES place(id),
  epoch_id             TEXT NOT NULL REFERENCES boundary_epoch(id),
  number               INTEGER,
  reservation          TEXT CHECK (reservation IN ('general','sc','st','bl')),
  geometry_ref         TEXT,
  electors_at_creation INTEGER,
  UNIQUE (place_id, epoch_id)
);

INSERT INTO place_version_v2 (id, place_id, epoch_id, number, reservation, geometry_ref, electors_at_creation)
SELECT id, place_id, epoch_id, number, reservation, geometry_ref, electors_at_creation FROM place_version;

DROP TABLE place_version;
ALTER TABLE place_version_v2 RENAME TO place_version;
