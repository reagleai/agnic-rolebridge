/**
 * Configurable LLM adapter for Supabase Edge Functions.
 * Block A — _shared/llm.ts
 *
 * Uses OpenRouter's OpenAI-compatible API. Model selection is
 * driven by env vars with sensible defaults — no model name is
 * hardcoded in any downstream task logic.
 */

// ── Default model identifiers (overridden by env vars) ──

const DEFAULT_MODELS: Record<string, string> = {
  section_extraction: "poolside/laguna-m.1:free",
  question_generation: "poolside/laguna-m.1:free",
  answer_evaluation: "poolside/laguna-m.1:free",
  report_generation: "poolside/laguna-m.1:free",
};

// Env var keys follow the pattern LLM_MODEL_<TASK_UPPER>
const ENV_KEY_MAP: Record<string, string> = {
  section_extraction: "LLM_MODEL_SECTION_EXTRACTION",
  question_generation: "LLM_MODEL_QUESTION_GENERATION",
  answer_evaluation: "LLM_MODEL_ANSWER_EVALUATION",
  report_generation: "LLM_MODEL_REPORT_GENERATION",
};

function getModelForTask(task: string): string {
  const envKey = ENV_KEY_MAP[task];
  if (envKey) {
    const envVal = Deno.env.get(envKey);
    if (envVal) return envVal;
  }
  return DEFAULT_MODELS[task] ?? DEFAULT_MODELS.section_extraction;
}

// ── Helpers ──

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Main LLM call wrapper ──

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_RETRIES = 1;

/**
 * Call an LLM via OpenRouter. Returns parsed JSON object.
 *
 * @param task - Routing key from MODEL_ROUTING (e.g. "section_extraction")
 * @param systemPrompt - System message content
 * @param userPrompt - User message content
 * @param retryCount - Internal retry counter (do not set manually)
 */
export async function callLLM(
  task: string,
  systemPrompt: string,
  userPrompt: string,
  retryCount = 0
): Promise<Record<string, unknown>> {
  const model = getModelForTask(task);
  const isReport = task === "report_generation";

  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY environment variable");
  }

  const appUrl = Deno.env.get("APP_URL") || "https://rolebridge.app";

  let res: Response;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": appUrl,
        "X-Title": "RoleBridge",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: isReport ? 0.4 : 0.3,
        max_tokens: isReport ? 3000 : 2048,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(isReport ? 60_000 : 25_000),
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error("llm_timeout");
    }
    throw new Error("llm_network_error");
  }

  // ── Rate limit handling ──
  if (res.status === 429) {
    if (retryCount < MAX_RETRIES) {
      await delay(4000);
      return callLLM(task, systemPrompt, userPrompt, retryCount + 1);
    }
    throw new Error("llm_rate_limited");
  }

  if (!res.ok) {
    throw new Error(`llm_error_${res.status}`);
  }

  // ── Parse response (OpenAI-compatible shape) ──
  const data = await res.json();
  const text: string | undefined = data.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error("llm_empty_response");
  }

  // ── JSON extraction ──
  try {
    const cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    return JSON.parse(cleaned);
  } catch {
    // Retry once with corrective prompt
    if (retryCount < MAX_RETRIES) {
      return callLLM(
        task,
        systemPrompt,
        userPrompt +
        "\n\nIMPORTANT: Your previous response was not valid JSON. Return ONLY the JSON object, no other text.",
        retryCount + 1
      );
    }
    throw new Error("llm_json_parse_failed");
  }
}
