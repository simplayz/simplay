import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { GameState } from "@/game/types";
import { GAME_SCHEMA, prepareGameState } from "@/game/validate";
import type { Db } from "./db/create";
import { games } from "./db/schema";

export interface LoadedSave {
  state: GameState;
  revision: number;
  gameSchema: number;
  createdAt: number;
  updatedAt: number;
}

export type LoadResult =
  | { kind: "none" }
  | { kind: "ok"; save: LoadedSave }
  | { kind: "corrupt" };

export type WriteResult =
  | { kind: "ok"; revision: number; savedAt: number; createdAt: number }
  | { kind: "conflict"; currentRevision: number; currentUpdatedAt: number };

export function loadSave(db: Db, sessionHash: string): LoadResult {
  const row = db.select().from(games).where(eq(games.sessionHash, sessionHash)).get();
  if (!row) return { kind: "none" };
  if (row.gameSchema !== GAME_SCHEMA) return { kind: "corrupt" };
  try {
    const prepared = prepareGameState(JSON.parse(row.stateJson));
    if (!prepared.ok) return { kind: "corrupt" };
    return {
      kind: "ok",
      save: {
        state: prepared.state,
        revision: row.revision,
        gameSchema: row.gameSchema,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
    };
  } catch {
    return { kind: "corrupt" };
  }
}

/**
 * One transaction per write. The revision is checked inside the same SQLite
 * transaction as the update, so two clients using the same revision cannot
 * both succeed. A missing row only accepts revision 0 (initial create).
 */
export function writeSave(db: Db, sessionHash: string, expectedRevision: number, state: GameState): WriteResult {
  const stateJson = JSON.stringify(state);
  const now = Date.now();

  return db.transaction((tx) => {
    const row = tx.select().from(games).where(eq(games.sessionHash, sessionHash)).get();
    if (!row) {
      if (expectedRevision !== 0) {
        return { kind: "conflict" as const, currentRevision: 0, currentUpdatedAt: now };
      }
      tx.insert(games)
        .values({
          id: randomUUID(),
          sessionHash,
          stateJson,
          gameSchema: state.schema,
          revision: 1,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      return { kind: "ok" as const, revision: 1, savedAt: now, createdAt: now };
    }

    if (row.revision !== expectedRevision) {
      return {
        kind: "conflict" as const,
        currentRevision: row.revision,
        currentUpdatedAt: row.updatedAt,
      };
    }

    const nextRevision = row.revision + 1;
    const updated = tx
      .update(games)
      .set({
        stateJson,
        gameSchema: state.schema,
        revision: nextRevision,
        updatedAt: now,
      })
      .where(and(eq(games.sessionHash, sessionHash), eq(games.revision, expectedRevision)))
      .run();
    if (updated.changes !== 1) {
      const current = tx.select().from(games).where(eq(games.sessionHash, sessionHash)).get();
      return {
        kind: "conflict" as const,
        currentRevision: current?.revision ?? expectedRevision,
        currentUpdatedAt: current?.updatedAt ?? now,
      };
    }
    return {
      kind: "ok" as const,
      revision: nextRevision,
      savedAt: now,
      createdAt: row.createdAt,
    };
  });
}

export function resetSave(db: Db, sessionHash: string): boolean {
  const result = db.delete(games).where(eq(games.sessionHash, sessionHash)).run();
  return result.changes > 0;
}
