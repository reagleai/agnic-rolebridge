-- Fix: "column reference 'prior_status' is ambiguous" in end_session_atomic
-- The RETURNS TABLE column names clashed with CTE column aliases.
-- Fix by using positional references in the final SELECT.

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
      t.status AS old_status,
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
      ) AS had_answers
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
    WHERE old_status = 'active'
      AND had_answers = true
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
  SELECT marked.old_status, marked.had_answers
  FROM marked;
END;
$$ LANGUAGE plpgsql;
