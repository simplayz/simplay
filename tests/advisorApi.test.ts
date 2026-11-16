import { describe, expect, it } from "vitest";
import {
  FixedWindowRateLimiter,
  loadAdvisorConfig,
  postAdvisorResponse,
  publicAdvisorConfig,
  type AdvisorConfig,
} from "@/server/advisorApi";
import { createSessionToken } from "@/server/session";
import { apiRequest, jsonBody } from "./helpers";

const BASE_BODY = {
  role: "cto",
  company: "TEST HOLDINGS",
  prompt: "What is the current risk?",
  digest: "CITY DIGEST\nTreasury ₡250,000",
  temperature: 0.6,
  history: [{ role: "ceo", author: "CEO Dana", text: "Status?" }],
};

function configured(overrides: Partial<AdvisorConfig> = {}): AdvisorConfig {
  return {
    configured: true,
    baseUrl: "https://advisor.example/v1",
    apiKey: "sk-test-secret",
    model: "test-model",
    timeoutMs: 1_000,
    ...overrides,
  };
}

describe("advisor proxy", () => {
  it("never exposes the API key through the public config", () => {
    const config = loadAdvisorConfig({
      SIMPLAYZ_ADVISOR_API_KEY: "sk-test-secret",
      SIMPLAYZ_ADVISOR_BASE_URL: "https://advisor.example/v1",
      SIMPLAYZ_ADVISOR_MODEL: "test-model",
    } as unknown as NodeJS.ProcessEnv);
    const publicConfig = publicAdvisorConfig(config);
    expect(publicConfig).toEqual({ configured: true, model: "test-model" });
    expect(JSON.stringify(publicConfig)).not.toContain("sk-test-secret");
    expect(JSON.stringify(publicConfig)).not.toContain("advisor.example");
  });

  it("returns 503 when the operator has not configured a live advisor", async () => {
    const response = await postAdvisorResponse(
      apiRequest("/api/advisor", { method: "POST", token: createSessionToken(), body: BASE_BODY }),
      {
        config: { configured: false, baseUrl: null, apiKey: null, model: null, timeoutMs: 1_000 },
        fetchImpl: async () => {
          throw new Error("should not be called");
        },
        limiter: new FixedWindowRateLimiter(10, 60_000),
        globalLimiter: new FixedWindowRateLimiter(10, 60_000),
      },
    );
    expect(response.status).toBe(503);
    expect(await jsonBody(response)).toMatchObject({ error: { code: "ADVISOR_NOT_CONFIGURED" } });
  });

  it("returns a timeout instead of hanging and leaves the local fallback available", async () => {
    const response = await postAdvisorResponse(
      apiRequest("/api/advisor", { method: "POST", token: createSessionToken(), body: BASE_BODY }),
      {
        config: configured({ timeoutMs: 25 }),
        fetchImpl: () => new Promise<Response>(() => undefined),
        limiter: new FixedWindowRateLimiter(10, 60_000),
        globalLimiter: new FixedWindowRateLimiter(10, 60_000),
      },
    );
    expect(response.status).toBe(504);
    expect(await jsonBody(response)).toMatchObject({ error: { code: "ADVISOR_TIMEOUT" } });
  });

  it("maps upstream failures to a generic 502 without leaking provider details", async () => {
    const response = await postAdvisorResponse(
      apiRequest("/api/advisor", { method: "POST", token: createSessionToken(), body: BASE_BODY }),
      {
        config: configured(),
        fetchImpl: async () =>
          ({
            ok: false,
            status: 500,
          }) as Response,
        limiter: new FixedWindowRateLimiter(10, 60_000),
        globalLimiter: new FixedWindowRateLimiter(10, 60_000),
      },
    );
    expect(response.status).toBe(502);
    const body = await jsonBody(response);
    expect(body).toMatchObject({ error: { code: "ADVISOR_UPSTREAM_ERROR" } });
    expect(JSON.stringify(body)).not.toContain("sk-test-secret");
    expect(JSON.stringify(body)).not.toContain("advisor.example");
  });

  it("accepts a valid completion and trims it", async () => {
    const response = await postAdvisorResponse(
      apiRequest("/api/advisor", { method: "POST", token: createSessionToken(), body: BASE_BODY }),
      {
        config: configured(),
        fetchImpl: async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ choices: [{ message: { content: "  Build the substation.  " } }] }),
          }) as Response,
        limiter: new FixedWindowRateLimiter(10, 60_000),
        globalLimiter: new FixedWindowRateLimiter(10, 60_000),
      },
    );
    expect(response.status).toBe(200);
    expect(await jsonBody(response)).toEqual({ text: "Build the substation.", model: "test-model" });
  });

  it("enforces CSRF headers and body bounds before calling the provider", async () => {
    let called = false;
    const fetchImpl = async () => {
      called = true;
      return { ok: true, status: 200 } as Response;
    };
    const missingOrigin = await postAdvisorResponse(
      apiRequest("/api/advisor", { method: "POST", token: createSessionToken(), origin: null, body: BASE_BODY }),
      { config: configured(), fetchImpl, limiter: new FixedWindowRateLimiter(10, 60_000), globalLimiter: new FixedWindowRateLimiter(10, 60_000) },
    );
    expect(missingOrigin.status).toBe(403);

    const oversized = await postAdvisorResponse(
      apiRequest("/api/advisor", {
        method: "POST",
        token: createSessionToken(),
        body: { ...BASE_BODY, prompt: "x".repeat(40_000) },
      }),
      { config: configured(), fetchImpl, limiter: new FixedWindowRateLimiter(10, 60_000), globalLimiter: new FixedWindowRateLimiter(10, 60_000) },
    );
    expect(oversized.status).toBe(413);
    expect(called).toBe(false);
  });

  it("rate-limits repeated calls per anonymous session", async () => {
    const token = createSessionToken();
    const deps = {
      config: configured(),
      fetchImpl: async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: "ok" } }] }),
        }) as Response,
      limiter: new FixedWindowRateLimiter(1, 60_000),
      globalLimiter: new FixedWindowRateLimiter(10, 60_000),
    };
    const first = await postAdvisorResponse(
      apiRequest("/api/advisor", { method: "POST", token, body: BASE_BODY }),
      deps,
    );
    expect(first.status).toBe(200);
    const second = await postAdvisorResponse(
      apiRequest("/api/advisor", { method: "POST", token, body: BASE_BODY }),
      deps,
    );
    expect(second.status).toBe(429);
    expect(await jsonBody(second)).toMatchObject({ error: { code: "ADVISOR_RATE_LIMITED" } });
  });
});
