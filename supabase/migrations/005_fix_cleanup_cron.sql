-- RoleBridge V1 - Fix cleanup cron to queue reports before deleting expired sessions
-- Previously, the cleanup cron silently deleted expired sessions without generating reports.

-- Step 1: Create a function that queues reports for expired active sessions with answers
CREATE OR REPLACE FUNCTION cleanup_expired_sessions_with_reports()
RETURNS void AS $$
BEGIN
  -- Queue reports for expired active sessions that have at least one answer
  INSERT INTO report_queue (session_id, email, section_name, section_text, jd_text, transcript, core_questions)
  SELECT id, email, section_name, section_text, jd_text, transcript, core_questions
  FROM sessions
  WHERE expires_at < NOW()
    AND status = 'active'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(transcript, '[]'::jsonb)) AS turn
      WHERE turn->>'type' = 'answer'
    );

  -- Stop any orphaned recording sessions
  UPDATE recording_sessions
  SET status = 'stopped',
      stop_reason = 'session_expired',
      stopped_at = NOW()
  WHERE session_id IN (
    SELECT id FROM sessions WHERE expires_at < NOW() AND status != 'ended'
  )
  AND status IN ('created', 'active');

  -- Delete all expired non-ended sessions
  DELETE FROM sessions WHERE expires_at < NOW() AND status != 'ended';
END;
$$ LANGUAGE plpgsql;

-- Step 2: Re-schedule the cleanup cron to use the new function
SELECT cron.schedule(
  'cleanup-expired-sessions',
  '*/10 * * * *',
  $$ SELECT cleanup_expired_sessions_with_reports(); $$
);
