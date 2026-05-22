/**
 * POST /v2-sessions - Create a new V2 interview session.
 * Block 2 - supabase/functions/v2-sessions/index.ts
 *
 * Creates a row in the `sessions` table linked to the authenticated
 * v2_user via the `v2_user_id` FK. No email argument needed — the
 * email is read from the user record.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/db.ts";
import {
  authenticateRequest,
  authErrorResponse,
} from "../_shared/v2_auth.ts";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  try {
    // ── Authenticate ──
    let user;
    try {
      const auth = await authenticateRequest(req);
      user = auth.user;
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

    const { count: createdCount, error: countError } = await db
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("v2_user_id", user.id);

    if (countError) {
      console.error("v2-sessions: session count check error:", countError);
      return jsonResponse({ error: "db_error", message: countError.message }, 500);
    }

    if ((createdCount || 0) >= 50) {
      return jsonResponse({
        error: "session_limit_reached",
        message: "You have reached the 50-session limit for this account.",
      }, 429);
    }

    // ── Create session linked to V2 user ──
    const { data, error } = await db
      .from("sessions")
      .insert({
        email: user.email,
        v2_user_id: user.id,
      })
      .select("id, status, expires_at")
      .single();

    if (error) {
      console.error("v2-sessions: DB insert error:", error);
      return jsonResponse({ error: "db_error", message: error.message }, 500);
    }

    return jsonResponse(
      {
        session_id: data.id,
        status: data.status,
        expires_at: data.expires_at,
      },
      200,
    );
  } catch (err) {
    console.error("v2-sessions: unexpected error:", err);
    return jsonResponse({ error: "internal_error", message: String(err) }, 500);
  }
});
