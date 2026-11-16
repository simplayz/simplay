import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, type SimplayzDatabase } from "@/server/db/create";
import { loadSave, resetSave, writeSave } from "@/server/saveStore";
import { validGame } from "./helpers";

let database: SimplayzDatabase;

beforeEach(() => {
  database = createDatabase(":memory:");
});

afterEach(() => {
  database.sqlite.close();
});

describe("saveStore", () => {
  it("creates revision 1, loads the sanitized state, and advances revisions", () => {
    const hash = "a".repeat(64);
    const state = validGame("ACME", 12);

    const created = writeSave(database.db, hash, 0, state);
    expect(created).toMatchObject({ kind: "ok", revision: 1 });

    const loaded = loadSave(database.db, hash);
    if (loaded.kind !== "ok") throw new Error(`expected save, got ${loaded.kind}`);
    expect(loaded.save.revision).toBe(1);
    expect(loaded.save.gameSchema).toBe(4);
    expect(loaded.save.state.company).toBe("ACME");
    expect(loaded.save.state.economy.tick).toBe(12);

    const updated = writeSave(database.db, hash, 1, { ...state, company: "ACME TWO" });
    expect(updated).toMatchObject({ kind: "ok", revision: 2 });
    expect(loadSave(database.db, hash)).toMatchObject({
      kind: "ok",
      save: { revision: 2, state: { company: "ACME TWO" } },
    });
  });

  it("rejects two writes from the same revision instead of silently overwriting", () => {
    const hash = "b".repeat(64);
    const state = validGame("FIRST");

    expect(writeSave(database.db, hash, 0, state)).toMatchObject({ kind: "ok", revision: 1 });

    const stale = writeSave(database.db, hash, 0, { ...state, company: "STALE" });
    expect(stale).toEqual({ kind: "conflict", currentRevision: 1, currentUpdatedAt: expect.any(Number) });

    const current = writeSave(database.db, hash, 1, { ...state, company: "CURRENT" });
    expect(current).toMatchObject({ kind: "ok", revision: 2 });

    expect(loadSave(database.db, hash)).toMatchObject({
      kind: "ok",
      save: { revision: 2, state: { company: "CURRENT" } },
    });
  });

  it("returns a conflict for a non-zero first write instead of adopting the caller's revision", () => {
    const hash = "c".repeat(64);
    expect(writeSave(database.db, hash, 7, validGame())).toEqual({
      kind: "conflict",
      currentRevision: 0,
      currentUpdatedAt: expect.any(Number),
    });
    expect(loadSave(database.db, hash)).toEqual({ kind: "none" });
  });

  it("isolates anonymous sessions and resets only the matching row", () => {
    const hashA = "d".repeat(64);
    const hashB = "e".repeat(64);
    expect(writeSave(database.db, hashA, 0, validGame("ALPHA"))).toMatchObject({ kind: "ok", revision: 1 });
    expect(writeSave(database.db, hashB, 0, validGame("BETA"))).toMatchObject({ kind: "ok", revision: 1 });

    expect(loadSave(database.db, hashA)).toMatchObject({ kind: "ok", save: { state: { company: "ALPHA" } } });
    expect(loadSave(database.db, hashB)).toMatchObject({ kind: "ok", save: { state: { company: "BETA" } } });

    expect(resetSave(database.db, hashA)).toBe(true);
    expect(loadSave(database.db, hashA)).toEqual({ kind: "none" });
    expect(loadSave(database.db, hashB)).toMatchObject({ kind: "ok", save: { state: { company: "BETA" } } });
  });

  it("reports corrupt rows without replacing them", () => {
    const hash = "f".repeat(64);
    expect(writeSave(database.db, hash, 0, validGame())).toMatchObject({ kind: "ok" });
    database.sqlite
      .prepare("UPDATE games SET state_json = ? WHERE session_hash = ?")
      .run("{not-json", hash);

    expect(loadSave(database.db, hash)).toEqual({ kind: "corrupt" });
    const row = database.sqlite.prepare("SELECT COUNT(*) AS count FROM games WHERE session_hash = ?").get(hash) as {
      count: number;
    };
    expect(row.count).toBe(1);
  });
});
