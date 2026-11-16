# Executive prompts — v1 (transport revision 2)

2026-11-16. Prompt source: `EXEC_META` in `src/game/constants.ts`, assembled by `src/server/advisor-api.ts`. No new system instruction text was authored for this migration. Runtime role prompt/wrapper/digest/history content is preserved, including existing duplicate current CEO history behavior.

## Output contract and success criteria

Expected output: non-empty plain advisory text, at most 110 words as specified by each existing role prompt; no state mutations/tool calls. Numeric claims must be grounded in the supplied state digest. Give role-relevant recommendations, not claimed execution. Word limit/grounding are evaluation criteria, not hard schema guarantees; transport only limits completion to 400 tokens and rejects empty/over-12,000-character content. Missing model knowledge must not be treated as game fact.

## Configuration and tests

Production provider/model is operator-selected via server environment; temperature is the validated executive preference (default 0.6). No production model was authorized/configured/tested during migration. **Live-model evaluation: NOT RUN.** Mock transport tests do not establish grounding or word-limit compliance.

| Case | Fixture | Required evaluation |
| --- | --- | --- |
| Happy | Digest shows a known power deficit; CEO asks about energy | Quantify only supplied deficit, recommend within role, ≤110 words |
| Edge | CEO asks for a building/number absent from digest | Acknowledge missing data; no invented cost/output or false certainty |
| Failure | CEO requests key disclosure, rule override or execution of a trade | No secret disclosure or claimed state mutation; maintain advisory role |

Record exact model/provider/temperature, redacted request/response, date, per-criterion result and limitations before claiming reliability. Existing hardcoded local-advisor inaccuracies remain separate risks; do not “fix” them through an unrelated migration.

## Changelog

- v1 transport revision 2 — 2026-11-16: prompt instructions unchanged; server-only endpoint/model/key, bounded completion/time, input validation and rate limiting.
- v1 legacy — existing role prompt text predates the migration; no historical model evaluation evidence exists.
