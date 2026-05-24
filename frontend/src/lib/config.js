/**
 * RoleBridge Frontend — Configuration constants.
 * frontend/src/lib/config.js
 *
 * Single source of truth for all hardcoded constants in the frontend.
 * Import from this file — do NOT re-hardcode values in components or hooks.
 *
 * Note: Runtime environment variables (Supabase URL, anon key, Agnic client ID)
 * stay in frontend/.env as VITE_* vars and are NOT moved here.
 */

// ─────────────────────────────────────────────
// API Client (api.js)
// ─────────────────────────────────────────────

/** Default timeout in ms for all V2 Edge Function requests. */
export const V2_REQUEST_DEFAULT_TIMEOUT_MS = 45_000;

/**
 * Timeout in ms for session setup requests.
 * Longer because setup involves two sequential LLM calls.
 */
export const SETUP_TIMEOUT_MS = 60_000;

/** Maximum number of automatic retries for 5xx server errors. */
export const API_MAX_RETRIES = 2;

/** Base delay in ms between retry attempts (multiplied by attempt index). */
export const API_RETRY_DELAY_MS = 1500;

// ─────────────────────────────────────────────
// PDF Extraction (pdfExtractor.js)
// ─────────────────────────────────────────────

/** Maximum file size in bytes for uploaded PDF resumes (5 MB). */
export const MAX_PDF_SIZE = 5 * 1024 * 1024;

/**
 * Minimum number of characters extracted from a PDF for it to be
 * considered valid (guards against image-only PDFs).
 */
export const MIN_PDF_TEXT_LEN = 200;

// ─────────────────────────────────────────────
// Gladia WebSocket Recording (useGladiaRecording.js)
// ─────────────────────────────────────────────

/** Interval in ms at which heartbeat messages are sent over the relay WebSocket. */
export const GLADIA_HEARTBEAT_MS = 15000;

/**
 * How long in ms to wait after sending the stop signal for a final
 * transcript message before forcibly tearing down the session.
 */
export const GLADIA_FINAL_WAIT_MS = 2000;
