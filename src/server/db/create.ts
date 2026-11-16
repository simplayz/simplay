import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

export const DEFAULT_DB_PATH = "./data/simplayz.sqlite";
export const DATABASE_SCHEMA_VERSION = 1;

export type SimplayzDatabase = ReturnType<typeof createDatabase>;

export interface DatabaseOptions {
  migrate?: boolean;
  migrationsFolder?: string;
}

export function resolveDbPath(explicitPath?: string): string {
  const configured = explicitPath ?? process.env.SIMPLAYZ_DB_PATH ?? DEFAULT_DB_PATH;
  // The operator owns this path and may put it outside the project. The DB is
  // runtime state, not a build asset, so do not make Turbopack trace it.
  return resolve(/* turbopackIgnore: true */ configured.trim() || DEFAULT_DB_PATH);
}

export function createDatabase(dbPath: string, options: DatabaseOptions = {}) {
  if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");
  if (dbPath !== ":memory:") sqlite.pragma("journal_mode = WAL");

  const db = drizzle(sqlite, { schema });
  if (options.migrate !== false) {
    migrate(db, {
      migrationsFolder: options.migrationsFolder ?? resolve(process.cwd(), "drizzle"),
    });
  }
  return { sqlite, db };
}

export type Db = SimplayzDatabase["db"];
