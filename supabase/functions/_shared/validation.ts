/**
 * Shared validation utilities for Edge Functions.
 * Block A - _shared/validation.ts
 */

// ── UUID v4 pattern ──
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Extract and validate a session UUID from the request URL.
 * Expects the UUID as the last path segment matching UUID v4 format,
 * or as the segment immediately after "sessions" in the path.
 *
 * Throws a structured error { status: 404, error: "session_not_found" }
 * if the UUID is missing or invalid.
 */
export function extractSessionId(url: string): string {
  const pathname = new URL(url).pathname;
  const segments = pathname.split("/").filter(Boolean);

  // Walk segments to find one after "sessions" or the first valid UUID
  let candidate: string | null = null;

  for (let i = 0; i < segments.length; i++) {
    // Prefer the segment right after "sessions"
    if (
      segments[i].toLowerCase() === "sessions" &&
      i + 1 < segments.length
    ) {
      candidate = segments[i + 1];
      break;
    }
  }

  // Fallback: try the last segment
  if (!candidate) {
    candidate = segments[segments.length - 1] ?? null;
  }

  if (!candidate || !UUID_RE.test(candidate)) {
    throw { status: 404, error: "session_not_found" };
  }

  return candidate;
}

// ── Email validation (simplified RFC 5322) ──
const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/**
 * Validate an email address against a simplified RFC 5322 regex.
 */
export function validateEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  return EMAIL_RE.test(email);
}

// ── Section name normalization ──

const SECTION_MAP: Record<string, string> = {
  // Work Experience variants
  "work experience": "Work Experience",
  experience: "Work Experience",
  "professional experience": "Work Experience",
  "work history": "Work Experience",
  employment: "Work Experience",
  "employment history": "Work Experience",
  "career history": "Work Experience",
  "professional background": "Work Experience",
  history: "Work Experience",
  
  // Projects variants
  projects: "Projects",
  "personal projects": "Projects",
  "side projects": "Projects",
  "academic projects": "Projects",
  "key projects": "Projects",
  "selected projects": "Projects",
  "other projects": "Projects",
  
  // Skills variants
  skills: "Skills",
  "technical skills": "Skills",
  "core competencies": "Skills",
  technologies: "Skills",
  "tools & technologies": "Skills",
  "tools and technologies": "Skills",
  expertise: "Skills",
  competencies: "Skills",
};

/**
 * Validate and normalize a section name against the allowed whitelist.
 * Case-insensitive. Returns canonical name or { valid: false }.
 */
export function validateSectionName(
  name: string
): { valid: boolean; canonical: string | null } {
  if (!name || typeof name !== "string") {
    return { valid: false, canonical: null };
  }
  const key = name.trim().toLowerCase();
  const canonical = SECTION_MAP[key] ?? null;
  return { valid: canonical !== null, canonical };
}
