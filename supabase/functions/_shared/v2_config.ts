/**
 * V2 Configuration - Single source of truth for all configurable constants.
 * _shared/v2_config.ts
 *
 * Every hardcoded value that a developer might want to change without
 * touching core logic lives here. Import from this file - do NOT
 * re-hardcode in individual function files.
 *
 * Sections:
 *   1. LLM - model, gateway, retry
 *   2. Inference parameters
 *   3. Agnic API endpoints
 *   4. Auth / OAuth
 *   5. Session rules
 *   6. Input validation limits
 *   7. Context truncation limits
 *   8. Report generation
 *   9. Email delivery
 *  10. STT / Recording
 *  11. Profile field limits
 */

// ─────────────────────────────────────────────
// 1. LLM - Model & Gateway
// ─────────────────────────────────────────────

/** Default models used for tasks when no env-var override is set. */
export const DEFAULT_MODELS: Record<string, string> = {
  section_extraction: "openai/gpt-4o",
  question_generation: "anthropic/claude-sonnet-4.6",
  answer_evaluation: "anthropic/claude-sonnet-4.6",
  report_generation: "anthropic/claude-opus-4.7",
};

/** Agnic AI Gateway - OpenAI-compatible chat completions endpoint. */
export const AGNIC_GATEWAY_URL = "https://api.agnic.ai/v1/chat/completions";

/** Maximum number of automatic retries for LLM calls (rate-limit + JSON parse). */
export const LLM_MAX_RETRIES = 1;

/** Delay in ms before retrying after a 429 rate-limit response. */
export const LLM_RETRY_DELAY_MS = 4000;

// ─────────────────────────────────────────────
// 2. Inference Parameters
// ─────────────────────────────────────────────

/** Temperature for task calls (section extraction, question gen, answer eval). */
export const TEMPERATURE_TASK = 0.3;

/** Temperature for report generation (slightly more creative). */
export const TEMPERATURE_REPORT = 0.4;

/** Max output tokens for task calls. */
export const MAX_TOKENS_TASK = 2048;

/** Max output tokens for report generation. */
export const MAX_TOKENS_REPORT = 3000;

/** Max output tokens when generating more than 10 questions (larger output needed). */
export const MAX_TOKENS_EXTENDED = 4096;

/** Question count threshold above which EXTENDED token limit is used. */
export const EXTENDED_TOKEN_QUESTION_THRESHOLD = 10;

/** Max output tokens explicitly requested for report worker (overrides MAX_TOKENS_REPORT). */
export const REPORT_WORKER_MAX_TOKENS = 4096;

/** Request timeout in ms for standard LLM task calls. */
export const TIMEOUT_TASK_MS = 60_000;

/** Request timeout in ms for report generation (longer output needs more time). */
export const TIMEOUT_REPORT_MS = 90_000;

// ─────────────────────────────────────────────
// 3. Agnic API Endpoints
// ─────────────────────────────────────────────

/** Agnic OAuth token endpoint (authorization code exchange + refresh). */
export const AGNIC_TOKEN_ENDPOINT = "https://api.agnic.ai/oauth/token";

/** Agnic /api/me endpoint - returns user info from the access token. */
export const AGNIC_ME_ENDPOINT = "https://api.agnic.ai/api/me";

/** Agnic OpenID Connect userinfo endpoint. */
export const AGNIC_USERINFO_ENDPOINT = "https://api.agnic.ai/userinfo";

/** Agnic wallet balance endpoint. */
export const AGNIC_BALANCE_ENDPOINT = "https://api.agnic.ai/api/balance";

// ─────────────────────────────────────────────
// 4. Auth / OAuth
// ─────────────────────────────────────────────

/**
 * How many ms before token expiry we proactively refresh.
 * (5 minutes expressed in ms.)
 */
export const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

/** Timeout in ms for the Agnic token refresh/exchange HTTP call. */
export const TOKEN_REFRESH_TIMEOUT_MS = 10_000;

/**
 * Timeout in ms for the initial auth code exchange in v2-auth-callback.
 * Longer than refresh because it's a first-time round-trip to Agnic.
 */
export const AUTH_CODE_EXCHANGE_TIMEOUT_MS = 15_000;

/** Timeout in ms for Agnic /api/me and /userinfo fetches during auth callback. */
export const AUTH_USERINFO_TIMEOUT_MS = 10_000;

/** Timeout in ms for the balance fetch inside v2-auth-me (best-effort). */
export const AUTH_ME_BALANCE_TIMEOUT_MS = 5_000;

/** Timeout in ms for the Agnic balance proxy in v2-balance. */
export const BALANCE_FETCH_TIMEOUT_MS = 10_000;

// ─────────────────────────────────────────────
// 5. Session Rules
// ─────────────────────────────────────────────

/** Maximum number of sessions allowed per user account. */
export const SESSION_LIMIT = 50;

/** Minimum number of interview questions that can be requested. */
export const MIN_QUESTION_COUNT = 6;

/** Maximum number of interview questions that can be requested. */
export const MAX_QUESTION_COUNT = 15;

/** Default question count when the request field is missing or invalid. */
export const DEFAULT_QUESTION_COUNT = 6;

/** Minimum session duration in seconds (regardless of question count). */
export const MIN_SESSION_DURATION_SECS = 6 * 300;

/** Maximum session duration in seconds (cap to prevent runaway sessions). */
export const MAX_SESSION_DURATION_SECS = 15 * 300;

/** Estimated seconds per question, used to calculate session duration. */
export const SECS_PER_QUESTION = 300;

/**
 * Multiplier used to compute the absolute answer cap.
 * absolute_cap = core_questions.length × ABSOLUTE_CAP_MULTIPLIER
 */
export const ABSOLUTE_CAP_MULTIPLIER = 2;

/**
 * Maximum followup depth per core question.
 * (1 = at most one followup question before moving to the next core question.)
 */
export const MAX_FOLLOWUP_DEPTH = 1;

/** Number of most recent transcript turns to include in the answer-eval context. */
export const RECENT_TRANSCRIPT_TURNS = 8;

// ─────────────────────────────────────────────
// 6. Input Validation Limits
// ─────────────────────────────────────────────

/** Minimum character length for a submitted resume text. */
export const MIN_RESUME_LEN = 50;

/** Minimum character length for a submitted job description text. */
export const MIN_JD_LEN = 50;

/** Minimum character length for a submitted answer. */
export const ANSWER_MIN_LEN = 3;

/** Maximum duration in seconds allowed for a single answer recording. */
export const MAX_ANSWER_DURATION_SECS = 180;

/**
 * Minimum length of extracted section text to be considered "found".
 * If the extraction returns fewer chars (or "NOTFOUND"), we surface an error.
 */
export const SECTION_NOT_FOUND_MIN_LEN = 20;

// ─────────────────────────────────────────────
// 7. Context Truncation Limits
// ─────────────────────────────────────────────

/** Max chars of section_text sent to the answer evaluation LLM. */
export const SECTION_TEXT_MAX_CHARS = 2500;

/** Max chars of jd_text sent to the answer evaluation LLM. */
export const JD_TEXT_MAX_CHARS = 1000;

/** Max chars of jd_text sent to the report generation LLM. */
export const REPORT_JD_MAX_CHARS = 1000;

/** Max chars of section_text sent to the report generation LLM. */
export const REPORT_SECTION_TEXT_MAX_CHARS = 2000;

// ─────────────────────────────────────────────
// 8. Report Generation
// ─────────────────────────────────────────────

/** Minimum number of questions returned by the LLM for the setup to succeed. */
export const MIN_QUESTIONS_RETURNED = 4;

// ─────────────────────────────────────────────
// 9. Email Delivery (Resend)
// ─────────────────────────────────────────────

/** Timeout in ms for the Resend email API call. */
export const EMAIL_TIMEOUT_MS = 15_000;

/**
 * Default "from" address used when RESEND_FROM_EMAIL env var is not set.
 * Override via the RESEND_FROM_EMAIL environment variable in production.
 */
export const RESEND_FROM_EMAIL_DEFAULT = "RoleBridge <reports@protonaiagents.com>";

// ─────────────────────────────────────────────
// 10. STT / Recording
// ─────────────────────────────────────────────

/**
 * Default maximum recording duration in ms, used when the
 * MAX_RECORDING_DURATION_MS env var is not set.
 */
export const MAX_RECORDING_DURATION_MS_DEFAULT = 600_000;

/** Timeout in ms for the initial Gladia live session creation HTTP call. */
export const GLADIA_SESSION_TIMEOUT_MS = 10_000;

// ─────────────────────────────────────────────
// 11. Profile Field Limits
// ─────────────────────────────────────────────

/** Maximum character length for the resume_text profile field. */
export const MAX_PROFILE_RESUME_LEN = 50_000;

/** Maximum character length for the transition_notes profile field. */
export const MAX_PROFILE_NOTES_LEN = 5_000;

/** Default maximum character length for all other profile string fields. */
export const MAX_PROFILE_FIELD_LEN = 500;
