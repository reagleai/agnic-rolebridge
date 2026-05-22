/**
 * WSS /stt-relay/:recordingSessionId - Backend-owned Gladia live STT relay.
 *
 * The relay gives RoleBridge a real backend disconnect/timeout/heartbeat path.
 * It forwards binary PCM audio to Gladia and forwards Gladia JSON messages back
 * to the browser without storing audio chunks.
 */

import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/db.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEARTBEAT_TIMEOUT_MS = 45000;

function extractRecordingSessionId(url: string): string {
  const pathname = new URL(url).pathname;
  const candidate = pathname.split("/").filter(Boolean).pop() || "";
  if (!UUID_RE.test(candidate)) {
    throw new Error("recording_session_not_found");
  }
  return candidate;
}

function safeSend(socket: WebSocket, data: string | ArrayBuffer): void {
  try {
    if (socket.readyState === WebSocket.OPEN) socket.send(data);
  } catch {}
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const upgrade = req.headers.get("upgrade") || "";
  if (upgrade.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket upgrade", {
      status: 400,
      headers: corsHeaders,
    });
  }

  let recordingSessionId: string;
  try {
    recordingSessionId = extractRecordingSessionId(req.url);
  } catch {
    return new Response("Recording session not found", {
      status: 404,
      headers: corsHeaders,
    });
  }

  const db = getSupabaseClient();
  const { data: recording, error: recordingError } = await db
    .from("recording_sessions")
    .select("id, session_id, gladia_ws_url, status, max_duration_ms")
    .eq("id", recordingSessionId)
    .in("status", ["created", "active"])
    .single();

  if (recordingError || !recording?.gladia_ws_url) {
    return new Response("Recording session not found", {
      status: 404,
      headers: corsHeaders,
    });
  }

  const { data: session, error: sessionError } = await db
    .from("sessions")
    .select("id, status, expires_at")
    .eq("id", recording.session_id)
    .single();

  if (sessionError || !session || session.status !== "active") {
    return new Response("Interview session is not active", {
      status: 409,
      headers: corsHeaders,
    });
  }

  if (new Date(session.expires_at) <= new Date()) {
    return new Response("Interview session expired", {
      status: 410,
      headers: corsHeaders,
    });
  }

  const { socket: clientSocket, response } = Deno.upgradeWebSocket(req);

  let gladiaSocket: WebSocket | null = null;
  let maxTimer: number | undefined;
  let heartbeatTimer: number | undefined;
  let finalCloseTimer: number | undefined;
  let stopped = false;
  let lastHeartbeat = Date.now();

  const markStopped = async (reason: string) => {
    await db
      .from("recording_sessions")
      .update({
        status: reason === "max_duration_timeout" ? "timeout" : "stopped",
        stop_reason: reason,
        stopped_at: new Date().toISOString(),
        last_heartbeat_at: new Date(lastHeartbeat).toISOString(),
      })
      .eq("id", recordingSessionId);
  };

  const stopBoth = (reason: string) => {
    if (stopped) return;
    stopped = true;

    if (maxTimer) clearTimeout(maxTimer);
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (finalCloseTimer) clearTimeout(finalCloseTimer);

    if (gladiaSocket?.readyState === WebSocket.OPEN) {
      try {
        // Fix: Ghost Recording P0 - relay always tells Gladia to stop before closing.
        gladiaSocket.send(JSON.stringify({ type: "stop_recording" }));
      } catch {}
    }

    try { gladiaSocket?.close(); } catch {}
    try { clientSocket.close(); } catch {}

    console.warn(`[stt-relay] recording ${recordingSessionId} stopped: ${reason}`);
    void markStopped(reason);
  };

  const scheduleFinalClose = (reason: string) => {
    if (finalCloseTimer) clearTimeout(finalCloseTimer);
    finalCloseTimer = setTimeout(() => stopBoth(reason), 2500);
  };

  clientSocket.onopen = () => {
    console.log(`[stt-relay] client connected: ${recordingSessionId}`);

    void db
      .from("recording_sessions")
      .update({
        status: "active",
        last_heartbeat_at: new Date().toISOString(),
      })
      .eq("id", recordingSessionId);

    gladiaSocket = new WebSocket(recording.gladia_ws_url);

    maxTimer = setTimeout(() => {
      safeSend(clientSocket, JSON.stringify({
        type: "relay_error",
        error: "max_recording_duration_exceeded",
      }));
      stopBoth("max_duration_timeout");
    }, recording.max_duration_ms || 600000);

    heartbeatTimer = setInterval(() => {
      if (Date.now() - lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
        safeSend(clientSocket, JSON.stringify({
          type: "relay_error",
          error: "heartbeat_timeout",
        }));
        stopBoth("heartbeat_timeout");
      }
    }, 5000);

    gladiaSocket.onopen = () => {
      console.log(`[stt-relay] Gladia connected: ${recordingSessionId}`);
    };

    gladiaSocket.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      safeSend(clientSocket, event.data);

      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "end_session") {
          scheduleFinalClose("gladia_end_session");
        }
      } catch {}
    };

    gladiaSocket.onerror = () => {
      safeSend(clientSocket, JSON.stringify({
        type: "relay_error",
        error: "gladia_ws_error",
      }));
      stopBoth("gladia_ws_error");
    };

    gladiaSocket.onclose = () => {
      if (!stopped) stopBoth("gladia_ws_closed");
    };
  };

  clientSocket.onmessage = async (event) => {
    if (typeof event.data === "string") {
      let msg: { type?: string; reason?: string } = {};
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      if (msg.type === "heartbeat") {
        lastHeartbeat = Date.now();
        void db
          .from("recording_sessions")
          .update({ last_heartbeat_at: new Date(lastHeartbeat).toISOString() })
          .eq("id", recordingSessionId);
        return;
      }

      if (msg.type === "stop_recording") {
        if (gladiaSocket?.readyState === WebSocket.OPEN) {
          gladiaSocket.send(JSON.stringify({ type: "stop_recording" }));
        }
        scheduleFinalClose(msg.reason || "client_stop");
        return;
      }

      return;
    }

    if (!gladiaSocket || gladiaSocket.readyState !== WebSocket.OPEN) {
      // Fix: relay startup race - early audio chunks can arrive before the outbound Gladia socket opens.
      return;
    }

    if (event.data instanceof ArrayBuffer) {
      gladiaSocket.send(event.data);
      return;
    }

    if (event.data instanceof Blob) {
      gladiaSocket.send(await event.data.arrayBuffer());
    }
  };

  clientSocket.onerror = () => {
    stopBoth("client_ws_error");
  };

  clientSocket.onclose = () => {
    stopBoth("client_disconnect");
  };

  return response;
});
