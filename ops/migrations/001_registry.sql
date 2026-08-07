-- 001_registry.sql — MANDATE Ring 1 (registry), ported from docs/mandate/04-engineering.md §19.
--
-- Portable SQL subset: these files run UNCHANGED on SQLite (dev, node:sqlite) and Postgres (prod).
-- The rules, and the divergences they buy, are in docs/adr/0001-sqlite-dev-postgres-prod.md:
--   * TEXT + CHECK (x IN (...))  instead of CREATE TYPE ... AS ENUM
--   * TEXT holding JSON          instead of jsonb
--   * TEXT holding ISO-8601      instead of date / timestamptz  (lexical order == chronological)
--   * INTEGER PRIMARY KEY        instead of bigserial   (SQLite auto-assigns; Postgres does NOT)
--   * NUMERIC                    instead of numeric(p,s), which SQLite ignores anyway
--   * no DEFAULT now()           — every clock is passed in by the caller, so audits reproduce
--   * every PRIMARY KEY column is explicitly NOT NULL — SQLite tolerates NULLs there, Postgres
--     does not, and we want the stricter of the two everywhere.

-- ─── provenance root ─────────────────────────────────────────────────────────
-- `source` lives in 001, not 003, because every ring-1 table cites it and Postgres resolves
-- REFERENCES at CREATE TABLE time (SQLite resolves at DML time and would not care). Migrations
-- are applied in lexical order, so the parent has to be in the first file. Rest of Ring 3: 003.
CREATE TABLE source (
  id           TEXT PRIMARY KEY NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN (
                 'eci_form20','eci_declaration','eci_notification','affidavit','gazette',
                 'court_order','prs_record','party_return','census','secc','press','factcheck',
                 -- 'static_module': cycle 1's only sources are this repo's own src/data/*.ts
                 -- modules. They are real sources with a real hash; they are just not scraped yet.
                 'static_module')),
  publisher    TEXT,
  title        TEXT,
  url          TEXT,
  archived_url TEXT,
  retrieved_at TEXT NOT NULL,                    -- ISO-8601 UTC
  published_on TEXT,                             -- ISO-8601 date
  doc_hash     TEXT NOT NULL,
  page_count   INTEGER,
  licence      TEXT                              -- §12: not decorative, the bulk surface filters on it
);

-- ─── places, versioned by boundary epoch (P4) ────────────────────────────────
CREATE TABLE boundary_epoch (
  id             TEXT PRIMARY KEY NOT NULL,      -- 'delim-2008'
  name           TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to   TEXT,                           -- NULL = current
  source_id      TEXT REFERENCES source(id)
);

CREATE TABLE place (
  id             TEXT PRIMARY KEY NOT NULL,      -- 'wb', 'wb.nadia', 'wb.ac.084'
  kind           TEXT NOT NULL CHECK (kind IN
                   ('nation','state','ut','division','district','pc','ac','ward','booth')),
  parent_id      TEXT REFERENCES place(id),
  canonical_name TEXT NOT NULL,
  names          TEXT NOT NULL DEFAULT '{}',     -- JSON {bn: '...', hi: '...'}
  lgd_code       TEXT,
  eci_code       TEXT,
  UNIQUE (kind, eci_code, parent_id)
);
CREATE INDEX place_parent_kind_idx ON place (parent_id, kind);

CREATE TABLE place_version (
  id                   INTEGER PRIMARY KEY,      -- SQLite auto-assigns on NULL; Postgres will not
  place_id             TEXT NOT NULL REFERENCES place(id),
  epoch_id             TEXT NOT NULL REFERENCES boundary_epoch(id),
  number               INTEGER,                  -- constituency number in that epoch
  reservation          TEXT CHECK (reservation IN ('general','sc','st')),
  geometry_ref         TEXT,                     -- tile feature key; geometry lives in PMTiles
  electors_at_creation INTEGER,
  UNIQUE (place_id, epoch_id)
);

-- the table that survives the next delimitation (§12: "the single most valuable table nobody builds")
CREATE TABLE place_crosswalk (
  from_place_version_id INTEGER NOT NULL REFERENCES place_version(id),
  to_place_version_id   INTEGER NOT NULL REFERENCES place_version(id),
  area_share            NUMERIC NOT NULL,
  population_share      NUMERIC,
  elector_share         NUMERIC,
  method                TEXT NOT NULL CHECK (method IN
                          ('areal','booth_reassignment','official_order')),
  source_id             TEXT REFERENCES source(id),
  PRIMARY KEY (from_place_version_id, to_place_version_id)
);

-- ─── people ──────────────────────────────────────────────────────────────────
CREATE TABLE person (
  id                    TEXT PRIMARY KEY NOT NULL,   -- slug: 'mamata-banerjee'
  canonical_name        TEXT NOT NULL,
  canonical_name_script TEXT,                        -- 'latn','beng',…
  names                 TEXT NOT NULL DEFAULT '{}',  -- JSON
  sex                   TEXT CHECK (sex IN ('m','f','o')),
  birth_year            INTEGER,
  birth_year_confidence TEXT CHECK (birth_year_confidence IN ('exact','approx','unknown')),
  review_state          TEXT NOT NULL DEFAULT 'unreviewed'
                        CHECK (review_state IN ('unreviewed','auto','human','disputed')),
  created_at            TEXT NOT NULL
);

CREATE TABLE person_alias (
  person_id  TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  script     TEXT NOT NULL,                      -- 'latn','beng','deva','taml'…
  norm_key   TEXT NOT NULL,                      -- Indic-aware phonetic key (core/indic)
  kind       TEXT NOT NULL,                      -- eci_nomination|affidavit|prs|court|gazette|press|user_submitted
  first_seen TEXT,
  source_id  TEXT REFERENCES source(id),
  PRIMARY KEY (person_id, name, script)
);
CREATE INDEX person_alias_norm_key_idx ON person_alias (norm_key);   -- the ER blocking index

CREATE TABLE person_identifier (
  person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  scheme    TEXT NOT NULL CHECK (scheme IN
              ('eci_candidate_id','myneta_id','prs_id','sansad_id','pan_masked','affidavit_no')),
  value     TEXT NOT NULL,
  source_id TEXT REFERENCES source(id),
  -- (scheme, value) is the key, not (person_id, scheme, value): one myneta_id is one human, and
  -- ER leans on that. A collision here is a merge candidate, not a second row.
  PRIMARY KEY (scheme, value)
);
CREATE INDEX person_identifier_person_idx ON person_identifier (person_id);

CREATE TABLE person_merge (
  id           INTEGER PRIMARY KEY,
  surviving_id TEXT NOT NULL REFERENCES person(id),
  merged_id    TEXT NOT NULL,                    -- deliberately no FK: survives the cascade, audit trail
  score        NUMERIC,
  decided_by   TEXT NOT NULL,                    -- 'auto:v3' | 'user:<id>'
  decided_at   TEXT NOT NULL,
  evidence     TEXT NOT NULL,                    -- JSON
  reverted_at  TEXT
);

-- ─── symbols, parties, lineage (P3, P4) ──────────────────────────────────────
CREATE TABLE symbol (
  id             TEXT PRIMARY KEY NOT NULL,
  name           TEXT NOT NULL,
  names          TEXT NOT NULL DEFAULT '{}',     -- JSON
  svg_ref        TEXT,
  allotment_kind TEXT,                           -- vocabulary not fixed in §12; no CHECK until it is
  licensed_from  TEXT
);

CREATE TABLE party (
  id            TEXT PRIMARY KEY NOT NULL,
  name          TEXT NOT NULL,
  short_name    TEXT NOT NULL,
  names         TEXT NOT NULL DEFAULT '{}',      -- JSON
  kind          TEXT CHECK (kind IN
                  ('national','state','registered_unrecognised','independent')),
  registered_on TEXT,
  dissolved_on  TEXT
);

CREATE TABLE party_version (
  id         INTEGER PRIMARY KEY,
  party_id   TEXT NOT NULL REFERENCES party(id),
  valid_from TEXT NOT NULL,
  valid_to   TEXT,                               -- NULL = open-ended
  name       TEXT NOT NULL,
  symbol_id  TEXT REFERENCES symbol(id)
  -- §19 has: EXCLUDE USING gist (party_id WITH =, daterange(valid_from, valid_to) WITH &&).
  -- No portable equivalent (SQLite has neither exclusion constraints nor ranges), so the
  -- invariant moves to the view party_version_overlap below + migrate.test.ts. See ADR 0001.
);
CREATE INDEX party_version_party_idx ON party_version (party_id, valid_from);

-- The dropped EXCLUDE constraint, as a detector. Empty view == invariant holds. Half-open
-- [valid_from, valid_to) semantics, matching Postgres daterange.
CREATE VIEW party_version_overlap AS
  SELECT a.party_id AS party_id, a.id AS a_id, b.id AS b_id
  FROM party_version a
  JOIN party_version b
    ON a.party_id = b.party_id
   AND a.id < b.id
   AND a.valid_from < COALESCE(b.valid_to, '9999-12-31')
   AND b.valid_from < COALESCE(a.valid_to, '9999-12-31');

CREATE TABLE party_lineage (
  from_party_id TEXT NOT NULL REFERENCES party(id),
  to_party_id   TEXT NOT NULL REFERENCES party(id),
  kind          TEXT NOT NULL CHECK (kind IN
                  ('split','merge','rename','symbol_transfer','derecognition')),
  effective_on  TEXT NOT NULL,
  source_id     TEXT REFERENCES source(id),
  PRIMARY KEY (from_party_id, to_party_id, effective_on)
);

-- ─── alliances: versioned membership, because NDA-2019 != NDA-2024 ───────────
CREATE TABLE alliance (
  id    TEXT PRIMARY KEY NOT NULL,
  name  TEXT NOT NULL,
  names TEXT NOT NULL DEFAULT '{}'               -- JSON
);

CREATE TABLE alliance_version (
  id          INTEGER PRIMARY KEY,
  alliance_id TEXT NOT NULL REFERENCES alliance(id),
  valid_from  TEXT NOT NULL,
  valid_to    TEXT
);

CREATE TABLE alliance_member (
  alliance_version_id INTEGER NOT NULL REFERENCES alliance_version(id),
  party_id            TEXT NOT NULL REFERENCES party(id),
  joined_on           TEXT,
  left_on             TEXT,
  seat_share_agreed   INTEGER,
  PRIMARY KEY (alliance_version_id, party_id)
);

-- ─── elections and contests ──────────────────────────────────────────────────
-- election_lifecycle enum, inlined twice (election.lifecycle, contest.lifecycle): SQLite has no
-- CREATE DOMAIN and no CREATE TYPE, so the list is duplicated rather than shared.
CREATE TABLE election (
  id                    TEXT PRIMARY KEY NOT NULL,   -- 'ls-2024', 'wb-assembly-2026'
  kind                  TEXT NOT NULL CHECK (kind IN
                          ('general','assembly','biennial_rs','municipal','panchayat','bypoll',
                           'presidential')),
  level                 TEXT NOT NULL CHECK (level IN
                          ('union','state','district','block','ward')),
  electorate_kind       TEXT NOT NULL DEFAULT 'direct'
                        CHECK (electorate_kind IN ('direct','indirect','electoral_college')),
  jurisdiction_place_id TEXT NOT NULL REFERENCES place(id),
  epoch_id              TEXT NOT NULL REFERENCES boundary_epoch(id),
  name                  TEXT NOT NULL,
  lifecycle             TEXT NOT NULL CHECK (lifecycle IN
                          ('announced','notified','nominations','scrutiny','withdrawal','campaign',
                           'silence','polling','counting','declared','disputed','closed')),
  announced_on          TEXT,
  notified_on           TEXT,
  counting_on           TEXT,
  -- §6.10: the compliance gate, enforced in the API from these two columns
  forecast_gate_from    TEXT,
  forecast_gate_to      TEXT
);

CREATE TABLE election_phase (
  election_id TEXT NOT NULL REFERENCES election(id),
  n           INTEGER NOT NULL,
  poll_date   TEXT NOT NULL,
  seat_count  INTEGER,
  PRIMARY KEY (election_id, n)
);

CREATE TABLE contest (
  id               TEXT PRIMARY KEY NOT NULL,    -- 'ls-2024:wb-diamond-harbour'
  election_id      TEXT NOT NULL REFERENCES election(id),
  place_version_id INTEGER NOT NULL REFERENCES place_version(id),
  phase_n          INTEGER,
  seats_available  INTEGER NOT NULL DEFAULT 1,
  lifecycle        TEXT NOT NULL CHECK (lifecycle IN
                     ('announced','notified','nominations','scrutiny','withdrawal','campaign',
                      'silence','polling','counting','declared','disputed','closed')),
  declared_at      TEXT,
  -- P4: a contest is (election, place-as-of-an-epoch). Also the join key ingest dedupes on.
  UNIQUE (election_id, place_version_id)
);

CREATE TABLE candidacy (
  id                  TEXT PRIMARY KEY NOT NULL,
  contest_id          TEXT NOT NULL REFERENCES contest(id),
  person_id           TEXT NOT NULL REFERENCES person(id),
  party_version_id    INTEGER REFERENCES party_version(id),
  alliance_version_id INTEGER REFERENCES alliance_version(id),
  symbol_id           TEXT REFERENCES symbol(id),
  serial_no           INTEGER,
  status              TEXT NOT NULL CHECK (status IN
                        ('filed','rejected','withdrawn','contesting','elected','defeated',
                         'disqualified')),
  age_declared        INTEGER,
  education_declared  TEXT,
  -- party_raw: the source's party string when it does not resolve to a party row (src/data's
  -- partyId is sometimes a code, sometimes a full name that is not a key). NULL once resolved.
  -- ponytail: one nullable column beats a side table — a candidacy is never dropped for an
  -- unresolvable party. Promote to a claim row when unresolved parties need their own review queue.
  party_raw           TEXT,
  UNIQUE (contest_id, person_id)                 -- ER hard negative depends on this
);
-- No index on candidacy(contest_id): UNIQUE (contest_id, person_id) already indexes that prefix.
-- person_id is the column the unique index does NOT cover, and person pages read by it.
CREATE INDEX candidacy_person_idx ON candidacy (person_id);

-- ─── affidavits: the delta feature ───────────────────────────────────────────
CREATE TABLE affidavit (
  id           TEXT PRIMARY KEY NOT NULL,
  candidacy_id TEXT NOT NULL REFERENCES candidacy(id),
  filed_on     TEXT,
  source_id    TEXT NOT NULL REFERENCES source(id)      -- P2
);

CREATE TABLE affidavit_field (
  affidavit_id   TEXT NOT NULL REFERENCES affidavit(id),
  path           TEXT NOT NULL,                  -- 'assets.movable.total'
  value_numeric  NUMERIC,
  value_text     TEXT,
  unit           TEXT,
  page_no        INTEGER,
  rect           TEXT,                           -- JSON — the citation anchor
  parser_version TEXT NOT NULL,
  PRIMARY KEY (affidavit_id, path)
);

-- ─── cases: P5 lives here ────────────────────────────────────────────────────
CREATE TABLE legal_case (
  id              TEXT PRIMARY KEY NOT NULL,
  person_id       TEXT NOT NULL REFERENCES person(id),
  court           TEXT,
  case_no         TEXT,
  sections        TEXT,                           -- JSON array (was text[])
  -- P5: a bare case COUNT with no stage information is stage='unknown'. Never 'charged',
  -- never 'convicted'. 'convicted' additionally requires source.kind='court_order' — asserted
  -- by the audit query, not by a CHECK, because CHECK cannot read another table.
  stage           TEXT NOT NULL CHECK (stage IN
                    ('fir','charged','trial','convicted','acquitted','stayed','unknown')),
  filed_on        TEXT,
  last_hearing_on TEXT,
  disposed_on     TEXT,
  source_id       TEXT NOT NULL REFERENCES source(id)   -- P2
);
CREATE INDEX legal_case_person_idx ON legal_case (person_id);
