-- RoleBridge V1 - Initial Schema
-- Block B: sessions + report_queue + indexes

CREATE TABLE sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             TEXT NOT NULL,
  resume_text       TEXT,
  section_name      TEXT,
  section_text      TEXT,
  jd_text           TEXT,
  core_questions    JSONB,
  transcript        JSONB DEFAULT '[]',
  status            TEXT DEFAULT 'setup',
                                        -- setup | active | ended | failed
  question_index    INT DEFAULT 0,
  followup_count    INT DEFAULT 0,
  followup_depth    INT DEFAULT 0,
  total_questions   INT DEFAULT 0,
  session_start     TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 minutes',
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Report queue: decouples slow LLM report generation from user-facing /end
CREATE TABLE report_queue (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL,
  email       TEXT NOT NULL,
  section_name TEXT,
  section_text TEXT,
  jd_text     TEXT,
  transcript  JSONB,
  core_questions JSONB,
  status      TEXT DEFAULT 'pending',  -- pending | processing | done | failed
  attempts    INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  expires_at  TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'
);

-- Indexes
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_report_queue_status ON report_queue(status, created_at);
