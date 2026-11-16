# Decisions, risks and open questions — v1.1

Updated 2026-11-16 after the Next.js/SQLite persistence migration. Priority is a recommendation, not an approved implementation backlog.

## Confirmed direction vs provisional defaults

**User-confirmed direction:** Simplayz is intended to be a multiplayer world simulation using the same real-world map based on OpenStreetMap. A separate confirmed request added durable server-side saves for anonymous players without implementing real multiplayer.

**Existing prototype defaults, not confirmed product decisions:** 64 km² claims, four sectors × five sites, 20 archetypes, desktop-first interiors, 10–15 minute sessions, simulated peers, SDLC construction, local-rule advisors, and OpenAI-compatible live advisors. These are playable hypotheses. See `OPEN_QUESTIONS` (`q1`–`q12`) in `src/game/constants.ts`. In-app question answers are saved text only; they do not reconfigure game rules.

## Decisions implemented in this change

| Date | Decision | Rationale / consequences |
| --- | --- | --- |
| 2026-11-16 | Replace Vite with Next.js 16 App Router, React 19, strict TypeScript | One deployment serves the client and API; server-only modules and route handlers provide the persistence boundary. The visual language and engine contract were preserved. |
| 2026-11-16 | Keep the interactive app client-only via `next/dynamic({ ssr: false })` | Leaflet, Three.js/WebGL, `window`, `localStorage`, geolocation, and pointer lock are browser APIs. A client-only shell avoids SSR crashes; the tradeoff is a loading shell before hydration. |
| 2026-11-16 | Use SQLite (`better-sqlite3`) + Drizzle with versioned migrations | Simple durable single-node storage. The DB path is configurable and lives outside `src/`/`public/`. WAL, busy timeout, and foreign keys are enabled. This is not a multi-node database. |
| 2026-11-16 | Anonymous session cookie, hashed at rest, one game row per session | Avoids accounts/identity work while giving each browser durable ownership. The cookie is the bearer credential; clearing it loses access. No account recovery. |
| 2026-11-16 | Optimistic concurrency on an integer save revision | Two tabs cannot silently overwrite each other. Stale writes return `409`; recovery is explicit. The client never supplies an authoritative save ID. |
| 2026-11-16 | Keep game schema `4` / `simplayz.save.v4`; separate DB schema version `1` | Avoids a gameplay save migration purely for storage. Full validation and secret stripping make old copies safe to import. The two schema numbers evolve independently. |
| 2026-11-16 | Never migrate legacy localStorage automatically | A server-only or partially failed boot must not destroy the only copy. Sanitize credentials immediately; remove local data only after a confirmed server write. |
| 2026-11-16 | Remove provider credentials/URLs/models from `GameState`; proxy through server environment variables | Saves, exports, responses, logs, and bundles no longer contain old keys. Live advisor remains optional; local fallback is always available. |
| 2026-11-16 | Single-node deployment; in-memory advisor rate limiting | Acceptable for the current prototype. It is not shared across instances and resets on restart; horizontal scaling would need shared storage/limiting and a new concurrency review. |
| 2026-11-16 | Bind dev/start to `0.0.0.0`; allowlist only explicit dev origins | Required for preview hosting. `SIMPLAYZ_ALLOWED_DEV_ORIGINS` affects the Next dev server only; it is not a production security control. |
| 2026-11-16 | Same-origin `Origin` + custom-header CSRF checks, `SameSite=Lax`, HttpOnly, production Secure cookie | Reasonable anonymous-prototype boundary. It does not replace real authentication, authorization, or abuse prevention. |

## Known risks / source discrepancies

| ID | Status after migration | Impact and evidence | Recommended handling in a future scoped change |
| --- | --- | --- | --- |
| R1 | **Partly fixed** | Provider keys/URLs/models are no longer in `GameState`, exports, responses, bundles, or server logs. Saves still contain CEO/company and claim coordinates; exports are private; the SQLite file is unencrypted; the cookie is a bearer credential; no retention/consent/account recovery exists. | Define privacy/retention policy, at-rest protection, operator access controls, and an account/credential story before public scale. Never share raw saves. |
| R2 | **Mostly fixed** | Server, boot, import, and legacy paths now run full structural/reference/bounds validation and strip credential-shaped fields. Remaining invariant gaps are possible because validation is hand-written; it is not a formal schema. | Add property/fixture tests for new entities; review cross-reference invariants whenever types change. |
| R3 | **Mostly fixed** | Autosave is serialized/coalesced, at most one write is in flight, and a write is attempted at least every five seconds while dirty. `pagehide` is best effort only; forced termination, offline periods, oversized keepalive payloads, or a permanently failing DB can still lose recent progress. | Add explicit offline/expired-cookie UX and a durable client queue if progress loss becomes unacceptable. |
| R4 | **Unchanged** | No shared authority: generated peers, local actions, and synthetic claims. A cookie identifies one save row, not a player in a shared world. | Decide server simulation, ownership, conflict resolution, and identity before multiplayer. |
| R5 | **Unchanged** | The reducer still uses `Math.random`/`Date.now`; StrictMode runs effects twice in development. | Control RNG/time for tests; evaluate replay-safe actions before authoritative networking. |
| R6 | **Partly fixed** | Advisor requests now have server and browser timeouts, rate limits, and generic errors. The duplicated latest CEO turn remains (the client appends the new message to history and `buildAdvisorMessages` appends the prompt again). Local advice still contains static balance assertions; `flows.revenue`/`netCredits` semantics remain unreconciled. | Fix the turn duplication and digest/accounting tests as a separate prompt/mechanics change; evaluate live output on the actual model. |
| R7 | **Unchanged** | Free-selected centers can overlap; small-angle boxes are not a global land registry; roads are five-point synthetic bends, not OSM routing. | Specify claim geometry/conflicts and a routing provider/budget. Do not treat comments as guarantees. |
| R8 | **Unchanged** | Cancellation can add salvage before spending; phase draws may overshoot; change requests lack a treasury guard. | Agree escrow/refund/debt semantics, then add conservation/boundary tests. Do not silently rebalance in a migration. |
| R9 | **Unchanged** | Opening stocks total 1,600 units against 400 base capacity; some archetype descriptions and rationales are stale. | Reconcile descriptions with measured behavior. Rationale is a hypothesis, not verified balance data. |
| R10 | **Improved** | Vitest now covers persistence, autosave, validation, advisor, and store gates; typecheck is a script. There is still no lint script, CI workflow, coverage threshold, or browser E2E suite. | Add CI/lint/E2E in a separately scoped change; do not invent results. |
| R11 | **Extended** | External OSM tiles/Google Fonts, advisor provider terms, SQLite backup/restore, TLS/proxy configuration, and no project LICENSE all affect distribution. Native `better-sqlite3` builds complicate deployment. | Review tile/provider/hosting rights, document operator runbooks, and add a license decision before launch. |
| R12 | **New: session loss/recovery** | Clearing cookies, using another browser/profile, or losing the cookie loses access to the server row. The row remains until reset/cleanup. Multiple tabs share the session and can conflict. | Decide whether account linking/export-import recovery is enough; add retention/cleanup policy. |
| R13 | **New: SQLite operations** | One process/volume; WAL files must be backed up consistently; a lost `data/` volume loses all anonymous saves; migrations are forward-only. In-memory rate limits are per process. | Follow `docs/DEPLOYMENT.md`; back up before migrations; do not run multiple writers against one SQLite file over a network share. |
| R14 | **New: deployment cookie/proxy mismatch** | In production the cookie defaults to `Secure`. Serving plain HTTP causes the browser to reject it; an `Origin`/host mismatch behind a TLS-terminating proxy rejects writes unless forwarded headers are configured correctly. | Terminate HTTPS; set `SIMPLAYZ_TRUST_PROXY=1` only behind a trusted proxy; use `SIMPLAYZ_COOKIE_SECURE=0` only for deliberate HTTP testing. |

## Decisions still needed

1. **Identity and recovery:** anonymous cookie only, optional export/import, or real accounts? How are lost sessions and orphaned rows handled?
2. **Shared world:** one persistent planet or instanced worlds? What does “same map” mean for ownership and visibility?
3. **Time authority:** continuously running server, per-session time, or scheduled catch-up? What happens offline?
4. **Claim geometry:** exact size, overlaps, water/protected land, antimeridian, and location privacy?
5. **Multiplayer writes:** who may edit/visit/trade; atomicity, cooldown authority, and anti-duplication rules?
6. **OSM role:** visual basemap only or terrain/buildings/roads as gameplay data? Provider, caching, licensing, and query budget?
7. **Advisor production policy:** provider/model/temperature, budget, retention, latency target, and credential custody?
8. **Economy goals:** target session length, recovery floor, escrow/refunds, inflation/sinks, and monetization constraints?
9. **Operations:** target host, backup/restore RPO/RTO, data retention, monitoring, and single-node vs managed database?
10. **Target devices/accessibility:** are touch interiors in scope?

Resolve only the decisions needed for the next change. Do not block a local UI fix on the entire roadmap. Record accepted decisions with date, user authority, rationale, alternatives, and affected files/tests.

## Revision log

- v1.0 — 2026-11-16: repository audit and separation of confirmed vision from prototype assumptions.
- v1.1 — 2026-11-16: recorded the Next.js/SQLite anonymous-save migration, secret custody, optimistic concurrency, and residual operational/privacy risks. No gameplay or balance decision was newly approved.
