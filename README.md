# RoleBridge
Interview Pressure-Test · Powered by AI

## Product Overview
RoleBridge is a highly adaptive, role-specific interview simulation platform. It is specifically designed for mid-career professionals transitioning between different roles, functions, or industries. Rather than relying on generic question banks, RoleBridge utilizes the candidate's actual resume and target job description to pinpoint narrative gaps, applying intelligent follow-up pressure exactly where candidates tend to break down in real interviews.

## The Problem & Target Customer
- **The Audience:** Mid-career professionals switching between different roles, functions, or industries.
- **The Core Problem:** Most professionals switching roles between different roles, functions or industries can position themselves well enough on paper to get shortlisted, but break down when interviewers probe deeper - answers become vague, inconsistent, or disconnected from the target role's expectations and candidate loses credibility, confidence as well as the role itself.
- **The Consequence:** Under the pressure of follow-up questions, they revert to old functional language, fail to demonstrate concrete ownership, and ultimately lose the offer due to a weak, disconnected storyline.

## Value Proposition
RoleBridge provides an environment where candidates can safely hit their breaking point. By rigorously pressure-testing answers against the target job description and pushing back on vague claims in real-time, the platform forces candidates to clarify their evidence, translate their adjacent experience under pressure, and walk into the real interview with tested confidence.

## How It Works (Core User Flow)
1. **Upload Your Profile:** Connect via Agnic OAuth. Upload your resume (PDF, paste, or import from profile) and paste your target job description. The AI instantly identifies the gap between your current background and target role.
2. **Setup Session:** Select the specific resume section you want to focus on (e.g., Work Experience, Projects) and choose the intensity (6-15 questions).
3. **The Pressure Test:** Engage in the interview via real-time voice or text. If your answer is weak or lacks evidence, the AI won't let it slide—it pushes back dynamically with targeted follow-up questions, just like a tough hiring manager.
4. **Pay-as-you-go:** Practice comfortably knowing you only pay for exactly what you use via your Agnic wallet. If your credits run out, the interview safely pauses—ensuring you're always in control of your spending without any surprise charges.
5. **Your Final Report:** Upon completion, receive a brutally honest 6-dimension score report (Clarity, Evidence, Ownership, Role-Language, Relevance, Coherence) both on-screen and via email.

## The Team
Built by a solo product builder and founder uniquely positioned to leverage AI systems and evaluation pipelines to solve real career transition challenges.

## Monetization Model
- **Agnic OAuth & Wallet:** Users authenticate via Agnic. Their Agnic wallet funds every API call made during the session.
- **Earn-Per-Generate:** Every AI call routed through the Agnic API Gateway includes our `AGNIC_PARTNER_ID`, earning a commission margin on processed tokens.
- **The 402 Paywall:** When credits run out, a 402 error is surfaced natively in the UI. Hitting a credit wall mid-session represents the highest-intent moment for monetization.
- **Unit Economics:** The base model cost is optimized (e.g., using `gpt-4o-mini` and `claude-sonnet-4.6`), allowing users to be charged $0.50–$1.00 per high-intensity session with gross margins exceeding 90%.

## Technical Stack
- **Frontend:** React 19 / Vite SPA, React Router DOM, vanilla CSS, `pdfjs-dist` (client-side PDF parsing).
- **Backend Infrastructure:** Supabase Edge Functions (Deno runtime) handling 20+ specialized microservices.
- **Database:** Supabase PostgreSQL with RLS policies, persisting sessions, transcripts, eval scores, and question states.
- **Authentication:** Agnic OAuth 2.0.
- **AI Gateway:** Agnic API Gateway for dynamic model routing.
- **Voice:** Gladia API for real-time Speech-to-Text via WebSockets.
- **Email:** Resend API for delivering the post-mortem report.
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

*(Note: `session-*`, `stt-*`, and `report-worker` are legacy V1 functions preserved for backward compatibility).*

## Setup & Environment Variables
For local development, copy the existing `.env.example` file in the root directory to `.env.local` and fill in the required values. Supabase edge functions will automatically pick up secrets from this file when running locally via `supabase functions serve`. 
*(Note: Production secrets are managed via the Supabase Vault. Ensure `AGNIC_PARTNER_ID` is set to receive token commissions!)*

## Live Demo & Repository
- **Live Demo:** [https://agnic-rolebridge.vercel.app/](https://agnic-rolebridge.vercel.app/)
- **Repository:** [https://github.com/reagleai/agnic-rolebridge](https://github.com/reagleai/agnic-rolebridge)
