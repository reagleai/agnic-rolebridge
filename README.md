# RoleBridge V1

AI interview simulator for career-transition candidates. Takes a resume + JD, generates focused interview questions, runs a live voice interview with real-time follow-up logic, then emails a detailed evaluation report.

## Stack

- **Frontend**: Vite + React (deployed to Vercel)
- **Backend**: Supabase Edge Functions (Deno)
- **Database**: Supabase Postgres (ephemeral sessions)
- **STT**: Gladia Live
- **LLM**: OpenRouter (configurable models)
- **Email**: Resend

## Setup

1. Copy `.env.example` to `.env` and fill in your values.
2. Set backend secrets in the Supabase dashboard (Edge Function secrets).
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel project settings.
4. Run the database migration: `supabase db push`
5. Update `002_cron_setup.sql` with your project ref and service role key, then apply.
6. Deploy Edge Functions: `supabase functions deploy`
7. Start frontend locally: `cd frontend && npm install && npm run dev`

## Environment Variables

### Backend — Supabase Edge Function Secrets

Set these in the **Supabase Dashboard → Edge Function Secrets**:

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | ✅ | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role key (server-only, never expose to browser) |
| `OPENROUTER_API_KEY` | ✅ | OpenRouter API key for LLM calls |
| `GLADIA_API_KEY` | ✅ | Gladia API key for live speech-to-text |
| `RESEND_API_KEY` | ✅ | Resend API key for sending report emails |
| `APP_URL` | ✅ | Your production URL (e.g. `https://rolebridge.app`) |
| `RESEND_FROM_EMAIL` | Optional | Sender email (default: `RoleBridge <reports@protonaiagents.com>`) |
| `LLM_MODEL_*` | Optional | Override default LLM models per task (see `.env.example`) |

### Frontend — Vercel Project Settings

Set these in **Vercel → Project Settings → Environment Variables**:

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | ✅ | Your Supabase project URL (public) |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Supabase anon/public key (safe for browser) |

### CI/CD — GitHub Actions Secrets

Set these in **GitHub → Settings → Secrets and Variables → Actions**:

| Variable | Required | Description |
|---|---|---|
| `VERCEL_TOKEN` | ✅ | Vercel deploy token |
| `VERCEL_ORG_ID` | ✅ | Vercel organization ID |
| `VERCEL_PROJECT_ID` | ✅ | Vercel project ID |
| `SUPABASE_PROJECT_REF` | ✅ | Supabase project reference ID |
| `SUPABASE_ACCESS_TOKEN` | ✅ | Supabase CLI access token |

### Cron Setup — SQL Placeholders

The file `supabase/migrations/002_cron_setup.sql` requires manual replacement of:
- `<PROJECT_URL>` → Your Supabase project URL (e.g. `https://<ref>.supabase.co`)
- `<SERVICE_ROLE_KEY>` → Your Supabase service role key
