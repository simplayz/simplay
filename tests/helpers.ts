import { createGame } from "@/game/engine";
import type { GameState } from "@/game/types";
import { prepareGameState } from "@/game/validate";
import { hashSessionToken, SESSION_COOKIE } from "@/server/session";

export const APP_ORIGIN = "http://localhost";

export function validGame(company = "TEST HOLDINGS", tick = 0): GameState {
  const prepared = prepareGameState(createGame("Dana Reyes", company, 51.5072, -0.1276, "manual"));
  if (!prepared.ok) throw new Error(prepared.error);
  if (tick > 0) prepared.state.economy.tick = tick;
  return prepared.state;
}

export function cookieHeader(token: string): string {
  return `${SESSION_COOKIE}=${token}`;
}

export function sessionHash(token: string): string {
  return hashSessionToken(token);
}

export function apiRequest(
  path: string,
  init: {
    method?: string;
    token?: string;
    body?: unknown;
    contentType?: string;
    origin?: string | null;
    csrfHeader?: boolean;
    extraHeaders?: Record<string, string>;
  } = {},
): Request {
  const headers: Record<string, string> = { ...(init.extraHeaders ?? {}) };
  if (init.token !== undefined) headers.cookie = cookieHeader(init.token);
  if (init.origin !== null) headers.origin = init.origin ?? APP_ORIGIN;
  if (init.csrfHeader !== false) headers["x-simplayz-request"] = "1";
  if (init.body !== undefined) headers["content-type"] = init.contentType ?? "application/json";
  else if (init.contentType) headers["content-type"] = init.contentType;
  return new Request(`${APP_ORIGIN}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : typeof init.body === "string" ? init.body : JSON.stringify(init.body),
  });
}

export async function jsonBody(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

export function responseCookieToken(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) throw new Error("response did not set a session cookie");
  const first = setCookie.split(";")[0] ?? "";
  const value = first.slice(first.indexOf("=") + 1);
  return decodeURIComponent(value);
}
