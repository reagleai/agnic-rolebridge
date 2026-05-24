# Sentinel Security Learnings

- Checked frontend for `dangerouslySetInnerHTML` injections for the LLM output; data interpolation handles strings without injecting unescaped tags.
- Verified Edge Function identity mapping mapping Agnic OAuth to `rb_session_token`, ensuring zero access token leakage to the client.
- Evaluated CORS wildcard configurations (`Access-Control-Allow-Origin: *`) in `_shared/cors.ts` as a moderate risk that requires lockdown before moving to production to prevent unauthorized session API execution.
- Evaluated Supabase RLS boundaries bypassing via `SUPABASE_SERVICE_ROLE_KEY` inside edge functions and established `authenticateRequest` validates the identity bounds successfully against `session.v2_user_id === userId`.
