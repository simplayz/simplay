# Changelog

Repository documentation history. Existing in-game feature history remains in `src/game/constants.ts`; its dates/versions have not been independently verified. Package version `0.0.0`, save schema `4`, in-game feature version and document versions are separate identifiers.

## 2026-11-16 — Documentation v1.0 / change-request prompt v1

- Audited source at baseline `294a75c`; separated multiplayer/OSM vision from browser-local simulation.
- Added README, root agent instructions, architecture/source map, mechanic/balance reference, decision/risk register and validation guide.
- Added a versioned Arena change-request prompt with output contract, success criteria and happy/edge/failure evaluation fixtures; live-model tests explicitly not run.
- Added PR checklist and ignored generated `dist/` output.
- Verified dependency install, Vite production build and strict TypeScript check. Browser gameplay and external-service checks not run.
- No gameplay, economy, prompt runtime, networking or save format changed; identified risks remain unfixed.
