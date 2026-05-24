/**
 * POST /v2-session-setup/:id - Setup session with resume, JD, section, question count.
 * Block 2 - supabase/functions/v2-session-setup/index.ts
 *
 * 1. Validate inputs (resume, JD, section, question_count)
 * 2. LLM Call 1: Extract the resume section (via Agnic Gateway, user's token)
 * 3. LLM Call 2: Generate questions (count driven by slider, 6-15)
 * 4. Persist to sessions table, transition status → active
 * 5. Return first question + session metadata
 *
 * Key V2 differences from V1:
 * - Uses Agnic Gateway (per-user token) instead of OpenRouter
 * - Supports dynamic question count (6-15) instead of fixed 2-3
 * - Handles 402 (insufficient balance) for pre-flight balance check
 * - Supports "Full Resume" section (skips extraction step)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/db.ts";
import { extractSessionId, validateSectionName } from "../_shared/validation.ts";
import { authenticateRequest, authErrorResponse } from "../_shared/v2_auth.ts";
import { callAgnicGateway, llmErrorResponse } from "../_shared/v2_llm.ts";
import type { LLMError } from "../_shared/v2_llm.ts";
import {
  SECTION_EXTRACTION_SYSTEM,
  buildSectionExtractionUser,
  QUESTION_GEN_SYSTEM,
  buildQuestionGenUser,
} from "../_shared/v2_prompts.ts";
import {
  MIN_RESUME_LEN,
  MIN_JD_LEN,
  MIN_QUESTION_COUNT,
  MAX_QUESTION_COUNT,
  DEFAULT_QUESTION_COUNT,
  MAX_TOKENS_EXTENDED,
  EXTENDED_TOKEN_QUESTION_THRESHOLD,
  SECTION_NOT_FOUND_MIN_LEN,
  MIN_SESSION_DURATION_SECS,
  MAX_SESSION_DURATION_SECS,
  SECS_PER_QUESTION,
  MIN_QUESTIONS_RETURNED,
} from "../_shared/v2_config.ts";

// Prompts are imported from ../_shared/v2_prompts.ts
// Config constants are imported from ../_shared/v2_config.ts

// ── Helpers ──

function generateQuestionId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "q_";
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

    // ── Extract session ID from URL ──
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

    if (session.v2_user_id !== userId) {
      return jsonResponse(
        { error: "session_forbidden", message: "This session belongs to another user." },
        403,
      );
    }

    if (session.status !== "setup") {
      return jsonResponse({ error: "session_already_active" }, 409);
    }

    if (new Date(session.expires_at) <= new Date()) {
      return jsonResponse({ error: "session_expired" }, 410);
    }

    // ── Parse and validate body ──
    const body = await req.json();
    const { resume_text, jd_text, section_name, question_count } = body;

    if (!resume_text || typeof resume_text !== "string" || resume_text.length < MIN_RESUME_LEN) {
      return jsonResponse({ error: "resume_too_short", message: `Resume text must be at least ${MIN_RESUME_LEN} characters.` }, 400);
    }

    if (!jd_text || typeof jd_text !== "string" || jd_text.length < MIN_JD_LEN) {
      return jsonResponse({ error: "jd_too_short", message: `Job description must be at least ${MIN_JD_LEN} characters.` }, 400);
    }

    // Validate question count (6-15, default 6)
    const qCount = Math.max(MIN_QUESTION_COUNT, Math.min(MAX_QUESTION_COUNT, parseInt(question_count) || DEFAULT_QUESTION_COUNT));

    // Validate section name - allow "Full Resume" as a special case
    let canonicalSection: string;
    const isFullResume = section_name?.trim().toLowerCase() === "full resume";

    if (isFullResume) {
      canonicalSection = "Full Resume";
    } else {
      const sectionResult = validateSectionName(section_name);
      if (!sectionResult.valid || !sectionResult.canonical) {
        return jsonResponse({ error: "invalid_section" }, 400);
      }
      canonicalSection = sectionResult.canonical;
    }

    // ── LLM Call 1: Section extraction (skipped for "Full Resume") ──
    let sectionText: string;

    if (isFullResume) {
      // Use the entire resume text as the section
      sectionText = resume_text;
      console.log(`[v2-session-setup] Using full resume (${resume_text.length} chars)`);
    } else {
      try {
        console.log(`[v2-session-setup] Extracting section '${canonicalSection}' (${resume_text.length} chars)`);

        const extractionResult = await callAgnicGateway(
          agnicToken,
          "section_extraction",
          SECTION_EXTRACTION_SYSTEM,
          buildSectionExtractionUser(resume_text, canonicalSection),
        );

        sectionText = (extractionResult as { section_text?: string }).section_text || "";

        if (!sectionText || sectionText === "NOTFOUND" || sectionText.trim().length < SECTION_NOT_FOUND_MIN_LEN) {
          console.warn(`[v2-session-setup] Section '${canonicalSection}' not found: '${sectionText?.slice(0, 100)}'`);
          return jsonResponse(
            {
              error: "section_not_found",
              message: `Could not find '${canonicalSection}' in your resume. Please check the section heading or try "Full Resume".`,
            },
            400,
          );
        }
      } catch (err: unknown) {
        console.error("[v2-session-setup] Section extraction error:", err);
        if (err && typeof err === "object" && "status" in err) {
          return llmErrorResponse(err as LLMError, corsHeaders);
        }
        return jsonResponse({ error: "llm_error", message: String(err) }, 502);
      }
    }

    // ── LLM Call 2: Question generation ──
    let questions: Array<{
      id: string;
      text: string;
      intent: string;
      resume_anchor: string;
    }>;

    try {
      console.log(`[v2-session-setup] Generating ${qCount} questions for '${canonicalSection}'`);

      const genResult = await callAgnicGateway(
        agnicToken,
        "question_generation",
        QUESTION_GEN_SYSTEM,
        buildQuestionGenUser(canonicalSection, sectionText, jd_text, qCount),
        { maxTokens: qCount > EXTENDED_TOKEN_QUESTION_THRESHOLD ? MAX_TOKENS_EXTENDED : undefined },
      );

      // Parse response
      const raw = (genResult as { questions?: unknown }).questions || genResult;

      if (!Array.isArray(raw) || raw.length < Math.min(qCount, MIN_QUESTIONS_RETURNED)) {
        throw new Error(`LLM returned too few questions: expected ${qCount}, got ${Array.isArray(raw) ? raw.length : 'non-array'}`);
      }

      if (raw.length < qCount) {
        console.warn(`[v2-session-setup] LLM returned ${raw.length}/${qCount} questions - using what we have`);
      }

      // Sanitize and normalize
      questions = raw.slice(0, qCount).map(
        (q: { id?: string; text?: string; intent?: string; resume_anchor?: string }) => ({
          id:
            q.id && typeof q.id === "string" && q.id.startsWith("q_")
              ? q.id
              : generateQuestionId(),
          text: q.text || "",
          intent: q.intent || "ownership_and_evidence",
          resume_anchor: q.resume_anchor || "",
        }),
      );

      if (questions.some((q) => !q.text)) {
        throw new Error("One or more questions missing text field");
      }
    } catch (err: unknown) {
      console.error("[v2-session-setup] Question generation error:", err);
      if (err && typeof err === "object" && "status" in err) {
        return llmErrorResponse(err as LLMError, corsHeaders);
      }
      return jsonResponse({ error: "question_gen_failed", message: String(err) }, 500);
    }

    // ── Build first transcript turn ──
    const now = new Date().toISOString();
    const firstTurn = {
      turn: 1,
      type: "question",
      level: 0,
      core_question_index: 0,
      question_id: questions[0].id,
      text: questions[0].text,
      asked_at: now,
    };

    // ── Calculate session duration ──
    // Dynamic: min 8min, max 20min, ~80sec per question
    const durationSeconds = Math.min(MAX_SESSION_DURATION_SECS, Math.max(MIN_SESSION_DURATION_SECS, qCount * SECS_PER_QUESTION));
    const expiresAt = new Date(Date.now() + durationSeconds * 1000).toISOString();

    // ── Persist ──
    const { error: updateError } = await db
      .from("sessions")
      .update({
        resume_text,
        jd_text,
        section_name: canonicalSection,
        section_text: sectionText,
        core_questions: questions,
        transcript: [firstTurn],
        status: "active",
        question_index: 0,
        followup_count: 0,
        followup_depth: 0,
        total_questions: 0,
        session_start: now,
        expires_at: expiresAt,
      })
      .eq("id", sessionId)
      .eq("status", "setup"); // Guard: only update if still in setup

    if (updateError) {
      console.error("[v2-session-setup] DB update error:", updateError);
      return jsonResponse({ error: "db_error", message: updateError.message }, 500);
    }

    // ── Response ──
    return jsonResponse(
      {
        first_question: {
          id: questions[0].id,
          text: questions[0].text,
          question_number: 1,
          total_core: questions.length,
        },
        session_id: sessionId,
        session_start: now,
        session_expires_at: expiresAt,
        question_count: questions.length,
        section_name: canonicalSection,
      },
      200,
    );
  } catch (err) {
    console.error("[v2-session-setup] Unexpected error:", err);
    return jsonResponse({ error: "internal_error", message: String(err) }, 500);
  }
});
