/**
 * GET /v2-report/:sessionId - Fetch report by session ID.
 * Block 4 - supabase/functions/v2-report/index.ts
 *
 * Returns the report_json if status is 'ready', or the current status
 * ('pending', 'processing', 'failed') so the frontend can poll.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/db.ts";
import { authenticateRequest, authErrorResponse } from "../_shared/v2_auth.ts";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

    // ── Extract session ID from URL ──
    const pathname = new URL(req.url).pathname;
    const segments = pathname.split("/").filter(Boolean);
    const sessionId = segments[segments.length - 1];

    if (!sessionId || sessionId.length < 10) {
      return jsonResponse({ error: "invalid_session_id" }, 400);
    }

    const db = getSupabaseClient();

    // ── Fetch report for this session ──
    const { data: report, error } = await db
      .from("v2_reports")
      .select("id, session_id, report_json, status, email_sent, created_at")
      .eq("session_id", sessionId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !report) {
      return jsonResponse({ status: "not_found" }, 404);
    }

    if (report.status === "ready") {
      return jsonResponse({
        status: "ready",
        report_id: report.id,
        report: report.report_json,
        email_sent: report.email_sent,
        created_at: report.created_at,
      }, 200);
    }

    // Report is still being generated
    return jsonResponse({
      status: report.status, // 'pending' | 'processing' | 'failed'
      report_id: report.id,
    }, 200);
  } catch (err) {
    console.error("[v2-report] Unexpected error:", err);
    return jsonResponse({ error: "internal_error", message: String(err) }, 500);
  }
});
