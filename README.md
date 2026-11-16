# Simplayz

A company/world-simulation game on OpenStreetMap: claim a place, commission buildings through an SDLC pipeline, edit their plans, explore interiors, and balance resources with CTO/CFO/COO advisors.

**Current stack:** Next.js App Router + React + TypeScript, server-side SQLite snapshots through Drizzle/better-sqlite3. **Simulation remains client-driven.** Neighbors, online flags, roads and trades are simulated; this is not shared multiplayer or authoritative land ownership.

## Setup

Supported/tested Node: **22.22.3** (package range `>=22.22.3 <23`), npm 10.9.8. Lockfile pins dependencies. Next 16.4.6 and native better-sqlite3 13.2.0 were checked on this environment. Native builds need C++/Python tooling and matching Node headers if no compatible binary exists. In this restricted sandbox, plain `npm ci` could not download headers from nodejs.org; `npm_config_nodedir=/usr/local npm ci` succeeded using installed headers. That path is environment-specific; use your own header location or normal Node-header network access elsewhere.

```sh
npm ci
cp .env.example .env.local   # optional; defaults work without AI configuration
npm run db:migrate
npm run dev                 # binds 0.0.0.0:3000
```

In Arena open the live preview URL. Do not use your browser's localhost to reach the sandbox. Only `*.e2b.app` is added to development-origin allowances; API writes still require matching Origin/Host.

```sh
npm run typecheck
npm test                    # Vitest: API/DB/queue and jsdom UI tests
npm run build               # Next production build (webpack)
npm start                   # binds 0.0.0.0:3000; HTTPS required in deployment
# Optional, on a machine with browser/system dependencies installed:
npx playwright install --with-deps chromium
npm run test:browser         # against an already-running server; TEST_BASE_URL overrides URL
```

Maintenance commands read exported environment variables, **not Next's .env.local loader**. For a custom database path export `DATABASE_PATH` for both app and maintenance commands. `db:migrate` also runs lazily on first API access, but explicit migration before deployment is recommended.

## Environment and deployment

| Variable | Default / contract |
| --- | --- |
| `DATABASE_PATH` | `./data/simplayz.sqlite`, relative to working directory; use an absolute path on a persistent private volume in production |
| `AI_BASE_URL` | Unset: local-only advisors. Optional operator-controlled HTTPS OpenAI-compatible base URL, e.g. `https://api.openai.com/v1`; no user-supplied URLs |
| `AI_MODEL` | Unset: local-only; exact allowed operator model identifier |
| `AI_API_KEY` | Unset: local-only; server-only secret, never `NEXT_PUBLIC_*` |
| `AI_TIMEOUT_MS` | 10,000 ms, clamped 100–12,000; bounded wait before local fallback |
| `PORT` | Next default 3000 |

Deploy **one long-lived Node server** with the full application, `migrations/`, `.next/`, dependencies and a durable filesystem. Terminate HTTPS at a trusted proxy that preserves the public Host header. Production cookies are Secure; do not deploy production over plain HTTP. Set restrictive filesystem permissions/umask for the database and backups. Do not put them under `public/`. Ephemeral/serverless filesystems, multiple instances and shared network SQLite volumes are not supported. Session/AI rate limits are single-process, not distributed abuse protection. SQLite is not encryption at rest.

## Saves, ownership and recovery

- Anonymous identity is a random HttpOnly, SameSite=Lax cookie. Only its SHA-256 hash is stored in SQLite. Every read/write/reset is scoped to that session, never a client-provided owner ID.
- **Clearing cookies loses access.** No account or recovery service exists. Export JSON first; import an export into a new session if needed. Treat exports as private: they contain location/company data even though keys are excluded.
- DB schema version `1`, game schema `4`, and per-save revision are separate. Reset persists a null snapshot and increments revision; it clears the whole game including advisor preferences, not the anonymous identity. Confirmation is required. Failure leaves an unsaved reset pending for retry.
- Initial server loading blocks simulation. Existing server progress is never overwritten by a default onboarding snapshot.
- Coalesced autosave starts within four seconds of pending ticks; ticks never reset the deadline. At most one write is in flight. Significant actions/pausing request an immediate flush. This limits ordinary progress loss while avoiding a write per accelerated simulation hour. Slow requests, background throttling and unavailable storage can exceed five seconds; status shows unsaved/error. Unload saving is best effort.
- Errors retain pending in-memory progress and offer Retry. Conflicts pause autosave: export current progress, then explicitly load server state or replace it using the latest revision. Do not close an unsaved tab without exporting. Other tabs do not automatically synchronize; revision checks prevent silent overwrites.
- A valid legacy `simplayz.save.v4` browser save is sanitized locally and offered for explicit migration. It never uploads automatically. Choosing legacy may replace the server save, clearly labeled; it stays on disk until successful acknowledgement. Choosing server dismisses the offer once and leaves a redacted legacy copy (clear `simplayz.legacy.dismissed` to offer it again). Invalid legacy data is not uploaded. Back up damaged non-JSON legacy data manually; it cannot be safely interpreted or migrated.
- JSON import validates complete shape, bounds and important references, and asks before replacing current progress. Exports, API writes and reads strip legacy credential fields. Existing private keys from old versions should be revoked; sanitizing a browser copy cannot recall exports already shared.

## Optional advisors

Enable “Use server advisor” per executive. Provider/model/key are operator-configured; browser key entry is removed. Server calls send a validated city digest and up to eight recent chat messages to that provider; enable only with appropriate user consent/privacy policies. Missing configuration, timeout or upstream failure falls back to local rule-based advice, not an on-device LLM. AI text does not execute game actions. Model defaults/preferences in legacy saves are non-secret metadata; the server model is authoritative for requests.

## Backup and restore (WAL-safe)

```sh
DATABASE_PATH=/srv/simplayz/game.sqlite npm run db:backup -- ./backups/game.sqlite
```

This uses SQLite's online backup API for a consistent standalone copy including committed WAL data. Do **not** copy only the live `.sqlite` file while writes are occurring. Protect/encrypt backups and test recovery. To restore: stop **all** application/maintenance processes, preserve the old DB and its `-wal`/`-shm` sidecars together, move them out of the active path, copy the backup to `DATABASE_PATH`, restore private ownership/permissions, run `db:migrate`, then restart. Never leave stale sidecars beside a restored database. Browser cookies must still match backed-up sessions to access those saves.

## Documentation

- [Agent workflow](AGENTS.md)
- [Architecture and source map](docs/ARCHITECTURE.md)
- [Mechanics and balance](docs/GAME_DESIGN.md)
- [Decisions and remaining risks](docs/DECISIONS.md)
- [Validation evidence and procedures](docs/TESTING.md)
- [Reusable Arena change request](docs/prompts/CHANGE_REQUEST.md)
- [Changelog](CHANGELOG.md)

No balance/progression/RNG changes are part of this migration. Map tiles/fonts still require remote access. Review OSM attribution/tile policy and project distribution rights before launch; no project license is supplied. Durable storage is not server-authoritative gameplay, anti-cheat, full account security, or production readiness.
