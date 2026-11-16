# Architecture and source map — v1.1

Updated 2026-11-16 after the Next.js/SQLite migration. This describes implemented source, not a proposed multiplayer backend.

## Runtime

```text
app/layout.tsx (metadata, fonts, Leaflet CSS)
  → app/page.tsx
  → src/components/ClientApp.tsx   "use client" + next/dynamic({ ssr: false })
  → src/App.tsx                    GameProvider
  → onboarding or six-screen console
```

The app shell is deliberately client-only. Leaflet, Three.js/WebGL, `window`, `document`, `localStorage`, geolocation, and pointer lock never execute during server rendering. `app/page.tsx` itself is a small server component; `ClientApp` loads the interactive tree after hydration.

Player input → typed `Action` → `reducer` → `GameState` → React views/derived selectors. `src/state/store.tsx` owns the browser interval and persistence side effects. It dispatches one simulation hour per tick; the base interval is 1,000 ms divided by speed. There is no server clock, offline catch-up, or authoritative action simulation. Browser throttling affects progression.

Next.js 16 App Router with React 19 and strict TypeScript. `@/*` resolves to `src/*`. `npm run dev` and `npm start` bind `0.0.0.0`. API routes declare the Node runtime; `better-sqlite3` is loaded only through server modules and is marked as a server external package.

## Find the right file

| Concern/change | Source and related contracts |
| --- | --- |
| HTML shell, metadata, fonts, global CSS | `app/layout.tsx`, `app/globals.css` |
| Client-only app loading/fallback | `app/page.tsx`, `src/components/ClientApp.tsx` |
| Domain entities, save shape, phases | `src/game/types.ts` |
| Actions, initialization/demo, simulation tick, projects, trade, maintenance | `src/game/engine.ts` (`Action`, `reducer`, `createGame`, `demoGame`, `flows`, `systemMods`, `priceFor`, `tradeCapacity`) |
| Costs, phase shares, building catalogue, role prompts, open questions | `src/game/constants.ts` |
| Full save validation, bounds, reference checks, secret stripping | `src/game/validate.ts` |
| Approximate claim geometry, seeded helpers, synthetic roads | `src/game/geo.ts` |
| Row-major cell plans, generation, stats, collision/spawn helpers | `src/game/plans.ts` |
| State/UI separation, server-first boot, autosave, migration/reset | `src/state/store.tsx` |
| Serialized/coalesced autosave queue and conflict/error states | `src/lib/autosave.ts` |
| Browser save/config HTTP client | `src/lib/saveApi.ts` |
| Screen selection, keyboard shortcuts | `src/App.tsx` |
| Geolocation/manual registration, demo, legacy card | `src/components/Onboarding.tsx` |
| Save banner, boot screen, status pill | `src/components/Shell.tsx` |
| Leaflet layers, map interaction | `src/components/WorldMap.tsx` |
| Sector/site actions and building catalogue | `src/components/Territory.tsx` |
| Project visualization | `src/components/Pipeline.tsx` |
| Plan/interior orchestration | `src/components/Studio.tsx` |
| 2D cell editing | `src/components/FloorPlanEditor.tsx` |
| Three.js scene/cameras/interior interaction | `src/components/BuildingScene.tsx` |
| Advisor messages, local fallback, digest, server proxy client | `src/game/advisor.ts` |
| Board chat and server-managed advisor preferences | `src/components/Boardroom.tsx` |
| Bot trades, simulated peers, road UI | `src/components/Diplomacy.tsx` |
| In-app design reference, questions, save/import/export/recovery UI | `src/components/GDD.tsx` |
| Save GET/PUT/reset handlers | `src/server/saveApi.ts` |
| Transactional revision concurrency and session ownership | `src/server/saveStore.ts` |
| Origin/CSRF checks, JSON limits, response helpers | `src/server/http.ts` |
| Anonymous cookie token/hash/serialization | `src/server/session.ts` |
| SQLite path, WAL, migrations, process-wide connection | `src/server/db/create.ts`, `src/server/db/index.ts`, `src/server/db/schema.ts` |
| Advisor proxy, env config, timeout, rate limiting | `src/server/advisorApi.ts` |
| Route handlers | `app/api/save/route.ts`, `app/api/save/reset/route.ts`, `app/api/advisor/route.ts`, `app/api/advisor/config/route.ts` |
| Generated versioned migration | `drizzle/`, `drizzle.config.ts` |
| Migration/count CLI | `scripts/db-migrate.ts` |
| Automated tests | `tests/` |
| Shared controls/icons | `src/components/ui.tsx`, `src/utils/cn.ts` |

`src/server/**` is server-only (`server-only` on the DB entry point). Do not import it into client components. The client talks to it only through same-origin `/api/*` routes.

## State and persistence contracts

### Save shape

- `GameState` contains economy, claim, sectors/sites, buildings/plans, projects, executives (with `ai: { enabled, temperature }`), simulated peers/bots/roads, logs, and design question answers. It no longer contains provider keys, base URLs, or model names.
- `UiState` contains screen/selection/visit metadata, chat, toast, and boot state; it is not persisted with the game.
- Game save key/schema remains `simplayz.save.v4` / `schema: 4`. `prepareGameState` validates the entire object, entity references, bounds, and a 1.5 MB serialized budget. It also strips credential-shaped fields before validation so old saves can be migrated safely. Debt (negative credits) is valid gameplay, not corruption.
- `FloorPlan.cells[y * w + x]` has `w*h` cells; dimensions are metres, cell types 0 void / 1 floor / 2 wall / 3 door / 4 glass. Project `draft` is promoted into building `plan` on deployment. Keep 2D, 3D, and collision semantics aligned.

### Boot and save lifecycle

1. `GameProvider` starts in `boot: "loading"`; the simulation interval is gated on both a successful boot and an onboarding/demo/hydrate choice. No tick or save occurs before that.
2. `GET /api/save` returns the save for the anonymous cookie session (creating a cookie if absent). A validated save hydrates directly. Invalid stored data is reported as `SAVE_CORRUPT`/a boot error and is not replaced.
3. With no server save, onboarding is shown. A legacy `simplayz.save.v4` copy may be offered; it is sanitized in place immediately, but migration is explicit and the local copy survives until a server write succeeds.
4. On every `GameState` change after boot, `AutosaveController.markDirty` updates a pending snapshot. Player actions request a short prompt delay; simulation ticks do not. At most one PUT is in flight. A new write starts no later than five seconds after the previous attempt while pending state remains, so accelerated ticks cannot starve saving indefinitely.
5. `PUT /api/save` sends `{ revision, state }`. Success advances the revision. Network/DB failure retains the snapshot, shows `Saved` → `Unsaved/error`, and retries automatically while play continues. A `409 REVISION_CONFLICT` pauses autosave and retains the unsaved snapshot; recovery is explicit: load the server copy (discard local changes) or replace the server copy with this tab's state.
6. `pagehide` attempts a `keepalive` write of a pending snapshot. This is best effort; it is not a guarantee on mobile, forced termination, or oversized payloads.
7. Reset pauses and waits for any in-flight write, calls `POST /api/save/reset` with explicit confirmation, removes the legacy local copy, clears the controller, and returns to onboarding. The cookie and session remain, so a newly registered game starts at revision 1.
8. Import validates/sanitizes before hydration and queues a normal server write. Export validates/sanitizes and never includes advisor credentials. Export still includes company/location data.

### HTTP and authorization boundary

| Method/path | Purpose | Boundary |
| --- | --- | --- |
| `GET /api/save` | Load current anonymous save | Sets/reads `simplayz.sid`; no CSRF requirement for a read; `Cache-Control: no-store` |
| `PUT /api/save` | Validate and write a save | Requires cookie session, same-origin `Origin`, `X-Simplayz-Request: 1`, `application/json`, ≤2 MB body, revision `0..1e12`, full save validation |
| `POST /api/save/reset` | Delete this session's save | Requires cookie session, same-origin checks, custom header, and `{ confirm: true }`; ≤8 KB body |
| `GET /api/advisor/config` | Report whether the live advisor exists | Returns only `{ configured, model }`; never the key or base URL |
| `POST /api/advisor` | Proxy one advisor turn | Same-origin checks, 32 KB body, role/prompt/digest/history/temperature bounds, timeout, rate limits |

The session token is 32 random bytes encoded as base64url. The database stores its SHA-256 hash, not the token. The cookie is `HttpOnly`, `SameSite=Lax`, `Path=/`, one year; `Secure` defaults on in production. `SIMPLAYZ_COOKIE_SECURE=0` is an explicit override for HTTP-only local production testing. Clearing the cookie means the row can no longer be reached; there is no email/account recovery.

`checkStateChangingRequest` requires an exact `Origin` match against the request host/protocol, rejects cross-site `Sec-Fetch-Site` values, and requires the custom request header. This is a CSRF boundary for the anonymous prototype, not an account system. Proxy deployments that terminate TLS must either set `SIMPLAYZ_TRUST_PROXY=1` with a proxy that overwrites forwarded headers, or ensure `Origin` matches the host the Next server sees.

### Database

- SQLite via `better-sqlite3` + Drizzle ORM. Default path `./data/simplayz.sqlite`; configure with `SIMPLAYZ_DB_PATH`. Relative paths resolve from the process working directory. The DB is runtime state outside `src/`/`public/` and is gitignored with WAL/SHM/backup files.
- WAL journal mode (except `:memory:`), `foreign_keys=ON`, `busy_timeout=5000`, `synchronous=NORMAL`.
- Versioned migrations live in `drizzle/`; `app_meta.database_schema_version` is currently `1`. The app runs migrations lazily on first DB use; `npm run db:migrate` runs them explicitly and prints the schema version and stored game count.
- `games`: `id`, unique `session_hash`, `state_json`, `game_schema`, `revision`, `created_at`, `updated_at`. One row per anonymous session.
- Writes run in one SQLite transaction: read by session hash, compare expected revision, insert revision 1 only for revision 0 when absent, otherwise update with `revision = revision + 1`. Stale/missing-row mismatches return conflict rather than overwriting. Ownership is always derived from the cookie hash; no client-supplied save ID is accepted as authorization.
- Database schema version and game-save schema version are independent. Package version `0.0.0`, database schema `1`, game schema `4`, and in-game feature versions are separate identifiers.

## Geography and remote requests

Leaflet uses `[lat, lng]` tuples and named `{lat, lng}` centers. GeoJSON uses `[lng, lat]` if introduced later: convert at a named boundary. `claimCorners` uses a local small-angle approximation, not an exact global cadastral grid. Polar cosine is clamped; antimeridian/polar validity and claim collision are not solved. Independent player-selected centers do **not** guarantee non-overlapping claims.

Both onboarding and world map request `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`. Roads are synthetic Manhattan-bend polylines (`roadPath` returns five points), not routes on OSM ways. Resource sectors/sites and peers are generated, not extracted from OSM. Google Fonts load from `app/layout.tsx`. Tile/font/API access may fail in restricted environments; the production build does not verify these requests. Review OSM service policies before scale: https://operations.osmfoundation.org/policies/tiles/ and attribution guidance: https://www.openstreetmap.org/copyright (reference links, not a policy compliance audit).

## AI boundary

`buildAdvisorMessages` combines the role system prompt, company/role wrapper, `stateDigest`, up to eight history turns, and the current user input. When a player enables AI for a role, `askExec` POSTs `{ role, company, prompt, digest, temperature, history }` to same-origin `/api/advisor`.

The server, not the browser, loads `SIMPLAYZ_ADVISOR_API_KEY`, `SIMPLAYZ_ADVISOR_BASE_URL`, `SIMPLAYZ_ADVISOR_MODEL`, and `SIMPLAYZ_ADVISOR_TIMEOUT_MS`. It validates the base URL (HTTPS, or HTTP only for localhost), sends `POST {base}/chat/completions`, and returns only trimmed text plus the model name. Provider errors are mapped to generic messages; the key and URL never appear in responses. The request uses an AbortController timeout (default 12 s, clamped 1–30 s) and a fixed per-session/per-process rate limit.

The browser also has a 15 s abort. Missing configuration, non-OK HTTP, invalid JSON, empty text, timeout, or network failure falls back to `localAdvice`, which is keyword/rule-driven and grounded in the same digest—**not an on-device LLM**. Advisor text is advisory only; state-changing approvals/builds remain reducer actions.

Rate limiting is in-memory and process-local: 10 requests/minute per anonymous session and 120/minute per client IP bucket. It is not durable or shared across instances. If `SIMPLAYZ_TRUST_PROXY=1`, forwarded IP headers must be overwritten by a trusted reverse proxy. Do not send secrets or private player data to evaluate prompts without approval.

## Multiplayer direction (not implemented)

This migration added durable per-session saves and an anonymous identity boundary; it did **not** add a shared world. There is still no server simulation, cross-player ownership conflict resolution, real-time transport, human presence, or action authority. `RemoteCeo`, `netMode`, and generated peer plans remain prototype data seams. A multiplayer change first needs decisions on authority, identity, time progression, claim conflicts, transactions, persistence, and abuse limits. Never describe the anonymous cookie as authentication or a `live` type option as a working transport.
