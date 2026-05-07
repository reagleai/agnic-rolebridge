/**
 * POST /report-worker — Cron-triggered: claim pending report job, generate, email.
 * Block E — supabase/functions/report-worker/index.ts
 *
 * Flow:
 * 1. Claim oldest pending job (FOR UPDATE SKIP LOCKED)
 * 2. Generate evaluation report via LLM
 * 3. Build HTML email
 * 4. Send via Resend
 * 5. Mark done (or back to pending / failed on error)
 * 6. Cleanup old done/failed rows
 */

import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/db.ts";
import { callLLM } from "../_shared/llm.ts";

// ── Types ──

interface ReportJob {
  id: string;
  session_id: string;
  email: string;
  section_name: string;
  section_text: string;
  jd_text: string;
  transcript: Array<Record<string, unknown>>;
  core_questions: Array<Record<string, unknown>>;
  status: string;
  attempts: number;
}

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

// ── LLM Prompt ──

const REPORT_SYSTEM = `You are generating a detailed, honest interview evaluation report for a career-transition candidate. Use ONLY evidence from the transcript provided. Score each dimension out of 10.

Return ONLY valid JSON with this exact structure:
{
  "opening_summary": "2-3 sentence overview of the candidate's performance",
  "dimensions": {
    "clarity": { "score": 1-10, "why": "explanation", "flag": "pass|soft_flag|hard_flag", "transcript_evidence": "relevant quote" },
    "evidence": { "score": 1-10, "why": "...", "flag": "...", "transcript_evidence": "..." },
    "ownership": { "score": 1-10, "why": "...", "flag": "...", "transcript_evidence": "..." },
    "role_language_transition": { "score": 1-10, "why": "...", "flag": "...", "transcript_evidence": "..." },
    "relevance": { "score": 1-10, "why": "...", "flag": "...", "transcript_evidence": "..." },
    "coherence": { "score": 1-10, "why": "...", "flag": "...", "transcript_evidence": "..." }
  },
  "overall_impression": {
    "score": 1-10,
    "strengths": ["strength 1", "strength 2"],
    "weaknesses": ["weakness 1"],
    "points_to_improve": ["improvement 1", "improvement 2"]
  }
}`;

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

function renderDimension(label: string, d: DimensionScore): string {
  const flagColor = d.flag === "pass" ? "#34d399" : d.flag === "soft_flag" ? "#fbbf24" : "#f87171";
  const flagLabel = d.flag === "pass" ? "Pass" : d.flag === "soft_flag" ? "Needs Work" : "Critical";
  return `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #2a2a3a;font-weight:600;color:#e8e8ef;width:200px;">
        ${label}
        <br><span style="font-size:12px;font-weight:400;color:${flagColor};">● ${flagLabel}</span>
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #2a2a3a;text-align:center;font-size:20px;font-weight:700;color:#6366f1;width:80px;">
        ${d.score}/10
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #2a2a3a;color:#8888a0;">
        ${d.why}
        ${d.transcript_evidence ? `<br><span style="display:inline-block;margin-top:6px;padding:4px 8px;background:#1a1a26;border-left:3px solid #6366f1;font-style:italic;font-size:13px;color:#8888a0;">"${d.transcript_evidence}"</span>` : ""}
      </td>
    </tr>`;
}

function buildReportHTML(report: ReportData, job: ReportJob): string {
  const dims = report.dimensions;
  const overall = report.overall_impression;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e8e8ef;">
  <div style="max-width:640px;margin:0 auto;padding:32px 16px;">

    <!-- Header -->
    <div style="text-align:center;margin-bottom:32px;">
      <div style="display:inline-block;background:linear-gradient(135deg,#6366f1,#22d3ee);color:#fff;font-size:12px;font-weight:600;padding:4px 12px;border-radius:100px;text-transform:uppercase;letter-spacing:0.05em;">Interview Report</div>
      <h1 style="font-size:24px;font-weight:700;margin:12px 0 4px;color:#e8e8ef;">RoleBridge Evaluation</h1>
      <p style="color:#8888a0;font-size:14px;margin:0;">Section: ${job.section_name || "General"}</p>
    </div>

    <!-- Summary -->
    <div style="background:#12121a;border:1px solid #2a2a3a;border-radius:12px;padding:20px;margin-bottom:24px;">
      <h2 style="font-size:16px;font-weight:600;margin:0 0 8px;color:#22d3ee;">Summary</h2>
      <p style="color:#8888a0;font-size:14px;line-height:1.6;margin:0;">${report.opening_summary}</p>
    </div>

    <!-- Overall Score -->
    <div style="background:#12121a;border:1px solid #2a2a3a;border-radius:12px;padding:20px;margin-bottom:24px;text-align:center;">
      <div style="font-size:48px;font-weight:700;color:#6366f1;">${overall.score}/10</div>
      <p style="color:#8888a0;font-size:14px;margin:4px 0 0;">Overall Score</p>
    </div>

    <!-- Dimensions -->
    <div style="background:#12121a;border:1px solid #2a2a3a;border-radius:12px;overflow:hidden;margin-bottom:24px;">
      <div style="padding:16px 16px 8px;"><h2 style="font-size:16px;font-weight:600;margin:0;color:#22d3ee;">Dimension Scores</h2></div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        ${renderDimension("Clarity", dims.clarity)}
        ${renderDimension("Evidence", dims.evidence)}
        ${renderDimension("Ownership", dims.ownership)}
        ${renderDimension("Role Language", dims.role_language_transition)}
        ${renderDimension("Relevance", dims.relevance)}
        ${renderDimension("Coherence", dims.coherence)}
      </table>
    </div>

    <!-- Strengths & Weaknesses -->
    <div style="background:#12121a;border:1px solid #2a2a3a;border-radius:12px;padding:20px;margin-bottom:24px;">
      <h2 style="font-size:16px;font-weight:600;margin:0 0 12px;color:#22d3ee;">Strengths</h2>
      <ul style="padding-left:20px;margin:0 0 16px;color:#34d399;font-size:14px;">
        ${(overall.strengths || []).map((s: string) => `<li style="margin-bottom:4px;">${s}</li>`).join("")}
      </ul>
      <h2 style="font-size:16px;font-weight:600;margin:0 0 12px;color:#22d3ee;">Areas for Improvement</h2>
      <ul style="padding-left:20px;margin:0 0 16px;color:#fbbf24;font-size:14px;">
        ${(overall.weaknesses || []).map((w: string) => `<li style="margin-bottom:4px;">${w}</li>`).join("")}
      </ul>
      <h2 style="font-size:16px;font-weight:600;margin:0 0 12px;color:#22d3ee;">Key Points to Improve</h2>
      <ul style="padding-left:20px;margin:0;color:#8888a0;font-size:14px;">
        ${(overall.points_to_improve || []).map((p: string) => `<li style="margin-bottom:4px;">${p}</li>`).join("")}
      </ul>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:16px;color:#8888a0;font-size:12px;">
      <p style="margin:0;">Generated by RoleBridge • AI Interview Simulator</p>
      <p style="margin:4px 0 0;">This report is based on AI evaluation and should be used as guidance, not definitive assessment.</p>
    </div>
  </div>
</body>
</html>`;
}

// ── Handler ──

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const db = getSupabaseClient();

  try {
    // ── Step 1: Claim oldest pending job ──
    // supabase-js doesn't support FOR UPDATE SKIP LOCKED directly,
    // so we use a two-step claim: fetch oldest pending, then update with status guard
    const { data: pendingJobs, error: fetchError } = await db
      .from("report_queue")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1);

    if (fetchError) {
      console.error("Failed to fetch pending jobs:", fetchError);
      return jsonResponse({ error: "db_error", message: fetchError.message }, 500);
    }

    if (!pendingJobs || pendingJobs.length === 0) {
      // ── Cleanup before returning idle ──
      await runCleanup(db);
      return jsonResponse({ status: "idle" }, 200);
    }

    const jobId = pendingJobs[0].id;

    // Atomic claim: update only if still pending (race-safe)
    const { data: claimed, error: claimError } = await db
      .from("report_queue")
      .update({ status: "processing", attempts: pendingJobs[0].attempts + 1 })
      .eq("id", jobId)
      .eq("status", "pending")
      .select("*")
      .single();

    if (claimError || !claimed) {
      // Another worker claimed it — try cleanup and return idle
      await runCleanup(db);
      return jsonResponse({ status: "idle" }, 200);
    }

    const job = claimed as ReportJob;

    // ── Step 2: Generate report ──
    let report: ReportData;
    try {
      const transcript = job.transcript || [];
      const serialized = serializeTranscript(transcript);

      const userPrompt = `Target JD:\n---\n${(job.jd_text || "").substring(0, 1000)}\n---\nResume section (${job.section_name || "General"}):\n---\n${(job.section_text || "").substring(0, 2000)}\n---\nFull Interview Transcript:\n${serialized}`;

      const raw = await callLLM("report_generation", REPORT_SYSTEM, userPrompt);

      // Validate report structure
      const r = raw as Record<string, unknown>;
      if (!r.opening_summary || !r.dimensions || !r.overall_impression) {
        throw new Error("Invalid report structure");
      }

      report = r as unknown as ReportData;
    } catch (err) {
      console.error("Report generation failed:", err);
      await markJobStatus(db, job.id, job.attempts);
      return jsonResponse({ error: "report_gen_failed", message: String(err) }, 500);
    }

    // ── Step 3: Build HTML email ──
    const html = buildReportHTML(report, job);

    // ── Step 4: Send email via Resend ──
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      console.error("Missing RESEND_API_KEY — skipping email send");
      // Still mark as done to avoid infinite retries in dev
      await db
        .from("report_queue")
        .update({ status: "done" })
        .eq("id", job.id);
      await runCleanup(db);
      return jsonResponse({
        status: "processed",
        session_id: job.session_id,
        warning: "RESEND_API_KEY not set — email not sent",
      }, 200);
    }

    try {
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: Deno.env.get("RESEND_FROM_EMAIL") || "RoleBridge <reports@protonaiagents.com>",
          to: job.email,
          subject: "Your RoleBridge Interview Report",
          html,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!emailRes.ok) {
        const errBody = await emailRes.text().catch(() => "unknown");
        throw new Error(`Resend ${emailRes.status}: ${errBody}`);
      }
    } catch (err) {
      console.error("Email send failed:", err);
      await markJobStatus(db, job.id, job.attempts);
      return jsonResponse({ error: "email_failed", message: String(err) }, 500);
    }

    // ── Step 5: Mark done ──
    await db
      .from("report_queue")
      .update({ status: "done" })
      .eq("id", job.id);

    // ── Step 6: Cleanup ──
    await runCleanup(db);

    return jsonResponse({ status: "processed", session_id: job.session_id }, 200);
  } catch (err) {
    console.error("Unexpected error in report-worker:", err);
    return jsonResponse({ error: "db_error", message: String(err) }, 500);
  }
});

// ── Retry/failure logic ──

async function markJobStatus(
  db: ReturnType<typeof getSupabaseClient>,
  jobId: string,
  attempts: number
): Promise<void> {
  const newStatus = attempts >= 3 ? "failed" : "pending";
  await db
    .from("report_queue")
    .update({ status: newStatus })
    .eq("id", jobId);
}

// ── Cleanup old rows ──

async function runCleanup(db: ReturnType<typeof getSupabaseClient>): Promise<void> {
  try {
    // Delete done rows older than 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await db
      .from("report_queue")
      .delete()
      .eq("status", "done")
      .lt("created_at", oneHourAgo);

    // Delete failed rows older than 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await db
      .from("report_queue")
      .delete()
      .eq("status", "failed")
      .lt("created_at", oneDayAgo);
  } catch (err) {
    console.error("Cleanup error (non-fatal):", err);
  }
}
