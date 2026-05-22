/**
 * GET /v2-balance - Proxy Agnic Balance API.
 * Block 5 - supabase/functions/v2-balance/index.ts
 *
 * Returns the user's Agnic wallet balance by proxying
 * GET https://api.agnic.ai/api/balance with the user's access token.
 *
 * Response shape:
 * {
 *   balance: number,         // totalBalance
 *   creditBalance: number,
 *   usdcBalance: number,
 *   address: string,         // wallet address
 *   network: string          // e.g. "base-sepolia"
 * }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { authenticateRequest, authErrorResponse } from "../_shared/v2_auth.ts";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  if (req.method !== "GET") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  try {
    // ── Authenticate ──
    let agnicToken: string;
    try {
      const auth = await authenticateRequest(req);
      agnicToken = auth.agnicToken;
    } catch (err: unknown) {
      if (err && typeof err === "object" && "status" in err) {
        return authErrorResponse(
          err as { status: number; error: string; message: string },
          corsHeaders,
        );
      }
      throw err;
    }

    // ── Proxy to Agnic Balance API ──
    const agnicRes = await fetch("https://api.agnic.ai/api/balance", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${agnicToken}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!agnicRes.ok) {
      const errText = await agnicRes.text().catch(() => "unknown");
      console.error(`[v2-balance] Agnic API error: ${agnicRes.status} ${errText}`);

      if (agnicRes.status === 401) {
        return jsonResponse({
          error: "agnic_auth_failed",
          message: "Your Agnic session has expired. Please sign in again.",
        }, 401);
      }

      return jsonResponse({
        error: "balance_fetch_failed",
        message: `Agnic API returned ${agnicRes.status}`,
      }, 502);
    }

    const data = await agnicRes.json();

    // ── Normalize response ──
    // Agnic Balance API returns: { totalBalance, creditBalance, usdcBalance, address, network }
    return jsonResponse({
      balance: data.totalBalance ?? data.balance ?? 0,
      creditBalance: data.creditBalance ?? 0,
      usdcBalance: data.usdcBalance ?? 0,
      address: data.address || null,
      network: data.network || "base-sepolia",
    }, 200);
  } catch (err) {
    console.error("[v2-balance] Unexpected error:", err);
    return jsonResponse({ error: "internal_error", message: String(err) }, 500);
  }
});
