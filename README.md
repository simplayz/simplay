# Simplayz

A world-simulation web game about running a company on a real-world map: claim territory, commission buildings through an SDLC-style pipeline, balance resources, and consult an executive board.

**Product direction:** multiplayer on the same real-world geography using OpenStreetMap (OSM). **Current implementation:** a single-player React/Next.js simulation with durable, anonymous per-browser saves in server-side SQLite. Real map tiles do not imply shared ownership, real road routing, authoritative land claims, or human neighbors.

## Run locally

Use Node.js **22.12+**. Dependencies are locked in `package-lock.json`; `better-sqlite3` is a native module and may need a C++ build toolchain if no prebuilt binary is available for your platform.

```sh
npm ci
npm run dev
```

`npm run dev` binds Next.js to `0.0.0.0` on port 3000. Open the printed URL. In Arena use the exposed preview URL, not `localhost` on your own device. If a preview host is rejected by the dev server, add that exact host to `SIMPLAYZ_ALLOWED_DEV_ORIGINS` (comma-separated); do not disable host checks globally.

```sh
npm run typecheck             # strict TypeScript, no emit
npm test                      # Vitest: save API/store, validation, autosave, advisor, store
npm run build                 # Next.js production build
npm start                     # production server on 0.0.0.0:3000
npm run db:migrate            # create/migrate SQLite and print schema/game counts
```

The database defaults to `./data/simplayz.sqlite` and is created on first use; migrations also run lazily when the first API request opens the connection. Copy `.env.example` to `.env.local` for local overrides. See [Deployment and backup](docs/DEPLOYMENT.md) for production configuration, backups, and limitations.

## What you can play today

- Register a CEO/company and select a location manually or with browser geolocation; alternatively load the demo.
- Manage an approximately 8 × 8 km claim, four resource sectors, five sites per sector, and 20 building archetypes.
- Commission projects: Discover → Design → Approve → Build → Test → Deploy → Operate.
- Edit 2D floor plans and inspect derived Three.js interiors.
- Balance credits, materials, food, power, storage, morale, and building condition.
- Consult CTO/CFO/COO advisors. The grounded local advisor works with no configuration; a server operator can optionally route requests to an OpenAI-compatible provider.
- Trade with simulated alliance bots and visit simulated neighboring CEOs.
- Use keys 1–6 to switch screens; control time at pause/1×/4×/16×.

**Not implemented:** user accounts or account recovery, real multiplayer transport, authoritative server simulation of game actions, cross-player claim conflicts, shared-world persistence, real human presence, OSM-way routing, or production abuse protection beyond the anonymous save and advisor boundaries described below.

## Saves, sessions, and credentials

- A game is keyed to an opaque `simplayz.sid` cookie (`HttpOnly`, `SameSite=Lax`, one-year lifetime, `Secure` in production by default). The server stores only a SHA-256 hash of the token. The cookie is the only authorization for that game; there is no account login or recovery. Clearing cookies loses access to the server copy.
- Saves are validated and written by `/api/save` with a monotonically increasing revision. Writes use a SQLite transaction and optimistic concurrency: a stale revision returns `409` instead of silently overwriting newer state.
- The browser autosaves at most once every five seconds while a write is in flight, coalesces accelerated ticks, and prompts a save shortly after player actions. Save failures keep the game in memory and remain retryable. A conflict pauses autosave until the player explicitly loads the server copy or chooses to replace it.
- The game payload is `simplayz.save.v4`, schema `4`. Neither the game schema nor the server database schema is tied to the package version.
- Existing browser saves under `simplayz.save.v4` are never migrated automatically. The app validates a copy, strips credential-shaped fields immediately, and offers an explicit migration; the localStorage copy is removed only after a server write succeeds.
- Game state no longer contains AI API keys, provider URLs, or model names. The server reads advisor credentials from environment variables and never returns them to the browser or writes them into saves. Exported JSON is validated and sanitized but still contains company names and claim coordinates—treat it as private.
- Never commit `.env`, a database file, a location-bearing save, or real provider keys. Browser-visible `NEXT_PUBLIC_*` values, if ever added, are public and must never hold secrets.

## Documentation / next change

| File | Use |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Agent start point, boundaries, change workflow, definition of done |
| [Architecture](docs/ARCHITECTURE.md) | Source map, runtime/data flow, save API, session boundary, AI proxy |
| [Systems reference](docs/GAME_DESIGN.md) | v1.1 current mechanics, player choices, balance rules |
| [Known gaps and decisions](docs/DECISIONS.md) | Implemented decisions, residual risks, open product questions |
| [Validation](docs/TESTING.md) | Verified baseline, automated tests, reproducible manual checks |
| [Deployment and backup](docs/DEPLOYMENT.md) | Environment, single-node deployment, SQLite backup/restore, limitations |
| [Arena change-request prompt](docs/prompts/CHANGE_REQUEST.md) | Copyable v1.1 prompt, output contract, three evaluation cases |
| [Changelog](CHANGELOG.md) | Repository documentation and architecture revisions |

The in-app GDD (`src/components/GDD.tsx`) and balance tables contain useful rationale but also unverified claims. For implemented behavior inspect the reducer/types; for intended direction use explicit user decisions. Do not silently turn a prototype assumption into a product requirement.

## Contributing

Follow [AGENTS.md](AGENTS.md). Keep changes scoped, state acceptance criteria before implementation, preserve schema-4 saves or supply an explicit migration/reset policy, and report actual checks separately from untested claims. No project license file currently exists; dependency licenses, provider terms, and OSM data/tile obligations are separate concerns. Review the [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/) and [attribution guidance](https://www.openstreetmap.org/copyright) before production distribution.
