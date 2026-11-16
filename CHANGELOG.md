# Changelog

Repository documentation history. Existing in-game feature history remains in `src/game/constants.ts`; its dates/versions have not been independently verified. Package version `0.0.0`, save schema `4`, in-game feature version and document versions are separate identifiers.

## 2026-11-16 — Next.js / SQLite migration (documentation v2.0)

- Replace Vite entry/config/single-file bundling with Next 16 App Router, client-only game boundary and Tailwind PostCSS; preserve gameplay/visual design.
- Add Drizzle/better-sqlite3 server snapshots, DB migration v1, random hashed-cookie session ownership, same-origin/size/content checks, validation, transactional CAS revisions and sanitized errors.
- Add bounded coalesced autosave, initial loading gate, saved/error/conflict feedback, retry/export/recovery choices, explicit legacy import and confirmed reset; keep client-driven ticks.
- Remove game-state API credentials and browser key entry; sanitize legacy saves/exports, proxy operator-configured advisor calls server-side with timeout/rate/input limits and local fallback. Executive system prompt text unchanged; transport revision documented.
- Escape imported names before Leaflet HTML insertion and handle empty peer initials safely.
- Add Vitest API/DB/queue/jsdom tests and optional Playwright smoke; update setup, deployment, WAL-safe backup/restore, risk/design documentation and PR checklist.
- No economy/progression/RNG redesign, real multiplayer authority, accounts or offline simulation. Full browser/gameplay checks blocked by missing Chromium system libraries; production model evaluation not run.

## 2026-11-16 — Documentation v1.0 / change-request prompt v1

- Audited source at baseline `294a75c`; separated multiplayer/OSM vision from browser-local simulation.
- Added README, root agent instructions, architecture/source map, mechanic/balance reference, decision/risk register and validation guide.
- Added a versioned Arena change-request prompt with output contract, success criteria and happy/edge/failure evaluation fixtures; live-model tests explicitly not run.
- Added PR checklist and ignored generated `dist/` output.
- Verified dependency install, Vite production build and strict TypeScript check. Browser gameplay and external-service checks not run.
- No gameplay, economy, prompt runtime, networking or save format changed; identified risks remain unfixed.
