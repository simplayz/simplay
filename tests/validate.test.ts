import { describe, expect, it } from "vitest";
import type { GameState } from "@/game/types";
import { prepareGameState, sanitizeGameState, validateGameState } from "@/game/validate";
import { validGame } from "./helpers";

describe("save validation", () => {
  it("accepts a legitimate negative treasury (debt is gameplay, not corruption)", () => {
    const state = validGame();
    state.economy.credits = -84_500;
    const result = validateGameState(state);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.economy.credits).toBe(-84_500);
  });

  it("strips old advisor credentials and endpoint fields before validation", () => {
    const state = validGame() as GameState & {
      apiKey?: string;
      authorization?: string;
    };
    state.apiKey = "sk-legacy-top-level";
    state.authorization = "Bearer legacy-secret";
    const exec = state.execs[0] as unknown as {
      ai: Record<string, unknown>;
    };
    exec.ai = {
      enabled: true,
      temperature: 0.8,
      apiKey: "sk-legacy-exec",
      baseUrl: "https://private-provider.example/v1",
      model: "legacy-model",
      accessToken: "legacy-access",
    };

    const result = prepareGameState(state);
    if (!result.ok) throw new Error(result.error);
    const serialized = JSON.stringify(result.state);
    expect(serialized).not.toContain("sk-legacy");
    expect(serialized).not.toContain("private-provider");
    expect(serialized).not.toContain("legacy-access");
    expect(serialized).not.toContain("authorization");
    expect(result.state.execs[0]!.ai).toEqual({ enabled: true, temperature: 0.8 });
  });

  it("normalises missing or out-of-range advisor preferences without keeping extra fields", () => {
    const state = validGame() as GameState;
    const exec = state.execs[0] as unknown as { ai: Record<string, unknown> };
    exec.ai = { enabled: "yes", temperature: 99, model: "old" };
    const sanitized = sanitizeGameState(state) as GameState;
    expect(sanitized.execs[0]!.ai).toEqual({ enabled: false, temperature: 1.4 });
  });

  it("rejects wrong schemas, missing claims and broken entity references", () => {
    expect(validateGameState({ ...validGame(), schema: 3 })).toMatchObject({ ok: false });
    expect(validateGameState({ ...validGame(), claim: null })).toMatchObject({ ok: false });

    const broken = validGame();
    broken.buildings = [
      {
        id: "b1",
        areaId: "area_0",
        siteId: "missing_site",
        archetypeId: "solar_field",
        plan: { id: "p1", name: "Plan", w: 1, h: 1, storeys: 1, cells: [{ t: 1 }], revision: 0 },
        level: 1,
        operational: false,
        condition: 100,
        securityBot: { id: "s", name: "S", trust: 50, alerts: 0 },
        receptionBot: { id: "r", name: "R", queue: 0, satisfaction: 50 },
        visitorsToday: 0,
      },
    ];
    expect(validateGameState(broken)).toMatchObject({ ok: false, error: expect.stringContaining("unknown site") });
  });

  it("rejects a save that exceeds the serialized payload budget", () => {
    const state = validGame() as GameState & { padding?: string };
    state.padding = "x".repeat(1_600_000);
    expect(validateGameState(state)).toMatchObject({
      ok: false,
      error: expect.stringContaining("serialized save exceeds"),
    });
  });
});
