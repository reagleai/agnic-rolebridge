/**
 * RoleBridge API client.
 * Block A → Updated for V2 (Block 1)
 *
 * V1 endpoints are preserved for backward compatibility.
 * V2 endpoints use the rb_session_token (stored in localStorage)
 * sent via the x-rb-session header instead of the Supabase anon key.
 */

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

import {
  V2_REQUEST_DEFAULT_TIMEOUT_MS,
  SETUP_TIMEOUT_MS,
  API_MAX_RETRIES,
  API_RETRY_DELAY_MS,
} from './config.js';

const BASE_URL = `${SUPABASE_URL}/functions/v1`;

// ── V1 request helper (unchanged) ──

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    "Content-Type": "application/json",
    ...(SUPABASE_ANON_KEY && {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    }),
    ...options.headers,
  };

  const res = await fetch(url, { ...options, headers });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = {};
  }

  if (!res.ok) {
    const err = new Error(data.error || `request_failed_${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

// ── V2 request helper ──
// Uses rb_session_token from localStorage for auth via x-rb-session header.
// Still sends the Supabase anon key in Authorization (required by Supabase
// Edge Functions for routing) but the actual auth is via x-rb-session.

async function withRetry(fn, maxRetries = API_MAX_RETRIES, delayMs = API_RETRY_DELAY_MS) {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === maxRetries || err.status < 500) throw err;
      await new Promise(r => setTimeout(r, delayMs * (i + 1)));
    }
  }
}

async function v2request(path, options = {}, timeoutMs = V2_REQUEST_DEFAULT_TIMEOUT_MS) {
  const url = `${BASE_URL}${path}`;
  const rbToken = localStorage.getItem("rb_session_token") || "";

  const headers = {
    "Content-Type": "application/json",
    ...(SUPABASE_ANON_KEY && {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    }),
    ...(rbToken && { "x-rb-session": rbToken }),
    ...options.headers,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...options, headers, signal: controller.signal });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    if (!res.ok) {
      const err = new Error(data.error || data.message || `request_failed_${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  } catch (err) {
    if (err.name === 'AbortError') {
      const timeoutErr = new Error('request_timeout');
      timeoutErr.status = 504;
      timeoutErr.data = { error: 'request_timeout', message: 'The server took too long to respond. Please try again.' };
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ══════════════════════════════════════════════════
// V1 Endpoint wrappers (preserved for V1 compat)
// ══════════════════════════════════════════════════

/** POST /sessions - create a new session */
export function createSession(email) {
  return request("/sessions", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

/** POST /sessions/:id/setup - store resume/JD, generate questions */
export function setupSession(id, { resume_text, jd_text, section_name }) {
  return request(`/session-setup/${id}`, {
    method: "POST",
    body: JSON.stringify({ resume_text, jd_text, section_name }),
  });
}

/** GET /sessions/:id - rehydrate session state */
export function getSession(id) {
  return request(`/session-get/${id}`, { method: "GET" });
}

/** GET /sessions/:id/stt-session - get Gladia WebSocket URL */
export function getSttSession(id) {
  return request(`/stt-session/${id}`, { method: "GET" });
}

/** POST /sessions/:id/answers - submit answer, get next action */
export function submitAnswer(id, payload) {
  return request(`/session-answers/${id}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** POST /sessions/:id/end - end session, queue report */
export function endSession(id) {
  return request(`/session-end/${id}`, { method: "POST" });
}

// ══════════════════════════════════════════════════
// V2 Endpoint wrappers - Auth
// ══════════════════════════════════════════════════

/** POST /v2-auth-callback - exchange OAuth code for RoleBridge session */
export function exchangeAuthCode(code, redirect_uri, mode = "signin", email = "") {
  return v2request("/v2-auth-callback", {
    method: "POST",
    body: JSON.stringify({ code, redirect_uri, mode, email }),
  });
}

/** GET /v2-auth-me - get current user info + balance */
export function getAuthMe() {
  return v2request("/v2-auth-me", { method: "GET" });
}

/** POST /v2-auth-logout - invalidate session */
export function authLogout() {
  return v2request("/v2-auth-logout", { method: "POST" });
}

// ══════════════════════════════════════════════════
// V2 Endpoint wrappers - Balance
// ══════════════════════════════════════════════════

/** GET /v2-balance - get current Agnic wallet balance */
export function getBalance() {
  return v2request("/v2-balance", { method: "GET" });
}

// ══════════════════════════════════════════════════
// V2 Endpoint wrappers - Sessions (to be wired in Block 2)
// ══════════════════════════════════════════════════

/** POST /v2-sessions - create a new V2 session */
export function v2CreateSession() {
  return v2request("/v2-sessions", { method: "POST" });
}

/** POST /v2-session-setup/:id - setup session with resume/JD */
export function v2SetupSession(id, payload) {
  return withRetry(() => v2request(`/v2-session-setup/${id}`, {
    method: "POST",
    body: JSON.stringify(payload),
  }, SETUP_TIMEOUT_MS)); // give setup more time for LLM calls
}

/** GET /v2-session-get/:id - rehydrate V2 session state */
export function v2GetSession(id) {
  return v2request(`/v2-session-get/${id}`, { method: "GET" });
}

/** POST /v2-session-answers/:id - submit answer (to be wired in Block 3) */
export function v2SubmitAnswer(id, payload) {
  return withRetry(() => v2request(`/v2-session-answers/${id}`, {
    method: "POST",
    body: JSON.stringify(payload),
  }));
}

/** POST /v2-session-end/:id - end session, queue report */
export function v2EndSession(id) {
  return v2request(`/v2-session-end/${id}`, { method: "POST" });
}

/** GET /v2-report/:sessionId - get report by session ID */
export function v2GetReport(sessionId) {
  return v2request(`/v2-report/${sessionId}`, { method: "GET" });
}

/** POST /v2-report-worker - retry report generation for a session */
export function v2RetryReport(sessionId) {
  return v2request("/v2-report-worker", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId }),
  });
}

// ══════════════════════════════════════════════════
// V2 Endpoint wrappers - STT
// ══════════════════════════════════════════════════

/** GET /v2-stt-session/:id - get Gladia WebSocket URL (authenticated) */
export function v2SttSession(id) {
  return v2request(`/v2-stt-session/${id}`, { method: "GET" });
}

// ══════════════════════════════════════════════════
// V2 Endpoint wrappers - Profile
// ══════════════════════════════════════════════════

/** GET /v2-profile - get user profile */
export function v2GetProfile() {
  return v2request("/v2-profile", { method: "GET" });
}

/** PUT /v2-profile - save user profile */
export function v2SaveProfile(profileData) {
  return v2request("/v2-profile", {
    method: "PUT",
    body: JSON.stringify(profileData),
  });
}

/** DELETE /v2-profile - clear user profile */
export function v2DeleteProfile() {
  return v2request("/v2-profile", { method: "DELETE" });
}
