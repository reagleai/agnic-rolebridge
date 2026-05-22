/**
 * CORS headers helper for Supabase Edge Functions.
 * Block A - _shared/cors.ts
 *
 * Updated for V2: added x-rb-session header (RoleBridge session token)
 * and DELETE method (for profile management).
 */

const DEFAULT_FRONTEND_ORIGIN =
  Deno.env.get("VITE_FRONTEND_URL") ||
  Deno.env.get("FRONTEND_URL") ||
  "https://rolebridge-git-agnic-reagleai.vercel.app";

const EXTRA_ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_CORS_ORIGINS") || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function isAllowedOrigin(origin: string | null): origin is string {
  if (!origin) return false;
  if (origin === DEFAULT_FRONTEND_ORIGIN || EXTRA_ALLOWED_ORIGINS.includes(origin)) {
    return true;
  }

  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    const isVercelPreview = host === "vercel.app" || host.endsWith(".vercel.app");
    const isLocalDev = host === "localhost" || host === "127.0.0.1";

    return (url.protocol === "https:" && isVercelPreview) ||
      (url.protocol === "http:" && isLocalDev);
  } catch {
    return false;
  }
}

export function getCorsHeaders(req?: Request): Record<string, string> {
  const requestOrigin = req?.headers.get("origin") || null;
  const allowedOrigin = isAllowedOrigin(requestOrigin)
    ? requestOrigin
    : DEFAULT_FRONTEND_ORIGIN;

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-rb-session",
    "Access-Control-Allow-Methods": "POST, GET, PUT, DELETE, OPTIONS",
  };
}

export const corsHeaders: Record<string, string> = getCorsHeaders();

/**
 * Handle CORS preflight (OPTIONS) requests.
 * Returns a 200 Response for OPTIONS, or null for real requests.
 */
export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req), status: 200 });
  }
  return null;
}
