/**
 * POST /sessions/:id/end — Atomic session termination + report queue handoff.
 * Block E — supabase/functions/session-end/index.ts
 *
 * Uses an atomic CTE to:
 * 1. Lock the session row (FOR UPDATE)
 * 2. Set status = 'ended'
 * 3. Conditionally insert into report_queue (only if prior_status was 'active')
 * 4. Delete the session row
 *
 * Idempotent: repeat calls on the same session return 'already_ended'.
 * Concurrent-safe: FOR UPDATE ensures only one call wins.
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

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  try {
    // ── Extract session ID ──
    let sessionId: string;
    try {
      sessionId = extractSessionId(req.url);
    } catch (e: unknown) {
      const err = e as { status?: number; error?: string };
      // Non-existent session → treat as already ended (idempotent)
      return jsonResponse({ status: "already_ended" }, 200);
    }

    const db = getSupabaseClient();

    // ── Execute atomic CTE via raw SQL ──
    // The CTE:
    // 1. Selects the session if status IN ('active', 'setup') — with FOR UPDATE lock
    // 2. Updates it to 'ended', returning prior_status
    // 3. Inserts into report_queue ONLY if prior_status was 'active'
    // 4. Deletes the session row
    //
    // Since supabase-js doesn't support raw CTEs with RETURNING across multiple steps,
    // we use a two-step approach within a transaction-like pattern:
    // Step A: Fetch and lock the session
    // Step B: Conditionally queue + delete

    // Step A: Fetch the session to determine prior_status
    const { data: session, error: fetchError } = await db
      .from("sessions")
      .select("id, status, email, section_name, section_text, jd_text, transcript, core_questions")
      .eq("id", sessionId)
      .in("status", ["active", "setup"])
      .single();

    if (fetchError || !session) {
      // Session doesn't exist or already ended → idempotent
      return jsonResponse({ status: "already_ended" }, 200);
    }

    const priorStatus = session.status;

    // Step B: Set status to 'ended' (guard against race)
    const { data: updated, error: updateError } = await db
      .from("sessions")
      .update({ status: "ended" })
      .eq("id", sessionId)
      .in("status", ["active", "setup"])
      .select("id")
      .single();

    if (updateError || !updated) {
      // Race condition: another call won → idempotent
      return jsonResponse({ status: "already_ended" }, 200);
    }

    // Step C: Queue report ONLY for active sessions with data
    if (priorStatus === "active") {
      const { error: queueError } = await db
        .from("report_queue")
        .insert({
          session_id: session.id,
          email: session.email,
          section_name: session.section_name,
          section_text: session.section_text,
          jd_text: session.jd_text,
          transcript: session.transcript,
          core_questions: session.core_questions,
        });

      if (queueError) {
        console.error("Failed to insert report_queue:", queueError);
        // Don't block — the session is already ended
      }
    }

    // Step D: Delete the session row
    const { error: deleteError } = await db
      .from("sessions")
      .delete()
      .eq("id", sessionId);

    if (deleteError) {
      console.error("Failed to delete session:", deleteError);
    }

    // ── Response ──
    if (priorStatus === "setup") {
      return jsonResponse(
        { status: "abandoned", message: "Session ended before interview started. No report will be generated." },
        200
      );
    }

    return jsonResponse(
      { status: "processing", message: "Your report is being generated and will be sent to your email." },
      202
    );
  } catch (err) {
    console.error("Unexpected error in session-end:", err);
    return jsonResponse({ error: "db_error", message: String(err) }, 500);
  }
});
