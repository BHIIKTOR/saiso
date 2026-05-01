# SAISO v1.0.0-rc1 Research-to-Execution Plan

## Goal

Translate the current deep-research findings into an executable plan that improves SAISO in four lanes:

1. Consolidation (vertical depth on existing features)
2. Testing (unit, integration, e2e, and CI hardening)
3. New features (horizontal ROI expansion)
4. Conversational runtime and transport (universal chat surfaces and semi-autonomous goal execution)

This plan is intentionally biased toward production reliability, deterministic behavior, and strong EVM/SVM parity.

## Why This Plan Exists

The current codebase has strong foundations:

1. EVM/SVM orchestration and canonical parity surface
2. x402 and MPP payment challenge/retry support
3. trust/policy modules and receipt observability
4. Docker runtime and EVM localnet testing path

The largest gap is implementation depth in template feature packs and generated tests. Several features are scaffold-level and need vertical hardening before major additional surface expansion.

## Current Findings Snapshot

1. Multiple feature templates are envelope-only with minimal business logic.
2. Generated test scaffolds still contain placeholders in key paths.
3. SVM MCP server test depth is shallow relative to implementation complexity.
4. Localnet support is EVM-first and can be expanded into richer scenario testing.
5. Performance/profiling discipline is not yet formalized (no benchmark gates).
6. Some drift issues remain in template dependency pinning and chain-aware diagnostics.

## Lane Structure

1. Consolidation lane:
   - file: `./consolidation.md`
   - purpose: scale existing features vertically and remove partial implementations
2. Testing lane:
   - file: `./testing.md`
   - purpose: close unit and e2e gaps, including Foundry localnet scenario matrix
3. New features lane:
   - file: `./new-features.md`
   - purpose: add high-ROI horizontal capabilities (ops, UX, chain intelligence, and reusable runtime services)
4. Conversational runtime and transport lane:
   - file: `./conversational-runtime.md`
   - purpose: add transport-agnostic chat orchestration, Telegram adapter parity, goal runner, and alert jobs

## Cross-Lane Constraints

1. Preserve EVM/SVM parity at user-flow level.
2. Keep x402/MPP policy-aware behavior consistent across chains.
3. Keep template source of truth as `/templates` and maintain sync to `packages/saiso-cli/templates`.
4. No secret leakage in logs, receipts, or generated artifacts.
5. Prefer deterministic outputs for CLI JSON modes and test fixtures.
6. Keep this rc1 scope SAISO-only; adopt external patterns as design input without coupling to external runtime ownership.
7. Chat transport must be universal and selectable per session/agent, with Telegram implemented as an adapter, not as a runtime special case.

## Execution Sequence

1. Consolidation phase A (critical drift and hardening prework)
2. Testing phase A (unit and contract expansion)
3. Consolidation phase B (execution/ops/state feature depth)
4. Testing phase B (Foundry localnet e2e matrix and CI gates)
5. Conversational runtime phase A (transport core + Telegram MVP)
6. New features phase A (top ROI non-chat feature set)
7. Conversational runtime phase B (goal runner + alert scheduler hardening)
8. New features phase B (remaining prioritized features)
9. Final drift pass (code vs specs) and release readiness check

## Phase Gate Criteria

1. Gate after Consolidation phase A:
   - recursion and template dependency drift fixes merged
   - template sync and integrity checks green
2. Gate after Testing phase A:
   - new unit and contract tests green for modified modules
   - no schema drift in JSON command outputs under test
3. Gate after Consolidation phase B:
   - consolidated execution/ops/state flows meet lane-level acceptance criteria
   - no regression in policy/trust/payment behavior
4. Gate after Testing phase B:
   - Foundry localnet scenario matrix green
   - CI artifacts are deterministic and actionable on failures
5. Gate after Conversational runtime phase A:
   - transport core contracts and Telegram adapter MVP are operational and documented
   - transport conformance and Telegram e2e checks are green
6. Gate after New features phase A:
   - top-priority feature pack set is operationally usable and documented
7. Gate after Conversational runtime phase B:
   - goal runner lifecycle and alert scheduler flows are deterministic and operator-safe
   - recurring alert jobs pass reliability checks (dedupe, cooldown, restart recovery)
8. Gate after New features phase B:
   - remaining feature set passes parity and reliability checks
9. Final release gate:
   - all validation commands below pass
   - no open P0/P1 items in tracking source

## Release Readiness Criteria

1. All lane-level acceptance criteria pass.
2. Typecheck and tests are green for core, CLI, and SVM server.
3. Template sync and integrity drift gates are green.
4. Paid-flow smoke checks remain green.
5. Localnet scenario matrix produces deterministic pass/fail artifacts.
6. Chat transport conformance and Telegram adapter e2e checks are green.
7. Goal-runner and alert-job reliability checks are green.
8. No open P0/P1 gaps in this plan (tracked in `./tracking.md`).

## Validation Commands (Baseline)

```bash
npx tsc -p packages/saiso-core/tsconfig.json
npx tsc -p packages/saiso-cli/tsconfig.json
npx tsc -p packages/saiso-svm-mcp-server/tsconfig.json
bun test packages/saiso-core/tests
bun test packages/saiso-cli/src
bun test packages/saiso-svm-mcp-server/tests
node scripts/validate-template-features.mjs
diff -rq templates packages/saiso-cli/templates
bun run packages/saiso-cli/src/cli.ts policy validate --strict --payment-file spec/hardening-01/fixtures/policies/payment-policy.json --trust-file spec/hardening-01/fixtures/policies/trust-policy.json
node spec/saiso-v1.0/scripts/smoke-x402-mpp.mjs
npm run smoke:docker:localnet
```

Conversational runtime validation commands (required at CR1/CR2 gates):

```bash
bun test packages/saiso-core/tests/transport-conformance.test.ts
bun test packages/saiso-cli/src --test-name-pattern "telegram|transport"
bun test packages/saiso-core/tests/goal-runner-lifecycle.test.ts
bun test packages/saiso-core/tests/alert-scheduler-reliability.test.ts
```

Post-T6 performance gate (enable when testing lane introduces benchmark runner):

```bash
npm run perf:bench
```

## Deliverables

1. Hardened feature templates with real behavior and deterministic error classes.
2. Expanded unit coverage in core, CLI, and SVM MCP server.
3. Foundry-backed localnet e2e scenario suite for complex agent flows.
4. New high-ROI feature packs with clear operational value.
5. Universal chat transport core with Telegram as a selectable adapter.
6. Semi-autonomous goal runner and recurring alert jobs via provider+model chat.
7. Stronger profiling and performance guardrails integrated into CI workflow.

## Plan Files

1. Consolidation: `./consolidation.md`
2. Testing: `./testing.md`
3. New features: `./new-features.md`
4. Conversational runtime: `./conversational-runtime.md`
5. Risk tracking: `./tracking.md`

## Progress Checklist (Mirror of `tracking.md`)

Operator instructions:

1. After completion of each listed item, update the checkbox in this section immediately.
2. In the same change, update the corresponding row status/notes in `./tracking.md`.
3. Only mark an item as complete when implementation is merged and its validation/tests are green.

- [x] `T-001` (P1, Consolidation): Ensure `saiso dev` launch path cannot recurse through `dev` script.
- [x] `T-002` (P1, Consolidation): Align feature import/dependency contract for `@elizaos/core`.
- [x] `T-003` (P1, Testing): Expand SVM MCP server branch coverage for tool and transport paths.
- [x] `T-004` (P1, Testing): Build Foundry localnet scenario matrix for complex flows.
- [x] `T-005` (P2, New features): Introduce benchmark runner and `perf:bench` CI threshold gating.
- [x] `T-006` (P1, Conversational runtime): Ship chat transport core contract, registry, and normalized message envelope.
- [x] `T-007` (P1, Conversational runtime): Deliver Telegram adapter MVP over transport core.
- [x] `T-008` (P1, Testing): Add transport conformance and Telegram e2e test harness.
- [x] `T-009` (P1, Conversational runtime): Implement goal-runner lifecycle with approval-safe execution over chat.
- [x] `T-010` (P1, Testing): Add alert scheduler reliability tests (dedupe/cooldown/restart recovery).
- [x] `T-011` (P2, New features): Add second chat transport adapter to prove extensibility.
