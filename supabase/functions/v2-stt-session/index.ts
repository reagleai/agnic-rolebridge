/**
 * GET /v2-stt-session/:id - Initialize Gladia live STT session for V2.
 * Block 7 - supabase/functions/v2-stt-session/index.ts
 *
 * Same as V1 stt-session but with rb_session_token authentication
 * and session ownership verification.
 *
 * Returns:
 * {
 *   ws_url: string,            // Direct Gladia WebSocket URL
 *   relay_ws_url: string,      // Backend relay WebSocket URL
 *   recording_session_id: string,
 *   gladia_session_id: string,
 *   max_recording_duration_ms: number
 * }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/db.ts";
import { extractSessionId } from "../_shared/validation.ts";
import { authenticateRequest, authErrorResponse } from "../_shared/v2_auth.ts";
import { MAX_RECORDING_DURATION_MS_DEFAULT, GLADIA_SESSION_TIMEOUT_MS } from "../_shared/v2_config.ts";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getMaxRecordingMs(): number {
  const parsed = Number.parseInt(Deno.env.get("MAX_RECORDING_DURATION_MS") || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : MAX_RECORDING_DURATION_MS_DEFAULT;
}

function getRelayWsUrl(reqUrl: string, recordingSessionId: string): string {
  const url = new URL(reqUrl);
  // Supabase Edge Functions receive http: internally even when public URL is https:.
  // Always use wss: for production hosts to avoid mixed-content blocking.
  const isSecureHost = url.host.includes("supabase.co") || url.host.includes("supabase.in") || url.protocol === "https:";
  const wsProtocol = isSecureHost ? "wss:" : "ws:";
  // V2 reuses V1 stt-relay (it doesn't need auth, just recording_session_id)
  return `${wsProtocol}//${url.host}/functions/v1/stt-relay/${recordingSessionId}`;
}

serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  if (req.method !== "GET") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  try {
    // ── Authenticate ──
    let userId: string;
    try {
      const auth = await authenticateRequest(req);
      userId = auth.user.id;
    } catch (err: unknown) {
      if (err && typeof err === "object" && "status" in err) {
        return authErrorResponse(
          err as { status: number; error: string; message: string },
          corsHeaders,
        );
      }
      throw err;
    }

    // ── Extract session ID ──
    let sessionId: string;
    try {
      sessionId = extractSessionId(req.url);
    } catch (e: unknown) {
      const err = e as { status?: number; error?: string };
      return jsonResponse(
        { error: err.error || "session_not_found" },
        err.status || 404,
      );
    }

    const db = getSupabaseClient();

    // ── Fetch and guard session ──
    const { data: session, error: fetchError } = await db
      .from("sessions")
      .select("id, status, expires_at, v2_user_id")
      .eq("id", sessionId)
      .single();

    if (fetchError || !session) {
      return jsonResponse({ error: "session_not_found" }, 404);
    }

    // ── Verify ownership ──
    if (session.v2_user_id !== userId) {
      return jsonResponse({ error: "session_forbidden" }, 403);
    }

    if (session.status !== "active") {
      return jsonResponse({ error: "session_not_active" }, 409);
    }
    if (new Date(session.expires_at) <= new Date()) {
      return jsonResponse({ error: "session_expired" }, 410);
    }

    // ── Call Gladia to create a live session ──
    const gladiaKey = Deno.env.get("GLADIA_API_KEY");
    if (!gladiaKey) {
      console.error("[v2-stt-session] Missing GLADIA_API_KEY");
      return jsonResponse({
        error: "gladia_session_failed",
        message: "STT service not configured",
        fallback_input_type: "text",
        voice_available: false,
      }, 502);
    }

    let gladiaRes: Response;
    try {
      gladiaRes = await fetch("https://api.gladia.io/v2/live", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-gladia-key": gladiaKey,
        },
        body: JSON.stringify({
          encoding: "wav/pcm",
          sample_rate: 16000,
          bit_depth: 16,
          channels: 1,
          language_config: {
            languages: ["en"],
            code_switching: false,
          },
          messages_config: {
            receive_partial_transcripts: true,
          },
        }),
        signal: AbortSignal.timeout(GLADIA_SESSION_TIMEOUT_MS),
      });
    } catch (err) {
      console.error("[v2-stt-session] Gladia network error:", err);
      return jsonResponse({
        error: "gladia_session_failed",
        message: "Failed to reach STT service",
        fallback_input_type: "text",
        voice_available: false,
      }, 502);
    }

    if (!gladiaRes.ok) {
      const errBody = await gladiaRes.text().catch(() => "unknown");
      console.error("[v2-stt-session] Gladia API error:", gladiaRes.status, errBody);
      return jsonResponse({
        error: "gladia_session_failed",
        message: `STT service returned ${gladiaRes.status}`,
        fallback_input_type: "text",
        voice_available: false,
      }, 502);
    }

    const gladiaData = await gladiaRes.json();
    const wsUrl = gladiaData.url || gladiaData.ws_url;
    const gladiaSessionId = gladiaData.id || gladiaData.session_id;

    if (!wsUrl) {
      console.error("[v2-stt-session] Gladia response missing ws_url:", gladiaData);
      return jsonResponse({
        error: "gladia_session_failed",
        message: "Invalid STT response",
        fallback_input_type: "text",
        voice_available: false,
      }, 502);
    }

    const maxRecordingMs = getMaxRecordingMs();

    // ── Create recording_sessions row (reuse V1 table) ──
    const { data: recordingSession, error: recordingInsertError } = await db
      .from("recording_sessions")
      .insert({
        session_id: sessionId,
        gladia_session_id: gladiaSessionId || "",
        gladia_ws_url: wsUrl,
        status: "created",
        max_duration_ms: maxRecordingMs,
        last_heartbeat_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (recordingInsertError || !recordingSession) {
      console.error("[v2-stt-session] Recording session insert failed:", recordingInsertError);
      // Fallback: return direct Gladia URL without relay
      return jsonResponse({
        ws_url: wsUrl,
        relay_ws_url: "",
        recording_session_id: "",
        gladia_session_id: gladiaSessionId || "",
        max_recording_duration_ms: maxRecordingMs,
      }, 200);
    }

    return jsonResponse({
      ws_url: wsUrl,
      relay_ws_url: getRelayWsUrl(req.url, recordingSession.id),
      recording_session_id: recordingSession.id,
      gladia_session_id: gladiaSessionId || "",
      max_recording_duration_ms: maxRecordingMs,
    }, 200);
  } catch (err) {
    console.error("[v2-stt-session] Unexpected error:", err);
    return jsonResponse({
      error: "gladia_session_failed",
      message: String(err),
      fallback_input_type: "text",
      voice_available: false,
    }, 502);
  }
});
