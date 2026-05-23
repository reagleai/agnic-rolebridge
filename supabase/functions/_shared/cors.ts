/**
 * CORS headers helper for Supabase Edge Functions.
/**
 * CORS headers helper for Supabase Edge Functions.
 * Block A - _shared/cors.ts
 *
 * Updated for V2: added x-rb-session header (RoleBridge session token)
 * and DELETE method (for profile management).
 */

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Vary": "Origin",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-rb-session",
  "Access-Control-Allow-Methods": "POST, GET, PUT, DELETE, OPTIONS",
};

export function getCorsHeaders(req?: Request): Record<string, string> {
  return corsHeaders;
}

/**
 * Handle CORS preflight (OPTIONS) requests.
 * Returns a 200 Response for OPTIONS, or null for real requests.
 */
export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }
  return null;
}
