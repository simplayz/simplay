# Architecture and source map — v1.0

Audit: 2026-11-16, baseline `294a75c`. This describes source, not a proposed backend.

## Runtime

`index.html` → `src/main.tsx` (React StrictMode) → `App.tsx` → `GameProvider` → onboarding or six-screen console.

Player input → typed `Action` → `reducer` → `GameState` → React views/derived selectors. `store.tsx` owns the browser interval and save side effects. It dispatches one simulation hour per tick; base interval is 1,000 ms, divided by speed. There is no server clock or offline elapsed-time catch-up. Browser throttling affects progression.

`vite.config.ts` combines React, Tailwind v4 and `vite-plugin-singlefile`; `@/` resolves to `src/`. `npm run build` bundles without typechecking. No router, HTTP server API, database, auth, WebSocket client, or synchronization layer exists.

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

## State and persistence contracts

- `GameState` includes economy, claim, sectors/sites, buildings/plans, projects, executives **and AI keys**, simulated peers/bots/roads, logs and design question answers.
- `UiState` contains screen/selection/visit metadata, chat, toast and boot status; not saved with game state.
- Save key `simplayz.save.v4`, schema `4`. Startup accepts matching schema plus a truthy claim. GDD import checks only schema; `hydrate` directly returns supplied state. Neither validates the entire object.
- Autosave uses a **700 ms debounce on every state change**. At continuous 4×/16×, ticks can continually cancel the pending save. Do not promise a fixed save interval or reliable accelerated-play persistence.
- Storage quota/write errors are swallowed; play continues in memory. Reset removes the key and returns to onboarding. Export serializes all game state, without secret redaction.
- `FloorPlan.cells[y * w + x]` has `w*h` cells; dimensions are metres, cell types 0 void / 1 floor / 2 wall / 3 door / 4 glass. Project `draft` is promoted into building `plan` on deployment. Keep 2D, 3D and collision semantics aligned.

## Geography and remote requests

Leaflet uses `[lat, lng]` tuples and named `{lat, lng}` centers. GeoJSON uses `[lng, lat]` if introduced later: convert at a named boundary. `claimCorners` uses a local small-angle approximation, not an exact global cadastral grid. Polar cosine is clamped; antimeridian/polar validity and claim collision are not solved. Independent player-selected centers do **not** guarantee non-overlapping claims.

Both onboarding and world map request `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`. Roads are synthetic Manhattan-bend polylines (`roadPath` returns five points), not routes on OSM ways. Resource sectors/sites and peers are generated, not extracted from OSM. Google Fonts load from `index.html`. Tile/fonts/API access may fail in restricted environments; bundling does not verify these requests. Review OSM service policies before scale: https://operations.osmfoundation.org/policies/tiles/ and attribution guidance: https://www.openstreetmap.org/copyright (reference links, not a policy compliance audit).

## AI boundary

`EXEC_META[role].system` + company/role wrapper + `stateDigest` + last eight history messages + current user input → POST `${baseUrl}/chat/completions`. Default disabled config: `gpt-4o-mini`, temperature `0.6`, OpenAI base URL. These defaults are configuration, not proof of provider availability or evaluated model behavior.

`askExec` uses direct browser fetch and bearer credentials; endpoint must allow browser CORS. Non-OK HTTP, invalid JSON, empty completions and thrown fetch errors fall back to local rules. There is no timeout/abort or structured-output validation. The board awaits roles sequentially; a hanging request can keep it busy. Local advice is keyword/rule-driven, **not an on-device LLM**. Responses are advisory text, not authorized tool calls: state-changing approval/build decisions remain in the reducer.

The board includes the latest CEO message in history and `askExec` appends it again. Digest/local advice contain some hardcoded facts and mismatched calculations; consult the risk register before changing prompts.

## Multiplayer direction (not implemented)

Do not add a backend merely because this product is called multiplayer. A shared-world request first needs decisions on authority, identity, time progression, claim conflicts, transactions, persistence, and abuse limits. Server authority must eventually validate actions/ownership, not trust imported client state or AI text. `RemoteCeo`, `netMode` and generated peer plans are prototype data seams, not a network contract or access-control boundary.
