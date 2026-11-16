import type { GameState } from "@/game/types";

export interface SaveEnvelope {
  state: GameState;
  revision: number;
  gameSchema: number;
  createdAt: number;
  updatedAt: number;
}

export class SaveApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly currentRevision?: number,
    readonly currentUpdatedAt?: number,
  ) {
    super(message);
    this.name = "SaveApiError";
  }
}

async function readError(response: Response): Promise<SaveApiError> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Keep the generic status message below.
  }
  const error =
    typeof body === "object" && body !== null && "error" in body
      ? (body as { error?: Record<string, unknown> }).error
      : undefined;
  const message =
    error && typeof error.message === "string"
      ? error.message
      : `Save service returned HTTP ${response.status}.`;
  const code = error && typeof error.code === "string" ? error.code : "SAVE_REQUEST_FAILED";
  const currentRevision =
    error && typeof error.currentRevision === "number" ? error.currentRevision : undefined;
  const currentUpdatedAt =
    error && typeof error.currentUpdatedAt === "number" ? error.currentUpdatedAt : undefined;
  return new SaveApiError(message, response.status, code, currentRevision, currentUpdatedAt);
}

export async function loadServerSave(signal?: AbortSignal): Promise<SaveEnvelope | null> {
  const response = await fetch("/api/save", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw await readError(response);
  const body = (await response.json()) as { save?: SaveEnvelope | null };
  return body.save ?? null;
}

export async function putServerSave(
  state: GameState,
  revision: number,
  options: { keepalive?: boolean; signal?: AbortSignal } = {},
): Promise<{ revision: number; savedAt: number }> {
  const response = await fetch("/api/save", {
    method: "PUT",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Simplayz-Request": "1",
    },
    body: JSON.stringify({ revision, state }),
    keepalive: options.keepalive,
    signal: options.signal,
  });
  if (!response.ok) throw await readError(response);
  return (await response.json()) as { revision: number; savedAt: number };
}

export async function resetServerSave(): Promise<void> {
  const response = await fetch("/api/save/reset", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Simplayz-Request": "1",
    },
    body: JSON.stringify({ confirm: true }),
  });
  if (!response.ok) throw await readError(response);
}

export async function loadAdvisorConfig(): Promise<{ configured: boolean; model: string | null }> {
  const response = await fetch("/api/advisor/config", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) throw await readError(response);
  return (await response.json()) as { configured: boolean; model: string | null };
}
