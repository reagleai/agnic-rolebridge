/**
 * POST /sessions/:id/setup - Store resume/JD, extract section, generate questions.
 * Block B - supabase/functions/session-setup/index.ts
 */

import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/db.ts";
import { extractSessionId, validateSectionName } from "../_shared/validation.ts";
import { callLLM } from "../_shared/llm.ts";

// ── LLM Prompts ──

const SECTION_EXTRACTION_SYSTEM = `You are a resume parser. Extract the text belonging to the specified section from the resume.

IMPORTANT: Section headers in resumes vary. Use these mappings:
- "Work Experience" = any of: EXPERIENCE, WORK EXPERIENCE, PROFESSIONAL EXPERIENCE, WORK HISTORY, EMPLOYMENT, EMPLOYMENT HISTORY, CAREER HISTORY, PROFESSIONAL BACKGROUND, HISTORY
- "Projects" = any of: PROJECTS, PERSONAL PROJECTS, SIDE PROJECTS, ACADEMIC PROJECTS, KEY PROJECTS, SELECTED PROJECTS, OTHER PROJECTS
- "Skills" = any of: SKILLS, TECHNICAL SKILLS, CORE COMPETENCIES, TECHNOLOGIES, TOOLS & TECHNOLOGIES, TOOLS AND TECHNOLOGIES, EXPERTISE, COMPETENCIES

Extract ALL content under the matching section header until the next major section header begins.

Return ONLY valid JSON: {"section_text": "<extracted text>"}
If genuinely no matching section exists, return: {"section_text": "NOTFOUND"}`;

const QUESTION_GEN_SYSTEM = `You are an expert interview coach preparing follow-up pressure questions for a career-transition candidate. You have access to a specific section of their resume and the target job description.

Your job is to generate 2 to 3 interview questions that:
1. Are directly grounded in a specific claim or experience in the resume section.
2. Test whether the candidate can translate that experience into terms relevant to the target role.
3. Are open-ended and structured so a strong answer takes under 60 seconds.
4. Probe ownership, evidence, and role relevance - not just description.

Return ONLY valid JSON. No explanation. No markdown fences. Format:
{"questions": [
  {
    "id": "q_<6 random alphanumeric chars>",
    "text": "<question text>",
    "intent": "<one of: ownership_and_evidence | role_language_transition | coherence_probe | relevance_check>",
    "resume_anchor": "<the exact phrase from the resume section this question is grounded in>"
  }
]}`;

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

    if (session.status !== "setup") {
      return jsonResponse({ error: "session_already_active" }, 409);
    }

    if (new Date(session.expires_at) <= new Date()) {
      return jsonResponse({ error: "session_expired" }, 410);
    }

    // ── Parse and validate body ──
    const body = await req.json();
    const { resume_text, jd_text, section_name } = body;

    if (!resume_text || typeof resume_text !== "string" || resume_text.length < 200) {
      return jsonResponse({ error: "resume_too_short" }, 400);
    }

    if (!jd_text || typeof jd_text !== "string" || jd_text.length < 100) {
      return jsonResponse({ error: "jd_too_short" }, 400);
    }

    const sectionResult = validateSectionName(section_name);
    if (!sectionResult.valid || !sectionResult.canonical) {
      return jsonResponse({ error: "invalid_section" }, 400);
    }
    const canonicalSection = sectionResult.canonical;

    // ── LLM Call 1: Section extraction ──
    let sectionText: string;
    try {
      console.log(`[session-setup] Extracting section '${canonicalSection}' from resume (${resume_text.length} chars)`);

      const extractionResult = await callLLM(
        "section_extraction",
        SECTION_EXTRACTION_SYSTEM,
        `Resume text:\n---\n${resume_text}\n---\nExtract the section named: ${canonicalSection}`
      );

      console.log("[session-setup] LLM extraction result:", JSON.stringify(extractionResult).slice(0, 500));

      sectionText = (extractionResult as { section_text?: string }).section_text || "";

      if (!sectionText || sectionText === "NOTFOUND" || sectionText.trim().length < 20) {
        console.warn(`[session-setup] Section '${canonicalSection}' not found or too short: '${sectionText?.slice(0, 100)}'`);
        return jsonResponse(
          {
            error: "section_not_found",
            message: `Could not find '${canonicalSection}' in your resume. Please check the section heading.`,
          },
          400
        );
      }
    } catch (err) {
      console.error("[session-setup] Section extraction LLM error:", err);
      const errStr = String(err);
      if (errStr.includes("llm_rate_limited")) {
        return jsonResponse({ error: "llm_rate_limited" }, 429);
      }
      // Don't mislead the user - this is an LLM/network error, not a missing section
      return jsonResponse(
        {
          error: "llm_error",
          message: `AI service error during section extraction. Please try again. (${errStr.replace(/^Error: /, '')})`,
        },
        502
      );
    }

    // ── LLM Call 2: Question generation ──
    let questions: Array<{
      id: string;
      text: string;
      intent: string;
      resume_anchor: string;
    }>;

    try {
      const genResult = await callLLM(
        "question_generation",
        QUESTION_GEN_SYSTEM,
        `Resume section (${canonicalSection}):\n---\n${sectionText}\n---\nTarget JD:\n---\n${jd_text}\n---\nGenerate 2-3 core questions.`
      );

      // The response may be { questions: [...] } or directly an array
      const raw = (genResult as { questions?: unknown }).questions || genResult;
      if (!Array.isArray(raw) || raw.length < 2 || raw.length > 3) {
        throw new Error("Invalid question array length");
      }

      // Sanitize: ensure each question has a valid id
      questions = raw.map(
        (q: { id?: string; text?: string; intent?: string; resume_anchor?: string }) => ({
          id: q.id && typeof q.id === "string" && q.id.startsWith("q_")
            ? q.id
            : generateQuestionId(),
          text: q.text || "",
          intent: q.intent || "ownership_and_evidence",
          resume_anchor: q.resume_anchor || "",
        })
      );

      // Validate all questions have text
      if (questions.some((q) => !q.text)) {
        throw new Error("Question missing text field");
      }
    } catch (err) {
      console.error("Question generation LLM error:", err);
      if (String(err).includes("llm_rate_limited")) {
        return jsonResponse({ error: "llm_rate_limited" }, 429);
      }
      return jsonResponse({ error: "question_gen_failed" }, 500);
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
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      })
      .eq("id", sessionId)
      .eq("status", "setup"); // Guard: only update if still in setup

    if (updateError) {
      console.error("DB update error:", updateError);
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
        session_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      },
      200
    );
  } catch (err) {
    console.error("Unexpected error in session-setup:", err);
    return jsonResponse({ error: "db_error", message: String(err) }, 500);
  }
});
