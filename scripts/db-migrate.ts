import { createDatabase, resolveDbPath } from "../src/server/db/create";

const path = resolveDbPath();
const { sqlite, db } = createDatabase(path, { migrate: true });
const version = sqlite
  .prepare("SELECT value FROM app_meta WHERE key = 'database_schema_version'")
  .get() as { value?: string } | undefined;
const games = sqlite.prepare("SELECT COUNT(*) AS count FROM games").get() as { count: number };

console.log(`Simplayz SQLite ready: ${path}`);
console.log(`Database schema version: ${version?.value ?? "unknown"}`);
console.log(`Stored anonymous games: ${games.count}`);

// Release the handle so this short-lived command exits cleanly.
void db;
sqlite.close();
