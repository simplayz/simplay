# Validation guide — v1.0

## Verified baseline (2026-11-16)

On Node 22.22.3 / npm 10.9.8:

| Check | Result |
| --- | --- |
| `npm ci` | PASS; 106 packages installed; npm audit reported 0 vulnerabilities at execution time |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS; Vite single-file output `dist/index.html` |
| Browser gameplay, live tiles, geolocation, WebGL, save/reload | NOT RUN in this documentation audit |
| Production AI evaluation | NOT RUN; no authorized provider/key/model evaluation available |

These are baseline checks, not proof of correctness/security or a guarantee that services work. There is no test runner, lint script or CI workflow. Do not invent `npm test` results. `dist/` is generated and ignored.

## Smoke protocol for the next runtime change

Use a disposable browser profile/save. Do not reset a player's real save. Record commit, browser/device, start fixture, speed, actions, observed outcome, console/network errors and pass/fail. Pause time before inspecting values; screenshot results where useful. A browser's inability to reach a remote service is a limitation to report, not a reason to claim gameplay passed.

| Case | Procedure | Expected observation / diagnostic |
| --- | --- | --- |
| Happy: new company | Start fresh, enter CEO/company, click map point, register; navigate keys 1–6 | Claim and console appear; screens switch without uncaught errors; map attribution remains visible |
| Happy: demo | Load demo, inspect territory/pipeline/studio/board/diplomacy | Existing assets and simulated neighbors visible; local board advice works without a key |
| Happy: construction | Select valid empty matching-tier site, commission, observe all phases with sufficient funds/materials | Project/site stay linked; Deploy produces one building using the draft plan; occupied site cannot be recommissioned |
| Edge: clock | Pause, observe tick; run 1×/4×/16×, then pause | Pause stops tick advancement; faster speeds increase cadence. Do not assume exact wall-clock under browser throttling |
| Edge: limits | Attempt seventh active project, wrong sector/tier, occupied site | State remains valid; cap logs alert; no duplicate project/building assignment |
| Edge: plan consistency | Edit project draft, deploy, compare 2D and 3D; exit pointer lock and switch screen | Authored layout retained; doors/walls/collision coherent; scene/map listeners cleaned up on remount |
| Edge: save | At 1× pause for >700 ms then reload; repeat reload while actively at 4×/16× | Normal paused save should restore; accelerated-save staleness is a known risk (R3), not a passing guarantee |
| Failure: resource block | Reach Approve with insufficient money/materials, then restore resources | Blocked reason shown; gate rechecks and recovers on subsequent tick |
| Failure: AI | Disable AI/use empty key; separately simulate non-OK/empty response | Local response for no key; network/format error surfaces with fallback. Hanging-request recovery is NOT implemented |
| Failure: import/storage | In disposable profile import bad JSON/wrong schema, then test malformed schema-4 save separately | Bad JSON/wrong schema refused; malformed matching-schema data may crash (R2). Quota failure may be silent; capture as risk |
| Failure: geolocation/tiles | Deny geolocation; block tile network request | Manual point/demo remain alternative onboarding paths; record tile-failure UX without assuming offline tiles exist |

## Targeted regression contracts

For engine changes, add a focused test harness if in scope. Fixtures should use `createGame`, stable IDs and controlled `Math.random`/`Date.now` (restore mocks afterward). Seeded geo/plan helpers do not make the whole engine deterministic. Avoid snapshots with keys or real player coordinates.

- Construction: valid/invalid start, six-project cap, funding unblock, first/second QA rework and third-attempt signoff; draft promotion exactly once.
- Money/materials: conservation across approval, build phase overshoot, rework, cancel-before-spend, negative cash and late change requests. Agree expected behavior before locking exploit-like behavior into tests.
- Trades: cooldown at hours 5 vs 6, cap, zero/negative/non-finite/fractional quantities, insufficient bot purse/player stock, forbidden commodities; only successful trade changes stocks/relations/cooldown.
- Operations: power equality vs 1 kW short, condition 40 vs below 40, zero food, exact/over capacity, maintenance insufficient funds, price bounds and level thresholds.
- Persistence: full shape/reference validation, wrong/older schema, corrupt data, secret redaction, quota failures, accelerated saving and explicit migration/reset policy where touched.
- Presentation: StrictMode mount/unmount, Leaflet layers/listeners, Three.js disposal, keyboard typing guard, pointer-lock exit, reachable navigation and OSM attribution.

Known gaps are not asserted as desired long-term behavior. When fixing one, write a regression test for the agreed correction and update `DECISIONS.md`.

## Prompt evaluation record

For each prompt revision record: prompt version, expected output contract, fixture ID, exact provider/model version, temperature, date, request settings, redacted response, pass/fail against each criterion, latency/cost if available, and limitations. Include happy/edge/failure. Mocked API tests prove integration handling, not live-model compliance. Only claim production-model validation after authorized runs on that actual model and temperature.
