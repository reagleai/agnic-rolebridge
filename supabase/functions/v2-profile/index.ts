/**
 * GET/PUT/DELETE /v2-profile - Profile CRUD.
 * Block 6 - supabase/functions/v2-profile/index.ts
 *
 * GET    → returns the user's profile (or empty shell if none)
 * PUT    → upserts profile data (insert or update)
 * DELETE → clears all profile fields (keeps the row)
 *
 * Profile is separate from v2_users (which stores auth tokens).
 * One profile per user (enforced by UNIQUE constraint on user_id).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/db.ts";
import { authenticateRequest, authErrorResponse } from "../_shared/v2_auth.ts";

// Allowed profile fields — reject anything else
const ALLOWED_FIELDS = [
  "name",
  "headline",
  "years_exp",
  "current_role",
  "target_role",
  "linkedin_url",
  "resume_text",
  "pdf_name",
  "transition_notes",
];

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Sanitize input: only keep allowed fields, trim strings, enforce max lengths.
 */
function sanitize(body: Record<string, unknown>): Record<string, string | null> {
  const clean: Record<string, string | null> = {};

  for (const key of ALLOWED_FIELDS) {
    if (key in body) {
      const val = body[key];
      if (val === null || val === undefined || val === "") {
        clean[key] = null;
      } else if (typeof val === "string") {
        // Max lengths per field
        const maxLen = key === "resume_text" ? 50_000 : key === "transition_notes" ? 5_000 : 500;
        clean[key] = val.trim().substring(0, maxLen);
      }
      // Silently drop non-string values
    }
  }

  return clean;
}

serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

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

    const db = getSupabaseClient();

    // ═══════════════════════════════════
    // GET — Fetch profile
    // ═══════════════════════════════════
    if (req.method === "GET") {
      const { data: profile, error } = await db
        .from("v2_profiles")
        .select("name, headline, years_exp, current_role, target_role, linkedin_url, resume_text, pdf_name, transition_notes, updated_at")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error("[v2-profile] GET error:", error);
        return jsonResponse({ error: "db_error", message: error.message }, 500);
      }

      if (!profile) {
        // Return empty profile (user hasn't saved one yet)
        return jsonResponse({
          profile: {
            name: null,
            headline: null,
            years_exp: null,
            current_role: null,
            target_role: null,
            linkedin_url: null,
            resume_text: null,
            pdf_name: null,
            transition_notes: null,
          },
          exists: false,
        }, 200);
      }

      return jsonResponse({ profile, exists: true }, 200);
    }

    // ═══════════════════════════════════
    // PUT — Upsert profile
    // ═══════════════════════════════════
    if (req.method === "PUT") {
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "invalid_json" }, 400);
      }

      const cleanData = sanitize(body);

      if (Object.keys(cleanData).length === 0) {
        return jsonResponse({ error: "no_valid_fields" }, 400);
      }

      // Check if profile exists
      const { data: existing } = await db
        .from("v2_profiles")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      if (existing) {
        // Update existing
        const { data: updated, error } = await db
          .from("v2_profiles")
          .update({ ...cleanData, updated_at: new Date().toISOString() })
          .eq("user_id", userId)
          .select("name, headline, years_exp, current_role, target_role, linkedin_url, resume_text, pdf_name, transition_notes, updated_at")
          .single();

        if (error) {
          console.error("[v2-profile] PUT update error:", error);
          return jsonResponse({ error: "db_error", message: error.message }, 500);
        }

        return jsonResponse({ profile: updated, exists: true }, 200);
      } else {
        // Insert new
        const { data: created, error } = await db
          .from("v2_profiles")
          .insert({ user_id: userId, ...cleanData })
          .select("name, headline, years_exp, current_role, target_role, linkedin_url, resume_text, pdf_name, transition_notes, updated_at")
          .single();

        if (error) {
          console.error("[v2-profile] PUT insert error:", error);
          return jsonResponse({ error: "db_error", message: error.message }, 500);
        }

        return jsonResponse({ profile: created, exists: true }, 201);
      }
    }

    // ═══════════════════════════════════
    // DELETE — Clear profile
    // ═══════════════════════════════════
    if (req.method === "DELETE") {
      const { error } = await db
        .from("v2_profiles")
        .delete()
        .eq("user_id", userId);

      if (error) {
        console.error("[v2-profile] DELETE error:", error);
        return jsonResponse({ error: "db_error", message: error.message }, 500);
      }

      return jsonResponse({ status: "cleared" }, 200);
    }

    return jsonResponse({ error: "method_not_allowed" }, 405);
  } catch (err) {
    console.error("[v2-profile] Unexpected error:", err);
    return jsonResponse({ error: "internal_error", message: String(err) }, 500);
  }
});
