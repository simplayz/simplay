# Agent operating guide — v2.0

Applies to the whole repository. Updated 2026-11-16. Infrastructure migrated to Next.js + SQLite; see CHANGELOG.md.

## Read in this order

1. `README.md`: implemented prototype vs multiplayer vision, setup, secret handling.
2. `docs/ARCHITECTURE.md`: read only the source paths relevant to the request.
3. `docs/DECISIONS.md`: known risks and unresolved assumptions.
4. For mechanics/balance read `docs/GAME_DESIGN.md`; for prompts read `docs/prompts/CHANGE_REQUEST.md`; validate using `docs/TESTING.md`.

Inspect current source and `git status --short` before editing. These docs are a map, not a substitute for reading changed code. Existing runtime behavior wins when describing implementation; an explicit user decision defines intended behavior. Record disagreements instead of hiding them.

## Scope and guardrails

- Work on the session's current branch; do not create/switch/rename branches. Do not commit, push, open PRs, or change unrelated files unless requested.
- Preserve the Next.js App Router/React/TypeScript stack and existing visual language unless the request changes them. Avoid unrelated dependency upgrades or architecture rewrites.
- Game mutations belong in the engine/action contract, not duplicated UI calculations. UI-only selection/chat/toasts belong in the store's `UiState`.
- Do not claim that simulated peers are humans, that a type union enables multiplayer, or that visual OSM tiles are authoritative geography/ownership/routing data.
- Preserve OSM attribution. Read latitude/longitude ordering carefully; see architecture. Do not add mass tile downloads, unrestricted geocoding, or an Overpass dependency as a side effect of a visual change.
- Preserve game `schema: 4` legacy import compatibility and revision checks; `simplayz.save.v4` is migration-only. Preserve compatibility unless the request requires a change. For breaking changes document migration or user-approved reset, plus old/corrupt-save tests. Never silently discard player progress.
- Never commit keys, location-bearing saves, `.env`, `node_modules`, or generated `dist`. Browser `NEXT_PUBLIC_*` values are public, not a secret vault.
- Do not describe the reducer as deterministic: it currently uses `Math.random` and `Date.now`. Mock/control those sources for reproducible tests.
- Preview servers bind to `0.0.0.0`; browser code must not call sandbox `localhost` for a separate API. Use same-origin relative paths with a proxy when adding a backend.

## Change workflow

1. Restate the player problem and measurable acceptance criteria. Identify impacted files, non-goals, save/API/security consequences, and dependencies.
2. Ask only questions that materially block safe work (especially authority, ownership conflicts, economic intent, data loss, credentials). Otherwise label reversible assumptions.
3. Implement the smallest coherent change; keep costs, durations, rewards, cooldowns and their rationale together. Do not silently rebalance while fixing UI.
4. Validate happy path, boundary/edge, and failure/recovery. Run `npm run typecheck`, `npm test` and `npm run build`; `npm test` runs Vitest; no lint script exists. Add focused automated tests when changing complex logic if tooling is in scope; never call a manual scenario an automated test.
5. Update relevant docs and `CHANGELOG.md` for significant behavior/design changes. Keep in-app GDD/tables aligned where relevant. Report discrepancies that remain.
6. Summarize changed behavior/files, check results, skipped checks with reasons, and remaining risks. Do not claim production readiness from compilation alone.

## Design and prompt contracts

Every new/changed mechanic must specify purpose, player feeling/decision, inputs, outputs, rules/formulas, edge cases, failure/recovery, and acceptance tests. Every changed economic number needs units, a rationale, and a boundary example. Distinguish hypothesis from measured balance.

Before authoring a prompt define its output format and success criteria. Version it with a changelog and at least three cases (happy, edge, failure). Ground factual claims in provided state; make unknowns explicit; specify word/field limits instead of vague style instructions. Request concise decision summaries, not private chain-of-thought. Record actual production model identifier, provider, temperature, fixtures, and observations for model tests. If live evaluation is unavailable, mark it **not run** rather than asserting reliability. Do not send secrets or private player data to evaluate a prompt without approval.

## Definition of done

- Acceptance criteria implemented or explicitly marked blocked/deferred.
- Typecheck/build results reported; relevant gameplay paths checked or disclosed as untested.
- Save/schema, resource integrity, map lifecycle, and endpoint fallback considered where touched.
- Design/prompt revision and test evidence updated; no unrelated code/artifact changes.

## Migration-specific guardrails (v2.0)

- Read README deployment requirements before touching DB/auth. One persistent Node server, SQLite WAL; no Edge/static export. Never expose operator keys, owner hashes, or DB modules to client bundles.
- Keep DB schema version, game schema version, and save revision independent. Schema changes need versioned SQL migrations; reset must not rewind save revision.
- Validate/sanitize imports on client and server; enforce session ownership, same-origin writes and CAS revisions. Do not turn client snapshots into authoritative multiplayer claims.
- Keep the client-only dynamic game boundary: Leaflet and Three.js must not execute during SSR. Do not reintroduce legacy localStorage autosave.
- Test happy/edge/failure for saving, loading gates, retries, conflicts and credential stripping. Browser tests require external Chromium/system libraries; report unavailable checks honestly.
