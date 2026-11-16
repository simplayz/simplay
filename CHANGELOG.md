# Changelog

Repository documentation history. Existing in-game feature history remains in `src/game/constants.ts`; its dates/versions have not been independently verified. Package version `0.0.0`, database schema `1`, game schema `4`, in-game feature version and document versions are separate identifiers.

## 2026-11-16 — Next.js + durable anonymous saves (docs v1.1)

- Replaced Vite with Next.js 16 App Router, React 19, strict TypeScript, path aliases, and a client-only app shell; preserved the existing UI, Leaflet map, Three.js interiors, OSM attribution, and gameplay/economy.
- Added `better-sqlite3` + Drizzle with versioned migrations (`database_schema_version` 1), configurable `SIMPLAYZ_DB_PATH`, WAL, busy timeout, and ignored DB/WAL/SHM/backup files.
- Added anonymous `simplayz.sid` HttpOnly/SameSite session cookies (hashed in SQLite), ownership checks, same-origin/custom-header CSRF checks, payload limits, transactional revision concurrency, and explicit conflict recovery.
- Added full server/boot/import/legacy save validation and sanitization. Game schema remains `4` / `simplayz.save.v4`; the full save budget is 1.5 MB; negative credits remain valid.
- Added serialized/coalesced autosave: at most one write in flight, an attempt at least every 5 s while dirty, prompt saves for actions, best-effort `pagehide`, retained snapshots on failure, explicit conflict recovery, and boot/onboarding gates.
- Added explicit legacy localStorage migration: credentials are stripped immediately, the copy is removed only after a successful server write, and a server save is never overwritten automatically.
- Removed AI provider keys/URLs/models from `GameState`, saves, exports, and bundles. Added a server-only advisor proxy with environment credentials, URL validation, timeout, response bounds, generic errors, fixed endpoints/model, and in-memory rate limits; the grounded local advisor remains the fallback.
- Added six Vitest files (34 tests) for the save API/store, validation/sanitization, autosave, advisor proxy, and store boot/legacy gates. Typecheck and production build pass.
- Added `README.md`, `AGENTS.md`, architecture, design, testing, decisions, deployment/backup, and prompt-template updates. Browser gameplay, real OSM/WebGL/geolocation, live model evaluation, CI, and lint were not added or verified.
- No gameplay balance, shared-world authority, real multiplayer transport, or human-neighbor behavior was added.

## 2026-11-16 — Documentation v1.0 / change-request prompt v1

- Audited source at baseline `294a75c`; separated multiplayer/OSM vision from browser-local simulation.
- Added README, root agent instructions, architecture/source map, mechanic/balance reference, decision/risk register and validation guide.
- Added a versioned Arena change-request prompt with output contract, success criteria and happy/edge/failure evaluation fixtures; live-model tests explicitly not run.
- Added PR checklist and ignored generated `dist/` output.
- Verified dependency install, Vite production build and strict TypeScript check. Browser gameplay and external-service checks not run.
- No gameplay, economy, prompt runtime, networking or save format changed; identified risks remain unfixed.
