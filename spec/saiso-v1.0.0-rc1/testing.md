# Testing Lane

## Mission

Close critical coverage gaps and build deterministic confidence for SAISO core runtime, templates, chain-specific flows, and conversational transport behavior, with emphasis on Foundry-backed local EVM scenario testing.

## Scope

In scope:

1. Unit test expansion in core, CLI, and SVM MCP server.
2. Contract tests for canonical parity behavior.
3. Generated project scaffold test quality.
4. Foundry localnet e2e scenario matrix.
5. CI hard gates for deterministic test lanes.
6. Performance benchmark harness and regression budgets.
7. Chat transport conformance, Telegram adapter e2e, and alert scheduler reliability.

Out of scope:

1. Flaky or non-deterministic mainnet-only test dependencies in default CI.

## Current Gaps

1. SVM MCP server has limited test depth relative to tool complexity.
2. Generated test templates contain placeholders and low assertion value.
3. Existing localnet flow is present but not yet a rich scenario matrix.
4. No formal benchmark suite or regression budget gates in CI.
5. Chat transport behavior has no conformance suite for adapter parity.
6. Telegram path lacks deterministic integration coverage at adapter boundary.
7. Alert scheduler semantics (dedupe/cooldown/restart recovery) are not fully specified in tests.

## Test Pyramid Contract

1. Unit tests:
   - pure logic, parser, policy, trust, formatting, config validation
2. Integration tests:
   - orchestrator + payment challenge/retry + receipt persistence
3. E2E tests:
   - local deterministic chain scenarios via Docker + Foundry
4. Contract tests:
   - canonical parity operation semantics EVM vs SVM
5. Transport conformance tests:
   - normalized chat envelope, mode negotiation, retry/idempotency, and capability behavior
6. Performance tests:
   - benchmark hot paths and gate regressions

## Workstream T1: Core and CLI Unit Expansion

Objective:

1. Increase branch and failure-path coverage for policy, routing, parsing, and diagnostics.

Implementation:

1. Add tests for:
   - payment policy edge cases (allow/block/protocol class + trust floor interactions)
   - routing profile tie-break behavior and fallback determinism
   - receipt classification and sanitization contracts
   - chain-aware health and status command behavior
2. Add schema-lock tests for JSON outputs:
   - `saiso status --json`
   - `saiso receipts --json`
   - `saiso policy validate` result shape

Target paths:

1. `packages/saiso-core/tests/*.test.ts`
2. `packages/saiso-cli/src/**/*.test.ts`

Acceptance criteria:

1. Deterministic outputs with stable key presence.
2. Clear failure reason coverage for denial and upstream error classes.

## Workstream T2: SVM MCP Server Test Deepening

Objective:

1. Bring SVM MCP server coverage closer to execution complexity.

Implementation:

1. Add tool-level tests for:
   - private key parsing formats (array, hex seed, bs58 variants)
   - amount conversion and invalid numeric input handling
   - token program detection fallbacks
   - ATA creation and token transfer branches
   - simulation vs broadcast branches
2. Add server transport tests for:
   - `tools/list`, `tools/call`, invalid method, invalid payload
   - health endpoints (`/health`, `/healthz`, `/readyz`)
   - JSON-RPC error response shape consistency

Target paths:

1. `packages/saiso-svm-mcp-server/tests/*`

Acceptance criteria:

1. Canonical and legacy alias behavior is test-covered.
2. Error normalization is deterministic across tool and transport layers.

## Workstream T3: Template and Scaffolding Test Quality

Objective:

1. Ensure generated projects are testable and useful out of the box.

Implementation:

1. Replace placeholder generated tests with minimal functional checks.
2. Add generation tests validating:
   - no placeholder markers remain
   - chain-specific wording and RPC methods are correct
   - feature install modifies registry/entrypoint deterministically
3. Add template lint checks for structural quality:
   - required config files present
   - referenced files exist
   - required imports and exports present

Target paths:

1. `templates/agent*/tests/*.template`
2. `packages/saiso-cli/src/commands/test-add.ts`
3. `scripts/validate-template-features.mjs`

Acceptance criteria:

1. Generated projects have runnable tests with non-trivial assertions.
2. Template integrity and sync checks pass consistently.

## Workstream T4: Foundry Localnet E2E Scenario Matrix (EVM)

Objective:

1. Execute complex agent workflows in deterministic local chain conditions.

Implementation:

1. Define localnet fixture stack:
   - ERC20 test assets
   - swap/route fixture contracts
   - oracle freshness fixture
   - strategy/vault fixture where needed
2. Define scenario matrix:
   - safe execution pass path
   - policy denial before spend
   - slippage breach and abort
   - tx lifecycle retry/replacement/cancel path
   - stale oracle data block path
   - receipt and trust signal update path
3. Create scenario runner outputs:
   - action trace
   - tx ids and statuses
   - decision log
   - final assertions summary

Target paths:

1. `packages/saiso-cli/src/core/localnet.ts`
2. `scripts/docker-localnet-smoke.mjs`
3. scaffolded project localnet assets and test fixtures

Acceptance criteria:

1. Scenarios are deterministic and CI-runnable.
2. Failures include actionable artifacts and log slices.

## Workstream T5: SVM E2E Strategy (Phased)

Objective:

1. Extend parity confidence beyond EVM by introducing SVM scenario tests in staged manner.

Implementation:

1. Phase 1:
   - contract tests for canonical parity semantics without full validator runtime
2. Phase 2:
   - optional Dockerized SVM local validator lane for advanced scenarios
3. Phase 3:
   - parity scenario subsets mirroring EVM where chain semantics allow

Acceptance criteria:

1. EVM parity assumptions are validated against SVM behavior with explicit expected deltas.

## Workstream T6: Performance Testing and Budgets

Objective:

1. Add profiling and benchmark discipline to prevent silent regressions.

Implementation:

1. Create benchmark suites for:
   - payment parsing
   - policy evaluation
   - routing selection
   - receipt summarization
2. Store baseline numbers and enforce threshold checks in CI.
3. Capture benchmark artifacts for trend comparison.

Acceptance criteria:

1. CI fails when benchmark regressions exceed budget.
2. Performance artifacts are available for diagnosis.

## Workstream T7: Chat Transport Contract and Conformance

Objective:

1. Ensure all chat adapters behave identically at the runtime contract boundary.

Implementation:

1. Add conformance fixtures for normalized inbound/outbound envelope fields:
   - `transport`, `channelId`, `threadId`, `senderId`, `messageId`, `timestamp`, `attachments`
2. Add capability-contract tests:
   - `supportsStream`, `supportsButtons`, `supportsMedia`, `supportsTopics`, `supportsCallbacks`
3. Add response mode negotiation tests for `sync`, `stream`, and `websocket` with deterministic fallback behavior.
4. Add idempotency and retry tests for outbound delivery and duplicate inbound updates.
5. Add deterministic failure shape tests for transport errors and unsupported capabilities.
6. Add adapter ingress tests for webhook/external events mapping into canonical chat envelopes.

Target paths:

1. `packages/saiso-core/tests/**`
2. `packages/saiso-cli/src/**/*.test.ts`
3. transport and adapter test fixtures under templates as needed.

Acceptance criteria:

1. Transport adapters pass one shared conformance suite.
2. Unsupported capability paths fail with deterministic machine-parseable errors.

## Workstream T8: Telegram Adapter E2E Harness

Objective:

1. Validate Telegram as a selectable transport over shared contracts, not a runtime special case.

Implementation:

1. Add Telegram integration tests for:
   - private/group/topic mapping into canonical envelope
   - callback/button flows and reply threading
   - media message handling with deterministic metadata
2. Add fixture-driven tests for allowlist/safe-mode and restricted-chat behavior.
3. Add stream-vs-sync response mode tests according to transport capabilities.

Target paths:

1. Telegram transport adapter tests in SAISO runtime/CLI test packages
2. transport fixture harness under `packages/saiso-cli` test paths.

Acceptance criteria:

1. Telegram flows are deterministic across message classes and context types.
2. Telegram suite proves parity with transport-core conformance expectations.

## Workstream T9: Alert Scheduler Reliability Tests (`T-010`)

Objective:

1. Prove recurring and one-shot alert jobs are deterministic and recovery-safe.

Implementation:

1. Add tests for threshold and movement alert evaluation logic.
2. Add scheduler tests for dedupe keys, cooldown windows, and backoff retry behavior.
3. Add restart-recovery tests to ensure no duplicate side effects after process restart.
4. Add notification contract tests ensuring deterministic alert payloads over chat transport.

Target paths:

1. `packages/saiso-core/tests/**`
2. `packages/saiso-cli/src/**/*.test.ts`
3. localnet/e2e scenario fixtures where alert triggers are chain-data driven.

Acceptance criteria:

1. Alerts fire exactly once per dedupe key within cooldown rules.
2. Restart recovery preserves correctness without missed or duplicate notifications.

## CI Gates

Required lanes:

1. Typecheck core, CLI, and SVM server.
2. Unit and integration test suites.
3. Template sync and integrity checks.
4. Localnet e2e smoke plus scenario matrix subsets.
5. Optional performance regression lane (initially non-blocking, then blocking).
6. Transport conformance + Telegram adapter e2e lane.
7. Alert scheduler reliability lane.

## Flake Prevention Rules

1. No wall-clock assertions without fixed tolerance windows.
2. No dependence on external mainnet data for default CI lanes.
3. Stable fixture seeds and deterministic ordering for all scenario runs.

## Exit Criteria

1. Coverage and scenario depth are materially increased for high-risk paths.
2. Generated projects pass useful test suites from first scaffold.
3. Foundry localnet scenarios validate complex agent workflows reliably.
4. Benchmark budgets guard against TS/JS performance regressions.
5. Transport adapters are validated by shared conformance contracts.
6. Telegram and alert scheduler behavior is deterministic under failure and restart conditions.
