/**
 * V2 Authentication middleware for Supabase Edge Functions.
 * Block 0 - _shared/v2_auth.ts
 *
 * Validates inbound requests against the v2_users table using
 * the RoleBridge session token (x-rb-session header or cookie).
 *
 * The Agnic access_token is NEVER sent to the frontend - only
 * the rb_session_token travels between browser and Edge Function.
 * This module resolves it to the full user record + Agnic token
 * so downstream functions can make Agnic Gateway calls.
 */

import { getSupabaseClient } from "./db.ts";
import {
  TOKEN_EXPIRY_BUFFER_MS,
  TOKEN_REFRESH_TIMEOUT_MS,
  AGNIC_TOKEN_ENDPOINT,
} from "./v2_config.ts";

// ── Types ──

export interface V2User {
  id: string;
  agnic_user_id: string | null;
  email: string;
  display_name: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  token_scope: string | null;
  session_count: number;
  rb_session_token: string;
}

export interface AuthResult {
  user: V2User;
  agnicToken: string;
}

export interface AuthError {
  status: number;
  error: string;
  message: string;
}

// ── Helpers ──

/**
 * Extract the RoleBridge session token from the request.
 * Checks (in order):
 *   1. `x-rb-session` header
 *   2. `rb_session` cookie
 *
 * Returns null if no token found.
 */
function extractSessionToken(req: Request): string | null {
  // 1. Header
  const header = req.headers.get("x-rb-session");
  if (header && header.trim()) return header.trim();

  // 2. Cookie
  const cookieHeader = req.headers.get("cookie");
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)rb_session=([^\s;]+)/);
    if (match?.[1]) return match[1];
  }

  return null;
}

/**
 * Check if the user's Agnic access token is expired or about to expire.
 * Returns true if the token expires within the next 5 minutes.
 */
export function isTokenExpired(user: V2User): boolean {
  if (!user.token_expires_at) return false; // no expiry known - assume valid
  const expiresAt = new Date(user.token_expires_at).getTime();
  const buffer = TOKEN_EXPIRY_BUFFER_MS;
  return Date.now() >= expiresAt - buffer;
}

/**
 * Attempt to refresh the user's Agnic access token using the refresh_token.
 * Updates the v2_users row in-place.
 *
 * Returns the new access_token on success, or throws on failure.
 */
export async function refreshAgnicToken(user: V2User): Promise<string> {
  if (!user.refresh_token) {
    throw {
      status: 401,
      error: "token_expired",
      message: "Agnic token expired and no refresh token available. Please sign in again.",
    } as AuthError;
  }

  const clientId = Deno.env.get("AGNIC_CLIENT_ID");
  const clientSecret = Deno.env.get("AGNIC_CLIENT_SECRET");
  if (!clientId) {
    throw {
      status: 500,
      error: "config_error",
      message: "Missing AGNIC_CLIENT_ID environment variable.",
    } as AuthError;
  }

  const body: Record<string, string> = {
    grant_type: "refresh_token",
    refresh_token: user.refresh_token,
    client_id: clientId,
  };
  // Confidential client includes client_secret
  if (clientSecret) {
    body.client_secret = clientSecret;
  }

  const res = await fetch(AGNIC_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TOKEN_REFRESH_TIMEOUT_MS),
  });

  if (!res.ok) {
    // If refresh fails (expired, revoked, user disconnected), force re-auth.
    throw {
      status: 401,
      error: "refresh_failed",
      message: "Failed to refresh Agnic token. Please sign in again.",
    } as AuthError;
  }

  const tokens = await res.json();
  const newAccessToken: string = tokens.access_token;
  const newRefreshToken: string | undefined = tokens.refresh_token;
  const expiresIn: number | undefined = tokens.expires_in;

  // Calculate new expiry
  const tokenExpiresAt = expiresIn
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : null;

  // Update DB
  const db = getSupabaseClient();
  const { error: updateError } = await db
    .from("v2_users")
    .update({
      access_token: newAccessToken,
      refresh_token: newRefreshToken ?? user.refresh_token,
      token_expires_at: tokenExpiresAt,
      token_scope: tokens.scope ?? user.token_scope,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (updateError) {
    console.error("Failed to persist refreshed token:", updateError);
    // Non-fatal: the new token still works for this request
  }

  return newAccessToken;
}

export async function getFreshAgnicToken(user: V2User): Promise<string> {
  if (!isTokenExpired(user)) return user.access_token;
  return refreshAgnicToken(user);
}

// ── Main authentication function ──

/**
 * Authenticate an inbound Edge Function request.
 *
 * 1. Extracts the RoleBridge session token from headers/cookies
 * 2. Looks up the user in v2_users by rb_session_token
 * 3. Checks if the Agnic token is expired → refreshes if needed
 * 4. Returns { user, agnicToken } for downstream use
 *
 * Throws a structured AuthError on failure.
 */
export async function authenticateRequest(req: Request): Promise<AuthResult> {
  const token = extractSessionToken(req);

  if (!token) {
    throw {
      status: 401,
      error: "missing_session",
      message: "No RoleBridge session token found. Please sign in.",
    } as AuthError;
  }

  const db = getSupabaseClient();
  const { data: user, error } = await db
    .from("v2_users")
    .select("*")
    .eq("rb_session_token", token)
    .single();

  if (error || !user) {
    throw {
      status: 401,
      error: "invalid_session",
      message: "Session not found or expired. Please sign in again.",
    } as AuthError;
  }

  // Cast to typed interface
  const v2User = user as V2User;

  // Check token expiry and refresh if needed
  let agnicToken = v2User.access_token;
  agnicToken = await getFreshAgnicToken(v2User);

  return { user: v2User, agnicToken };
}

/**
 * Helper: create a JSON error response from an AuthError.
 * Use this in Edge Function catch blocks.
 */
export function authErrorResponse(
  err: AuthError,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(
    JSON.stringify({ error: err.error, message: err.message }),
    {
      status: err.status,
      headers: {
        "Content-Type": "application/json",
        ...extraHeaders,
      },
    },
  );
}
