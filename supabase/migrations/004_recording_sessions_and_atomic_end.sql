-- RoleBridge V1 - Recording session safety + atomic session end

CREATE TABLE IF NOT EXISTS recording_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID NOT NULL,
  gladia_session_id   TEXT,
  gladia_ws_url       TEXT,
  status              TEXT NOT NULL DEFAULT 'created',
                       -- created | active | stopped | failed | timeout | orphaned
  stop_reason          TEXT,
  max_duration_ms      INT NOT NULL DEFAULT 600000,
  last_heartbeat_at    TIMESTAMPTZ,
  started_at           TIMESTAMPTZ DEFAULT NOW(),
  stopped_at           TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recording_sessions_session
  ON recording_sessions(session_id);

CREATE INDEX IF NOT EXISTS idx_recording_sessions_status
  ON recording_sessions(status, last_heartbeat_at);

ALTER TABLE recording_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow Edge Functions to manage recording_sessions"
ON recording_sessions FOR ALL
USING (true)
WITH CHECK (true);

CREATE OR REPLACE FUNCTION end_session_atomic(p_session_id UUID)
RETURNS TABLE(prior_status TEXT, has_answers BOOLEAN) AS $$
BEGIN
  RETURN QUERY
  WITH target AS (
    SELECT *
    FROM sessions
    WHERE id = p_session_id
      AND status IN ('active', 'setup')
    FOR UPDATE
  ),
  marked AS (
    UPDATE sessions s
    SET status = 'ended'
    FROM target t
    WHERE s.id = t.id
    RETURNING
      t.id,
      t.status AS prior_status,
      t.email,
      t.section_name,
      t.section_text,
      t.jd_text,
      t.transcript,
      t.core_questions,
      EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(t.transcript, '[]'::jsonb)) AS turn
        WHERE turn->>'type' = 'answer'
      ) AS has_answers
  ),
  queue_insert AS (
    INSERT INTO report_queue (
      session_id,
      email,
      section_name,
      section_text,
      jd_text,
      transcript,
      core_questions
    )
    SELECT
      id,
      email,
      section_name,
      section_text,
      jd_text,
      transcript,
      core_questions
    FROM marked
    WHERE prior_status = 'active'
      AND has_answers = true
    RETURNING session_id
  ),
  cleanup_recordings AS (
    UPDATE recording_sessions
    SET
      status = CASE
        WHEN status IN ('created', 'active') THEN 'stopped'
        ELSE status
      END,
      stop_reason = COALESCE(stop_reason, 'session_end'),
      stopped_at = COALESCE(stopped_at, NOW())
    WHERE session_id = p_session_id
    RETURNING id
  ),
  deleted AS (
    DELETE FROM sessions
    WHERE id = p_session_id
      AND EXISTS (SELECT 1 FROM marked)
    RETURNING id
  )
  SELECT marked.prior_status, marked.has_answers
  FROM marked;
END;
$$ LANGUAGE plpgsql;
