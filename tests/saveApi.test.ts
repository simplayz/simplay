import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, type Db, type SimplayzDatabase } from "@/server/db/create";
import { readJsonBody } from "@/server/http";
import { getSaveResponse, putSaveResponse, resetSaveResponse } from "@/server/saveApi";
import { loadSave } from "@/server/saveStore";
import { hashSessionToken } from "@/server/session";
import { apiRequest, jsonBody, responseCookieToken, validGame } from "./helpers";

let database: SimplayzDatabase;

beforeEach(() => {
  database = createDatabase(":memory:");
});

afterEach(() => {
  database.sqlite.close();
});

describe("save API", () => {
  it("creates an anonymous session on GET, then writes and reads a save", async () => {
    const get = getSaveResponse(apiRequest("/api/save"), database.db);
    expect(get.status).toBe(200);
    expect(await jsonBody(get)).toEqual({ save: null });
    const token = responseCookieToken(get);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const state = validGame("HTTP CO", 3);
    const put = await putSaveResponse(
      apiRequest("/api/save", { method: "PUT", token, body: { revision: 0, state } }),
      database.db,
    );
    expect(put.status).toBe(200);
    expect(await jsonBody(put)).toEqual({ revision: 1, savedAt: expect.any(Number) });

    const read = getSaveResponse(apiRequest("/api/save", { token }), database.db);
    const body = await jsonBody(read);
    expect(body.save).toMatchObject({
      revision: 1,
      gameSchema: 4,
      state: { company: "HTTP CO", economy: { tick: 3 } },
    });
  });

  it("returns 409 with the current revision for a stale write", async () => {
    const get = getSaveResponse(apiRequest("/api/save"), database.db);
    const token = responseCookieToken(get);
    const state = validGame("REVISION CO");

    const first = await putSaveResponse(
      apiRequest("/api/save", { method: "PUT", token, body: { revision: 0, state } }),
      database.db,
    );
    expect(first.status).toBe(200);

    const stale = await putSaveResponse(
      apiRequest("/api/save", { method: "PUT", token, body: { revision: 0, state } }),
      database.db,
    );
    expect(stale.status).toBe(409);
    expect(await jsonBody(stale)).toEqual({
      error: {
        code: "REVISION_CONFLICT",
        message: expect.any(String),
        currentRevision: 1,
        currentUpdatedAt: expect.any(Number),
      },
    });
  });

  it("rejects writes without an anonymous session", async () => {
    const response = await putSaveResponse(
      apiRequest("/api/save", { method: "PUT", body: { revision: 0, state: validGame() } }),
      database.db,
    );
    expect(response.status).toBe(401);
    expect(await jsonBody(response)).toMatchObject({ error: { code: "SESSION_REQUIRED" } });
  });

  it("rejects cross-site and header-less state changes", async () => {
    const token = responseCookieToken(getSaveResponse(apiRequest("/api/save"), database.db));
    const state = validGame();

    const noOrigin = await putSaveResponse(
      apiRequest("/api/save", { method: "PUT", token, origin: null, body: { revision: 0, state } }),
      database.db,
    );
    expect(noOrigin.status).toBe(403);
    expect(await jsonBody(noOrigin)).toMatchObject({ error: { code: "ORIGIN_REQUIRED" } });

    const wrongOrigin = await putSaveResponse(
      apiRequest("/api/save", {
        method: "PUT",
        token,
        origin: "https://evil.example",
        body: { revision: 0, state },
      }),
      database.db,
    );
    expect(wrongOrigin.status).toBe(403);
    expect(await jsonBody(wrongOrigin)).toMatchObject({ error: { code: "ORIGIN_MISMATCH" } });

    const noCsrf = await putSaveResponse(
      apiRequest("/api/save", { method: "PUT", token, csrfHeader: false, body: { revision: 0, state } }),
      database.db,
    );
    expect(noCsrf.status).toBe(403);
    expect(await jsonBody(noCsrf)).toMatchObject({ error: { code: "CSRF_HEADER_REQUIRED" } });
  });

  it("validates revision, content type and the full save structure", async () => {
    const token = responseCookieToken(getSaveResponse(apiRequest("/api/save"), database.db));
    const state = validGame();

    const badRevision = await putSaveResponse(
      apiRequest("/api/save", { method: "PUT", token, body: { revision: "1", state } }),
      database.db,
    );
    expect(badRevision.status).toBe(400);
    expect(await jsonBody(badRevision)).toMatchObject({ error: { code: "INVALID_REVISION" } });

    const badType = await putSaveResponse(
      apiRequest("/api/save", {
        method: "PUT",
        token,
        body: JSON.stringify({ revision: 0, state }),
        contentType: "text/plain",
      }),
      database.db,
    );
    expect(badType.status).toBe(415);
    expect(await jsonBody(badType)).toMatchObject({ error: { code: "CONTENT_TYPE_REQUIRED" } });

    const badState = await putSaveResponse(
      apiRequest("/api/save", { method: "PUT", token, body: { revision: 0, state: { schema: 4 } } }),
      database.db,
    );
    expect(badState.status).toBe(422);
    expect(await jsonBody(badState)).toMatchObject({ error: { code: "INVALID_SAVE", schema: 4 } });
  });

  it("returns a generic 503 when the database fails, without writing", async () => {
    const token = responseCookieToken(getSaveResponse(apiRequest("/api/save"), database.db));
    const brokenRead = {
      select() {
        throw new Error("disk I/O error at /private/path");
      },
    } as unknown as Db;
    const failedRead = getSaveResponse(apiRequest("/api/save", { token }), brokenRead);
    expect(failedRead.status).toBe(503);
    const readBody = await jsonBody(failedRead);
    expect(readBody).toMatchObject({ error: { code: "SAVE_UNAVAILABLE" } });
    expect(JSON.stringify(readBody)).not.toContain("/private/path");

    const brokenWrite = {
      transaction() {
        throw new Error("disk I/O error at /private/path");
      },
    } as unknown as Db;
    const failedWrite = await putSaveResponse(
      apiRequest("/api/save", {
        method: "PUT",
        token,
        body: { revision: 0, state: validGame() },
      }),
      brokenWrite,
    );
    expect(failedWrite.status).toBe(503);
    expect(await jsonBody(failedWrite)).toMatchObject({ error: { code: "SAVE_UNAVAILABLE" } });
    expect(loadSave(database.db, hashSessionToken(token))).toEqual({ kind: "none" });
  });

  it("requires explicit reset confirmation and only deletes the matching session", async () => {
    const getA = getSaveResponse(apiRequest("/api/save"), database.db);
    const tokenA = responseCookieToken(getA);
    const getB = getSaveResponse(apiRequest("/api/save"), database.db);
    const tokenB = responseCookieToken(getB);
    const state = validGame();

    await putSaveResponse(apiRequest("/api/save", { method: "PUT", token: tokenA, body: { revision: 0, state } }), database.db);
    await putSaveResponse(apiRequest("/api/save", { method: "PUT", token: tokenB, body: { revision: 0, state } }), database.db);

    const unconfirmed = await resetSaveResponse(
      apiRequest("/api/save/reset", { method: "POST", token: tokenA, body: { confirm: false } }),
      database.db,
    );
    expect(unconfirmed.status).toBe(400);
    expect(loadSave(database.db, hashSessionToken(tokenA))).toMatchObject({ kind: "ok" });

    const reset = await resetSaveResponse(
      apiRequest("/api/save/reset", { method: "POST", token: tokenA, body: { confirm: true } }),
      database.db,
    );
    expect(reset.status).toBe(200);
    expect(await jsonBody(reset)).toEqual({ ok: true, cleared: true });
    expect(loadSave(database.db, hashSessionToken(tokenA))).toEqual({ kind: "none" });
    expect(loadSave(database.db, hashSessionToken(tokenB))).toMatchObject({ kind: "ok" });

    const unauthenticated = await resetSaveResponse(
      apiRequest("/api/save/reset", { method: "POST", body: { confirm: true } }),
      database.db,
    );
    expect(unauthenticated.status).toBe(401);
  });

  it("rejects an oversized JSON payload before parsing it", async () => {
    const request = apiRequest("/api/save", {
      method: "PUT",
      body: JSON.stringify({ revision: 0, padding: "a".repeat(2 * 1024 * 1024) }),
    });
    const result = await readJsonBody(request);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.response.status).toBe(413);
    expect(await jsonBody(result.response)).toMatchObject({ error: { code: "BODY_TOO_LARGE" } });
  });
});
