-- RoleBridge V2 - Users, Profiles, and Reports
-- Block 0: Foundation schema for Agnic-authenticated V2 backend.
--
-- Creates three new tables with `v2_` prefix to coexist with V1 schema.
-- V1 tables (sessions, report_queue, recording_sessions) are NOT modified
-- except for one new nullable FK column on `sessions`.

-- ──────────────────────────────────────────────────────────────
-- 1. v2_users — Agnic-authenticated users with persistent tokens
-- ──────────────────────────────────────────────────────────────

CREATE TABLE v2_users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agnic_user_id     TEXT UNIQUE,                     -- Agnic's unique user identifier
  email             TEXT NOT NULL,
  display_name      TEXT,
  access_token      TEXT NOT NULL,                    -- Agnic OAuth access token (server-side only)
  refresh_token     TEXT,                             -- Agnic OAuth refresh token
  token_expires_at  TIMESTAMPTZ,                      -- When access_token expires
  token_scope       TEXT,                             -- Granted OAuth scopes (e.g. 'payments:sign balance:read')
  session_count     INT DEFAULT 0,                    -- Total interview sessions completed
  rb_session_token  TEXT UNIQUE,                      -- RoleBridge session identifier sent to frontend (not the Agnic token)
  last_login_at     TIMESTAMPTZ DEFAULT NOW(),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_v2_users_email ON v2_users(email);
CREATE INDEX idx_v2_users_agnic_id ON v2_users(agnic_user_id);
CREATE INDEX idx_v2_users_rb_session ON v2_users(rb_session_token);

-- ──────────────────────────────────────────────────────────────
-- 2. v2_profiles — Career + resume data (separate from auth)
-- ──────────────────────────────────────────────────────────────

CREATE TABLE v2_profiles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES v2_users(id) ON DELETE CASCADE,
  name              TEXT,
  headline          TEXT,
  years_exp         TEXT,                             -- '0-2', '3-5', '6-10', '10+'
  "current_role"      TEXT,
  target_role       TEXT,
  linkedin_url      TEXT,
  resume_text       TEXT,
  pdf_name          TEXT,
  transition_notes  TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_v2_profiles_user UNIQUE (user_id)    -- One profile per user
);

CREATE INDEX idx_v2_profiles_user ON v2_profiles(user_id);

-- ──────────────────────────────────────────────────────────────
-- 3. v2_reports — Persisted reports for on-screen display + Realtime push
-- ──────────────────────────────────────────────────────────────

CREATE TABLE v2_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL,                    -- FK to sessions.id (but sessions get deleted, so no constraint)
  user_id           UUID NOT NULL REFERENCES v2_users(id),
  report_json       JSONB NOT NULL DEFAULT '{}'::jsonb, -- Full 6-dimension report structure
  email_sent        BOOLEAN DEFAULT FALSE,
  status            TEXT DEFAULT 'pending',            -- pending | generating | ready | emailed | failed
  error_message     TEXT,                              -- Failure reason if status = 'failed'
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_v2_reports_session ON v2_reports(session_id);
CREATE INDEX idx_v2_reports_user ON v2_reports(user_id);
CREATE INDEX idx_v2_reports_status ON v2_reports(status);

-- ──────────────────────────────────────────────────────────────
-- 4. Link sessions to v2_users
-- ──────────────────────────────────────────────────────────────
-- Nullable FK so V1 sessions (created without a v2_user) are unaffected.

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS v2_user_id UUID REFERENCES v2_users(id);
CREATE INDEX IF NOT EXISTS idx_sessions_v2_user ON sessions(v2_user_id);

-- ──────────────────────────────────────────────────────────────
-- 5. RLS — enabled with service_role bypass (matches V1 pattern)
-- ──────────────────────────────────────────────────────────────

ALTER TABLE v2_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow Edge Functions to manage v2_users"
  ON v2_users FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Allow Edge Functions to manage v2_profiles"
  ON v2_profiles FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Allow Edge Functions to manage v2_reports"
  ON v2_reports FOR ALL
  USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────
-- 6. Enable Realtime on v2_reports for WebSocket push
-- ──────────────────────────────────────────────────────────────
-- Supabase Realtime listens for changes on tables added to the
-- supabase_realtime publication. This allows the frontend to
-- subscribe to report status changes via Supabase client.

ALTER PUBLICATION supabase_realtime ADD TABLE v2_reports;
