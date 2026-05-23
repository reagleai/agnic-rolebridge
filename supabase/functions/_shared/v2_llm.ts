/**
 * V2 LLM adapter — Agnic AI Gateway.
 * Block 0 - _shared/v2_llm.ts
 *
 * Replaces the V1 OpenRouter adapter (_shared/llm.ts) with Agnic's
 * OpenAI-compatible Gateway. Key difference: V2 uses the user's own
 * Agnic OAuth token (per-user billing) instead of a single server key.
 *
 * API endpoint: https://api.agnic.ai/v1/chat/completions
 * Auth: Bearer <user's agnic access_token>
 * Attribution: X-Partner-Id header for commission accrual
 */

// ── Default model — single model for all tasks (Pay-As-You-Go) ──

const DEFAULT_MODEL = "google/gemini-3-flash-preview";

// Allow per-task overrides via env vars (same pattern as V1)
const ENV_KEY_MAP: Record<string, string> = {
  section_extraction: "V2_LLM_MODEL_SECTION_EXTRACTION",
  question_generation: "V2_LLM_MODEL_QUESTION_GENERATION",
  answer_evaluation: "V2_LLM_MODEL_ANSWER_EVALUATION",
  report_generation: "V2_LLM_MODEL_REPORT_GENERATION",
};

function getModelForTask(task: string): string {
  const envKey = ENV_KEY_MAP[task];
  if (envKey) {
    const envVal = Deno.env.get(envKey);
    if (envVal) return envVal;
  }
  return DEFAULT_MODEL;
}

// ── Helpers ──

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Types ──

export interface LLMCallOptions {
  /** Temperature override (default: 0.3 for tasks, 0.4 for reports) */
  temperature?: number;
  /** Max tokens override (default: 2048 for tasks, 3000 for reports) */
  maxTokens?: number;
  /** Request JSON output format. Some models don't support response_format. */
  jsonMode?: boolean;
}

export interface LLMError {
  status: number;
  error: string;
  message: string;
}

// ── Main LLM call wrapper ──

const AGNIC_GATEWAY_URL = "https://api.agnic.ai/v1/chat/completions";
const MAX_RETRIES = 1;

/**
 * Call an LLM via the Agnic AI Gateway using the user's OAuth token.
 * Returns parsed JSON object.
 *
 * @param agnicToken - The user's Agnic OAuth access token
 * @param task       - Task routing key (e.g. "question_generation")
 * @param systemPrompt - System message content
 * @param userPrompt   - User message content
 * @param options      - Optional overrides for temperature, max_tokens, etc.
 * @param retryCount   - Internal retry counter (do not set manually)
 *
 * @throws LLMError with status 402 if user has insufficient balance
 * @throws LLMError with status 401 if token is invalid
 * @throws LLMError for other gateway errors
 */
export async function callAgnicGateway(
  agnicToken: string,
  task: string,
  systemPrompt: string,
  userPrompt: string,
  options?: LLMCallOptions,
  retryCount = 0,
): Promise<Record<string, unknown>> {
  const model = getModelForTask(task);
  const isReport = task === "report_generation";

  const partnerId = Deno.env.get("AGNIC_PARTNER_ID");

  const temperature = options?.temperature ?? (isReport ? 0.4 : 0.3);
  const maxTokens = options?.maxTokens ?? (isReport ? 3000 : 2048);
  const wantsJsonMode = options?.jsonMode !== false; // default true
  const supportsJsonResponseFormat = !/(anthropic|claude)/i.test(model);

  // Build request headers
  const headers: Record<string, string> = {
    Authorization: `Bearer ${agnicToken}`,
    "Content-Type": "application/json",
  };
  if (partnerId) {
    headers["X-Partner-Id"] = partnerId;
  }

  // Build request body
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature,
    max_tokens: maxTokens,
  };

  // response_format may not be supported by all models on Agnic Gateway.
  // Use it when jsonMode is true; if it causes errors, callers can set jsonMode: false.
  if (wantsJsonMode && supportsJsonResponseFormat) {
    body.response_format = { type: "json_object" };
  }

  let res: Response;
  try {
    res = await fetch(AGNIC_GATEWAY_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(isReport ? 90_000 : 60_000),
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw {
        status: 504,
        error: "llm_timeout",
        message: `LLM request timed out for task: ${task}`,
      } as LLMError;
    }
    throw {
      status: 502,
      error: "llm_network_error",
      message: `Network error calling Agnic Gateway for task: ${task}`,
    } as LLMError;
  }

  // ── 402: Insufficient balance ──
  // This is the critical signal for mid-session top-up flow.
  if (res.status === 402) {
    throw {
      status: 402,
      error: "insufficient_balance",
      message: "Insufficient Agnic wallet balance. Please add credits to continue.",
    } as LLMError;
  }

  // ── 401: Invalid/expired token ──
  if (res.status === 401) {
    throw {
      status: 401,
      error: "agnic_auth_error",
      message: "Agnic token invalid or expired. Please sign in again.",
    } as LLMError;
  }

  // ── 429: Rate limited ──
  if (res.status === 429) {
    if (retryCount < MAX_RETRIES) {
      await delay(4000);
      return callAgnicGateway(
        agnicToken,
        task,
        systemPrompt,
        userPrompt,
        options,
        retryCount + 1,
      );
    }
    throw {
      status: 429,
      error: "llm_rate_limited",
      message: "Rate limited by Agnic Gateway. Please try again shortly.",
    } as LLMError;
  }

  // ── Other errors ──
  if (!res.ok) {
    let errorBody = "";
    try {
      errorBody = await res.text();
    } catch { /* ignore */ }
    throw {
      status: res.status,
      error: `llm_error_${res.status}`,
      message: `Agnic Gateway error (${res.status}) for task: ${task}. ${errorBody}`.trim(),
    } as LLMError;
  }

  // ── Parse response (OpenAI-compatible shape) ──
  const data = await res.json();
  const text: string | undefined = data.choices?.[0]?.message?.content;

  if (!text) {
    throw {
      status: 502,
      error: "llm_empty_response",
      message: `Agnic Gateway returned empty response for task: ${task}`,
    } as LLMError;
  }

  // ── JSON extraction ──
  try {
    // Strip markdown fences if present
    let cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();

    // If there's text before the first '{', extract only the JSON block
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace > 0 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    return JSON.parse(cleaned);
  } catch {
    // Retry once with corrective prompt
    if (retryCount < MAX_RETRIES) {
      return callAgnicGateway(
        agnicToken,
        task,
        systemPrompt,
        userPrompt +
        "\n\nIMPORTANT: Your previous response was not valid JSON. Return ONLY the JSON object, no other text.",
        options,
        retryCount + 1,
      );
    }
    throw {
      status: 502,
      error: "llm_json_parse_failed",
      message: `Failed to parse JSON from LLM response for task: ${task}`,
    } as LLMError;
  }
}

/**
 * Helper: create a JSON error response from an LLMError.
 * Use this in Edge Function catch blocks.
 */
export function llmErrorResponse(
  err: LLMError,
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
