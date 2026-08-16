-- 016_source_boundary_geometry.sql — a name for what a boundary dataset is.
--
-- Phase 3 imports constituency geometry, and `source.kind` had no truthful value for it.
--
-- WHY THE EXISTING VALUES DO NOT WORK, since widening an enum is not free:
--
--   `census`         is what the national basemap uses, correctly — those ARE 2011 census district
--                    boundaries. A constituency boundary set scraped from the Commission's polling-station
--                    GIS is not census data, and calling it census would put a false statement in the
--                    evidence drawer of every state map.
--   `static_module`  means "a module in this repository", which is what the West Bengal geometry has been
--                    and is exactly the provenance this phase exists to replace. It is false for a file
--                    fetched from a URL and hashed.
--   `eci_*`          the three ECI kinds name statutory instruments and declarations. A third party's
--                    vector rendering of an ECI system's output is not one of those, and Phase 3's own
--                    source report is explicit that the Commission publishes no vector geometry at all.
--
-- So the vocabulary genuinely lacked the word, and the alternative was to write something untrue in a
-- column whose whole purpose is to be true. Phase 2.6 declined to widen this union for one asset and was
-- right to; Phase 3 widens it because geometry is now a source class the product has several of and will
-- acquire more of.
--
-- WHAT THIS IS NOT. It changes no identity, no result, no epoch and no existing row. Nothing is migrated:
-- the two `static_module` West Bengal rows keep saying `static_module` until something re-imports them,
-- and if nothing ever does, that stays visible rather than being tidied into a nicer word.
--
-- ponytail: SQLite cannot ALTER a CHECK constraint, so the table is rebuilt. Foreign keys have to be off
-- for the swap — DROP TABLE is an implicit DELETE of every parent row — and the runner's own directive is
-- how that is asked for, because a PRAGMA inside a transaction is a no-op. Every table that references
-- source(id) keeps its rows: the ids do not change.
--
-- migrate: foreign_keys=off

CREATE TABLE source_new (
  id           TEXT PRIMARY KEY NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN (
                 'eci_form20','eci_declaration','eci_notification','affidavit','gazette',
                 'court_order','prs_record','party_return','census','secc','press','factcheck',
                 -- 'static_module': cycle 1's only sources are this repo's own src/data/*.ts
                 -- modules. They are real sources with a real hash; they are just not scraped yet.
                 'static_module',
                 -- 'boundary_geometry': a published boundary dataset — constituency or administrative
                 -- polygons, with a publisher, a URL, a licence and a hash over its bytes. See
                 -- docs/geo/sources.md for what this registry accepts as one and what it refuses.
                 'boundary_geometry')),
  publisher    TEXT,
  title        TEXT,
  url          TEXT,
  archived_url TEXT,
  retrieved_at TEXT NOT NULL,
  published_on TEXT,
  doc_hash     TEXT NOT NULL,
  page_count   INTEGER,
  licence      TEXT,
  hash_kind    TEXT NOT NULL DEFAULT 'url_only'
               CHECK (hash_kind IN ('document_bytes', 'url_only')),
  retrieval_kind TEXT NOT NULL DEFAULT 'asserted_by_upstream'
               CHECK (retrieval_kind IN ('fetched', 'asserted_by_upstream')),
  publisher_note TEXT
);

INSERT INTO source_new (id, kind, publisher, title, url, archived_url, retrieved_at, published_on,
                        doc_hash, page_count, licence, hash_kind, retrieval_kind, publisher_note)
  SELECT id, kind, publisher, title, url, archived_url, retrieved_at, published_on,
         doc_hash, page_count, licence, hash_kind, retrieval_kind, publisher_note
    FROM source;

DROP TABLE source;
ALTER TABLE source_new RENAME TO source;
