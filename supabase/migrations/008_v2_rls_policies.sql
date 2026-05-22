-- RoleBridge V2 - tighten row-level security policies.
--
-- Edge Functions use the Supabase service role key and bypass RLS. These
-- policies protect the tables from accidental direct client access while still
-- allowing future Supabase-authenticated users to read/update their own rows.

ALTER TABLE v2_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

COMMENT ON COLUMN v2_profiles."current_role" IS
  'RoleBridge V2 profile field; application code accesses the normalized current_role identifier.';

DROP POLICY IF EXISTS "Allow Edge Functions to manage v2_users" ON v2_users;
DROP POLICY IF EXISTS "Allow Edge Functions to manage v2_profiles" ON v2_profiles;
DROP POLICY IF EXISTS "Allow Edge Functions to manage v2_reports" ON v2_reports;
DROP POLICY IF EXISTS "Allow Edge Functions to manage sessions" ON sessions;

CREATE POLICY "Users can read own v2 user"
  ON v2_users FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR email = (auth.jwt() ->> 'email')
  );

CREATE POLICY "Users can update own v2 user"
  ON v2_users FOR UPDATE
  TO authenticated
  USING (
    id = auth.uid()
    OR email = (auth.jwt() ->> 'email')
  )
  WITH CHECK (
    id = auth.uid()
    OR email = (auth.jwt() ->> 'email')
  );

CREATE POLICY "Users can read own v2 profile"
  ON v2_profiles FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM v2_users
      WHERE v2_users.id = v2_profiles.user_id
        AND v2_users.email = (auth.jwt() ->> 'email')
    )
  );

CREATE POLICY "Users can insert own v2 profile"
  ON v2_profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM v2_users
      WHERE v2_users.id = v2_profiles.user_id
        AND v2_users.email = (auth.jwt() ->> 'email')
    )
  );

CREATE POLICY "Users can update own v2 profile"
  ON v2_profiles FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM v2_users
      WHERE v2_users.id = v2_profiles.user_id
        AND v2_users.email = (auth.jwt() ->> 'email')
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM v2_users
      WHERE v2_users.id = v2_profiles.user_id
        AND v2_users.email = (auth.jwt() ->> 'email')
    )
  );

CREATE POLICY "Users can delete own v2 profile"
  ON v2_profiles FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM v2_users
      WHERE v2_users.id = v2_profiles.user_id
        AND v2_users.email = (auth.jwt() ->> 'email')
    )
  );

CREATE POLICY "Users can read own v2 reports"
  ON v2_reports FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM v2_users
      WHERE v2_users.id = v2_reports.user_id
        AND v2_users.email = (auth.jwt() ->> 'email')
    )
  );

CREATE POLICY "Users can update own v2 reports"
  ON v2_reports FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM v2_users
      WHERE v2_users.id = v2_reports.user_id
        AND v2_users.email = (auth.jwt() ->> 'email')
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM v2_users
      WHERE v2_users.id = v2_reports.user_id
        AND v2_users.email = (auth.jwt() ->> 'email')
    )
  );

CREATE POLICY "Users can read own v2 sessions"
  ON sessions FOR SELECT
  TO authenticated
  USING (
    v2_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM v2_users
      WHERE v2_users.id = sessions.v2_user_id
        AND v2_users.email = (auth.jwt() ->> 'email')
    )
  );

CREATE POLICY "Users can update own v2 sessions"
  ON sessions FOR UPDATE
  TO authenticated
  USING (
    v2_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM v2_users
      WHERE v2_users.id = sessions.v2_user_id
        AND v2_users.email = (auth.jwt() ->> 'email')
    )
  )
  WITH CHECK (
    v2_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM v2_users
      WHERE v2_users.id = sessions.v2_user_id
        AND v2_users.email = (auth.jwt() ->> 'email')
    )
  );
