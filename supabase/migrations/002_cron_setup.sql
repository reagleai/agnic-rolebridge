-- RoleBridge V1 - Cron Setup
-- Block F: pg_cron + pg_net jobs
-- PREREQUISITES:
--   1. Enable pg_cron extension in Supabase dashboard (Database → Extensions)
--   2. Enable pg_net extension in Supabase dashboard (Database → Extensions)
--   3. Replace <PROJECT_REF> with your Supabase project ref (e.g. abcdefghijkl)
--   4. Replace <SERVICE_ROLE_KEY> with your Supabase service role key
--
-- For local dev, the URL is: http://host.docker.internal:54321/functions/v1/report-worker
-- For production, the URL is: https://<PROJECT_REF>.supabase.co/functions/v1/report-worker

-- ── Extension setup ──
-- These are enabled via the Supabase dashboard, not via SQL.
-- Uncomment only if running against a local Supabase instance:
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── Session cleanup: delete expired sessions every 10 minutes ──
SELECT cron.schedule(
  'cleanup-expired-sessions',
  '*/10 * * * *',
  $$ DELETE FROM sessions WHERE expires_at < NOW() AND status != 'ended'; $$
);

-- ── Report worker: invoke every 1 minute via pg_net ──
-- ⚠️  IMPORTANT: Replace the URL and Bearer token below before running.
--    Local:      url := 'http://host.docker.internal:54321/functions/v1/report-worker'
--    Production: url := 'https://<PROJECT_REF>.supabase.co/functions/v1/report-worker'
SELECT cron.schedule(
  'process-report-queue',
  '* * * * *',
  $$ SELECT net.http_post(
    url := '<PROJECT_URL>/functions/v1/report-worker',
    body := '{}'::jsonb,
    headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>", "Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000
  ); $$
);
