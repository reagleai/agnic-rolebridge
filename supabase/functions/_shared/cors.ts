/**
 * CORS headers helper for Supabase Edge Functions.
 * Block A - _shared/cors.ts
 */

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

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
