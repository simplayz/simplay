# Simplayz

A world-simulation web game about running a company on a real-world map: claim territory, commission buildings through an SDLC-style pipeline, balance resources, and consult an executive board.

**Product direction:** multiplayer on the same real-world geography using OpenStreetMap (OSM). **Current implementation:** a browser-local React prototype, not a shared multiplayer service. Real map tiles do not imply shared ownership, real road routing, or authoritative land claims.

## Run locally

Use Node.js **22.12+** (Node 22.22.3 and npm 10.9.8 verified). Dependencies are locked in `package-lock.json`.

```sh
npm ci
npm run dev -- --host 0.0.0.0
```

Open the URL printed by Vite. In Arena use the exposed preview URL, not `localhost` on your own device. If a preview host is rejected, allow that specific host in Vite rather than disabling host checks globally.

```sh
npx tsc --noEmit               # strict type check; build does NOT run this
npm run build                 # single-file frontend output: dist/index.html
npm run preview -- --host 0.0.0.0
```

There is no backend, database setup, required `.env`, test runner, lint script, or CI workflow. Browser requests load OSM tiles and Google Fonts; optional AI requests go to the configured endpoint. The generated HTML is not fully offline: these remote services still require connectivity. Sandbox network restrictions may prevent verifying them.

## What you can play today

- Register a CEO/company and select a location manually or with browser geolocation; alternatively load the demo.
- Manage an approximately 8 × 8 km claim, four resource sectors, five sites per sector, and 20 building archetypes.
- Commission projects: Discover → Design → Approve → Build → Test → Deploy → Operate.
- Edit 2D floor plans and inspect derived Three.js interiors.
- Balance credits, materials, food, power, storage, morale, and building condition.
- Consult CTO/CFO/COO advisors (local rules by default; optional OpenAI-compatible endpoint).
- Trade with simulated alliance bots and visit simulated neighboring CEOs.
- Use keys 1–6 to switch screens; control time at pause/1×/4×/16×.

**Not implemented:** authentication, authoritative server simulation, cross-player claim conflicts, shared world persistence, real human presence, OSM-way routing, or production credential handling. `netMode: "live"` is a type option, not a working transport.

## Saves and credentials — read before sharing

State is stored under `simplayz.save.v4` in browser `localStorage`. The GDD → Save screen exports/imports JSON. **AI API keys are part of game state and therefore persisted and exported in plaintext**, alongside CEO/company/location data. Never commit or share an unredacted save. Use disposable restricted keys only; this prototype is not safe for production secrets. AI calls send a city digest and recent chat to the configured provider. Import only trusted saves: validation currently checks the schema number, not the full object structure.

## Documentation / next change

| File | Use |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Agent start point, boundaries, change workflow, definition of done |
| [Architecture](docs/ARCHITECTURE.md) | Source map, data flow, persistence, map/network seams |
| [Systems reference](docs/GAME_DESIGN.md) | v1.0 current mechanics, player choices, balance rules |
| [Known gaps and decisions](docs/DECISIONS.md) | Risks, unresolved product questions, source inconsistencies |
| [Validation](docs/TESTING.md) | Verified baseline and reproducible manual/regression checks |
| [Arena change-request prompt](docs/prompts/CHANGE_REQUEST.md) | Copyable v1 prompt, output contract, three evaluation cases |
| [Changelog](CHANGELOG.md) | Repository documentation revisions |

The in-app GDD (`src/components/GDD.tsx`) and balance tables predate this audit. They contain useful rationale but also unverified claims. For implemented behavior inspect the reducer/types; for intended direction use explicit user decisions. Do not silently turn a prototype assumption into a product requirement.

## Contributing

Follow [AGENTS.md](AGENTS.md). Keep changes scoped, state acceptance criteria before implementation, preserve saves or supply an explicit migration/reset policy, and report actual checks separately from untested claims. No project license file currently exists; dependency licenses and OSM data/tile obligations are separate concerns. Review applicable OSM attribution and tile-service policies before production distribution.
