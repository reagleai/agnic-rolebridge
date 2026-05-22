/**
 * POST /v2-session-end/:id - End session + queue V2 report generation.
 * Block 4 - supabase/functions/v2-session-end/index.ts
 *
 * V2 differences from V1:
 * - Authenticates via rb_session_token + verifies ownership
 * - Does NOT delete the session row (V2 keeps it for history)
 * - Queues report via v2_reports table (not report_queue)
 * - Increments v2_users.session_count
 * - Fire-and-forget invoke of v2-report-worker
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/db.ts";
import { extractSessionId } from "../_shared/validation.ts";
import { authenticateRequest, authErrorResponse } from "../_shared/v2_auth.ts";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function incrementSessionCount(
  db: ReturnType<typeof getSupabaseClient>,
  userId: string,
): Promise<void> {
  const { error: rpcError } = await db.rpc("increment_counter", {
    row_id: userId,
    table_name: "v2_users",
    column_name: "session_count",
  });

  if (!rpcError) return;

  const { data: userRow, error: userError } = await db
    .from("v2_users")
    .select("session_count")
    .eq("id", userId)
    .single();

  if (userError) throw userError;

  const nextCount = ((userRow?.session_count as number | null) || 0) + 1;
  const { error: updateError } = await db
    .from("v2_users")
    .update({ session_count: nextCount, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (updateError) throw updateError;
}

function buildFunctionUrl(supabaseUrl: string, functionName: string): string {
  const base = new URL(supabaseUrl);
  return new URL(`/functions/v1/${functionName}`, base).toString();
}

serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  if (req.method !== "POST") {
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
    } catch {
      return jsonResponse({ status: "already_ended" }, 200);
    }

    const db = getSupabaseClient();

    // ── Fetch session ──
    const { data: session, error: fetchError } = await db
      .from("sessions")
      .select("id, status, email, v2_user_id, section_name, section_text, jd_text, transcript, core_questions")
      .eq("id", sessionId)
      .in("status", ["active", "setup"])
      .single();

    if (fetchError || !session) {
      return jsonResponse({ status: "already_ended" }, 200);
    }

    // ── Verify ownership ──
    if (session.v2_user_id !== userId) {
      return jsonResponse({ error: "session_forbidden" }, 403);
    }

    // ── Mark session as ended ──
    const { error: updateError } = await db
      .from("sessions")
      .update({ status: "ended" })
      .eq("id", sessionId)
      .in("status", ["active", "setup"]);

    if (updateError) {
      console.error("[v2-session-end] DB update error:", updateError);
      return jsonResponse({ error: "db_error", message: updateError.message }, 500);
    }

    // ── Check if session has answers ──
    const transcript = (session.transcript as Array<Record<string, unknown>>) || [];
    const hasAnswers = transcript.some((t) => t.type === "answer");

    if (session.status === "setup" || !hasAnswers) {
      return jsonResponse({
        status: "abandoned",
        message: "Session ended before any answers were submitted. No report will be generated.",
      }, 200);
    }

    // ── Queue report in v2_reports ──
    const { data: reportRow, error: reportError } = await db
      .from("v2_reports")
      .insert({
        session_id: sessionId,
        user_id: userId,
        report_json: {},  // Empty — will be filled by v2-report-worker
        status: "pending",
      })
      .select("id")
      .single();

    if (reportError) {
      console.error("[v2-session-end] Report queue error:", reportError);
      // Non-fatal — session is already ended
    }

    // ── Increment session_count on v2_users ──
    try {
      await incrementSessionCount(db, userId);
    } catch (err) {
      // Non-fatal — just log
      console.warn("[v2-session-end] Failed to increment session_count:", err);
    }

    // ── Invoke v2-report-worker (awaited to ensure it actually starts) ──
    let workerStatus = "queued";
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
      if (supabaseUrl && serviceKey && reportRow?.id) {
        const workerRes = await fetch(buildFunctionUrl(supabaseUrl, "v2-report-worker"), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ report_id: reportRow.id }),
          signal: AbortSignal.timeout(55_000),
        });
        const workerBody = await workerRes.json().catch(() => ({}));
        workerStatus = workerBody.status || (workerRes.ok ? "triggered" : "invoke_failed");
        console.log("[v2-session-end] Report worker response:", workerRes.status, workerStatus);
      }
    } catch (err) {
      // Non-fatal — the report row is in 'pending' state and the frontend polls
      console.warn("[v2-session-end] Report worker invocation error:", err);
      workerStatus = "invoke_failed";
    }

    return jsonResponse({
      status: "processing",
      report_id: reportRow?.id || null,
      worker_status: workerStatus,
      message: "Your report is being generated.",
    }, 202);
  } catch (err) {
    console.error("[v2-session-end] Unexpected error:", err);
    return jsonResponse({ error: "db_error", message: String(err) }, 500);
  }
});
