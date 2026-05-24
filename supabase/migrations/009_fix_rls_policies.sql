-- RoleBridge V2 - Fix Insecure RLS Policies
-- Security Audit Remediation: Drops the `USING (true)` policies from V1 tables
-- that exposed PII and session data to the public internet. Edge functions use
-- the service role key and bypass RLS, so no replacement policy is required.

DROP POLICY IF EXISTS "Allow Edge Functions to manage report_queue" ON report_queue;
DROP POLICY IF EXISTS "Allow Edge Functions to manage recording_sessions" ON recording_sessions;
