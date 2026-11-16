# Decisions and remaining risks — v2.0

2026-11-16. User-approved migration scope: Next.js App Router, Node runtime, single-server SQLite, anonymous isolated saves, client-driven simulation, no economy redesign or multiplayer authority.

## Accepted migration decisions

- Next 16.4.6, React 19.2.6, Node 22.22.3, better-sqlite3 13.2.0, Drizzle 0.45.4; package lock is authoritative.
- SQLite WAL, transactional ordered SQL migration baseline using user_version; database version 1, game schema 4, revision independent. Full-repository `next start`, not standalone/serverless packaging.
- Random HttpOnly/SameSite anonymous cookie; DB stores hash only. No accounts/recovery; clearing cookies loses access. Save ownership comes only from session cookie.
- Game remains client-rendered/client-simulated. Validated snapshots protect storage integrity, not cheating. Economic debt/overshoot/exploits are not silently rewritten.
- Four-second non-resetting autosave deadline, serialized/coalesced writes, CAS conflicts. Normal continuous accelerated play can save without tick starvation; network latency/browser throttling can exceed cadence. Unload durability is not guaranteed.
- Legacy keys removed before upload; opt-in migration and explicit replacement choice. JSON imports/exports are validated/sanitized. Selecting server dismisses legacy offer once while leaving redacted data. Malformed non-JSON legacy data is never interpreted/uploaded and may need manual private recovery.
- Operator-only AI environment credentials; configured HTTPS endpoint/model, bounded requests and local fallback. No arbitrary URL proxy, browser BYOK or database secret encryption feature.

## Audit risks: disposition

| ID | Status / remaining concern |
| --- | --- |
| R1: plaintext game API keys | Credential fields removed, legacy/schema boundaries sanitize, exports clean; server environment credentials only. Old exports/backups must be revoked/redacted by owners. Company/location/chat data still private. |
| R2: schema-only validation | Replaced with full entity/plan/bounds validation and important reference/uniqueness checks. This is not anti-cheat or proof of all semantic game invariants. |
| R3: fast-tick save starvation | Replaced with tested queue and visible retry/conflict. Pending changes remain volatile until acknowledged; SQLite/network failures still possible. |
| R4: no shared authority | Still true by design. Generated peers/roads/online flags are not live humans. |
| R5: non-replayable RNG/time | Still true. `Math.random`/`Date.now` remain in reducer; simulation/StrictMode determinism not changed. |
| R6: advisor correctness | Server timeout added; duplicated latest user turn, hardcoded local advice and netCredits/dividend mismatch remain. Prompt grounding/word limit are not model-tested guarantees. |
| R7: geometry | Overlap, polar/antimeridian approximation and synthetic five-point roads remain; transport bounds reject invalid coordinates rather than making a global registry. |
| R8: economy | Cancel-before-spend salvage, phase-boundary spending and late change-request bounds remain unchanged. |
| R9: rationale drift | Opening overflow, catalogue power rationale and some opening resource claims remain unvalidated. |
| R10: tests | Vitest DB/API/queue/jsdom tests added; browser test scaffold added. Full rendered gameplay not executed here because Chromium lacks system libraries. |
| R11: operational readiness | HTTPS/private persistent storage/backup ownership required. Single-process rate limits are not distributed protection; session creation globally limited, no session garbage collection/account recovery. No project license/production compliance audit. |

## Open product decisions

World sharing/claim conflict policy, server time/offline progression, account identity/permissions, exact land geometry/protected areas/location privacy, multiplayer transaction authority, OSM gameplay-data licensing/provider budget, AI privacy/consent/cost policies, economy targets/monetization and device accessibility remain unresolved. Prototype questions in constants are defaults, not user-approved final design. Recorded question answers do not execute rule changes.

## Revision log

- v2.0 — 2026-11-16: infrastructure migration choices and audited risk dispositions.
- v1.0 — 2026-11-16: initial Vite/localStorage risk audit; superseded for infrastructure only.
