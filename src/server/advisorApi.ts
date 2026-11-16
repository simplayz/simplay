import { buildAdvisorMessages, type AdvisorTurn } from "@/game/advisor";
import type { ExecRole } from "@/game/types";
import { apiError, checkStateChangingRequest, isRecord, jsonResponse, readJsonBody } from "./http";
import { hashSessionToken, isValidSessionToken, readSessionToken } from "./session";

const ROLES: ExecRole[] = ["cto", "cfo", "coo"];
const MAX_BODY_BYTES = 32 * 1024;
const MAX_PROMPT = 2_000;
const MAX_DIGEST = 16_000;
const MAX_HISTORY = 8;
const MAX_HISTORY_TEXT = 2_000;

export interface AdvisorConfig {
  configured: boolean;
  baseUrl: string | null;
  apiKey: string | null;
  model: string | null;
  timeoutMs: number;
}

export function loadAdvisorConfig(env: NodeJS.ProcessEnv = process.env): AdvisorConfig {
  const apiKey = env.SIMPLAYZ_ADVISOR_API_KEY?.trim() || null;
  const model = env.SIMPLAYZ_ADVISOR_MODEL?.trim() || null;
  const rawBase = env.SIMPLAYZ_ADVISOR_BASE_URL?.trim() || null;
  const timeout = Number(env.SIMPLAYZ_ADVISOR_TIMEOUT_MS ?? 12_000);
  const timeoutMs =
    Number.isFinite(timeout) && timeout >= 1_000 && timeout <= 30_000 ? Math.round(timeout) : 12_000;

  if (!apiKey || !model || !rawBase) {
    return { configured: false, baseUrl: null, apiKey: null, model: null, timeoutMs };
  }

  let baseUrl: string;
  try {
    const url = new URL(rawBase);
    const localHttp =
      url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (url.protocol !== "https:" && !localHttp) {
      return { configured: false, baseUrl: null, apiKey: null, model: null, timeoutMs };
    }
    if (url.username || url.password) {
      return { configured: false, baseUrl: null, apiKey: null, model: null, timeoutMs };
    }
    baseUrl = url.toString().replace(/\/$/, "");
  } catch {
    return { configured: false, baseUrl: null, apiKey: null, model: null, timeoutMs };
  }

  return { configured: true, baseUrl, apiKey, model, timeoutMs };
}

export function publicAdvisorConfig(config: AdvisorConfig) {
  return {
    configured: config.configured,
    model: config.configured ? config.model : null,
  };
}

export class FixedWindowRateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  consume(key: string, now = Date.now()): { ok: true } | { ok: false; retryAfterSeconds: number } {
    if (this.buckets.size > 10_000) {
      for (const [k, bucket] of this.buckets) if (bucket.resetAt <= now) this.buckets.delete(k);
    }
    const current = this.buckets.get(key);
    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return { ok: true };
    }
    if (current.count >= this.limit) {
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
    }
    current.count += 1;
    return { ok: true };
  }
}

const sessionLimiter = new FixedWindowRateLimiter(10, 60_000);
const globalLimiter = new FixedWindowRateLimiter(120, 60_000);

export interface AdvisorDeps {
  config?: AdvisorConfig;
  fetchImpl?: typeof fetch;
  limiter?: FixedWindowRateLimiter;
  globalLimiter?: FixedWindowRateLimiter;
  now?: () => number;
}

function rateKey(request: Request, now: number): string {
  const token = readSessionToken(request);
  if (isValidSessionToken(token)) return `session:${hashSessionToken(token).slice(0, 32)}`;
  if (process.env.SIMPLAYZ_TRUST_PROXY === "1") {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return `ip:${forwarded}`;
  }
  return `ip:unknown:${Math.floor(now / 60_000)}`;
}

function clientIpKey(request: Request): string {
  if (process.env.SIMPLAYZ_TRUST_PROXY === "1") {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return `ip:${forwarded}`;
  }
  return "ip:unknown";
}

export function getAdvisorConfigResponse(): Response {
  return jsonResponse(publicAdvisorConfig(loadAdvisorConfig()));
}

class AdvisorTimeout extends Error {}

export async function postAdvisorResponse(request: Request, deps: AdvisorDeps = {}): Promise<Response> {
  const csrf = checkStateChangingRequest(request);
  if (csrf) return csrf;

  const body = await readJsonBody(request, MAX_BODY_BYTES);
  if (!body.ok) return body.response;
  if (!isRecord(body.value)) {
    return apiError(400, "INVALID_BODY", "Expected a JSON object.");
  }

  const role = body.value.role;
  if (typeof role !== "string" || !ROLES.includes(role as ExecRole)) {
    return apiError(400, "INVALID_ROLE", "role must be cto, cfo or coo.");
  }
  const company = body.value.company;
  const prompt = body.value.prompt;
  const digest = body.value.digest;
  const temperature = body.value.temperature;
  const history = body.value.history;

  if (typeof company !== "string" || company.length < 1 || company.length > 80) {
    return apiError(400, "INVALID_COMPANY", "company must be 1–80 characters.");
  }
  if (typeof prompt !== "string" || prompt.trim().length < 1 || prompt.length > MAX_PROMPT) {
    return apiError(400, "INVALID_PROMPT", `prompt must be 1–${MAX_PROMPT} characters.`);
  }
  if (typeof digest !== "string" || digest.length < 1 || digest.length > MAX_DIGEST) {
    return apiError(400, "INVALID_DIGEST", `digest must be 1–${MAX_DIGEST} characters.`);
  }
  if (typeof temperature !== "number" || !Number.isFinite(temperature) || temperature < 0 || temperature > 1.4) {
    return apiError(400, "INVALID_TEMPERATURE", "temperature must be between 0 and 1.4.");
  }
  if (!Array.isArray(history) || history.length > MAX_HISTORY) {
    return apiError(400, "INVALID_HISTORY", `history must contain at most ${MAX_HISTORY} turns.`);
  }

  const turns: AdvisorTurn[] = [];
  for (let i = 0; i < history.length; i++) {
    const turn = history[i];
    if (!isRecord(turn)) return apiError(400, "INVALID_HISTORY", `history[${i}] is not an object.`);
    if (typeof turn.role !== "string" || ![...ROLES, "ceo"].includes(turn.role)) {
      return apiError(400, "INVALID_HISTORY", `history[${i}].role is invalid.`);
    }
    if (typeof turn.author !== "string" || turn.author.length > 80) {
      return apiError(400, "INVALID_HISTORY", `history[${i}].author is invalid.`);
    }
    if (typeof turn.text !== "string" || turn.text.length > MAX_HISTORY_TEXT) {
      return apiError(400, "INVALID_HISTORY", `history[${i}].text is invalid.`);
    }
    turns.push({ role: turn.role as ExecRole | "ceo", author: turn.author, text: turn.text });
  }

  const config = deps.config ?? loadAdvisorConfig();
  if (!config.configured || !config.baseUrl || !config.apiKey || !config.model) {
    return apiError(
      503,
      "ADVISOR_NOT_CONFIGURED",
      "The live advisor is not configured on this server. The local advisor remains available.",
    );
  }

  const now = deps.now?.() ?? Date.now();
  const sessionLimit = (deps.limiter ?? sessionLimiter).consume(rateKey(request, now), now);
  if (!sessionLimit.ok) {
    return apiError(429, "ADVISOR_RATE_LIMITED", "Too many advisor requests. Try again shortly.", {
      retryAfterSeconds: sessionLimit.retryAfterSeconds,
    }, { "Retry-After": String(sessionLimit.retryAfterSeconds) });
  }
  const globalLimit = (deps.globalLimiter ?? globalLimiter).consume(clientIpKey(request), now);
  if (!globalLimit.ok) {
    return apiError(429, "ADVISOR_RATE_LIMITED", "The advisor is busy. Try again shortly.", {
      retryAfterSeconds: globalLimit.retryAfterSeconds,
    }, { "Retry-After": String(globalLimit.retryAfterSeconds) });
  }

  const messages = buildAdvisorMessages(role as ExecRole, company, digest, turns, prompt.trim());
  const fetchImpl = deps.fetchImpl ?? fetch;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    const response = await Promise.race([
      fetchImpl(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          temperature,
          messages,
        }),
        signal: controller.signal,
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new AdvisorTimeout("timeout"));
        }, config.timeoutMs);
      }),
    ]);

    if (!response.ok) {
      return apiError(502, "ADVISOR_UPSTREAM_ERROR", `The advisor provider returned HTTP ${response.status}.`);
    }
    const json = await response.json().catch(() => null);
    const text =
      isRecord(json) &&
      Array.isArray(json.choices) &&
      isRecord(json.choices[0]) &&
      isRecord(json.choices[0].message) &&
      typeof json.choices[0].message.content === "string"
        ? json.choices[0].message.content.trim()
        : "";
    if (!text) {
      return apiError(502, "ADVISOR_EMPTY_RESPONSE", "The advisor provider returned an empty response.");
    }
    return jsonResponse({ text: text.slice(0, 8_000), model: config.model });
  } catch (error) {
    if (error instanceof AdvisorTimeout) {
      return apiError(504, "ADVISOR_TIMEOUT", "The advisor request timed out. The local advisor remains available.");
    }
    return apiError(502, "ADVISOR_UNAVAILABLE", "The advisor provider could not be reached.");
  } finally {
    if (timer) clearTimeout(timer);
  }
}
