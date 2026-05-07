/**
 * POST /sessions — Create a new interview session.
 * Block B — supabase/functions/sessions/index.ts
 */

import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/db.ts";
import { validateEmail } from "../_shared/validation.ts";

Deno.serve(async (req: Request) => {
  // ── CORS preflight ──
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // ── Only POST allowed ──
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "method_not_allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    const email = body?.email;

    // ── Validate email ──
    if (!validateEmail(email)) {
      return new Response(
        JSON.stringify({ error: "invalid_email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Insert session ──
    const db = getSupabaseClient();
    const { data, error } = await db
      .from("sessions")
      .insert({ email })
      .select("id")
      .single();

    if (error) {
      console.error("DB insert error:", error);
      return new Response(
        JSON.stringify({ error: "db_error", message: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ session_id: data.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "db_error", message: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
