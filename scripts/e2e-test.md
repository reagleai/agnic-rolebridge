# RoleBridge V1 — End-to-End Test Checklist

## Prerequisites
- [ ] Supabase project running (local or remote)
- [ ] All env vars set (see `.env.example`)
- [ ] Edge Functions deployed or served locally
- [ ] Frontend running (`npm run dev`)
- [ ] pg_cron and pg_net enabled (for report delivery)

---

## Happy Path: Full Flow

### 1. Landing Page
- [ ] Navigate to `http://localhost:5173`
- [ ] Page shows "RoleBridge" title, gradient badge, email input, "Start Interview" button
- [ ] Enter valid email → click "Start Interview"
- [ ] Redirected to `/setup/<uuid>`

### 2. Setup Page
- [ ] Upload a real PDF resume (< 5MB, text-based)
- [ ] Text extraction succeeds, preview shown
- [ ] Paste job description (100+ characters)
- [ ] Select section: "Work Experience"
- [ ] Click "Start Interview" → loading state "Generating questions…"
- [ ] Redirected to `/interview/<uuid>` with first question displayed

### 3. Interview Page — Voice Mode
- [ ] Session timer shows 8:00 and counts down
- [ ] Click "🎙 Start Recording"
- [ ] Browser asks for microphone permission → grant
- [ ] Answer timer starts (60s countdown)
- [ ] Speak for 10+ seconds → interim text appears in real-time
- [ ] Click "⏹ Stop & Submit"
- [ ] Loading "Evaluating your answer…"
- [ ] New question appears (followup or next core)
- [ ] Progress counter updates

### 4. Interview Page — Text Mode
- [ ] Click "⌨ Type" toggle
- [ ] Type answer (10+ chars)
- [ ] Click "Submit Answer"
- [ ] Loading "Evaluating…" → next question

### 5. Session End
- [ ] After enough questions or timer expiry → redirected to `/complete`
- [ ] End page shows completion message, email, session ID
- [ ] Database: `sessions` table has NO row for this session
- [ ] Database: `report_queue` table has a `pending` (or `processing`/`done`) row

### 6. Report Email
- [ ] Wait 1-2 minutes for cron to trigger report-worker
- [ ] Check email inbox (and spam)
- [ ] Report contains: summary, 6 dimension scores, strengths, weaknesses

---

## Error States

### PDF Errors
- [ ] Upload PDF > 5MB → "PDF is too large" error, paste fallback shown
- [ ] Upload scanned PDF (image-based) → "very little text" error, paste fallback shown
- [ ] Upload corrupt file → parse error, paste fallback shown

### Microphone Errors
- [ ] Deny mic permission → automatically switches to text mode with message
- [ ] No mic device → switches to text mode

### Input Validation
- [ ] Submit empty email → "Please enter a valid email" error
- [ ] Resume < 200 chars → "Resume text must be at least 200 characters"
- [ ] JD < 100 chars → "Job description must be at least 100 characters"
- [ ] Answer < 10 chars → "Answer must be at least 10 characters"

### Timer Behavior
- [ ] Answer timer reaches 0 → auto-submits current transcript/text
- [ ] Session timer reaches 0 → auto-ends session, redirects to /complete

### Session Recovery
- [ ] During interview, press F5 (refresh) → page reloads
- [ ] Session rehydrates from `GET /sessions/:id`
- [ ] Current question re-displayed, timers resume

### Tab Close
- [ ] Close tab during interview → `beforeunload` fires
- [ ] Session should be cleaned up (may need to verify via DB)

### Idempotent End
- [ ] Call POST /end twice → second returns "already_ended"

---

## Security Checks

- [ ] `npm run build` in frontend/
- [ ] `grep -r "OPENROUTER\|GLADIA\|RESEND\|SERVICE_ROLE" frontend/dist/` → must find NOTHING
- [ ] Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` may appear in bundle
- [ ] CORS: all Edge Function responses include `Access-Control-Allow-Origin: *`

---

## Cron Verification (Supabase SQL Editor)

```sql
-- Verify cron jobs exist
SELECT * FROM cron.job;
-- Should show: cleanup-expired-sessions, process-report-queue

-- Verify recent runs
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

-- Check report queue status
SELECT id, session_id, email, status, attempts, created_at FROM report_queue ORDER BY created_at DESC LIMIT 5;
```

---

## Environment Variable Checklist

### Backend (Supabase Edge Function secrets)
- [ ] `SUPABASE_URL` — set
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — set
- [ ] `OPENROUTER_API_KEY` — set
- [ ] `GLADIA_API_KEY` — set
- [ ] `RESEND_API_KEY` — set
- [ ] `APP_URL` — set (e.g., `https://rolebridge.app`)

### Frontend (Vercel env vars)
- [ ] `VITE_SUPABASE_URL` — set
- [ ] `VITE_SUPABASE_ANON_KEY` — set

### Optional
- [ ] `LLM_MODEL_SECTION_EXTRACTION` — (defaults in llm.ts)
- [ ] `LLM_MODEL_QUESTION_GENERATION` — (defaults in llm.ts)
- [ ] `LLM_MODEL_ANSWER_EVALUATION` — (defaults in llm.ts)
- [ ] `LLM_MODEL_REPORT_GENERATION` — (defaults in llm.ts)
