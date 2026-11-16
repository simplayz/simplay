import type { GameState } from "@/game/types";
import { GAME_SCHEMA, prepareGameState } from "@/game/validate";
import type { Db } from "./db/create";
import { apiError, checkStateChangingRequest, isRecord, jsonResponse, readJsonBody } from "./http";
import { loadSave, resetSave, writeSave } from "./saveStore";
import {
  createSessionToken,
  hashSessionToken,
  isValidSessionToken,
  readSessionToken,
  serializeSessionCookie,
} from "./session";

const MAX_REVISION = 1_000_000_000_000;

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 300) : "unknown error";
}

function logFailure(operation: string, error: unknown): void {
  // Never log the save payload: it can contain player location/company data.
  console.error(`[simplayz:save] ${operation} failed: ${safeMessage(error)}`);
}

export function getSaveResponse(request: Request, db: Db): Response {
  let token = readSessionToken(request);
  if (!isValidSessionToken(token)) token = createSessionToken();
  const sessionHash = hashSessionToken(token);

  try {
    const result = loadSave(db, sessionHash);
    if (result.kind === "corrupt") {
      return apiError(
        500,
        "SAVE_CORRUPT",
        "The stored save could not be read. It has not been replaced. Export or retry before starting over.",
        undefined,
        { "Set-Cookie": serializeSessionCookie(token) },
      );
    }
    const payload =
      result.kind === "ok"
        ? {
            save: {
              state: result.save.state,
              revision: result.save.revision,
              gameSchema: result.save.gameSchema,
              createdAt: result.save.createdAt,
              updatedAt: result.save.updatedAt,
            },
          }
        : { save: null };
    return jsonResponse(payload, 200, { "Set-Cookie": serializeSessionCookie(token) });
  } catch (error) {
    logFailure("read", error);
    return apiError(
      503,
      "SAVE_UNAVAILABLE",
      "The save service is temporarily unavailable. Retry in a moment.",
      undefined,
      { "Set-Cookie": serializeSessionCookie(token) },
    );
  }
}

export async function putSaveResponse(request: Request, db: Db): Promise<Response> {
  const token = readSessionToken(request);
  if (!isValidSessionToken(token)) {
    return apiError(
      401,
      "SESSION_REQUIRED",
      "No anonymous session was found. Reload the page so a session cookie can be created.",
    );
  }
  const csrf = checkStateChangingRequest(request);
  if (csrf) return csrf;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  if (!isRecord(body.value)) {
    return apiError(400, "INVALID_BODY", "Expected a JSON object with revision and state.");
  }
  const revision = body.value.revision;
  if (
    typeof revision !== "number" ||
    !Number.isInteger(revision) ||
    revision < 0 ||
    revision > MAX_REVISION
  ) {
    return apiError(400, "INVALID_REVISION", "revision must be a non-negative integer.");
  }

  const prepared = prepareGameState(body.value.state);
  if (!prepared.ok) {
    return apiError(422, "INVALID_SAVE", `The save was not persisted: ${prepared.error}`, {
      schema: GAME_SCHEMA,
    });
  }

  try {
    const result = writeSave(db, hashSessionToken(token), revision, prepared.state as GameState);
    if (result.kind === "conflict") {
      return apiError(
        409,
        "REVISION_CONFLICT",
        "A newer save exists on the server. Your game is still in memory; choose how to recover.",
        {
          currentRevision: result.currentRevision,
          currentUpdatedAt: result.currentUpdatedAt,
        },
      );
    }
    return jsonResponse({ revision: result.revision, savedAt: result.savedAt });
  } catch (error) {
    logFailure("write", error);
    return apiError(
      503,
      "SAVE_UNAVAILABLE",
      "The save could not be written. Your game is still in memory; retry when the database is available.",
    );
  }
}

export async function resetSaveResponse(request: Request, db: Db): Promise<Response> {
  const token = readSessionToken(request);
  if (!isValidSessionToken(token)) {
    return apiError(401, "SESSION_REQUIRED", "No anonymous session was found. Reload the page first.");
  }
  const csrf = checkStateChangingRequest(request);
  if (csrf) return csrf;

  const body = await readJsonBody(request, 8 * 1024);
  if (!body.ok) return body.response;
  if (!isRecord(body.value) || body.value.confirm !== true) {
    return apiError(400, "RESET_NOT_CONFIRMED", "Send { confirm: true } to reset this anonymous save.");
  }

  try {
    const cleared = resetSave(db, hashSessionToken(token));
    return jsonResponse({ ok: true, cleared });
  } catch (error) {
    logFailure("reset", error);
    return apiError(
      503,
      "RESET_UNAVAILABLE",
      "The save could not be reset. Nothing was removed; your game is still in memory.",
    );
  }
}
