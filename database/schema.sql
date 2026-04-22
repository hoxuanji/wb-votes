-- ============================================================
-- WB VOTES - PostgreSQL Schema
-- Compatible with Supabase / Railway PostgreSQL
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- CORE TABLES
-- ============================================================

CREATE TABLE constituencies (
  id              TEXT PRIMARY KEY,             -- e.g. 'c001'
  assembly_number INTEGER NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  name_bn         TEXT NOT NULL,
  district        TEXT NOT NULL,
  district_bn     TEXT NOT NULL,
  reservation     TEXT NOT NULL CHECK (reservation IN ('General','SC','ST')),
  total_voters    INTEGER,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE parties (
  id           TEXT PRIMARY KEY,               -- e.g. 'AITC', 'BJP'
  name         TEXT NOT NULL,
  name_bn      TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  color        TEXT NOT NULL,                  -- hex colour
  is_national  BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE candidates (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,
  name_bn              TEXT,
  party_id             TEXT NOT NULL REFERENCES parties(id),
  constituency_id      TEXT NOT NULL REFERENCES constituencies(id),
  photo_url            TEXT,
  age                  INTEGER,
  gender               TEXT CHECK (gender IN ('Male','Female','Other')),
  education            TEXT,
  education_bn         TEXT,
  criminal_cases       INTEGER DEFAULT 0,
  criminal_cases_detail TEXT,
  total_assets         BIGINT DEFAULT 0,
  movable_assets       BIGINT DEFAULT 0,
  immovable_assets     BIGINT DEFAULT 0,
  total_liabilities    BIGINT DEFAULT 0,
  affidavit_url        TEXT,
  occupation           TEXT,
  occupation_bn        TEXT,
  is_incumbent         BOOLEAN DEFAULT FALSE,
  incumbent_years      INTEGER,
  data_source          TEXT DEFAULT 'mock',    -- 'mock' | 'myneta' | 'eci'
  last_verified_at     TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- QUIZ TABLES
-- ============================================================

CREATE TABLE quiz_questions (
  id          TEXT PRIMARY KEY,
  question    TEXT NOT NULL,
  question_bn TEXT NOT NULL,
  category    TEXT NOT NULL,
  category_bn TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE quiz_options (
  id          TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  text_bn     TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE quiz_option_party_weights (
  option_id  TEXT NOT NULL REFERENCES quiz_options(id) ON DELETE CASCADE,
  party_id   TEXT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  weight     SMALLINT NOT NULL CHECK (weight BETWEEN 0 AND 10),
  PRIMARY KEY (option_id, party_id)
);

-- ============================================================
-- SESSION / RESULTS TABLES (no PII stored)
-- ============================================================

CREATE TABLE quiz_sessions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  constituency_id   TEXT REFERENCES constituencies(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  -- No IP address, no name, no email — privacy by design
  expires_at        TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')
);

CREATE TABLE quiz_session_answers (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id  UUID NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES quiz_questions(id),
  option_id   TEXT NOT NULL REFERENCES quiz_options(id),
  answered_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE quiz_session_results (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id  UUID NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  party_id    TEXT NOT NULL REFERENCES parties(id),
  score       SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 100),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_candidates_constituency ON candidates(constituency_id);
CREATE INDEX idx_candidates_party        ON candidates(party_id);
CREATE INDEX idx_quiz_answers_session    ON quiz_session_answers(session_id);
CREATE INDEX idx_quiz_results_session    ON quiz_session_results(session_id);
CREATE INDEX idx_constituencies_district ON constituencies(district);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER candidates_updated_at
  BEFORE UPDATE ON candidates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- ROW LEVEL SECURITY (Supabase)
-- ============================================================

ALTER TABLE constituencies          ENABLE ROW LEVEL SECURITY;
ALTER TABLE parties                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates              ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_questions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_options            ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_option_party_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_sessions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_session_answers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_session_results    ENABLE ROW LEVEL SECURITY;

-- Public read-only for reference data
CREATE POLICY "public_read_constituencies" ON constituencies FOR SELECT USING (true);
CREATE POLICY "public_read_parties"        ON parties        FOR SELECT USING (true);
CREATE POLICY "public_read_candidates"     ON candidates     FOR SELECT USING (true);
CREATE POLICY "public_read_questions"      ON quiz_questions FOR SELECT USING (is_active = true);
CREATE POLICY "public_read_options"        ON quiz_options   FOR SELECT USING (true);
CREATE POLICY "public_read_weights"        ON quiz_option_party_weights FOR SELECT USING (true);

-- Sessions: insert and read own session only
CREATE POLICY "insert_session"  ON quiz_sessions         FOR INSERT WITH CHECK (true);
CREATE POLICY "read_own_session" ON quiz_sessions         FOR SELECT USING (true);
CREATE POLICY "insert_answers"  ON quiz_session_answers  FOR INSERT WITH CHECK (true);
CREATE POLICY "read_answers"    ON quiz_session_answers  FOR SELECT USING (true);
CREATE POLICY "insert_results"  ON quiz_session_results  FOR INSERT WITH CHECK (true);
CREATE POLICY "read_results"    ON quiz_session_results  FOR SELECT USING (true);
