# Validation guide — v1.1

## Verified baseline (2026-11-16)

Environment: Node **24.21.0**, npm **12.2.2**, Windows. These are local results, not a CI guarantee.

| Check | Result |
| --- | --- |
| `npm install` / locked dependencies | PASS at migration time; npm audit reports **4 moderate** vulnerabilities, not investigated or auto-fixed |
| `npm run typecheck` | PASS (strict TypeScript 5.9.3) |
| `npm test` | PASS — 6 files, 34 tests |
| `npm run build` | PASS — Next.js 16.4.6 production build; `/` static, API routes dynamic, no Turbopack dynamic-filesystem warning |
| `npm run db:migrate` | PASS — created ignored `data/simplayz.sqlite`; database schema version `1`; 0 stored anonymous games |
| Browser smoke: boot, onboarding gate, save/reload, legacy, reset, local advisor | See result below; update this table after each release |
| Real OSM tile loading, geolocation, WebGL interiors | NOT RUN in the migration check unless recorded below |
| Live advisor provider evaluation | NOT RUN; no authorized provider key/model evaluation was available |
| CI, lint, `npm test` in CI | No CI/lint configuration exists |

Compilation, mocks, and a local build are not proof of security, production readiness, OSM service availability, or live-model reliability. The test suite stubs the DB with in-memory SQLite and mocked fetch; it does not exercise a real deployment.

## Automated tests

Run `npm test`. `vitest.config.ts` uses the Node environment, restores mocks, and unstubs env/globals. Tests that import the React store set up jsdom locally.

| File | Covers |
| --- | --- |
| `tests/saveApi.test.ts` | GET creates a cookie and round-trips a save; stale revision → 409; missing session → 401; cross-site/header-less requests → 403; revision/content-type/full-structure validation; generic 503 on DB failure; reset confirmation + session isolation; oversized JSON → 413 |
| `tests/saveStore.test.ts` | Revision 1 on create and increments; two same-revision writes cannot both succeed; non-zero first write conflicts; session isolation/reset; corrupt row reported without replacement |
| `tests/validate.test.ts` | Negative treasury allowed; old credentials/endpoints stripped; advisor shape normalized; wrong schema/missing claim/broken references rejected; serialized payload budget |
| `tests/autosave.test.ts` | One in-flight write; coalescing; at-most-five-second cadence; prompt delay for actions; conflict pausing; snapshot retention/retry; explicit server-copy adoption; `whenIdle()` |
| `tests/advisorApi.test.ts` | Public config never exposes key; unconfigured 503; timeout; generic upstream error; valid completion; CSRF/body bounds before fetch; per-session rate limit |
| `tests/store.test.tsx` | Initial loading and no ticks before boot/onboarding; failed boot gate/retry without auto-write; legacy copy retained until explicit successful migration and old keys not uploaded |

When changing persistence, add cases for: happy-path create/update/read, same-revision conflict, malformed body/state, unauthorized session, DB failure, CSRF/origin rejection, legacy migration conflict, secret stripping, autosave cadence, and loading/retry gates. Use `createDatabase(":memory:")` and controlled clocks/timers; do not use a real player's database or location-bearing save.

## Manual smoke protocol

Use a disposable browser profile and a disposable database (`SIMPLAYZ_DB_PATH=./data/smoke.sqlite`). Do not reset a real player's save. Record browser/device, starting fixture, speed, actions, network requests, console errors, and pass/fail.

| Case | Procedure | Expected observation / diagnostic |
| --- | --- | --- |
| Boot/onboarding gate | Open a fresh profile; watch loading; inspect Network; do not register | `GET /api/save` completes, cookie is set, onboarding appears; no `PUT /api/save` and no simulation hour advances before a choice |
| Happy: register + reload | Register manually or with geolocation; pause; wait for Saved; reload | `PUT` creates revision 1; reload hydrates the same CEO/claim/economy; status reports the server revision |
| Autosave during play | Run 1×/4×/16×, inspect Network; pause and act | Writes are serialized, never overlapping; accelerated ticks coalesce; a write is attempted at least every ~5 s while state is dirty; action prompts a short-delay save |
| Failure: save unavailable | Make `/api/save` return 5xx (or stop the DB); keep playing; restore | Game stays in memory; banner/pill shows unsaved; snapshot retained; automatic retry eventually succeeds; no default state overwrites the server |
| Conflict: two tabs | Same profile, two tabs; let tab A save a change; change/save tab B | Tab B gets 409, autosave pauses, unsaved snapshot remains; "Load server revision" discards local changes; "Keep this browser's version" explicitly replaces the server copy |
| Legacy migration | In a disposable profile set `simplayz.save.v4` to an old schema-4 save containing key-shaped fields; reload; migrate | Legacy card shows validation; old credentials are stripped from localStorage immediately and are absent from the PUT body; local copy disappears only after a successful write; failure keeps it |
| Legacy conflict | With an existing server save, migrate a different legacy copy | UI warns that the next server revision will be replaced; no automatic overwrite occurs without the explicit migration action |
| Reset | GDD → Save → reset; confirm | In-flight save settles; server row for this cookie is deleted; legacy copy removed; onboarding returns; cookie is retained; next game starts at revision 1 |
| Import/export | Export; import trusted and malformed files | Export is valid/sanitized; malformed/wrong-schema/broken references are refused before hydration; a valid import queues a server write |
| Advisor local | Leave advisor env unset; enable or disable live routing and chat | `/api/advisor/config` says not configured; local advice works; no provider key appears in page/network/save/export |
| Advisor live | Configure a disposable provider; send one turn; separately force timeout/5xx | Proxy returns text or a generic error; timeout is bounded; browser falls back locally; key/base URL never appear in responses |
| Map/WebGL/geolocation | Allow/deny geolocation; block tile requests; open a building interior | Manual/demo onboarding remains available; OSM attribution visible; tile failure is reported honestly; WebGL scene mounts and disposes on remount |
| CSRF/origin | Send PUT/reset without Origin or `X-Simplayz-Request`, and with a foreign Origin | 403; no save row is changed |

## Targeted regression contracts

For engine changes, fixtures should use `createGame`, stable IDs, and controlled `Math.random`/`Date.now` (restore mocks afterward). Seeded geo/plan helpers do not make the whole engine deterministic. Avoid snapshots with real keys or coordinates.

- Construction: valid/invalid start, six-project cap, funding unblock, first/second QA rework and third-attempt signoff; draft promotion exactly once.
- Money/materials: conservation across approval, build-phase overshoot, rework, cancel-before-spend, negative cash, and late change requests. Agree expected behavior before locking exploit-like behavior into tests.
- Trades: cooldown at hours 5 vs 6, cap, zero/negative/non-finite/fractional quantities, insufficient bot purse/player stock, forbidden commodities; only successful trade changes stocks/relations/cooldown.
- Operations: power equality vs 1 kW short, condition 40 vs below 40, zero food, exact/over capacity, maintenance insufficient funds, price bounds, and level thresholds.
- Persistence: full shape/reference validation, wrong/older schema, corrupt data, secret stripping, quota/LocalStorage failure, accelerated saving, conflict recovery, reset/import, and explicit legacy migration.
- Presentation: StrictMode mount/unmount, Leaflet layers/listeners, Three.js disposal, keyboard typing guard, pointer-lock exit, reachable navigation, and OSM attribution.

Known gaps are not asserted as desired long-term behavior. When fixing one, add a regression test for the agreed correction and update `DECISIONS.md`.

## Prompt evaluation record

For each prompt revision record: prompt version, expected output contract, fixture ID, exact provider/model version, temperature, date, request settings, redacted response, pass/fail against each criterion, latency/cost if available, and limitations. Include happy/edge/failure. Mocked API tests prove integration handling, not live-model compliance. Only claim production-model validation after authorized runs on that actual model and temperature.
