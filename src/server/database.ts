import 'server-only';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { sql } from 'drizzle-orm';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { parseSave } from '../persistence/validation';
import type { GameState } from '../game/types';

export class ConflictError extends Error {}
export class UnauthorizedError extends Error {}
export function tokenHash(token: string) { return createHash('sha256').update(token).digest('hex'); }

export function openDatabase(path = process.env.DATABASE_PATH || './data/simplayz.sqlite') {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  const db = drizzle(sqlite);
  // Small ordered SQL migration runner. Drizzle handles typed/parameterized queries;
  // user_version is the DB version, independent from game schema and row revision.
  sqlite.transaction(() => {
    const version = sqlite.pragma('user_version', { simple: true }) as number;
    if (version > 1) throw new Error('Unsupported database version');
    if (version < 1) {
      sqlite.exec(readFileSync(resolve('migrations/0001_initial.sql'), 'utf8'));
      sqlite.pragma('user_version = 1');
    }
  })();
  function authorized(hash: string) {
    if (!db.get(sql`SELECT id FROM sessions WHERE id=${hash}`)) throw new UnauthorizedError();
  }
  return {
    sqlite,
    createSession() {
      const token = randomBytes(32).toString('hex');
      const hash = tokenHash(token); const now = Date.now();
      sqlite.transaction(() => {
        db.run(sql`INSERT INTO sessions(id,created_at) VALUES(${hash},${now})`);
        db.run(sql`INSERT INTO saves(session_id,snapshot,revision,created_at,updated_at) VALUES(${hash},NULL,0,${now},${now})`);
      })();
      return token;
    },
    hasSession(hash: string) { return !!db.get(sql`SELECT id FROM sessions WHERE id=${hash}`); },
    read(hash: string) {
      authorized(hash);
      const row = db.get<{ snapshot: string | null; revision: number; created_at: number; updated_at: number }>(sql`SELECT * FROM saves WHERE session_id=${hash}`)!;
      return { state: row.snapshot ? parseSave(JSON.parse(row.snapshot)) : null, revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at };
    },
    write(hash: string, revision: number, input: GameState | null) {
      const state = input === null ? null : parseSave(input);
      return sqlite.transaction(() => {
        authorized(hash);
        const result = db.run(sql`UPDATE saves SET snapshot=${state ? JSON.stringify(state) : null}, revision=revision+1, updated_at=${Date.now()} WHERE session_id=${hash} AND revision=${revision}`);
        if (result.changes !== 1) throw new ConflictError();
        return revision + 1;
      })();
    },
  };
}
export type GameDatabase = ReturnType<typeof openDatabase>;
let singleton: GameDatabase | undefined;
export function database() { return singleton ??= openDatabase(); }
