-- 013_election_event_identity.sql — an election is an event, not a year.
-- Forward-only; 001-012 are shipped and untouched. Same portable subset (ADR 0001).
-- migrate: foreign_keys=off
--
-- WHAT THIS FIXES. An election's identity was (jurisdiction, house, year), carried only in an id string.
-- Bihar held TWO assembly elections in 2005 — the 13th assembly in February and the 14th in November, 243
-- seats each — and both collapsed into 'br-assembly-2005'. contest is UNIQUE (election_id,
-- place_version_id), so 486 contests became 243; a candidacy id derives from (contest, person), so the 618
-- candidates who stood in the same seat at both elections collided and one row overwrote the other. 34
-- seats ended up with two declared winners. This is the same mistake as the constituency one repaired in
-- 011: a year is no more a permanent identity for an election than a seat number is for a seat.
-- docs/model/election-identity.md.
--
-- THE NEW COLUMNS, all from the source's own fields (Assembly_No, month, Poll_No), none invented:
--   year           a real column. Chronology lived in the id text, which is why 17 queries across 11 files
--                  had to read substr(election_id, -4) to sort anything. Derived here from the id, which is
--                  where it was already encoded — a re-representation, not a new claim — and the CHECK
--                  below turns any id that does not carry a plausible year into a loud failure rather than
--                  a silent zero.
--   polling_month  1-12 where the source gives it. NULL on by-elections, whose rows carry no month.
--   house_ordinal  Assembly_No: which assembly or Lok Sabha this election constituted. Bihar's February
--                  2005 election made its 13th assembly; November's made the 14th. This is the cleanest
--                  distinguisher the source has, and it is a fact about the event, not a derived label.
--   poll_no        0 for a general election, 1..n for a by-election round.
--   occurrence     1-based, chronological within (jurisdiction, kind, year). This is what makes the
--                  identity TOTAL: not a month, so it also separates by-election rounds that have no month;
--                  not the source's ordinal, so it also works where a source numbers houses differently.
--   source_id      P2. `election` was the last ring-1 table with no source at all.
--   house          WHICH HOUSE is being elected — 'ac' or 'pc', the same vocabulary place_version.kind
--                  uses, so a join needs no translation. This was missing entirely, and adding the UNIQUE
--                  below is what exposed it: an assembly by-election and a parliamentary by-election in the
--                  same state and year are both kind='bypoll' at level='state', so 145 pairs
--                  ('ap-bypoll-ae-1965' and 'ap-bypoll-ge-1965' and so on) were distinguished by nothing but
--                  their id text. No rows were lost to it — they are separate election rows with separate
--                  contests — but an identity that only exists in a string is the defect this migration is
--                  about. 'none' is for an election that fills neither house (municipal, panchayat,
--                  presidential, biennial Rajya Sabha); it is a real value rather than NULL so that the
--                  UNIQUE constraint stays total, since SQLite treats NULLs as distinct.
--
-- UNIQUE (jurisdiction_place_id, kind, house, year, occurrence) is the constraint that makes the collapse
-- unrepresentable. Existing rows all take occurrence 1, which is correct for 1,186 of the 1,188: the two
-- colliding groups are split by `mandate elections repair`, which cannot run until this exists.
--
-- foreign_keys=off for the reason 010-012 documented: election_phase and contest hold foreign keys into
-- election, DROP TABLE is an implicit DELETE FROM of every parent row, and ALTER TABLE RENAME rewrites
-- children's REFERENCES clauses. Ids are preserved by the copy, so all 63,288 contests keep their target.

CREATE TABLE election_v2 (
  id                    TEXT PRIMARY KEY NOT NULL,   -- 'ls-2024', 'br-assembly-2005-02'
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
  house                 TEXT NOT NULL DEFAULT 'none' CHECK (house IN ('ac','pc','none')),
  year                  INTEGER NOT NULL,
  polling_month         INTEGER,
  house_ordinal         INTEGER,
  poll_no               INTEGER,
  occurrence            INTEGER NOT NULL DEFAULT 1,
  source_id             TEXT REFERENCES source(id),
  announced_on          TEXT,
  notified_on           TEXT,
  counting_on           TEXT,
  -- §6.10: the compliance gate, enforced in the API from these two columns
  forecast_gate_from    TEXT,
  forecast_gate_to      TEXT,
  UNIQUE (jurisdiction_place_id, kind, house, year, occurrence),
  CONSTRAINT election_year_plausible  CHECK (year BETWEEN 1950 AND 2100),
  CONSTRAINT election_month_real      CHECK (polling_month IS NULL OR polling_month BETWEEN 1 AND 12),
  CONSTRAINT election_occurrence_pos  CHECK (occurrence >= 1),
  CONSTRAINT election_poll_no_natural CHECK (poll_no IS NULL OR poll_no >= 0)
);

INSERT INTO election_v2
  (id, kind, level, electorate_kind, jurisdiction_place_id, epoch_id, name, lifecycle,
   house, year, occurrence, announced_on, notified_on, counting_on, forecast_gate_from, forecast_gate_to)
SELECT id, kind, level, electorate_kind, jurisdiction_place_id, epoch_id, name, lifecycle,
       -- The house is read off the id because that is the only place it was ever recorded. It is not a
       -- guess: 'assembly' and '-bypoll-ae-' fill assembly seats, 'general' and '-bypoll-ge-' fill
       -- parliamentary ones, and `mandate elections backfill` re-asserts every value from the source file
       -- afterwards, so an id that lies here is caught rather than trusted.
       CASE
         WHEN kind = 'assembly' OR id LIKE '%-bypoll-ae-%' THEN 'ac'
         WHEN kind = 'general'  OR id LIKE '%-bypoll-ge-%' THEN 'pc'
         ELSE 'none'
       END,
       CAST(substr(id, -4) AS INTEGER), 1,
       announced_on, notified_on, counting_on, forecast_gate_from, forecast_gate_to
  FROM election;

DROP TABLE election;
ALTER TABLE election_v2 RENAME TO election;

-- Chronology is (year, polling_month, occurrence) from here on, so the index matches how it is read.
CREATE INDEX election_chronology ON election (year, polling_month, occurrence);
CREATE INDEX election_jurisdiction ON election (jurisdiction_place_id, kind, house, year);
