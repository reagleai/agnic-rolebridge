/**
 * POST /v2-session-answers/:id - Submit answer, evaluate, determine next action.
 * Block 3 - supabase/functions/v2-session-answers/index.ts
 *
 * Core interview engine (V2):
 * 1. Authenticate request + verify session ownership
 * 2. Validate inputs + session state
 * 3. LLM-evaluate the answer via Agnic Gateway (user's token)
 * 4. Apply hard-rule overrides (total cap, followup depth, core exhaustion)
 * 5. Build transcript turns (answer + optional next question)
 * 6. Persist to DB — CRITICAL: branch SQL by next_action to avoid null::jsonb
 * 7. Return next_action + next_question + session_stats
 *
 * V2 differences from V1:
 * - Uses Agnic Gateway (per-user token) instead of OpenRouter
 * - Authenticates via rb_session_token
 * - Verifies session ownership (session.v2_user_id)
 * - Dynamic core exhaustion checks (from core_questions.length, not hardcoded 5)
 * - 402 handling for mid-session balance depletion
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/db.ts";
import { extractSessionId } from "../_shared/validation.ts";
import { authenticateRequest, authErrorResponse } from "../_shared/v2_auth.ts";
import { callAgnicGateway, llmErrorResponse } from "../_shared/v2_llm.ts";
import type { LLMError } from "../_shared/v2_llm.ts";
import {
  ANSWER_EVAL_SYSTEM,
  buildAnswerEvalUser,
} from "../_shared/v2_prompts.ts";
import {
  ANSWER_MIN_LEN,
  MAX_ANSWER_DURATION_SECS,
  MAX_FOLLOWUP_DEPTH,
  ABSOLUTE_CAP_MULTIPLIER,
  RECENT_TRANSCRIPT_TURNS,
  SECTION_TEXT_MAX_CHARS,
  JD_TEXT_MAX_CHARS,
} from "../_shared/v2_config.ts";

// Prompts are imported from ../_shared/v2_prompts.ts
// Config constants are imported from ../_shared/v2_config.ts

// ── Types ──

interface TranscriptTurn {
  turn: number;
  type: "question" | "answer";
  question_id: string;
  text: string;
  level?: number;
  core_question_index?: number;
  input_type?: string;
  duration_seconds?: number;
  asked_at?: string;
  answered_at?: string;
  eval?: Record<string, unknown>;
}

interface CoreQuestion {
  id: string;
  text: string;
  intent: string;
  resume_anchor: string;
}

interface EvalResult {
  eval: Record<string, unknown>;
  next_action: "followup" | "next_question" | "end_session";
  followup_question?: { id: string; text: string } | null;
  eval_notes?: string;
}

// ── Helpers ──

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function generateFollowupId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "f_";
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function getDefaultEval(): EvalResult {
  return {
    eval: {
      clarity: "pass",
      evidence: "pass",
      ownership: "pass",
      role_language: "pass",
      relevance: "pass",
      coherence: "pass",
      needs_followup: false,
      followup_reason: "",
    },
    next_action: "next_question",
    followup_question: null,
    eval_notes: "eval_failed_defaulted",
  };
}

/**
 * Apply hard-rule overrides to the LLM's recommendation.
 * V2: Core exhaustion is based on core_questions.length instead of hardcoded 5.
 *
 * Hard caps:
 * - Max 1 followup per core question (depth cap)
 * - Absolute answer cap = 2× core count (prevents runaway sessions)
 * - Core exhaustion when no more core questions remain
 */
function determineNextAction(
  llmAction: string,
  totalQuestions: number,
  followupDepth: number,
  questionIndex: number,
  coreQuestionsLength: number,
): "followup" | "next_question" | "end_session" {
  // Hard rule 0: absolute cap — total answers must not exceed ABSOLUTE_CAP_MULTIPLIER× core count
  const absoluteCap = coreQuestionsLength * ABSOLUTE_CAP_MULTIPLIER;
  if (totalQuestions + 1 >= absoluteCap) {
    return "end_session";
  }
  // Hard rule 1: empty or exhausted core question set
  if (coreQuestionsLength <= 0 || questionIndex >= coreQuestionsLength) {
    return "end_session";
  }
  // Hard rule 2: followup depth cap (max MAX_FOLLOWUP_DEPTH followups per core question)
  if (llmAction === "followup" && followupDepth >= MAX_FOLLOWUP_DEPTH) {
    return "next_question";
  }
  // Hard rule 3: core exhaustion — no more core questions to advance to
  if (
    llmAction === "next_question" &&
    questionIndex + 1 >= coreQuestionsLength
  ) {
    return "end_session";
  }
  // Otherwise trust LLM
  return llmAction as "followup" | "next_question" | "end_session";
}

function getRecentTranscript(transcript: TranscriptTurn[], maxTurns = RECENT_TRANSCRIPT_TURNS): TranscriptTurn[] {
  return transcript.slice(Math.max(0, transcript.length - maxTurns));
}

function serializeTranscript(transcript: TranscriptTurn[]): string {
  return transcript
    .map((t) => {
      if (t.type === "question") {
        return `Q (turn ${t.turn}): ${t.text}`;
      }
      return `A (turn ${t.turn}): ${t.text}`;
    })
    .join("\n");
}

// ── Handler ──

serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  try {
    // ── Authenticate ──
    let agnicToken: string;
    let userId: string;
    try {
      const auth = await authenticateRequest(req);
      agnicToken = auth.agnicToken;
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

    // ── Verify ownership ──
    if (session.v2_user_id !== userId) {
      return jsonResponse(
        { error: "session_forbidden", message: "This session belongs to another user." },
        403,
      );
    }

    if (session.status !== "active") {
      return jsonResponse({ error: "session_not_active" }, 409);
    }
    if (new Date(session.expires_at) <= new Date()) {
      return jsonResponse({ error: "session_expired" }, 410);
    }

    // ── Parse and validate body ──
    const body = await req.json();
    const { question_id, answer_text, input_type, duration_seconds } = body;

    if (
      !answer_text ||
      typeof answer_text !== "string" ||
      answer_text.trim().length < ANSWER_MIN_LEN
    ) {
      return jsonResponse({ error: "answer_too_short" }, 400);
    }
    if (!["voice", "text"].includes(input_type)) {
      return jsonResponse({ error: "invalid_input_type" }, 400);
    }
    const duration = Number(duration_seconds);
    if (!Number.isFinite(duration) || duration < 0 || duration > MAX_ANSWER_DURATION_SECS) {
      return jsonResponse({ error: "invalid_duration" }, 400);
    }

    // ── Derive expected question ID from transcript ──
    const transcript = (session.transcript as TranscriptTurn[]) || [];
    const coreQuestions = (session.core_questions as CoreQuestion[]) || [];

    let expectedQuestionId: string | null = null;
    for (let i = transcript.length - 1; i >= 0; i--) {
      if (transcript[i].type === "question") {
        expectedQuestionId = transcript[i].question_id;
        break;
      }
    }

    if (!question_id || question_id !== expectedQuestionId) {
      return jsonResponse({ error: "wrong_question_id" }, 400);
    }

    // ── LLM evaluation via Agnic Gateway ──
    let evalResult: EvalResult;
    try {
      const coreRemaining =
        Math.max(0, coreQuestions.length - session.question_index - 1);
      const recentTranscript = getRecentTranscript(transcript);
      const userPrompt = buildAnswerEvalUser(
        session.section_name,
        (session.section_text || "").substring(0, SECTION_TEXT_MAX_CHARS),
        (session.jd_text || "").substring(0, JD_TEXT_MAX_CHARS),
        serializeTranscript(recentTranscript),
        transcript.find(
          (t: TranscriptTurn) =>
            t.question_id === question_id && t.type === "question",
        )?.text || "",
        answer_text,
        session.followup_depth,
        session.total_questions,
        coreRemaining,
      );

      const raw = await callAgnicGateway(
        agnicToken,
        "answer_evaluation",
        ANSWER_EVAL_SYSTEM,
        userPrompt,
      );

      evalResult = {
        eval:
          ((raw as Record<string, unknown>).eval as Record<string, unknown>) ||
          getDefaultEval().eval,
        next_action:
          (((raw as Record<string, unknown>).next_action as string) as "followup" | "next_question" | "end_session") ||
          "next_question",
        followup_question:
          ((raw as Record<string, unknown>).followup_question as {
            id: string;
            text: string;
          } | null) || null,
        eval_notes:
          ((raw as Record<string, unknown>).eval_notes as string) || "",
      };

      // Validate eval has required fields
      if (!evalResult.eval || typeof evalResult.eval !== "object") {
        evalResult = getDefaultEval();
      }
    } catch (err: unknown) {
      console.error("[v2-session-answers] LLM eval error:", err);

      // ── 402: Insufficient balance → surface to frontend ──
      if (err && typeof err === "object" && "status" in err) {
        const llmErr = err as LLMError;
        if (llmErr.status === 402) {
          return llmErrorResponse(llmErr, corsHeaders);
        }
        // 429: rate limited
        if (llmErr.status === 429) {
          return llmErrorResponse(llmErr, corsHeaders);
        }
      }

      // Other errors: default to next_question (graceful degradation)
      evalResult = getDefaultEval();
    }

    // ── Determine next action with hard-rule overrides ──
    const finalAction = determineNextAction(
      evalResult.next_action,
      session.total_questions,
      session.followup_depth,
      session.question_index,
      coreQuestions.length,
    );

    // ── Build transcript turns ──
    const now = new Date().toISOString();
    const answerTurnNum = transcript.length + 1;

    const answerTurn: TranscriptTurn = {
      turn: answerTurnNum,
      type: "answer",
      question_id,
      text: answer_text,
      input_type,
      duration_seconds: duration,
      answered_at: now,
      eval: {
        ...evalResult.eval,
        eval_notes: evalResult.eval_notes || "",
      },
    };

    let nextQuestion: {
      id: string;
      text: string;
      question_number: number;
      level: number;
    } | null = null;
    let questionTurn: TranscriptTurn | null = null;
    let newQuestionIndex = session.question_index;
    let newFollowupCount = session.followup_count;
    let newFollowupDepth = session.followup_depth;

    if (finalAction === "followup") {
      // Use LLM-generated followup question
      const fq = evalResult.followup_question;
      const fqId = fq?.id || generateFollowupId();
      const fqText = fq?.text || "Can you elaborate on that?";
      newFollowupDepth = session.followup_depth + 1;
      newFollowupCount = session.followup_count + 1;

      nextQuestion = {
        id: fqId,
        text: fqText,
        question_number: session.total_questions + 2,
        level: newFollowupDepth,
      };

      questionTurn = {
        turn: answerTurnNum + 1,
        type: "question",
        level: newFollowupDepth,
        core_question_index: session.question_index,
        question_id: fqId,
        text: fqText,
        asked_at: now,
      };
    } else if (finalAction === "next_question") {
      newQuestionIndex = session.question_index + 1;
      newFollowupDepth = 0;
      newFollowupCount = 0;

      if (newQuestionIndex < coreQuestions.length) {
        const nextCore = coreQuestions[newQuestionIndex];
        nextQuestion = {
          id: nextCore.id,
          text: nextCore.text,
          question_number: session.total_questions + 2,
          level: 0,
        };

        questionTurn = {
          turn: answerTurnNum + 1,
          type: "question",
          level: 0,
          core_question_index: newQuestionIndex,
          question_id: nextCore.id,
          text: nextCore.text,
          asked_at: now,
        };
      }
    }
    // end_session: nextQuestion and questionTurn stay null

    // ── Database update — CRITICAL: branch by action ──
    if (finalAction === "end_session" || !questionTurn) {
      // Append ONLY the answer turn. Do NOT append null.
      const { error: upErr } = await db
        .from("sessions")
        .update({
          transcript: [...transcript, answerTurn],
          total_questions: session.total_questions + 1,
        })
        .eq("id", sessionId);

      if (upErr) {
        console.error("[v2-session-answers] DB update error (end):", upErr);
        return jsonResponse(
          { error: "db_error", message: upErr.message },
          500,
        );
      }
    } else {
      // Append answer turn + question turn, update state counters
      const { error: upErr } = await db
        .from("sessions")
        .update({
          transcript: [...transcript, answerTurn, questionTurn],
          question_index: newQuestionIndex,
          followup_count: newFollowupCount,
          followup_depth: newFollowupDepth,
          total_questions: session.total_questions + 1,
        })
        .eq("id", sessionId);

      if (upErr) {
        console.error("[v2-session-answers] DB update error (continue):", upErr);
        return jsonResponse(
          { error: "db_error", message: upErr.message },
          500,
        );
      }
    }

    // ── Build response ──
    const sessionStart = new Date(session.session_start).getTime();
    const timeElapsed = Math.floor((Date.now() - sessionStart) / 1000);
    const totalQuestionsAsked = session.total_questions + 1;
    const activeQuestionIndex =
      finalAction === "next_question" && nextQuestion
        ? newQuestionIndex
        : session.question_index;
    const questionsRemaining = Math.max(
      0,
      finalAction === "end_session"
        ? 0
        : coreQuestions.length - activeQuestionIndex - 1,
    );

    return jsonResponse(
      {
        next_action: finalAction,
        next_question: nextQuestion,
        session_stats: {
          total_questions_asked: totalQuestionsAsked,
          questions_remaining: questionsRemaining,
          time_elapsed_seconds: timeElapsed,
          session_expires_at: session.expires_at,
          total_core: coreQuestions.length,
        },
      },
      200,
    );
  } catch (err) {
    console.error("[v2-session-answers] Unexpected error:", err);
    return jsonResponse({ error: "eval_failed", message: String(err) }, 500);
  }
});
