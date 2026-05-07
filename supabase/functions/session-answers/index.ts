/**
 * POST /sessions/:id/answers — Submit answer, evaluate, determine next action.
 * Block C — supabase/functions/session-answers/index.ts
 *
 * Core interview engine:
 * 1. Validate inputs + session state
 * 2. LLM-evaluate the answer (6 rubric dimensions)
 * 3. Apply hard-rule overrides (total cap, followup depth, core exhaustion)
 * 4. Build transcript turns (answer + optional next question)
 * 5. Persist to DB — CRITICAL: branch SQL by next_action to avoid null::jsonb
 * 6. Return next_action + next_question + session_stats
 */

import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/db.ts";
import { extractSessionId } from "../_shared/validation.ts";
import { callLLM } from "../_shared/llm.ts";

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

// ── LLM Prompts ──

const ANSWER_EVAL_SYSTEM = `You are the Live Interview engine for RoleBridge.

PRODUCT
RoleBridge helps career-transition candidates defend and translate real experience under follow-up pressure.
This session is not a coaching chat.
It is a grounded interview simulation.

YOUR JOB
Given:
- the resume,
- the selected resume section,
- the target job description,
- the pre-generated core questions,
- the transcript so far,
- the latest user answer,
- the current follow-up count,

decide the next interviewer move.

You must do exactly one of these:
1. ask the next core question,
2. ask one follow-up question tied to the latest answer,
3. end the interview if no more valid questions remain.

HARD RULES
- Ask one question at a time.
- No live coaching.
- No feedback during the session.
- No praise, reassurance, or tips.
- No invented background.
- No generic “can you elaborate?” unless it is made specific.
- No more than 2 follow-up questions total in the session.
- Follow-up depth may not exceed 2 levels from the original core question.
- Every follow-up must be triggered by something concrete in the answer, transcript, resume, or JD.
- Evaluate only transcript content, not delivery style.

SESSION LOGIC
The session tests whether the user can remain:
- clear,
- specific,
- evidence-based,
- ownership-forward,
- relevant to the target role,
- coherent across probing.

FOLLOW-UP TYPES
Use only these labels:

1. claim
Use when the answer makes a claim without enough detail, proof, mechanism, or measurable support.
Example trigger:
- “I improved efficiency significantly.”
Desired probe:
- what changed, how it changed, how they know.

2. ownership
Use when the answer hides behind “we,” blurs personal contribution, or leaves responsibility unclear.
Example trigger:
- “We launched a new workflow.”
Desired probe:
- what the user personally drove, decided, owned, or executed.

3. translation
Use when the answer describes old-role work but fails to connect it to the target role.
Example trigger:
- good execution story, weak target-role mapping.
Desired probe:
- which part of the experience translates and why.

4. coherence
Use when the answer conflicts with the resume, prior answers, or itself.
Example trigger:
- timeline mismatch, inconsistent ownership, contradictory scope.
Desired probe:
- reconcile the inconsistency directly.

5. expansion
Use rarely.
Only use when the answer is already solid and there is one clearly relevant, JD-aligned, unaddressed point from the selected resume section worth pulling in.
Do not use expansion to roam into broad resume coverage.

FOLLOW-UP SELECTION RULES
Ask a follow-up only if it materially improves the quality of the evaluation.
Do not ask a follow-up just because one is available.
Prefer follow-ups when:
- a major claim lacks evidence,
- ownership is unclear,
- transition logic is weak,
- a contradiction appears,
- the answer avoids the actual question.

Move to the next core question when:
- the latest answer is sufficient for the current question,
- the remaining gaps are minor,
- follow-up budget is exhausted,
- a follow-up would likely become repetitive or low value.

END the session when:
- all core questions have been exhausted, and
- no high-value follow-up is justified within the remaining limit.

QUESTION WRITING RULES
- Keep the interviewer tone professional and direct.
- Keep each question concise.
- Make each follow-up explicitly tied to the user’s own answer.
- Questions should be answerable in about 60 seconds.
- Do not bundle multiple unrelated asks into one long question.

BAD INTERVIEWER BEHAVIOR
- “Great answer.”
- “Here’s how you could improve that.”
- “Try using the STAR method.”
- “Can you tell me more?” with no anchor.
- “That’s relevant to PM because…” followed by coaching.
- Any question based on facts not present in the inputs.

DECISION METHOD
For the latest answer:
1. Check whether it answered the asked question.
2. Check for unsupported claims.
3. Check whether personal ownership is visible.
4. Check whether target-role translation is explicit enough.
5. Check for contradictions against resume or earlier transcript.
6. Decide whether the highest-value next move is follow-up, next core question, or end.

OUTPUT REQUIREMENTS
Return valid JSON only.
Do not include markdown.
Do not include commentary before or after the JSON.

OUTPUT SCHEMA
{
  "decision": "followup | next_core | end",
  "reasoning_label": "brief operational reason such as unsupported_claim | unclear_ownership | weak_transition | contradiction | sufficient_answer | exhausted_budget",
  "question_to_ask": {
    "question_id": "F1 or Q2 or null",
    "question_text": "The exact next interviewer question, or null if ending",
    "question_type": "claim | ownership | translation | coherence | expansion | core | null",
    "parent_question_id": "Q1 or null",
    "trigger_evidence": [
      "Exact phrase or short excerpt from latest answer or prior transcript that triggered this move"
    ]
  },
  "session_state_update": {
    "followups_used_total": 0,
    "followup_depth_for_current_core": 0,
    "core_questions_remaining": 0,
    "should_end_session": false
  }
}

QUALITY BAR
The next move must feel like a serious interviewer stress-testing a real candidate’s story, not a chatbot trying to keep conversation alive.
If the follow-up could be asked to almost anyone, it is too generic.`;

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
 */
function determineNextAction(
  llmAction: string,
  totalQuestions: number,
  followupDepth: number,
  questionIndex: number,
  coreQuestionsLength: number
): "followup" | "next_question" | "end_session" {
  // Hard rule 1: total cap (5th answer → end)
  if (totalQuestions >= 4) {
    return "end_session";
  }
  // Hard rule 2: followup depth cap
  if (llmAction === "followup" && followupDepth >= 2) {
    return "next_question";
  }
  // Hard rule 3: core exhaustion
  if (llmAction === "next_question" && questionIndex + 1 >= coreQuestionsLength) {
    return "end_session";
  }
  // Otherwise trust LLM
  return llmAction as "followup" | "next_question" | "end_session";
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

    // ── Parse and validate body ──
    const body = await req.json();
    const { question_id, answer_text, input_type, duration_seconds } = body;

    if (!answer_text || typeof answer_text !== "string" || answer_text.length < 10) {
      return jsonResponse({ error: "answer_too_short" }, 400);
    }
    if (!["voice", "text"].includes(input_type)) {
      return jsonResponse({ error: "invalid_input_type" }, 400);
    }
    const duration = Number(duration_seconds);
    if (!Number.isFinite(duration) || duration < 1 || duration > 75) {
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

    // ── LLM evaluation ──
    let evalResult: EvalResult;
    try {
      const coreRemaining = coreQuestions.length - session.question_index - 1;
      const userPrompt = `Resume section (${session.section_name}):\n---\n${session.section_text}\n---\nTarget JD:\n---\n${(session.jd_text || "").substring(0, 1000)}\n---\nTranscript so far:\n${serializeTranscript(transcript)}\n---\nCurrent question: ${transcript.find((t: TranscriptTurn) => t.question_id === question_id && t.type === "question")?.text || ""}\nCandidate answer: ${answer_text}\n---\nCurrent followup depth: ${session.followup_depth}\nTotal questions completed: ${session.total_questions}\nRemaining core questions: ${coreRemaining}`;

      const raw = (await callLLM("answer_evaluation", ANSWER_EVAL_SYSTEM, userPrompt)) as any;

      let next_action = "next_question";
      if (raw.decision === "next_core") next_action = "next_question";
      else if (raw.decision === "end") next_action = "end_session";
      else if (raw.decision === "followup") next_action = "followup";
      else if (raw.next_action) next_action = raw.next_action;

      let followup_question = null;
      if (raw.question_to_ask && raw.question_to_ask.question_text) {
        followup_question = {
          id: raw.question_to_ask.question_id || generateFollowupId(),
          text: raw.question_to_ask.question_text
        };
      } else if (raw.followup_question) {
        followup_question = raw.followup_question;
      }

      evalResult = {
        eval: raw.eval || getDefaultEval().eval,
        next_action: next_action as any,
        followup_question,
        eval_notes: raw.reasoning_label || raw.eval_notes || "",
      };

      // Validate eval has required fields
      if (!evalResult.eval || typeof evalResult.eval !== "object") {
        evalResult = getDefaultEval();
      }
    } catch (err) {
      console.error("LLM eval error (defaulting to next_question):", err);
      if (String(err).includes("llm_rate_limited")) {
        return jsonResponse({ error: "llm_rate_limited" }, 429);
      }
      evalResult = getDefaultEval();
    }

    // ── Determine next action with hard-rule overrides ──
    const finalAction = determineNextAction(
      evalResult.next_action,
      session.total_questions,
      session.followup_depth,
      session.question_index,
      coreQuestions.length
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

    let nextQuestion: { id: string; text: string; question_number: number; level: number } | null =
      null;
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
        question_number: session.total_questions + 2, // +1 for this answer, +1 for next
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
      // If no more core questions, this shouldn't happen (hard rule 3 would have forced end_session)
      // but defensively, treat as end_session
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
        console.error("DB update error (end_session):", upErr);
        return jsonResponse({ error: "db_error", message: upErr.message }, 500);
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
        console.error("DB update error (continue):", upErr);
        return jsonResponse({ error: "db_error", message: upErr.message }, 500);
      }
    }

    // ── Build response ──
    const sessionStart = new Date(session.session_start).getTime();
    const timeElapsed = Math.floor((Date.now() - sessionStart) / 1000);
    const totalQuestionsAsked = session.total_questions + 1;
    const questionsRemaining = Math.max(0, 5 - totalQuestionsAsked - 1);

    return jsonResponse(
      {
        next_action: finalAction,
        next_question: nextQuestion,
        session_stats: {
          total_questions_asked: totalQuestionsAsked,
          questions_remaining: questionsRemaining,
          time_elapsed_seconds: timeElapsed,
          session_expires_at: session.expires_at,
        },
      },
      200
    );
  } catch (err) {
    console.error("Unexpected error in session-answers:", err);
    return jsonResponse({ error: "eval_failed", message: String(err) }, 500);
  }
});
