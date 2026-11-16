# Architecture and source map — v2.0

2026-11-16: Next.js/SQLite migration. Gameplay simulation and economic formulas remain unchanged.

## Runtime

`src/app/layout.tsx` loads global/Tailwind/Leaflet CSS and font links. `page.tsx` is a client entry that dynamically imports `App.tsx` with SSR disabled: Leaflet, Three.js, browser storage and pointer lock never execute on the server. Next StrictMode remains enabled. Components below that boundary are client modules transitively.

`App` → `GameProvider` loads `/api/game` before gameplay mounts. Player inputs → typed reducer actions → `GameState` → UI. One tick is still one simulation hour, at pause/1×/4×/16×; no offline catch-up/server ticks.

Next Node-runtime routes → same-origin/content/size/session checks → Zod snapshot validation → SQLite. `server-only` guards prevent database/credential code entering client bundles. Drizzle parameterizes SQL; better-sqlite3 runs local transactions with WAL, foreign keys and a 5-second busy timeout. Full-repository `next start` deployment is supported, not static export/standalone packaging or ephemeral hosts.

## Find the right file

| Concern/change | Source and related contracts |
| --- | --- |
| Domain entities, save shape, phases | `src/game/types.ts` |
| Actions, initialization/demo, simulation tick, projects, trade, maintenance | `src/game/engine.ts` (`Action`, `reducer`, `createGame`, `demoGame`, `flows`, `systemMods`, `priceFor`, `tradeCapacity`) |
| Costs, phase shares, building catalogue, role prompts, open questions | `src/game/constants.ts` |
| Approximate claim geometry, seeded helpers, synthetic roads | `src/game/geo.ts` |
| Row-major cell plans, generation, stats, collision/spawn helpers | `src/game/plans.ts` |
| State/UI separation, autosave, timer, new game/reset | `src/state/store.tsx` |
| Screen selection, keyboard shortcuts | `src/App.tsx` |
| Geolocation/manual registration, demo | `src/components/Onboarding.tsx` |
| Leaflet layers, map interaction | `src/components/WorldMap.tsx` |
| Sector/site actions and building catalogue | `src/components/Territory.tsx` |
| Project visualization | `src/components/Pipeline.tsx` |
| Plan/interior orchestration | `src/components/Studio.tsx` |
| 2D cell editing | `src/components/FloorPlanEditor.tsx` |
| Three.js scene/cameras/interior interaction | `src/components/BuildingScene.tsx` |
| Advisor request/fallback, digest | `src/game/advisor.ts` |
| Board chat and per-role AI config | `src/components/Boardroom.tsx` |
| Bot trades, simulated peers, road UI | `src/components/Diplomacy.tsx` |
| In-app design reference, questions, JSON save import/export | `src/components/GDD.tsx` |
| Navigation, speed/summary/ticker/toasts | `src/components/Shell.tsx` |
| Shared controls/icons, style tokens | `src/components/ui.tsx`, `src/index.css`, `src/utils/cn.ts` |

## Persistence contracts

- `src/persistence/validation.ts` validates every game entity, finite numeric bounds, plan dimensions, entity uniqueness and key references. Legacy/unknown fields including AI keys/URLs are stripped. Debt, executive load above 100 and existing overspent project behavior are preserved. Limits are transport-safety ceilings, not economic tuning; near-pole/world-wrap states outside accepted coordinate bounds are refused rather than normalized.
- `src/persistence/queue.ts` serializes/coalesces writes with a non-resetting four-second deadline; new pending data during writes is flushed after completion. Failure retains pending state; retry is explicit. Revision conflict blocks autosave until the player makes a recovery choice.
- `src/persistence/client.ts` owns relative fetches, bounded client timeouts, clean exports and legacy redaction.
- `src/state/store.tsx` gates simulation on initial load/legacy choice, schedules urgent action saves, and exposes loading/saving/saved/error/conflict UI. Browser data is only a legacy migration source, not new-save persistence.
- `src/server/database.ts` owns SQLite, migrations and revisioned session rows. `sessions.id` is a hash of a 256-bit cookie token, not the token itself. `saves` holds one nullable snapshot per session with timestamps and monotonically increasing revision. Reset leaves a revisioned tombstone, preventing stale pre-reset writes.
- `migrations/0001_initial.sql` + `PRAGMA user_version=1` are the ordered migration baseline; extend the migration runner and add a new SQL file for future DB changes. Game schema remains 4, without secret config fields; legacy schema-4 saves are parsed/sanitized on import.
- `src/server/http.ts` centralizes origin/session/streamed-body limits and bounded single-process rate buckets. GET may issue a new cookie; PUT requires a valid session and integer expected revision. PUT state `null` is reset. Routes return no-store responses and sanitized errors.
- `src/server/game-api.ts` implements testable handlers; `src/app/api/game/route.ts` supplies the real DB. GET returns `{state,revision,createdAt,updatedAt}`; PUT `{state,revision}` returns `{revision}`. Errors: 400 invalid, 401 session, 403 origin, 409 stale, 413 size, 415 content type, 429 rate, 503 storage.
- `UiState` (chat/selection/toasts/visit) is not persisted. Game snapshots still contain private company/location data, but never API credentials.

## AI boundary

`askExec` retains local rule-based fallback. Enabled preferences send the validated state, current input and up to eight messages to `/api/advisor`. `advisor-api.ts` reconstructs the existing executive v1 system wrapper/digest/history contract. Operator environment controls endpoint/model/key; no client URL proxy or BYOK storage exists. Temperature remains a non-secret player preference. Server adds a 400-token completion budget, a 100–12,000 ms timeout (10,000 default), no redirects, per-session/global rate limits, and sanitized errors. Client fallback also handles a 15-second timeout. Prompt content is unchanged; the existing duplicate latest CEO turn remains to avoid unrelated prompt changes. See `docs/prompts/EXECUTIVES.md` for evaluation contract.

## Geography / external services

Leaflet expects `[lat,lng]`, named centers `{lat,lng}`. GeoJSON conversion would require `[lng,lat]`. Claim boxes use small-angle approximations; independently selected centers can overlap. OSM raster tiles are visual, not ownership or routing data. `roadPath` creates five synthetic points; peers/sectors/sites are generated. Neither map nor visits enforce multiplayer permissions.

Both maps request `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`; Google Fonts load from layout links. Remote assets/API access may fail in a restricted sandbox. Preserve attribution and review https://operations.osmfoundation.org/policies/tiles/ before scaling. SQLite persistence does not eliminate these network requirements.

## Non-goals and deployment boundary

No accounts, cross-device recovery, server-authoritative actions, shared land conflicts, real presence, offline simulation, distributed locks/rate limits or multi-instance hosting. Snapshot validation is integrity protection, not anti-cheat. Read README for persistent-volume, HTTPS, backup/restore and session limitations.

## Revision log

- v2.0 — 2026-11-16: Next App Router, server SQLite snapshots, session ownership, credential removal, save queue and recovery APIs.
- v1.0 — 2026-11-16: original Vite/localStorage audit, superseded for infrastructure; gameplay source map retained.
