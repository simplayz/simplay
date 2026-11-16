# Agent operating guide — v1.1

Applies to the whole repository. Updated 2026-11-16 after the Next.js/SQLite migration.

## Read in this order

1. `README.md`: current implementation, setup, save/session/secret handling.
2. `docs/ARCHITECTURE.md`: runtime, source map, save API, database, advisor boundary.
3. `docs/DECISIONS.md`: implemented decisions, residual risks, unresolved assumptions.
4. For mechanics/balance read `docs/GAME_DESIGN.md`; for prompts read `docs/prompts/CHANGE_REQUEST.md`; validate using `docs/TESTING.md`; operate using `docs/DEPLOYMENT.md`.

Inspect current source and `git status --short` before editing. These docs are a map, not a substitute for reading changed code. Existing runtime behavior wins when describing implementation; an explicit user decision defines intended behavior. Record disagreements instead of hiding them.

## Scope and guardrails

- Work on the session's current branch; do not create/switch/rename branches. Do not commit, push, open PRs, or change unrelated files unless requested.
- Preserve the Next.js 16 App Router / React 19 / strict TypeScript stack, the client-only app shell, and the existing visual language unless the request changes them. Avoid unrelated dependency upgrades or architecture rewrites.
- Keep Leaflet, Three.js/WebGL, `window`, `document`, `localStorage`, geolocation, and pointer lock out of server rendering. The app tree loads through `src/components/ClientApp.tsx` with `ssr: false`; do not import browser-only modules into server components or route handlers.
- Game mutations belong in the engine/action contract, not duplicated UI calculations. UI-only selection/chat/toasts belong in the store's `UiState`.
- Treat `src/server/**` as server-only. Do not import it into client components. The browser talks to the server through same-origin `/api/*` routes.
- Never trust client-supplied save IDs, revisions, ownership, or unsanitized state. Ownership comes from the anonymous session cookie hash. Keep revision checks and writes inside one SQLite transaction.
- Preserve `schema: 4` / `simplayz.save.v4` compatibility unless the request requires a change. For breaking changes document migration or user-approved reset, plus old/corrupt-save tests. Never silently discard player progress. Database schema version (`app_meta.database_schema_version`, currently `1`) is separate from the game schema.
- Never commit keys, `.env*`, location-bearing saves, SQLite/WAL/SHM/backup files, `node_modules`, `.next`, or generated `dist`. Browser `NEXT_PUBLIC_*` values are public, not a secret vault. Advisor credentials belong only in server env.
- Do not claim that simulated peers are humans, that a type union enables multiplayer, that an anonymous cookie is full authentication/account recovery, or that visual OSM tiles are authoritative geography/ownership/routing data.
- Preserve OSM attribution. Read latitude/longitude ordering carefully; see architecture. Do not add mass tile downloads, unrestricted geocoding, or an Overpass dependency as a side effect of a visual change.
- Do not describe the reducer as deterministic: it uses `Math.random` and `Date.now`. Mock/control those sources for reproducible tests.
- Preview servers bind to `0.0.0.0`; browser code must use same-origin relative paths. Do not hardcode `localhost` for a separate API. Add preview hosts only through `SIMPLAYZ_ALLOWED_DEV_ORIGINS`; do not disable checks globally.
- Do not run destructive DB operations on a real player database. Use a disposable `SIMPLAYZ_DB_PATH` for smoke tests; back up before migrations. Never run multiple writers against one SQLite file expecting coordination.
- State-changing API routes must keep same-origin `Origin`, the `X-Simplayz-Request` header, payload limits, generic error messages, and parameterized Drizzle queries. Do not log save bodies or credentials.

## Change workflow

1. Restate the player problem and measurable acceptance criteria. Identify impacted files, non-goals, save/DB/API/security consequences, and dependencies.
2. Ask only questions that materially block safe work (especially authority, ownership conflicts, economic intent, data loss, credentials). Otherwise label reversible assumptions.
3. Implement the smallest coherent change; keep costs, durations, rewards, cooldowns and their rationale together. Do not silently rebalance while fixing UI.
4. Validate happy path, boundary/edge, and failure/recovery. Run `npm run typecheck`, `npm test`, and `npm run build`. For persistence changes also run `npm run db:migrate` against a disposable path and exercise conflict/error recovery. There is no lint script or CI workflow; never call a manual scenario an automated test.
5. Update relevant docs and `CHANGELOG.md` for significant behavior/design changes. Keep in-app GDD/tables aligned where relevant. Report discrepancies that remain.
6. Summarize changed behavior/files, check results, skipped checks with reasons, and remaining risks. Do not claim production readiness from compilation alone.

## Design and prompt contracts

Every new/changed mechanic must specify purpose, player feeling/decision, inputs, outputs, rules/formulas, edge cases, failure/recovery, and acceptance tests. Every changed economic number needs units, rationale, and a boundary example. Distinguish hypothesis from measured balance.

Before authoring a prompt define its output format and success criteria. Version it with a changelog and at least three cases (happy, edge, failure). Ground factual claims in provided state; make unknowns explicit; specify word/field limits instead of vague style instructions. Request concise decision summaries, not private chain-of-thought. Record actual production model identifier, provider, temperature, fixtures, and observations for model tests. If live evaluation is unavailable, mark it **not run** rather than asserting reliability. Do not send secrets or private player data to evaluate a prompt without approval.

## Definition of done

- Acceptance criteria implemented or explicitly marked blocked/deferred.
- Typecheck, test, and build results reported; relevant gameplay/browser paths checked or disclosed as untested.
- Save/schema/DB migration, session/CSRF, resource integrity, map lifecycle, and endpoint fallback considered where touched.
- No secrets in state, localStorage, exports, API responses, logs, or client bundles.
- Design/prompt revision and test evidence updated; no unrelated code/artifact changes.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
