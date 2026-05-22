/**
 * V2 Auth Callback — Agnic OAuth Code Exchange
 * Block 1 - supabase/functions/v2-auth-callback/index.ts
 *
 * Flow:
 *   1. Frontend redirects user to Agnic /oauth/authorize
 *   2. User authorizes → Agnic redirects to frontend /auth/callback?code=...&state=...
 *   3. Frontend calls this Edge Function with the auth code
 *   4. This function exchanges the code for tokens with Agnic
 *   5. Upserts a v2_users row (or updates tokens for returning user)
 *   6. Generates a rb_session_token and returns it to the frontend
 *
 * The Agnic access_token is NEVER returned to the frontend.
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
    const body = await req.json();
    const { code, redirect_uri, mode } = body;

    if (!code || typeof code !== "string") {
      return new Response(
        JSON.stringify({ error: "missing_code", message: "Authorization code is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!redirect_uri || typeof redirect_uri !== "string") {
      return new Response(
        JSON.stringify({ error: "missing_redirect_uri", message: "Redirect URI is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Exchange code for tokens with Agnic ──
    const clientId = Deno.env.get("AGNIC_CLIENT_ID");
    const clientSecret = Deno.env.get("AGNIC_CLIENT_SECRET");

    if (!clientId || !clientSecret) {
      console.error("Missing AGNIC_CLIENT_ID or AGNIC_CLIENT_SECRET");
      return new Response(
        JSON.stringify({ error: "config_error", message: "Server configuration error." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const tokenRes = await fetch("https://api.agnic.ai/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error("Agnic token exchange failed:", tokenRes.status, errBody);
      return new Response(
        JSON.stringify({
          error: "token_exchange_failed",
          message: "Failed to exchange authorization code. Please try signing in again.",
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const tokens = await tokenRes.json();
    console.log("[v2-auth-callback] Token response keys:", Object.keys(tokens));
    console.log("[v2-auth-callback] Token response (redacted):", JSON.stringify({
      ...tokens,
      access_token: tokens.access_token ? tokens.access_token.substring(0, 20) + "..." : undefined,
      refresh_token: tokens.refresh_token ? "[REDACTED]" : undefined,
    }));

    const accessToken: string = tokens.access_token;
    const refreshToken: string | undefined = tokens.refresh_token;
    const expiresIn: number | undefined = tokens.expires_in;
    const scope: string | undefined = tokens.scope;

    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: "no_access_token", message: "Agnic did not return an access token." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Extract user info from multiple sources ──
    let agnicEmail = "";
    let agnicUserId = "";
    let balanceValue: number | null = null;

    // Source 1: Check if the token response itself contains email/user info
    if (tokens.email) agnicEmail = tokens.email;
    if (tokens.user_id) agnicUserId = tokens.user_id;
    if (tokens.userId) agnicUserId = tokens.userId;

    // Source 2: Try to decode JWT access token (if it's a JWT)
    if (!agnicEmail && accessToken.includes(".")) {
      try {
        const parts = accessToken.split(".");
        if (parts.length === 3) {
          // Decode the payload (second part)
          const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
          console.log("[v2-auth-callback] JWT payload keys:", Object.keys(payload));
          if (payload.email) agnicEmail = payload.email;
          if (payload.sub) agnicUserId = payload.sub;
          if (payload.user_id) agnicUserId = payload.user_id;
        }
      } catch (e) {
        console.warn("[v2-auth-callback] Token is not a decodable JWT:", e);
      }
    }

    // Source 3: Try Agnic /api/me endpoint (common convention)
    if (!agnicEmail) {
      try {
        const meRes = await fetch("https://api.agnic.ai/api/me", {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(10_000),
        });
        console.log("[v2-auth-callback] /api/me status:", meRes.status);
        if (meRes.ok) {
          const meData = await meRes.json();
          console.log("[v2-auth-callback] /api/me keys:", Object.keys(meData));
          agnicEmail = meData.email || meData.userEmail || "";
          agnicUserId = agnicUserId || meData.user_id || meData.userId || meData.id || "";
        }
      } catch (e) {
        console.warn("[v2-auth-callback] /api/me failed:", e);
      }
    }

    // Source 4: Try standard OpenID Connect /userinfo
    if (!agnicEmail) {
      try {
        const userinfoRes = await fetch("https://api.agnic.ai/userinfo", {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(10_000),
        });
        console.log("[v2-auth-callback] /userinfo status:", userinfoRes.status);
        if (userinfoRes.ok) {
          const userinfoData = await userinfoRes.json();
          console.log("[v2-auth-callback] /userinfo keys:", Object.keys(userinfoData));
          agnicEmail = userinfoData.email || "";
          agnicUserId = agnicUserId || userinfoData.sub || userinfoData.user_id || "";
        }
      } catch (e) {
        console.warn("[v2-auth-callback] /userinfo failed:", e);
      }
    }

    // Source 5: Try the balance endpoint (original approach)
    if (!agnicEmail) {
      try {
        const balanceRes = await fetch("https://api.agnic.ai/api/balance", {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(10_000),
        });
        console.log("[v2-auth-callback] /api/balance status:", balanceRes.status);
        if (balanceRes.ok) {
          const balanceData = await balanceRes.json();
          console.log("[v2-auth-callback] /api/balance keys:", Object.keys(balanceData));
          agnicEmail = balanceData.email || "";
          agnicUserId = agnicUserId || balanceData.user_id || balanceData.userId || "";
          balanceValue = balanceData.balance ?? balanceData.totalBalance ?? null;
        }
      } catch (e) {
        console.warn("[v2-auth-callback] /api/balance failed:", e);
      }
    } else {
      // Still fetch balance even if we already have email
      try {
        const balanceRes = await fetch("https://api.agnic.ai/api/balance", {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(10_000),
        });
        if (balanceRes.ok) {
          const balanceData = await balanceRes.json();
          balanceValue = balanceData.balance ?? balanceData.totalBalance ?? null;
        }
      } catch {
        // Non-fatal
      }
    }

    // Source 6: Use email from request body (frontend may have it from Agnic redirect)
    if (!agnicEmail) {
      agnicEmail = body.email || "";
    }

    if (!agnicEmail) {
      console.error("[v2-auth-callback] Could not determine email from any source.");
      return new Response(
        JSON.stringify({
          error: "no_email",
          message: "Could not determine user email. Please try again.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("[v2-auth-callback] Resolved email:", agnicEmail, "userId:", agnicUserId);

    // ── Generate RoleBridge session token ──
    const rbSessionToken = crypto.randomUUID() + "-" + crypto.randomUUID();

    // ── Calculate token expiry ──
    const tokenExpiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;

    // ── Upsert user in v2_users ──
    const db = getSupabaseClient();
    const now = new Date().toISOString();

    // Check if user exists by email
    const { data: existingUser } = await db
      .from("v2_users")
      .select("id, session_count")
      .eq("email", agnicEmail)
      .single();

    let userId: string;
    let sessionCount: number;
    let isNewUser = false;

    if (existingUser) {
      // Update existing user with new tokens
      userId = existingUser.id;
      sessionCount = existingUser.session_count;

      const { error: updateError } = await db
        .from("v2_users")
        .update({
          access_token: accessToken,
          refresh_token: refreshToken || null,
          token_expires_at: tokenExpiresAt,
          token_scope: scope || null,
          rb_session_token: rbSessionToken,
          agnic_user_id: agnicUserId || undefined,
          last_login_at: now,
          updated_at: now,
        })
        .eq("id", userId);

      if (updateError) {
        console.error("Failed to update user:", updateError);
        return new Response(
          JSON.stringify({ error: "db_error", message: "Failed to update user record." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    } else {
      // Create new user
      isNewUser = true;
      sessionCount = 0;

      const { data: newUser, error: insertError } = await db
        .from("v2_users")
        .insert({
          agnic_user_id: agnicUserId || null,
          email: agnicEmail,
          access_token: accessToken,
          refresh_token: refreshToken || null,
          token_expires_at: tokenExpiresAt,
          token_scope: scope || null,
          rb_session_token: rbSessionToken,
          session_count: 0,
          last_login_at: now,
          created_at: now,
          updated_at: now,
        })
        .select("id")
        .single();

      if (insertError || !newUser) {
        console.error("Failed to create user:", insertError);
        return new Response(
          JSON.stringify({ error: "db_error", message: "Failed to create user record." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      userId = newUser.id;
    }

    // ── Return session info to frontend ──
    // The rb_session_token is what the frontend stores and sends on subsequent requests.
    // The Agnic access_token is NEVER returned here.
    return new Response(
      JSON.stringify({
        rb_session_token: rbSessionToken,
        user: {
          id: userId,
          email: agnicEmail,
          display_name: null,
          session_count: sessionCount,
          is_new_user: isNewUser,
        },
        balance: balanceValue,
        mode: mode || "signin",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("v2-auth-callback error:", err);
    return new Response(
      JSON.stringify({ error: "internal_error", message: "Authentication failed. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
