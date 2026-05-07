/**
 * GET /sessions/:id — Rehydrate frontend state after page refresh.
 * Block B — supabase/functions/session-get/index.ts
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

    // ── Fetch session ──
    const { data: session, error: fetchError } = await db
      .from("sessions")
      .select("*")
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

    // ── Determine current question ──
    const transcript = (session.transcript as Array<Record<string, unknown>>) || [];
    const coreQuestions =
      (session.core_questions as Array<{ id: string; text: string }>) || [];

    // Find the last question turn in the transcript
    let currentQuestion: { id: string; text: string; level: number } | null = null;

    for (let i = transcript.length - 1; i >= 0; i--) {
      if (transcript[i].type === "question") {
        currentQuestion = {
          id: transcript[i].question_id as string,
          text: transcript[i].text as string,
          level: (transcript[i].level as number) ?? 0,
        };
        break;
      }
    }

    // Fallback: derive from core_questions[question_index]
    if (!currentQuestion && coreQuestions.length > 0) {
      const idx = Math.min(session.question_index, coreQuestions.length - 1);
      currentQuestion = {
        id: coreQuestions[idx].id,
        text: coreQuestions[idx].text,
        level: 0,
      };
    }

    // ── Calculate questions remaining ──
    // Total cap is 5. total_questions counts completed Q&A rounds.
    // questions_remaining = max(0, 5 - total_questions - 1) for the question currently being asked
    const questionsRemaining = Math.max(0, 5 - session.total_questions - 1);

    return jsonResponse(
      {
        status: "active",
        question_index: session.question_index,
        followup_depth: session.followup_depth,
        total_questions: session.total_questions,
        current_question: currentQuestion,
        session_start: session.session_start,
        session_expires_at: session.expires_at,
        questions_remaining: questionsRemaining,
        total_core: coreQuestions.length,
      },
      200
    );
  } catch (err) {
    console.error("Unexpected error in session-get:", err);
    return jsonResponse({ error: "db_error", message: String(err) }, 500);
  }
});
