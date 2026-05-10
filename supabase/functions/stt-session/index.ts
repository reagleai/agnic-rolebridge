/**
 * GET /sessions/:id/stt-session - Initialize a Gladia live STT session.
 * Block C - supabase/functions/stt-session/index.ts
 *
 * Calls Gladia server-side so the API key never reaches the browser.
 * Returns a self-authenticating WebSocket URL for the frontend to connect directly.
 */

import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/db.ts";
import { extractSessionId } from "../_shared/validation.ts";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getMaxRecordingMs(): number {
  const parsed = Number.parseInt(Deno.env.get("MAX_RECORDING_DURATION_MS") || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 600000;
}

function getRelayWsUrl(reqUrl: string, recordingSessionId: string): string {
  const url = new URL(reqUrl);
  const wsProtocol = url.protocol === "https:" ? "wss:" : "ws:";
  return `${wsProtocol}//${url.host}/functions/v1/stt-relay/${recordingSessionId}`;
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== "GET") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  try {
    // ── Extract session ID ──
    let sessionId: string;
    try {
      sessionId = extractSessionId(req.url);
    } catch (e: unknown) {
      const err = e as { status?: number; error?: string };
      return jsonResponse(
        { error: err.error || "session_not_found" },
        err.status || 404
      );
    }

    const db = getSupabaseClient();

    // ── Fetch and guard session ──
    const { data: session, error: fetchError } = await db
      .from("sessions")
      .select("id, status, expires_at")
      .eq("id", sessionId)
      .single();

    if (fetchError || !session) {
      return jsonResponse({ error: "session_not_found" }, 404);
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
      console.error("Missing GLADIA_API_KEY");
      return jsonResponse({ error: "gladia_session_failed", message: "STT service not configured" }, 502);
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
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      console.error("Gladia network error:", err);
      return jsonResponse({ error: "gladia_session_failed", message: "Failed to reach STT service" }, 502);
    }

    if (!gladiaRes.ok) {
      const errBody = await gladiaRes.text().catch(() => "unknown");
      console.error("Gladia API error:", gladiaRes.status, errBody);
      return jsonResponse({ error: "gladia_session_failed", message: `STT service returned ${gladiaRes.status}` }, 502);
    }

    const gladiaData = await gladiaRes.json();
    const wsUrl = gladiaData.url || gladiaData.ws_url;
    const gladiaSessionId = gladiaData.id || gladiaData.session_id;

    if (!wsUrl) {
      console.error("Gladia response missing ws_url:", gladiaData);
      return jsonResponse({ error: "gladia_session_failed", message: "Invalid STT response" }, 502);
    }

    const maxRecordingMs = getMaxRecordingMs();

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
      console.error("Recording session insert failed:", recordingInsertError);
      // Fix: relay rollout safety - keep the current direct Gladia path working if tracking is unavailable.
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
    console.error("Unexpected error in stt-session:", err);
    return jsonResponse({ error: "gladia_session_failed", message: String(err) }, 502);
  }
});
