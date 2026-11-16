# Deployment and backup — v1.0

Updated 2026-11-16. This is a single-node runbook for the current prototype, not a production-readiness certification.

## Requirements

- Node.js **22.12+**; npm with the locked `package-lock.json`.
- A persistent writable volume for SQLite (default `./data/simplayz.sqlite`). Do not place it under `public/` or serve it over HTTP.
- A native build toolchain if `better-sqlite3` has no prebuilt binary for the host (Python + C++ build tools are commonly required on Windows).
- A reverse proxy that terminates HTTPS for any public deployment. TLS is expected for the Secure session cookie and for protecting save/location data in transit.
- Outbound HTTPS access only if the live advisor is enabled. OSM tiles and Google Fonts are loaded by the player's browser, not by the server.

## Install and start

```sh
npm ci
cp .env.example .env.local        # edit values; never commit it
npm run db:migrate                # optional explicit migration + count check
npm run build
npm start                         # binds 0.0.0.0:3000 by default
```

`npm run dev` also binds `0.0.0.0` for local preview. The API routes are dynamic and use the Node runtime; do not deploy the app to an edge-only runtime.

The first DB access runs pending Drizzle migrations lazily. Running `npm run db:migrate` before starting is still recommended so schema failures are visible before traffic arrives. Migrations are forward-only; back up the database before every upgrade.

## Environment

| Variable | Default / behavior |
| --- | --- |
| `SIMPLAYZ_DB_PATH` | `./data/simplayz.sqlite`; relative paths resolve from the process working directory. Parent directories are created. |
| `SIMPLAYZ_COOKIE_SECURE` | Unset: `Secure` in production, non-Secure in development. `1`/`true` forces Secure; `0`/`false` forces non-Secure. Use `0` only for deliberate HTTP testing, never for a public HTTPS deployment. |
| `SIMPLAYZ_ALLOWED_DEV_ORIGINS` | Comma-separated extra dev-server hostnames (no scheme, no `*`). Used by `next.config.ts` only for `next dev`; not a production allowlist. |
| `SIMPLAYZ_TRUST_PROXY` | `0` by default. Set `1` only when a trusted reverse proxy overwrites `X-Forwarded-Host`, `X-Forwarded-Proto`, and `X-Forwarded-For`. This affects origin checks and advisor IP rate limiting. |
| `SIMPLAYZ_ADVISOR_API_KEY` | Server-only provider key. Leave unset to keep the live advisor disabled. |
| `SIMPLAYZ_ADVISOR_BASE_URL` | OpenAI-compatible base URL, HTTPS (HTTP only for localhost), without credentials in the URL. |
| `SIMPLAYZ_ADVISOR_MODEL` | Fixed model identifier sent to the provider. |
| `SIMPLAYZ_ADVISOR_TIMEOUT_MS` | `12000`; clamped to 1000–30000. |

All three advisor values must be set to enable `/api/advisor`; otherwise the browser is told the live advisor is not configured and the local advisor remains usable. Never expose these values through `NEXT_PUBLIC_*`. The public config route returns only `{ configured, model }`.

### Reverse proxy and cookies

- Public production should be HTTPS end-to-end from the browser to the proxy. Leave `SIMPLAYZ_COOKIE_SECURE` unset (or `1`).
- If the proxy terminates TLS and forwards HTTP to Next, set `SIMPLAYZ_TRUST_PROXY=1` and ensure the proxy **overwrites** the forwarded host/proto/for headers. Origin checks compare the browser's `Origin` to those forwarded values.
- Do not set `SIMPLAYZ_TRUST_PROXY=1` when clients can supply their own forwarded headers.
- A plain-HTTP production deployment with the default Secure cookie will appear to load but fail to persist sessions. `SIMPLAYZ_COOKIE_SECURE=0` is a conscious local-only override.

## Storage, scaling, and retention

- One Next.js process and one SQLite file per environment. SQLite is not a shared multi-writer database; horizontal scale-out requires moving to a managed database and revisiting concurrency/rate limiting. Do not put the DB on an unreliable network share.
- The in-memory advisor limiter (10/session/minute, 120/IP bucket/minute) is per process and resets on restart. It is abuse friction, not a billing control.
- There is no account recovery: the `simplayz.sid` cookie is the only key to a save row. Clearing cookies or changing browsers loses access. Rows are not automatically expired. Decide and document a retention policy before public operation; an omitted row cannot be recovered by the player.
- Saves contain company/CEO identity and claim coordinates. Restrict filesystem access, encrypt backups if the threat model requires it, and avoid copying raw saves into tickets/logs. Server error logs intentionally omit save bodies.
- The database, `-wal`, `-shm`, and backup files are gitignored. Never commit them.

## Backup

SQLite WAL mode makes naive live file copies unsafe. Use one of these:

```sh
# Consistent online backup via the SQLite CLI (preferred):
mkdir -p backups
sqlite3 data/simplayz.sqlite ".backup 'backups/simplayz-$(date +%F-%H%M).sqlite'"

# Alternative while the app is running (creates a consistent copy):
sqlite3 data/simplayz.sqlite "VACUUM INTO 'backups/simplayz-snapshot.sqlite'"
```

If the SQLite CLI is unavailable, stop the app cleanly and copy the database together with any `-wal` and `-shm` files, or use the backup API from a small maintenance script. Do not copy only the main file while writers are active.

Verify a backup before relying on it:

```sh
sqlite3 backups/your-backup.sqlite "PRAGMA integrity_check; SELECT value FROM app_meta WHERE key='database_schema_version'; SELECT COUNT(*) FROM games;"
```

Keep backups outside the web root and apply the same access controls as the live DB. Test a restore on a disposable path; an unverified backup is not a recovery plan.

## Restore

1. Stop the application.
2. Move the current DB and its `-wal`/`-shm` files aside (do not delete them until the restore is verified).
3. Copy the chosen backup to `SIMPLAYZ_DB_PATH` (or set the env var to the restored file).
4. Ensure the app user can read/write the file and its directory.
5. Start the app; it will run any pending migrations. Check `npm run db:migrate` output and the app's `/api/save` behavior with a disposable session.
6. Keep the old files until the restored data has been checked. If the backup predates a migration, expect the app to migrate it forward; never copy a newer database file under an older application version without checking migration compatibility.

## Upgrade checklist

1. Read `CHANGELOG.md` and back up the DB.
2. Pull/build the new version; run `npm run typecheck`, `npm test`, `npm run build`.
3. Run `npm run db:migrate` with the production env/path and inspect the schema version/count.
4. Restart the process, verify `GET /api/save` creates a cookie on a fresh profile, register a disposable game, reload, and check the Save tab status.
5. Verify HTTPS, cookie flags, advisor configuration (if enabled), and that tiles/attribution still render.

## Limitations

- Anonymous saves are not accounts; there is no recovery, email, password, or cross-device sync.
- No real multiplayer/shared-world authority, real human presence, or claim-conflict resolution.
- Save data is unencrypted at rest by the application. Encryption depends on the host/volume.
- Autosave is best effort under forced termination, offline periods, and `pagehide`; a failed write remains unsaved until a retry succeeds.
- SQLite, the in-memory limiter, and the single process are intentional prototype constraints, not a high-availability design.
- OSM tiles and Google Fonts are external services; availability, rate limits, and attribution obligations are the operator's responsibility.
- There is no CI, lint, coverage gate, or browser E2E suite in the repository.
- The live advisor is not evaluated by this runbook; provider behavior, cost, latency, and output quality require separate authorized testing.
