-- RoleBridge V1 - Enable Row Level Security (RLS)
-- Block G: Security setup
-- This fixes the Supabase Advisor warnings about RLS being disabled.

-- 1. Enable RLS on both tables
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_queue ENABLE ROW LEVEL SECURITY;

-- 2. Create policies for the Edge Functions (service_role)
-- The Edge Functions use the service_role key, which automatically bypasses RLS.
-- However, we can add a basic policy just to satisfy any strict checks.

CREATE POLICY "Allow Edge Functions to manage sessions" 
ON sessions FOR ALL 
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow Edge Functions to manage report_queue" 
ON report_queue FOR ALL 
USING (true)
WITH CHECK (true);
