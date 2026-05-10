/**
 * POST /sessions/:id/end - Atomic session termination + report queue handoff.
 * Block E - supabase/functions/session-end/index.ts
 *
 * Uses the end_session_atomic Postgres RPC so status changes, report queueing,
 * recording cleanup metadata, and session deletion happen in one DB transaction.
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

async function fallbackEndSession(
  db: ReturnType<typeof getSupabaseClient>,
  sessionId: string
): Promise<Response> {
  console.warn("Falling back to non-atomic session end. Apply migration 004_recording_sessions_and_atomic_end.sql.");

  const { data: session, error: fetchError } = await db
    .from("sessions")
    .select("id, status, email, section_name, section_text, jd_text, transcript, core_questions")
    .eq("id", sessionId)
    .in("status", ["active", "setup"])
    .single();

  if (fetchError || !session) {
    return jsonResponse({ status: "already_ended" }, 200);
  }

  const { data: updated, error: updateError } = await db
    .from("sessions")
    .update({ status: "ended" })
    .eq("id", sessionId)
    .in("status", ["active", "setup"])
    .select("id")
    .single();

  if (updateError || !updated) {
    return jsonResponse({ status: "already_ended" }, 200);
  }

  const transcript = (session.transcript as Array<Record<string, unknown>>) || [];
  const hasAnswers = transcript.some((t) => t.type === "answer");

  if (session.status === "active" && hasAnswers) {
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
      console.error("Fallback report queue insert failed:", queueError);
    }
  }

  const { error: deleteError } = await db
    .from("sessions")
    .delete()
    .eq("id", sessionId);

  if (deleteError) {
    console.error("Fallback session delete failed:", deleteError);
  }

  if (session.status === "setup" || !hasAnswers) {
    return jsonResponse(
      { status: "abandoned", message: "Session ended before any answers were submitted. No report will be generated." },
      200
    );
  }

  return jsonResponse(
    { status: "processing", message: "Your report is being generated and will be sent to your email." },
    202
  );
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  try {
    let sessionId: string;
    try {
      sessionId = extractSessionId(req.url);
    } catch {
      return jsonResponse({ status: "already_ended" }, 200);
    }

    const db = getSupabaseClient();

    const { data, error } = await db.rpc("end_session_atomic", {
      p_session_id: sessionId,
    });

    if (error) {
      console.error("end_session_atomic RPC failed:", error);
      if (error.code === "PGRST202" || error.message?.includes("end_session_atomic")) {
        return await fallbackEndSession(db, sessionId);
      }
      return jsonResponse({ error: "db_error", message: error.message }, 500);
    }

    const result = Array.isArray(data) ? data[0] : null;

    if (!result) {
      return jsonResponse({ status: "already_ended" }, 200);
    }

    if (result.prior_status === "setup" || !result.has_answers) {
      return jsonResponse(
        { status: "abandoned", message: "Session ended before any answers were submitted. No report will be generated." },
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
