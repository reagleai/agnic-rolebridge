/**
 * POST /v2-report-worker - Generate report via Agnic Gateway, store in v2_reports.
 * Block 4 - supabase/functions/v2-report-worker/index.ts
 *
 * Can be invoked:
 * 1. Fire-and-forget from v2-session-end (immediate)
 * 2. Via cron as a safety net (retry pending reports)
 *
 * Flow:
 * 1. Claim a pending v2_reports row (or use provided report_id)
 * 2. Look up the session + user's Agnic token
 * 3. Generate evaluation report via Agnic Gateway
 * 4. Store report_json in v2_reports, mark as 'ready'
 * 5. Send email via Resend
 * 6. Broadcast Supabase Realtime event (v2_reports INSERT/UPDATE)
 *
 * V2 differences from V1:
 * - Uses Agnic Gateway (user's token) instead of OpenRouter
 * - Stores structured report in v2_reports (not just email)
 * - v2_reports table has Supabase Realtime enabled → frontend subscribes
 * - Does NOT delete session (kept for history)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/db.ts";
import { callAgnicGateway } from "../_shared/v2_llm.ts";
import { getFreshAgnicToken, refreshAgnicToken } from "../_shared/v2_auth.ts";
import type { V2User } from "../_shared/v2_auth.ts";
import type { LLMError } from "../_shared/v2_llm.ts";
import {
  REPORT_SYSTEM,
  buildReportUser,
} from "../_shared/v2_prompts.ts";
import {
  REPORT_WORKER_MAX_TOKENS,
  REPORT_JD_MAX_CHARS,
  REPORT_SECTION_TEXT_MAX_CHARS,
  EMAIL_TIMEOUT_MS,
  RESEND_FROM_EMAIL_DEFAULT,
} from "../_shared/v2_config.ts";

// Prompts are imported from ../_shared/v2_prompts.ts
// Config constants are imported from ../_shared/v2_config.ts

// ── Types ──

interface DimensionScore {
  score: number;
  why: string;
  flag: string;
  transcript_evidence: string;
}

interface ReportData {
  opening_summary: string;
  dimensions: {
    clarity: DimensionScore;
    evidence: DimensionScore;
    ownership: DimensionScore;
    role_language_transition: DimensionScore;
    relevance: DimensionScore;
    coherence: DimensionScore;
  };
  overall_impression: {
    score: number;
    strengths: string[];
    weaknesses: string[];
    points_to_improve: string[];
  };
}

// ── Helpers ──

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function serializeTranscript(transcript: Array<Record<string, unknown>>): string {
  return transcript
    .map((t) => {
      if (t.type === "question") {
        return `Interviewer: ${t.text}`;
      }
      return `Candidate: ${t.text}`;
    })
    .join("\n\n");
}

function buildReportHTML(report: ReportData, sectionName: string, email: string): string {
  const dims = report.dimensions;
  const overall = report.overall_impression;

  const renderDim = (label: string, d: DimensionScore) => {
    const flagColor = d.flag === "pass" ? "#00E5A0" : d.flag === "soft_flag" ? "#FBBF24" : "#EF4444";
    const flagLabel = d.flag === "pass" ? "Pass" : d.flag === "soft_flag" ? "Needs Work" : "Critical";
    return `
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #2A344A;font-weight:600;color:#E2E8F0;width:200px;">
          ${label}
          <br><span style="font-size:12px;font-weight:400;color:${flagColor};">● ${flagLabel}</span>
        </td>
        <td style="padding:12px 16px;border-bottom:1px solid #2A344A;text-align:center;font-size:20px;font-weight:700;color:#00E5A0;width:80px;">
          ${d.score}/10
        </td>
        <td style="padding:12px 16px;border-bottom:1px solid #2A344A;color:#94A3B8;line-height:1.5;">
          ${d.why}
          ${d.transcript_evidence ? `<br><span style="display:inline-block;margin-top:6px;padding:6px 10px;background:rgba(0, 229, 160, 0.05);border-left:3px solid #00E5A0;font-style:italic;font-size:13px;color:#94A3B8;">"${d.transcript_evidence}"</span>` : ""}
        </td>
      </tr>`;
  };

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0B0F19;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#E2E8F0;">
  <div style="max-width:640px;margin:0 auto;padding:32px 16px;">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="display:inline-block;background:rgba(0, 229, 160, 0.12);border:1px solid rgba(0, 229, 160, 0.2);color:#33FFB8;font-size:12px;font-weight:600;padding:4px 12px;border-radius:100px;text-transform:uppercase;letter-spacing:0.05em;">Interview Report</div>
      <h1 style="font-size:24px;font-weight:700;margin:16px 0 4px;color:#E2E8F0;">RoleBridge Evaluation</h1>
      <p style="color:#94A3B8;font-size:14px;margin:0;">Section: ${sectionName || "General"}</p>
    </div>
    <div style="background:#131A2A;border:1px solid #2A344A;border-radius:12px;padding:20px;margin-bottom:24px;">
      <h2 style="font-size:16px;font-weight:600;margin:0 0 8px;color:#00E5A0;">Summary</h2>
      <p style="color:#94A3B8;font-size:14px;line-height:1.6;margin:0;">${report.opening_summary}</p>
    </div>
    <div style="background:#131A2A;border:1px solid #2A344A;border-radius:12px;padding:20px;margin-bottom:24px;text-align:center;">
      <div style="font-size:48px;font-weight:700;color:#00E5A0;">${overall.score}/10</div>
      <p style="color:#94A3B8;font-size:14px;margin:4px 0 0;">Overall Score</p>
    </div>
    <div style="background:#131A2A;border:1px solid #2A344A;border-radius:12px;overflow:hidden;margin-bottom:24px;">
      <div style="padding:16px 16px 8px;"><h2 style="font-size:16px;font-weight:600;margin:0;color:#00E5A0;">Dimension Scores</h2></div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        ${renderDim("Clarity", dims.clarity)}
        ${renderDim("Evidence", dims.evidence)}
        ${renderDim("Ownership", dims.ownership)}
        ${renderDim("Role Language", dims.role_language_transition)}
        ${renderDim("Relevance", dims.relevance)}
        ${renderDim("Coherence", dims.coherence)}
      </table>
    </div>
    <div style="background:#131A2A;border:1px solid #2A344A;border-radius:12px;padding:20px;margin-bottom:24px;">
      <h2 style="font-size:16px;font-weight:600;margin:0 0 12px;color:#00E5A0;">Strengths</h2>
      <ul style="padding-left:20px;margin:0 0 16px;color:#33FFB8;font-size:14px;">
        ${(overall.strengths || []).map((s: string) => `<li style="margin-bottom:6px;">${s}</li>`).join("")}
      </ul>
      <h2 style="font-size:16px;font-weight:600;margin:0 0 12px;color:#00E5A0;">Areas for Improvement</h2>
      <ul style="padding-left:20px;margin:0 0 16px;color:#FBBF24;font-size:14px;">
        ${(overall.weaknesses || []).map((w: string) => `<li style="margin-bottom:6px;">${w}</li>`).join("")}
      </ul>
      <h2 style="font-size:16px;font-weight:600;margin:0 0 12px;color:#00E5A0;">Key Points to Improve</h2>
      <ul style="padding-left:20px;margin:0;color:#94A3B8;font-size:14px;line-height:1.5;">
        ${(overall.points_to_improve || []).map((p: string) => `<li style="margin-bottom:6px;">${p}</li>`).join("")}
      </ul>
    </div>
    <div style="text-align:center;padding:16px;color:#64748B;font-size:12px;">
      <p style="margin:0;">Generated by RoleBridge • Career Transition Interview Simulation</p>
      <p style="margin:4px 0 0;">This report is based on AI evaluation and should be used as guidance, not definitive assessment.</p>
    </div>
  </div>
</body>
</html>`;
}

// ── Handler ──

serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  const url = new URL(req.url);
  if (req.method === "GET" || url.searchParams.get("ping") === "1") {
    return jsonResponse({ status: "warm" }, 200);
  }

  const db = getSupabaseClient();

  try {
    // ── Parse optional report_id or session_id from body ──
    let targetReportId: string | null = null;
    let targetSessionId: string | null = null;
    try {
      const body = await req.json();
      if (body?.ping) return jsonResponse({ status: "warm" }, 200);
      targetReportId = body.report_id || null;
      targetSessionId = body.session_id || null;
    } catch {
      // Body may be empty (cron invocation)
    }

    // ── Resolve session_id → report_id (for retry support) ──
    if (!targetReportId && targetSessionId) {
      // Find most recent report for this session
      const { data: existing } = await db
        .from("v2_reports")
        .select("id, status")
        .eq("session_id", targetSessionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (existing) {
        if (existing.status === "failed" || existing.status === "pending") {
          // Reset failed report to pending for retry
          await db.from("v2_reports").update({ status: "pending", error_message: null }).eq("id", existing.id);
          targetReportId = existing.id;
        } else if (existing.status === "processing") {
          return jsonResponse({ status: "already_processing" }, 200);
        } else if (existing.status === "ready") {
          return jsonResponse({ status: "already_ready" }, 200);
        }
      } else {
        // No report exists — look up session owner and create one
        const { data: session } = await db
          .from("sessions")
          .select("v2_user_id")
          .eq("id", targetSessionId)
          .single();

        if (session?.v2_user_id) {
          const { data: newReport } = await db
            .from("v2_reports")
            .insert({ session_id: targetSessionId, user_id: session.v2_user_id, report_json: {}, status: "pending" })
            .select("id")
            .single();
          if (newReport) targetReportId = newReport.id;
        }
      }

      if (!targetReportId) {
        return jsonResponse({ error: "no_report_found", message: "Could not find or create a report for this session." }, 404);
      }
    }

    // ── Step 1: Claim a pending report ──
    let reportRow: Record<string, unknown> | null = null;

    if (targetReportId) {
      // Direct invocation with specific report_id
      const { data, error } = await db
        .from("v2_reports")
        .update({ status: "processing" })
        .eq("id", targetReportId)
        .eq("status", "pending")
        .select("*")
        .single();

      if (error || !data) {
        return jsonResponse({ status: "already_processing" }, 200);
      }
      reportRow = data;
    } else {
      // Cron invocation — claim oldest pending
      const { data: pendingReports } = await db
        .from("v2_reports")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(1);

      if (!pendingReports || pendingReports.length === 0) {
        return jsonResponse({ status: "idle" }, 200);
      }

      const { data, error } = await db
        .from("v2_reports")
        .update({ status: "processing" })
        .eq("id", pendingReports[0].id)
        .eq("status", "pending")
        .select("*")
        .single();

      if (error || !data) {
        return jsonResponse({ status: "idle" }, 200);
      }
      reportRow = data;
    }

    const reportId = reportRow.id as string;
    const sessionId = reportRow.session_id as string;
    const reportUserId = reportRow.user_id as string;

    // ── Step 2: Fetch session data ──
    const { data: session, error: sessionError } = await db
      .from("sessions")
      .select("section_name, section_text, jd_text, transcript, core_questions, email")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      console.error("[v2-report-worker] Session not found:", sessionId);
      await db.from("v2_reports").update({ status: "failed" }).eq("id", reportId);
      return jsonResponse({ error: "session_not_found" }, 404);
    }

    // ── Step 3: Get user's Agnic token ──
    const { data: user, error: userError } = await db
      .from("v2_users")
      .select("*")
      .eq("id", reportUserId)
      .single();

    if (userError || !user?.access_token) {
      console.error("[v2-report-worker] User token not found:", reportUserId);
      await db.from("v2_reports").update({ status: "failed" }).eq("id", reportId);
      return jsonResponse({ error: "user_token_not_found" }, 500);
    }

    // ── Step 4: Generate report via Agnic Gateway ──
    let report: ReportData;
    try {
      const transcript = (session.transcript as Array<Record<string, unknown>>) || [];
      const serialized = serializeTranscript(transcript);

      const v2User = user as V2User;
      let agnicToken = await getFreshAgnicToken(v2User);

      const generate = (token: string) =>
        callAgnicGateway(
          token,
          "report_generation",
          REPORT_SYSTEM,
          buildReportUser(
            (session.jd_text || "").substring(0, REPORT_JD_MAX_CHARS),
            session.section_name || "General",
            (session.section_text || "").substring(0, REPORT_SECTION_TEXT_MAX_CHARS),
            serialized,
          ),
          { maxTokens: REPORT_WORKER_MAX_TOKENS, jsonMode: true },
        );

      let raw: Record<string, unknown>;
      try {
        raw = await generate(agnicToken);
      } catch (err) {
        const llmErr = err as LLMError;
        if (llmErr?.status !== 401 || !v2User.refresh_token) throw err;
        agnicToken = await refreshAgnicToken(v2User);
        raw = await generate(agnicToken);
      }

      const r = raw as Record<string, unknown>;
      if (!r.opening_summary || !r.dimensions || !r.overall_impression) {
        throw new Error("Invalid report structure");
      }

      report = r as unknown as ReportData;
    } catch (err) {
      console.error("[v2-report-worker] Report generation failed:", err);
      await db
        .from("v2_reports")
        .update({ status: "failed", error_message: String(err) })
        .eq("id", reportId);
      return jsonResponse({ error: "report_gen_failed", message: String(err) }, 500);
    }

    // ── Step 5: Store report + mark as ready ──
    // This UPDATE triggers Supabase Realtime (the frontend subscribes to v2_reports changes)
    const { error: storeError } = await db
      .from("v2_reports")
      .update({
        report_json: report,
        status: "ready",
      })
      .eq("id", reportId);

    if (storeError) {
      console.error("[v2-report-worker] Failed to store report:", storeError);
      return jsonResponse({ error: "db_error", message: storeError.message }, 500);
    }

    // ── Step 6: Send email via Resend ──
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const emailAddr = user.email || session.email;

    if (resendKey && emailAddr) {
      try {
        const html = buildReportHTML(report, session.section_name || "General", emailAddr);

        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: Deno.env.get("RESEND_FROM_EMAIL") || RESEND_FROM_EMAIL_DEFAULT,
            to: emailAddr,
            subject: "Your RoleBridge Interview Report",
            html,
          }),
          signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS),
        });

        if (emailRes.ok) {
          await db.from("v2_reports").update({ email_sent: true }).eq("id", reportId);
        } else {
          const errBody = await emailRes.text().catch(() => "unknown");
          console.warn("[v2-report-worker] Email send failed:", emailRes.status, errBody);
        }
      } catch (err) {
        console.warn("[v2-report-worker] Email send error:", err);
        // Non-fatal — report is still in the DB for on-screen display
      }
    } else {
      console.warn("[v2-report-worker] RESEND_API_KEY not set — email skipped");
    }

    return jsonResponse({ status: "processed", report_id: reportId, session_id: sessionId }, 200);
  } catch (err) {
    console.error("[v2-report-worker] Unexpected error:", err);
    return jsonResponse({ error: "internal_error", message: String(err) }, 500);
  }
});
