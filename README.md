# RoleBridge
Interview Pressure-Test · Powered by AI

## Product Overview
RoleBridge is an interview practice tool that prepares you for high-stakes career changes. Instead of asking generic questions, it uses your actual resume to find the gaps in your story. When you give a weak or vague answer, RoleBridge pushes back immediately, helping you fix your mistakes in practice so you don't lose the job in the real interview.

## Value Proposition
For professionals transitioning between domains or industries, RoleBridge has developed an AI-powered interview prep platform, which results in the ability to translate adjacent experience under pressure, successfully handle tough follow-up questions, and walk into the real interview with confidence. *(Note: Adapted from the exact framing praised by Angelo Casanas).*

## The Problem & Target Customer
- **The Audience:** Professionals switching between different roles, functions, or industries.
- **The Core Problem:** They can position themselves well enough on paper to get shortlisted, but break down when interviewers probe deeper.
- **The Consequence:** Under the pressure of follow-up questions, their answers become vague, inconsistent, or disconnected from the target role's expectations—causing the interviewer to pass.

## How It Works
1. **Upload Your Profile:** Upload your resume and paste your target job description. The AI instantly identifies the gap between where you are and where you want to be.
2. **The Pressure Test:** Answer dynamically generated questions via voice or text. If your answer is weak, the AI won't let it slide—it pushes back with a targeted follow-up.
3. **Pay-as-you-go:** High-intensity practice uses your Agnic wallet credits. If your wallet depletes mid-session, a paywall halts the interview at the exact moment you realize you need the practice the most.
4. **Your Final Report:** Receive a brutally honest 6-dimension score report (Clarity, Evidence, Ownership, Role-Language, Relevance, Coherence) on-screen and via email.

## Competitive Positioning
*Following Angelo's guidance: "Saying we have no competition hurts credibility."*
- **Direct Competitors (e.g., Big Interview):** Scripted, static, and lacking real-time, adaptive pushback.
- **Indirect Competitors (e.g., ChatGPT):** Requires complex prompting, lacks structured scoring, and doesn't enforce the pressure of a real interview.
- **Our Position:** RoleBridge sits in a unique quadrant—highly adaptive and role-specific. The defensibility lies in our strict evaluation logic and dynamic follow-up chain.

## Market Size & Go-to-Market Strategy
- **Market Size (TAM/SAM):** Career coaching is a $15B+ global industry, and LinkedIn reports 150M+ job transitions annually. The market is massive, and the demand for high-stakes interview prep carries a very high willingness-to-pay.
- **Go-to-Market (GTM):** We will initially target high-intent niche communities (e.g., bootcamp graduates, outplacement programs). The free tier serves as lead generation, smoothly transitioning users to our credit-based paywall exactly when they need deeper sparring.

## The Team
Built by a founder uniquely positioned with experience in AI systems, product operations, and thousands of LLM evaluations. This provides the critical domain knowledge required to build robust AI evaluation pipelines while intimately understanding the exact moment a candidate's narrative breaks down.

## Monetization Model
- **Agnic OAuth & Wallet:** Users sign in with their Agnic account. Their Agnic wallet funds every API call they make on the platform.
- **Earn-Per-Generate:** Every AI call routed through the Agnic API Gateway includes our `AGNIC_PARTNER_ID`, earning us a commission margin on every token processed.
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
- **Live Demo:** [https://agnic-rolebridge.vercel.app/](https://agnic-rolebridge.vercel.app/)
- **Repository:** [https://github.com/reagleai/agnic-rolebridge](https://github.com/reagleai/agnic-rolebridge)
