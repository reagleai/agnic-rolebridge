# RoleBridge
Interview Pressure-Test · Powered by AI

## Product Overview
RoleBridge simulates high-stakes, pressure-tested interviews for mid-career professionals looking to switch industries or roles. By grounding the interview directly in the user's uploaded resume and target job description, RoleBridge generates highly targeted questions. If a candidate provides a vague answer or relies on outdated jargon, the AI dynamically pushes back, ensuring the candidate learns exactly where their narrative breaks down before setting foot in a real interview.

## Value Proposition
For mid-career professionals making a domain switch, RoleBridge delivers a personalized AI interview pressure-test that sharpens how they translate their real experience into the target role's language — so they walk into the real interview confident, not rehearsed.

## The Problem
- **The Audience:** Mid-career professionals (25–45) switching industries or functions, where one bad interview means months of setbacks.
- **The Pain:** They get shortlisted because of their resume, but fail the interview because they can't translate their past work into the new role's language when a hiring manager pushes back.
- **The Consequence:** Candidates give vague answers, fall back on old-industry jargon, and present an inconsistent narrative—prompting the interviewer to pass.

## How It Works
1. **Context Loading:** Upload your resume (or import from your profile) and paste your target job description. The AI identifies the translation gap.
2. **The Pressure Test:** Answer dynamically generated questions via voice or text. If your answer is weak, the AI does not move on—it pushes back with a targeted follow-up.
3. **The Credit Wall:** High-intensity LLM usage is funded by the user's Agnic wallet. If the wallet depletes mid-session, a 402 paywall halts the interview at the exact moment of highest intent.
4. **The Post-Mortem:** Receive a brutally honest 6-dimension score report (Clarity, Evidence, Ownership, Role-Language, Relevance, Coherence) on-screen and via email.

<p align="center">
  <img src="./docs/rolebridge-report.png" width="800" alt="RoleBridge Evaluation Report Demo" />
</p>

## Monetization Model
- **Agnic OAuth & Wallet:** Users sign in with their Agnic account. Their Agnic wallet funds every LLM call they make on the platform.
- **Earn-Per-Generate:** Every LLM call routed through the Agnic API Gateway includes our `AGNIC_PARTNER_ID`, earning us a commission margin on every token processed.
- **The 402 Paywall:** We surface a 402 error natively in the UI when credits run out. Hitting a credit wall mid-session (when the candidate realizes their interview narrative has a hole in it) is the highest-intent moment for monetization.
- **Unit Economics:** Base model cost is optimized (using `gpt-4o-mini` and `claude-3-5-sonnet`), allowing users to be charged $0.50–$1.00 per high-intensity session with gross margins exceeding 90%.

## Technical Stack
- **Frontend:** React 19 / Vite SPA, React Router DOM, vanilla CSS, `pdfjs-dist` (for client-side PDF parsing).
- **Backend Infrastructure:** Supabase Edge Functions (Deno runtime) handling 20+ specialized microservices.
- **Database:** Supabase PostgreSQL with RLS policies, persisting sessions, transcripts, eval scores, and question states.
- **Authentication:** Agnic OAuth 2.0 (full flow via edge functions).
- **AI Gateway:** Agnic API Gateway (routing multiple underlying models like OpenAI and Anthropic based on per-function ENV variable overrides).
- **Voice:** Gladia API for real-time Speech-to-Text via WebSockets.
- **Email:** Resend API for delivering the 6-dimension post-mortem report.
- **Deployment:** Vercel (Frontend) and Supabase (Backend).

## Supabase Edge Functions
RoleBridge relies on a deep backend architecture consisting of 21 specialized Edge Functions:

- `v2-auth-callback`: Exchanges the Agnic OAuth code for a session token.
- `v2-auth-me`: Retrieves the current user's profile and session validity.
- `v2-auth-logout`: Invalidates the user's active session.
- `v2-balance`: Fetches the real-time Agnic wallet balance to drive UI state.
- `v2-profile`: Manages user profile data (e.g. saved resumes).
- `v2-sessions`: Initializes a new interview session record in PostgreSQL.
- `v2-session-setup`: (LLM Call) Extracts resume sections and generates the core interview questions.
- `v2-session-get`: Rehydrates the active session state for the frontend.
- `v2-session-answers`: (LLM Call) The core loop—evaluates the user's answer in real-time and triggers dynamic follow-ups.
- `v2-session-end`: Marks the session as completed and triggers the report worker.
- `v2-report`: Fetches the final evaluation report for on-screen display.
- `v2-report-worker`: (LLM Call) Asynchronously generates the 6-dimension report and emails it via Resend.
- `v2-stt-session`: Generates an authenticated Gladia WebSocket URL for real-time voice input.
- *(Note: `session-*`, `stt-*`, and `report-worker` are legacy V1 functions preserved for backward compatibility).*

## What's Working / What's Not / What's Next
- **What's Working:** The core interview loop is rock solid. The AI successfully parses resumes, generates highly targeted questions, enforces the 402 paywall, and delivers a robust email report using the Resend API.
- **What's Not:** Voice input via Gladia can occasionally drop if the user speaks for too long (over 3 minutes) without an intermediate WebSocket ping, causing the fallback text mode to trigger abruptly.
- **What's Next:** We plan to integrate deeper career coaching analytics to track candidate improvement over multiple sessions, and expand our LLM dynamic routing to utilize localized models for even lower latency.

## Setup & Environment Variables
For local development, copy the existing `.env.example` file in the root directory to `.env.local` and fill in the required values. Supabase edge functions will automatically pick up secrets from this file when running locally via `supabase functions serve`. 
*(Note: Production secrets are managed via the Supabase Vault. Ensure `AGNIC_PARTNER_ID` is set to receive token commissions!)*

## Live Demo & Repository
- **Live Demo:** https://agnic-rolebridge.vercel.app/
- **Repository:** https://github.com/reagleai/agnic-rolebridge
