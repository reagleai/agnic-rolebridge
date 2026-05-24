/**
 * GET /v2-session-get/:id - Rehydrate V2 session state after page refresh.
 * Block 2 - supabase/functions/v2-session-get/index.ts
 *
 * Returns the full session state needed for the frontend to resume
 * an in-progress interview. This is the fix for Issue #3 (refresh
 * loses all state on InterviewPage).
 *
 * V2 differences from V1:
 * - Authenticates via rb_session_token
 * - Verifies session belongs to the authenticated user
 * - Returns dynamic question count and remaining
 * - Supports "Full Resume" section
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

    // ── Fetch session ──
    const { data: session, error: fetchError } = await db
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (fetchError || !session) {
      return jsonResponse({ error: "session_not_found" }, 404);
    }

    // ── Verify session ownership ──
    if (session.v2_user_id !== userId) {
      return jsonResponse({ error: "session_forbidden", message: "This session belongs to another user." }, 403);
    }

    // ── Handle non-active sessions ──
    if (session.status === "ended") {
      return jsonResponse({ error: "session_ended", status: "ended" }, 410);
    }

    if (session.status === "setup") {
      // Session exists but not set up yet - return setup state
      return jsonResponse(
        {
          status: "setup",
          session_id: sessionId,
          expires_at: session.expires_at,
        },
        200,
      );
    }

    if (session.status !== "active") {
      return jsonResponse({ error: "session_not_active", status: session.status }, 409);
    }

    // ── Check expiry ──
    if (new Date(session.expires_at) <= new Date()) {
      return jsonResponse({ error: "session_expired", status: "expired" }, 410);
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

    // ── Calculate questions answered and remaining ──
    const totalCore = coreQuestions.length;
    const questionsAnswered = session.total_questions || 0;
    const questionsRemaining = Math.max(
      0,
      totalCore - (session.question_index || 0) - 1,
    );

    // ── Count answers in transcript for completeness check ──
    const answerCount = transcript.filter(
      (t) => t.type === "answer",
    ).length;

    return jsonResponse(
      {
        status: "active",
        session_id: sessionId,
        question_index: session.question_index,
        followup_depth: session.followup_depth,
        total_questions: session.total_questions,
        current_question: currentQuestion,
        session_start: session.session_start,
        session_expires_at: session.expires_at,
        questions_remaining: questionsRemaining,
        questions_answered: questionsAnswered,
        answer_count: answerCount,
        total_core: totalCore,
        section_name: session.section_name,
      },
      200,
    );
  } catch (err) {
    console.error("[v2-session-get] Unexpected error:", err);
    return jsonResponse({ error: "internal_error", message: String(err) }, 500);
  }
});
