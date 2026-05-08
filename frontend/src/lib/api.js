/**
 * RoleBridge API client.
 * Block A - frontend/src/lib/api.js
 *
 * All backend calls route through Supabase Edge Functions.
 * Base URL and anon key are read from Vite build-time env vars.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

const BASE_URL = `${SUPABASE_URL}/functions/v1`;

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
  const data = await res.json();

  if (!res.ok) {
    const err = new Error(data.error || `request_failed_${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

// ── Endpoint wrappers ──

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
