// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameProvider, useGame } from "@/state/store";
import { LEGACY_SAVE_KEY } from "@/game/validate";
import { validGame } from "./helpers";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => body,
  } as unknown as Response;
}

function Harness() {
  const { state, ui, persistence, newGame } = useGame();
  return (
    <div>
      <output data-testid="boot">{persistence.boot}</output>
      <output data-testid="booted">{String(ui.booted)}</output>
      <output data-testid="tick">{state.economy.tick}</output>
      <output data-testid="company">{state.company}</output>
      <output data-testid="save">{`${persistence.status.phase}:${persistence.status.revision}`}</output>
      <output data-testid="legacy">{persistence.legacy.status}</output>
      <button onClick={() => newGame("Dana", "GATE CO", 1, 2, "manual")}>register</button>
      <button onClick={persistence.retryBoot}>retry</button>
      <button onClick={persistence.migrateLegacy}>migrate</button>
    </div>
  );
}

interface FetchCall {
  method: string;
  url: string;
  body: unknown;
}

function installFetch(handler: (call: FetchCall) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: FetchCall = {
      method: init?.method ?? "GET",
      url: String(input),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    return handler(call);
  });
  vi.stubGlobal("fetch", mock);
  return calls;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("server-first store", () => {
  it("shows initial loading and does not tick until boot and onboarding complete", async () => {
    vi.useFakeTimers();
    let resolveGet: ((response: Response) => void) | undefined;
    installFetch((call) => {
      if (call.method === "GET") return new Promise<Response>((resolve) => (resolveGet = resolve));
      return jsonResponse({ revision: 1, savedAt: 1 });
    });

    render(
      <GameProvider>
        <Harness />
      </GameProvider>,
    );

    expect(screen.getByTestId("boot").textContent).toBe("loading");
    expect(screen.getByTestId("booted").textContent).toBe("false");

    await act(async () => {
      resolveGet?.(jsonResponse({ save: null }));
      await Promise.resolve();
    });
    expect(screen.getByTestId("boot").textContent).toBe("ready");
    expect(screen.getByTestId("booted").textContent).toBe("false");
    expect(screen.getByTestId("tick").textContent).toBe("0");

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByTestId("tick").textContent).toBe("0");

    await act(async () => {
      fireEvent.click(screen.getByText("register"));
      await Promise.resolve();
    });
    expect(screen.getByTestId("booted").textContent).toBe("true");
    expect(screen.getByTestId("company").textContent).toBe("GATE CO");

    await act(async () => {
      vi.advanceTimersByTime(1_100);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(Number(screen.getByTestId("tick").textContent)).toBeGreaterThan(0);
  });

  it("keeps the onboarding gate on a failed load and retries without auto-writing", async () => {
    vi.useFakeTimers();
    const serverState = validGame("SERVER CO", 9);
    let getCount = 0;
    const calls = installFetch((call) => {
      if (call.method === "GET") {
        getCount += 1;
        if (getCount === 1) throw new Error("offline");
        return jsonResponse({
          save: {
            state: serverState,
            revision: 4,
            gameSchema: 4,
            createdAt: 1,
            updatedAt: 2,
          },
        });
      }
      return jsonResponse({ revision: 5, savedAt: 3 });
    });

    render(
      <GameProvider>
        <Harness />
      </GameProvider>,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId("boot").textContent).toBe("error");
    expect(screen.getByTestId("booted").textContent).toBe("false");

    await act(async () => {
      fireEvent.click(screen.getByText("retry"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId("boot").textContent).toBe("ready");
    expect(screen.getByTestId("booted").textContent).toBe("true");
    expect(screen.getByTestId("company").textContent).toBe("SERVER CO");
    expect(screen.getByTestId("save").textContent).toBe("saved:4");
    expect(calls.filter((call) => call.method === "PUT")).toHaveLength(0);
  });

  it("keeps a legacy copy until an explicit migration write succeeds, without uploading old keys", async () => {
    vi.useFakeTimers();
    const legacy = validGame("LEGACY CO", 22) as ReturnType<typeof validGame> & {
      authorization?: string;
    };
    legacy.authorization = "Bearer old-secret";
    const legacyAi = legacy.execs[0] as unknown as { ai: Record<string, unknown> };
    legacyAi.ai = {
      enabled: true,
      temperature: 0.9,
      apiKey: "sk-legacy",
      baseUrl: "https://private.example/v1",
      model: "old-model",
    };
    window.localStorage.setItem(LEGACY_SAVE_KEY, JSON.stringify(legacy));

    const serverState = validGame("SERVER CO", 4);
    const calls = installFetch((call) => {
      if (call.method === "GET") {
        return jsonResponse({
          save: {
            state: serverState,
            revision: 5,
            gameSchema: 4,
            createdAt: 1,
            updatedAt: 2,
          },
        });
      }
      return jsonResponse({ revision: 6, savedAt: 3 });
    });

    render(
      <GameProvider>
        <Harness />
      </GameProvider>,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId("save").textContent).toBe("saved:5");
    expect(screen.getByTestId("legacy").textContent).toBe("available");
    expect(screen.getByTestId("company").textContent).toBe("SERVER CO");
    expect(calls.filter((call) => call.method === "PUT")).toHaveLength(0);

    const rewritten = JSON.parse(window.localStorage.getItem(LEGACY_SAVE_KEY) ?? "null") as Record<string, unknown>;
    expect(JSON.stringify(rewritten)).not.toContain("sk-legacy");
    expect(JSON.stringify(rewritten)).not.toContain("private.example");
    expect(JSON.stringify(rewritten)).not.toContain("old-secret");
    expect((rewritten.execs as { ai: unknown }[])[0]!.ai).toEqual({ enabled: true, temperature: 0.9 });

    await act(async () => {
      fireEvent.click(screen.getByText("migrate"));
      await Promise.resolve();
    });
    expect(screen.getByTestId("company").textContent).toBe("LEGACY CO");

    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const puts = calls.filter((call) => call.method === "PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0]!.body).toMatchObject({ revision: 5, state: { company: "LEGACY CO" } });
    expect(JSON.stringify(puts[0]!.body)).not.toContain("sk-legacy");
    expect(JSON.stringify(puts[0]!.body)).not.toContain("private.example");
    expect(JSON.stringify(puts[0]!.body)).not.toContain("old-secret");
    expect(screen.getByTestId("save").textContent).toBe("saved:6");
    expect(screen.getByTestId("legacy").textContent).toBe("none");
    expect(window.localStorage.getItem(LEGACY_SAVE_KEY)).toBeNull();
  });
});
