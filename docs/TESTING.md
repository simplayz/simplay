# Validation guide — v2.0

2026-11-16, Next.js/SQLite migration. Node 22.22.3 / npm 10.9.8.

## Evidence

| Check | Result |
| --- | --- |
| Clean install | PASS with `npm_config_nodedir=/usr/local npm ci`; plain `npm ci` failed on blocked nodejs.org header download; use local headers in this sandbox |
| Native better-sqlite3 load and SQLite query | PASS (SQLite 3.54.1 reported) |
| `npm run db:migrate` | PASS; schema version 1 initialized |
| `npm run typecheck` | PASS |
| `npm test` | PASS; 22 tests across persistence/API/queue and jsdom store tests at initial migration validation (final rerun after changes) |
| `npm run build` | PASS; Next 16.4.6 production App Router build, game `/`, Node `/api/game`, `/api/advisor` |
| Actual Next dev HTTP `/`, GET/PUT save, cookie issuance, isolated second session | PASS; synthetic test company persisted |
| Actual server restart | PASS; dev server stopped, production server started with same DB/session, save and revision retained; Secure production cookie verified |
| Online backup / migration rerun | PASS; SQLite backup API completed while server running, backup database migration rerun successful |
| DB close/reopen and migration rerun | PASS automated; revision/data retained |
| Full rendered browser gameplay and Playwright smoke | NOT RUN successfully; attempted Chromium launch failed due missing `libnspr4.so`; no WebGL/map/hydration correctness claim |
| Live OSM tiles, geolocation, Google Fonts, real AI provider/model | NOT RUN; remote access/consent not available |

For final check results and any added test counts, see the migration response. HTTP tests are not browser gameplay tests; jsdom store tests are not rendering Leaflet/Three.js. Mocked advisor tests are not model evaluations.

## Automated contracts

`npm test` runs Vitest (test-only Vite transform dependency; no Vite application framework remains). Tests use isolated in-memory/temp SQLite databases, synthetic player state, mocked upstream requests and fake queue timers. The production `server-only` marker is aliased only in test configuration.

- Full save entity/reference validation, demo/long-running state and legitimate negative credits.
- Legacy credential removal, non-secret preference preservation, invalid/non-finite/oversized rejection.
- Session creation, save/read/revision increment, isolation, rejected owner injection and unauthorized writes.
- Same-origin/header/content/size protections, invalid writes preserve prior valid snapshot.
- Concurrent stale writes: exactly one succeeds; reset increments revision and clears snapshot/preferences.
- SQLite query-only write failure returns generic error; DB close/reopen preserves data.
- Advisor operator config/model/credentials, missing config, timeout, empty and non-OK upstream fallback path.
- Queue tick intervals 1,000/250/62.5 ms do not reset oldest deadline; one write in flight; explicit retry and conflict halt.
- Store initial loading gate, no hydrated-default overwrite, failed-load retry, retained memory on write failure, explicit legacy migration/server coexistence, delete legacy only after acknowledged save, reset confirmation.

## Browser protocol

On a system with Playwright dependencies:

```sh
npx playwright install --with-deps chromium
npm run dev
# in another shell
npm run test:browser
```

`tests/browser/smoke.spec.ts` is a basic demo/navigation/reload/attribution smoke, not exhaustive gameplay coverage. Use a disposable profile/database. Record browser, fixture, steps, console/network failures and observed results. Pause before comparing values.

Required manual extensions: new company/manual/GPS-denied onboarding; demo screens 1–6; commission through QA/Deploy; design draft 2D→3D, doors/collision/exit pointer lock; board disabled/server-error local fallback; valid/invalid JSON import/export; 1×/4×/16× saves/reload; two contexts and two tabs sharing a cookie; conflict export/load/replace; interrupted save/retry; persistent-volume server restart; confirmed reset/reload; denied tiles/fonts and StrictMode scene/map remount cleanup.

## Future engine changes

Control `Math.random`/`Date.now`; seeded geo helpers do not make simulation deterministic. Cover six-project cap, funding unblock, QA retries/third signoff, draft promotion, maintenance at condition 40/below, power equality/shortage, storage boundary, cooldown 5 vs 6 hours, stock/purse conservation, price bounds and progression thresholds. Known economic exploits are not approved balance rules; agree corrections before locking them into tests.

## Prompt evaluation

See `docs/prompts/EXECUTIVES.md`. Record exact provider/model/version/temperature, prompt version, happy/edge/failure fixture, redacted input/output, per-criterion result and latency/cost when available. No authorized live model evaluation was performed. Never send real keys/location-bearing saves for tests.

## Revision log

- v2.0 — 2026-11-16: automated SQLite/API/queue/store coverage and Next validation, browser limitation disclosed.
- v1.0 — 2026-11-16: Vite baseline audit; superseded for infrastructure.
