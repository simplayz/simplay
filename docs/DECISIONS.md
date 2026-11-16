# Decisions, risks and open questions — v1.0

Audit 2026-11-16, baseline `294a75c`. Priority is a recommendation, not an approved implementation backlog. This documentation change fixes none of the runtime issues below.

## Confirmed direction vs provisional defaults

**User-confirmed direction:** Simplayz is intended to be a multiplayer world simulation using the same real-world map based on OpenStreetMap.

**Existing prototype defaults, not confirmed product decisions:** 64 km² claims, four sectors × five sites, 20 archetypes, desktop-first interiors, 10–15 minute sessions, local persistence, simulated peers, SDLC construction and OpenAI-compatible advisors. These are playable hypotheses. See `OPEN_QUESTIONS` (`q1`–`q12`) in `src/game/constants.ts`. In-app question answers are saved text only; they do not reconfigure game rules.

## Known risks / source discrepancies

| ID | Impact and evidence | Recommended handling in a future scoped change |
| --- | --- | --- |
| R1 | **High: secret/privacy exposure.** AI keys, identity and claim location live in `GameState`; store persists it, GDD exports it, advisor sends a digest/history externally. | Redact exports and design server-side credential custody; define data consent/retention. Never share raw saves. |
| R2 | **High: untrusted saves.** GDD schema-only check and direct `hydrate`; startup checks schema/claim only. Malformed matching-schema saves may crash views. | Runtime validation, reference integrity checks and safe error recovery before hydration. |
| R3 | **High: save starvation.** 700 ms debounce is reset by 250/62.5 ms ticks at 4×/16×. Quota failures are silent. | Define maximum unsaved duration and visible failure; test reload during accelerated play. |
| R4 | **High: no shared authority.** Generated peers/online flags, local actions and synthetic claims. | Decide server model, ownership and conflict resolution before multiplayer implementation. |
| R5 | **Medium: simulation is not pure/replayable.** Engine calls `Math.random` and `Date.now`, contrary to its header. React runs under StrictMode. | Control RNG/time for tests; evaluate replay-safe actions before authoritative networking. |
| R6 | **Medium: advisor correctness/liveness.** No request timeout; duplicated latest user turn; local text includes static balance assertions. `flows.revenue` includes civic dividend but `netCredits` excludes it, affecting displayed/digested runway. | Choose canonical accounting semantics; test digest/advice against formulas; add timeout separately if requested. |
| R7 | **Medium: geometry overclaims.** Free-selected centers can overlap; small-angle boxes are not a globally tiled land registry. q8 says 3-node road bend; actual path has five points and is not OSM routing. | Specify claim geometry/conflicts and routing provider/budget. Do not treat comments as guarantees. |
| R8 | **Medium: economic exploits/bounds need tests.** Cancellation adds a fraction of unspent budget even before any debit; phase draws may overshoot on boundary ticks; change requests lack a treasury guard. | Agree escrow/refund/debt semantics, then add conservation/boundary tests. Do not silently rebalance in docs work. |
| R9 | **Medium: rationale drift.** Opening stocks total 1,600 units against 400 base capacity; Aquaponics says “25% more power” but table draws 55 vs Farm 70; some opening-food/material rationales are stale. | Reconcile descriptions with measured behavior. Rationale is a hypothesis, not verified balance data. |
| R10 | **Medium: missing regression infrastructure.** No test runner/lint/CI scripts; build does not typecheck. | Add focused tests in a separately scoped change; use documented manual checks now. |
| R11 | **Medium: service/rights readiness.** External OSM tiles/fonts, browser API CORS, no project LICENSE. | Review tile policy, attribution, hosting and distribution rights before launch; don't invent a license. |

## Decisions needed for a shared world

1. One persistent planet or instanced worlds with asynchronous visits? What does “same map” mean for ownership and visibility?
2. Who owns simulation time: continuously running server, per-session, or scheduled catch-up? What happens offline?
3. Identity/account recovery, region/shard scope and authoritative action validation?
4. Exact claim geometry/size, overlapping claims, water/protected land, antimeridian and location privacy?
5. Multiplayer writes: who may edit/visit/trade; atomicity, cooldown authority and anti-duplication rules?
6. OSM as visual basemap only or terrain/buildings/roads as gameplay data? Provider, caching, licensing and query budget?
7. Production AI providers/models/temperatures, budget, retention, latency target and credential handling?
8. Economy goals: target session length, recovery floor, escrow/refunds, inflation/sinks and any monetization constraints?
9. Target devices and accessibility; are touch interiors in scope?

Resolve only the decisions needed for the next change. Do not block a local UI fix on the entire roadmap. Record accepted decisions with date, user authority, rationale, alternatives and affected files/tests.

## Revision log

- v1.0 — 2026-11-16: repository audit and separation of confirmed vision from prototype assumptions. No product decisions newly approved.
