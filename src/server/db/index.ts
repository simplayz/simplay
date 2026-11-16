import "server-only";
import { createDatabase, resolveDbPath, type SimplayzDatabase } from "./create";

const globalForDb = globalThis as unknown as { simplayzDb?: SimplayzDatabase };

/** Lazily opens the single process-wide SQLite connection and runs migrations. */
export function getDb(): SimplayzDatabase {
  if (!globalForDb.simplayzDb) {
    globalForDb.simplayzDb = createDatabase(resolveDbPath(), { migrate: true });
  }
  return globalForDb.simplayzDb;
}
