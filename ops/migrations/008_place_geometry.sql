-- 008_place_geometry.sql — a place can have a shape.
-- Forward-only; 001-007 are shipped and untouched. Same portable subset (ADR 0001).
--
-- `place_version.geometry_ref` has existed since 001 and has been NULL for every one of 336 rows. The
-- consequence was visible in two places at once: `mandate export --diff` reported wb-ac-paths.json and
-- wb-districts.json at 0.0% reconstructable — 1,546 values with nowhere to live, the entire remaining
-- gap between the ingested figure and the whole-seed figure — and the product had no map, while 294
-- constituency outlines and 19 district outlines sat in data/seed/ from the first commit.
--
-- geometry_ref stays as the pointer it was designed to be; this table is what it points at. Keeping the
-- path out of place_version matters because a path is 2.7 KB of text and place_version is read on every
-- brief, every analysis and every search row — inlining it would put a kilobyte of unread SVG into
-- every one of those queries.
--
-- Coordinates, deliberately: these are PROJECTED SVG coordinates in a shared viewBox, not lat/long.
-- They came from a rendered map, the projection was not recorded, and inventing a CRS name for them
-- would be worse than admitting that. A real geodetic store (and a real projection) is a separate
-- change; this one makes the shapes that exist reachable and reconstructable.

CREATE TABLE place_geometry (
  place_version_id INTEGER PRIMARY KEY NOT NULL REFERENCES place_version(id),
  -- SVG path data. One shape per place version; a multi-polygon arrives as one path with several
  -- subpaths, which is how the source already encodes islands.
  path             TEXT NOT NULL,
  -- The label anchor the source supplies, in the same coordinate space as `path`.
  centroid_x       NUMERIC NOT NULL,
  centroid_y       NUMERIC NOT NULL,
  -- The coordinate space the path and centroid are expressed in. Stored per row rather than assumed
  -- globally: assembly outlines and district outlines are separate renders and nothing guarantees they
  -- share a frame, so a consumer that overlays them has to check rather than hope.
  view_box         TEXT NOT NULL,
  source_id        TEXT NOT NULL REFERENCES source(id),   -- P2
  CONSTRAINT place_geometry_path_nonempty CHECK (length(path) > 0)
);
