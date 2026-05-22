/**
 * V2 Auth Logout — Clear session
 * Block 1 - supabase/functions/v2-auth-logout/index.ts
 *
 * Invalidates the RoleBridge session token in the database.
 * The Agnic access_token is NOT revoked — the user stays logged into
 * Agnic and can re-authorize RoleBridge at any time.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/db.ts";

serve(async (req) => {
  // CORS preflight
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "method_not_allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    // Extract session token from header or cookie
    const sessionToken =
      req.headers.get("x-rb-session")?.trim() ||
      req.headers.get("cookie")?.match(/(?:^|;\s*)rb_session=([^\s;]+)/)?.[1] ||
      null;

    if (!sessionToken) {
      // Already logged out — no-op, return success
      return new Response(
        JSON.stringify({ ok: true, message: "Already signed out." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Invalidate the session token by setting it to null
    const db = getSupabaseClient();
    const { error } = await db
      .from("v2_users")
      .update({
        rb_session_token: null,
        updated_at: new Date().toISOString(),
      })
      .eq("rb_session_token", sessionToken);

    if (error) {
      console.error("Logout DB error:", error);
      // Non-fatal: the frontend will clear its local storage anyway
    }

    return new Response(
      JSON.stringify({ ok: true, message: "Signed out successfully." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("v2-auth-logout error:", err);
    return new Response(
      JSON.stringify({ ok: true, message: "Signed out." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
