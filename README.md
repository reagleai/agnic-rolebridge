# RoleBridge V2
Interview Pressure-Test · Powered by AI

## Overview
RoleBridge V2 is an AI-powered interview simulation platform designed for career-transition candidates. It takes your real resume and target job description, generating smart follow-up questions to simulate the pressure of a real interview and providing comprehensive, multi-dimensional feedback.

## Problem
Candidates, particularly career changers, often have resumes strong enough to pass the initial screening. However, the real failure mode happens during the interview when the interviewer starts probing-asking for specific details, testing ownership, and pushing for concrete evidence. Under this pressure, answers can easily become vague, relying on old functional language rather than speaking like the targeted role.

## Solution
RoleBridge V2 bridges this gap by directly testing how well your story holds up under scrutiny. It grounds its interview simulations in your actual work experience and the specific job you're targeting. During the simulation, when your answers lack depth or clarity, the AI dynamically pushes back with targeted follow-up questions, acting just like a real hiring manager.

## Value Proposition
- **User Benefit**: Helps candidates develop sharper articulation of their real past experience and stronger translation of that work into the target role's language.
- **Product Benefit**: Provides concrete awareness of weak answers *before* the real interview, replacing generic coaching with an actionable, personalized pressure test.
- **Operational Benefit**: Flexible and asynchronous. Use Agnic wallet credits to practice at your own pace, with a robust feedback loop in minutes.

## Key Features
- **Grounded Context**: Dynamic questions generated directly from your resume (via PDF or text) and a target job description.
- **Selective Focus**: Choose to dive deep into Work Experience, Projects, Skills, or the Full Resume.
- **Adjustable Depth**: Configure the simulation to ask between 6 and 15 core questions.
- **Adaptive Follow-Up Pressure**: The AI intelligently detects vague answers and probes further to extract specific evidence and test ownership.
- **Comprehensive Evaluation**: Receive a 6-dimension evaluation report (with scores, evidence flags, and actionable improvements) on-screen and via email.
- **Voice & Text Input**: Answer questions naturally using voice (Speech-to-Text) or text.

## How It Works
1. **Setup**: Sign in securely with Agnic.
2. **Context**: Upload your resume (or import from your profile) and paste your target job description.
3. **Customize**: Select a specific resume section to focus on and choose the number of questions.
4. **Interview**: Engage in the session. Answer the AI's core questions. If your answer is vague, expect a challenging follow-up question.
5. **Report**: Upon completion, a detailed multi-dimensional evaluation report is generated, displayed on-screen, and emailed directly to you.

## Tech Stack
### Frontend
- **Framework**: React 19 / Vite SPA
- **Routing**: React Router DOM
- **Styling**: Vanilla CSS (designed for a rich, modern, responsive UI)
- **Utilities**: `pdfjs-dist` for client-side PDF text extraction

### Backend & Infrastructure
- **Backend**: Supabase (PostgreSQL, Edge Functions via Deno)
- **Authentication & Wallet**: Agnic (OAuth 2.0, user profiles, and wallet credits)
- **AI Gateway**: Agnic API Gateway (routing to models like Google Gemini)
- **Emails**: Resend API (for report delivery)
- **Voice**: Gladia API (for live Speech-to-Text)

## Project Structure
- `frontend/`: The Vite React frontend application containing components, hooks, and views.
- `supabase/`: Backend infrastructure.
  - `functions/`: Deno edge functions for auth, sessions, LLM interactions, and report generation.
  - `migrations/`: PostgreSQL schema definitions and RLS policies.
- `vercel.json`: Configuration for deployment.

## Setup and Installation
To run RoleBridge V2 locally:

### 1. Backend (Supabase)
Ensure you have the Supabase CLI installed and Docker running.
```bash
# Start the local Supabase instance
supabase start

# Serve edge functions locally
supabase functions serve
```

### 2. Frontend
Open a new terminal window.
```bash
cd frontend

# Install dependencies
npm install

# Start the development server
npm run dev
```

## Environment Variables
Create a `.env` file in the `frontend` directory based on the following placeholders:

```env
# Frontend (Vite build-time)
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Agnic OAuth (Register OAuth client at app.agnic.ai)
VITE_AGNIC_CLIENT_ID=your_agnic_client_id
```
*(Note: Supabase edge functions manage their own secrets (e.g., Agnic tokens, Resend API keys, Gladia API keys) via the Supabase secrets manager.)*

## Usage
1. Launch the app and click **Get Started Free** to authenticate via Agnic.
2. Provide your resume (upload PDF, paste text, or load from profile).
3. Paste a target Job Description.
4. Adjust the sliders (section focus, question count) and start the interview.
5. Respond to questions via text or voice.
6. Review the generated feedback report to improve your interview performance.

## Example Use Cases / Impact
- **Career Transitioners**: A teacher transitioning to product management can test if they are relying too heavily on education jargon rather than product leadership terminology.
- **Senior Roles**: Candidates for Staff/Principal engineering roles can practice defending their architectural decisions under pressure, ensuring they demonstrate true ownership.
- **General Interview Prep**: Anyone can use the platform to identify "fluff" in their answers before the stakes are high, ensuring concrete, evidence-based storytelling.

## Screens / Demo Notes
*(Placeholder: Add screenshots or a quick GIF demonstrating the setup process, the interview interface with dynamic follow-ups, and the final multi-dimensional report.)*
