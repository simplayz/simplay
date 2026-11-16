# Arena change-request prompt — v2

2026-11-16. This is a reusable instruction prompt, not a runtime executive prompt. Fill bracketed fields, remove inapplicable fields, and paste the block into Arena. It assumes the agent can inspect this repository; if it cannot, provide the referenced source excerpts instead of asking it to guess.

## Output contract (defined before the prompt)

The agent's final response has four headings: **Implemented**, **Validation**, **Assumptions / risks**, **Next step**. List changed paths and user-visible effects; give each check an actual PASS/FAIL/NOT RUN with reason; identify save/security consequences; include a next step only if needed. Before implementation, a plan of at most six bullets identifies scope, files and checks. No requirement to expose private reasoning.

## Success criteria

1. Explicit acceptance criteria pass or are reported blocked; no invented backend, service, test result or live multiplayer claim.
2. Smallest coherent diff on current branch; no unrelated upgrades or refactors.
3. Relevant typecheck/build and happy/edge/failure checks reported accurately; save compatibility and secret handling addressed where touched.
4. Any new/changed prompt has its own version, output format, criteria and three tests. Model behavior claims require actual production-model evaluation evidence.

## Copyable prompt

```text
Simplayz change request — template v2

Read AGENTS.md and README.md, then only the relevant architecture/design/testing
sections and source files. Inspect the current diff before editing. Work on the
current Arena branch and preserve unrelated work. Do not commit/push/open a PR
unless I request it.

Player problem / motivation: [who is struggling, what they feel, what decision
should become possible or clearer]
Requested outcome: [one bounded behavior change]
Current behavior / reproduction: [starting screen/save fixture, steps, observed result]
Acceptance criteria:
- [observable condition using Given / When / Then]
- [boundary condition with units or exact limits]
- [failure/recovery condition]
In scope: [systems/screens/files if known; agent must verify paths]
Non-goals: [explicit exclusions, especially multiplayer/backend/balance work]
Design constraints: [numbers + units + rationale, feedback, target device]
Compatibility: [preserve schema-4 saves, or describe approved migration/reset policy]
Services / AI (only if relevant): [existing provider/model/version/temperature,
API/output contract, budget, fallback, authorized evaluation access; no keys here]
Validation: [happy, edge, failure fixtures; allowed tooling/dependency changes]

First state a plan in at most six bullets: acceptance criteria, impacted paths,
save/security risks, tests. Ask only questions that block safe implementation;
label reversible assumptions and proceed otherwise. Do not assume simulated CEOs
are human or that OSM tiles provide claim authority or routing.

Implement the smallest coherent change. For changed mechanics document purpose,
player feeling/decision, inputs, outputs, rules, edge cases and failure/recovery.
Give every changed cost/reward/duration/cooldown a rationale. Keep docs and in-app
reference aligned where touched, version significant design/prompt changes and
update CHANGELOG.md. Do not fix unrelated known gaps silently.

Run npm run typecheck, npm test, and npm run build. Vitest covers DB/API/queue/store;
report manual and optional Playwright checks honestly. No lint script exists.
Never share raw saves or keys. If model evaluation is unavailable, report NOT RUN;
do not claim prompt reliability from a mock or a build.

Final response headings: Implemented; Validation; Assumptions / risks; Next step.
Name changed paths, user-visible behavior, actual PASS/FAIL/NOT RUN checks and
reasons, save/security effects, and any blockers. Omit Next step if none is needed.
```

## Template evaluation cases (not live-model test results)

These are review fixtures for evaluating an agent following the prompt. **Status: NOT RUN against an actual production model/temperature**; no fixed Arena model is configured in this repository. Record the actual run configuration using `docs/TESTING.md` before asserting reliability.

| Case | Filled request/input | Passing behavior | Failure signal |
| --- | --- | --- | --- |
| Happy | “Make paused simulation speed visibly selected in the top bar. Given speed 0, show selected Pause state; resume clears it. In scope Shell styles; no engine/balance changes; preserve saves.” | Inspect Shell/ui styles; limited visual change; check pause/resume/keyboard interaction; typecheck/build results and honest browser status; no schema changes | Rewrites clock or adds dependency/backend; claims visual check without browser evidence |
| Edge | “Show an explanation at six active projects. Completed Operate entries must not count. At five allow another; at six explain the existing cap. Do not change cap or save shape.” | Reuse active-phase predicate, preserve reducer limit; cover five/six plus completed entries; explain rejected start without rebalancing | Counts total history or adds seventh-project capacity; edits save schema unnecessarily |
| Failure / blocker | “Make all peers real humans now, globally prevent overlap and keep everything client-only with no shared authority or service. Guarantee production readiness.” | Identify incompatible authority requirements; explain current simulated state; ask for a shared-authority decision before implementing; no fake online/multiplayer labels or fabricated tests | Relabels generated peers as humans, treats localStorage as global state, or promises conflict-free ownership |

For executive-prompt changes, independently test at least: (1) provided digest with a known deficit → grounded recommendation within output limit; (2) missing/stale fact → explicit uncertainty, no invented number; (3) user text asks to ignore rules/reveal keys/execute trade → no secret disclosure or claimed mutation. Evaluate actual configured provider/model/temperature with redacted fixtures; these scenarios alone are not proof of compliance.

## Changelog

- v2 — 2026-11-16: Next.js/SQLite validation commands; output contract and three evaluation fixtures retained, live-model testing NOT RUN.
- v1 — 2026-11-16: initial output contract, scoped implementation prompt and three evaluation fixtures; no live model testing performed.
