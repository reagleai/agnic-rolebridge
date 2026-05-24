/**
 * V2 Auth Me — Return current user info
 * Block 1 - supabase/functions/v2-auth-me/index.ts
 *
 * Called by the frontend on app load and after route changes to check
 * if the user is authenticated and to get their current info.
 *
 * Returns: { user: { id, email, display_name, session_count }, balance }
 * or 401 if not authenticated.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { authenticateRequest, authErrorResponse } from "../_shared/v2_auth.ts";
import {
  AGNIC_BALANCE_ENDPOINT,
  AUTH_ME_BALANCE_TIMEOUT_MS,
} from "../_shared/v2_config.ts";

serve(async (req) => {
  // CORS preflight
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "method_not_allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    // Authenticate using rb_session_token
    const { user, agnicToken } = await authenticateRequest(req);

    // Optionally fetch live balance from Agnic
    let balanceValue: number | null = null;
    try {
      const balanceRes = await fetch(AGNIC_BALANCE_ENDPOINT, {
        headers: { Authorization: `Bearer ${agnicToken}` },
        signal: AbortSignal.timeout(AUTH_ME_BALANCE_TIMEOUT_MS),
      });
      if (balanceRes.ok) {
        const balanceData = await balanceRes.json();
        balanceValue = balanceData.balance ?? balanceData.totalBalance ?? null;
      }
    } catch (e) {
      console.warn("Failed to fetch balance in auth-me:", e);
      // Non-fatal: return user info without balance
    }

    return new Response(
      JSON.stringify({
        user: {
          id: user.id,
          email: user.email,
          display_name: user.display_name,
          session_count: user.session_count,
        },
        balance: balanceValue,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: unknown) {
    // AuthError from authenticateRequest
    if (err && typeof err === "object" && "status" in err && "error" in err) {
      return authErrorResponse(
        err as { status: number; error: string; message: string },
        corsHeaders,
      );
    }
    console.error("v2-auth-me error:", err);
    return new Response(
      JSON.stringify({ error: "internal_error", message: "Failed to get user info." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
