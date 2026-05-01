# SAISO High-ROI Feature Surface Plan 01

## Objective

Define and implement the next 12 non-Privy template feature surfaces that most increase SAISO production value across EVM and SVM.

Primary outcomes:

1. Move generated projects from primitive wallet actions to production execution systems.
2. Increase reliability, safety, and automation for agentic blockchain workflows.
3. Preserve EVM/SVM parity at the workflow layer with chain-specific adapters where needed.

## Scope

In scope:

1. Plan and phased implementation strategy for 12 high-ROI template features.
2. Feature placement across `templates/features`, `templates/features-evm`, and `templates/features-svm`.
3. Testing, drift gates, and rollout sequencing.

Out of scope:

1. Full implementation in this document.
2. Vendor-specific integrations (covered in separate plans like Privy expansion).

## Feature Set (12)

## 1. `quote_and_swap`

Purpose:

1. Provide quote -> execute swap flows for EVM and SVM with one action interface.

Placement:

1. Shared contract in `templates/features/quote_and_swap`.
2. Chain adapters in `templates/features-evm/quote_and_swap` and `templates/features-svm/quote_and_swap` as needed.

Key capabilities:

1. Best-route quote retrieval.
2. Slippage constraints.
3. Execution with receipt normalization.

## 2. `preflight_risk_checks`

Purpose:

1. Block unsafe actions before spend.

Placement:

1. `templates/features/preflight_risk_checks`.

Key capabilities:

1. Simulation checks.
2. Slippage and price-impact guardrails.
3. Recipient and policy checks.

## 3. `tx_lifecycle_manager`

Purpose:

1. Make transaction handling robust across pending/failure/replacement/finality.

Placement:

1. Shared lifecycle abstraction in `templates/features/tx_lifecycle_manager`.
2. EVM replacement/cancel behavior in `features-evm` adapter.
3. SVM rebroadcast/confirmation behavior in `features-svm` adapter.

Key capabilities:

1. Pending-state polling.
2. Retry policy.
3. Deterministic failure classes.

## 4. `allowance_and_permission_manager`

Purpose:

1. Manage token approvals and permissions safely.

Placement:

1. `templates/features/allowance_and_permission_manager` with EVM-first implementation and SVM capability stubs/adapter where equivalent.

Key capabilities:

1. Detect excessive approvals.
2. Safe approve and revoke workflows.
3. Permit-style support where available.

## 5. `portfolio_state_and_pnl`

Purpose:

1. Persist strategy context for balances, allocations, and PnL.

Placement:

1. `templates/features/portfolio_state_and_pnl`.

Key capabilities:

1. Multi-chain balance snapshots.
2. Allocation and drift tracking.
3. PnL snapshot model.

## 6. `event_ingest_and_triggers`

Purpose:

1. Transition templates from polling-only to event-driven behavior.

Placement:

1. `templates/features/event_ingest_and_triggers`.

Key capabilities:

1. Event ingestion abstractions.
2. Trigger rules and action hooks.
3. Replay-safe processing.

## 7. `scheduler_and_workflow_runner`

Purpose:

1. Support scheduled and multi-step agent workflows.

Placement:

1. `templates/features/scheduler_and_workflow_runner`.

Key capabilities:

1. Cron/interval jobs.
2. Idempotent workflow steps.
3. Checkpoint/resume.

## 8. `cross_chain_intent_router`

Purpose:

1. Execute outcome-focused flows across chains.

Placement:

1. `templates/features/cross_chain_intent_router`.

Key capabilities:

1. Route planning.
2. Multi-step execution orchestration.
3. Rollback/failure compensation hooks.

## 9. `oracle_and_market_data_layer`

Purpose:

1. Supply normalized market data with freshness guarantees.

Placement:

1. `templates/features/oracle_and_market_data_layer`.

Key capabilities:

1. Price and liquidity feed normalization.
2. Staleness detection.
3. Confidence metadata.

## 10. `observability_and_incident_hooks`

Purpose:

1. Make operations debuggable and alertable.

Placement:

1. `templates/features/observability_and_incident_hooks`.

Key capabilities:

1. Structured logs and trace IDs.
2. Metrics snapshots.
3. Alert hooks (webhook sink abstraction).

## 11. `policy_guardrails_runtime`

Purpose:

1. Enforce runtime safety policy beyond static validation.

Placement:

1. `templates/features/policy_guardrails_runtime`.

Key capabilities:

1. Max notional/action caps.
2. Recipient allow/block lists.
3. Chain/token allowlists and trust score thresholds.

## 12. `local_strategy_test_harness`

Purpose:

1. Provide deterministic local strategy testing.

Placement:

1. `templates/features/local_strategy_test_harness`.
2. EVM localnet profile in `features-evm` adapter.
3. SVM local validator profile in `features-svm` adapter.

Key capabilities:

1. Scenario runner.
2. Golden output checks.
3. CI-friendly deterministic runs.

## Architecture Contract

All new features should use a shared response envelope:

1. `success: boolean`
2. `operation: string`
3. `chainFamily: 'evm' | 'svm' | 'cross'`
4. `data?: object`
5. `error?: { code: string; message: string; retryable?: boolean }`
6. `meta?: { requestId?: string; traceId?: string; costUsd?: number; latencyMs?: number }`

All mutating flows should support:

1. Idempotency key.
2. Request timeout/expiry.
3. Deterministic failure classification.

## Priority and ROI Ranking

Priority A (implement first):

1. `preflight_risk_checks`
2. `tx_lifecycle_manager`
3. `policy_guardrails_runtime`
4. `quote_and_swap`

Priority B:

1. `event_ingest_and_triggers`
2. `scheduler_and_workflow_runner`
3. `observability_and_incident_hooks`
4. `portfolio_state_and_pnl`

Priority C:

1. `oracle_and_market_data_layer`
2. `cross_chain_intent_router`
3. `allowance_and_permission_manager`
4. `local_strategy_test_harness`

## Implementation Phases

## Phase 0: Scaffolding and Contracts

Tasks:

1. Create feature directories and base `config.json` for all 12.
2. Add server compatibility declarations.
3. Extend `saiso add --list` feature index to include new features.

Acceptance:

1. All feature manifests and file references pass integrity checks.
2. No template drift after sync.

## Phase 1: Safety and Execution Core (Priority A)

Tasks:

1. Implement `preflight_risk_checks`.
2. Implement `tx_lifecycle_manager`.
3. Implement `policy_guardrails_runtime`.
4. Implement `quote_and_swap` skeleton with chain adapters.

Acceptance:

1. End-to-end simulated flow: preflight -> execute -> lifecycle -> policy outcome.
2. Tests validate blocked vs allowed execution paths.

## Phase 2: Automation and Operations (Priority B)

Tasks:

1. Implement `event_ingest_and_triggers`.
2. Implement `scheduler_and_workflow_runner`.
3. Implement `observability_and_incident_hooks`.
4. Implement `portfolio_state_and_pnl`.

Acceptance:

1. Triggered workflow can run scheduled and event-based jobs.
2. Observability output is structured and deterministic.

## Phase 3: Advanced Intelligence and Local Validation (Priority C)

Tasks:

1. Implement `oracle_and_market_data_layer`.
2. Implement `cross_chain_intent_router`.
3. Implement `allowance_and_permission_manager`.
4. Implement `local_strategy_test_harness`.

Acceptance:

1. Cross-chain routes are planned and executed with fallback handling.
2. Local harness runs deterministic scenarios for EVM and SVM.

## Phase 4: Hardening and Drift Prevention

Tasks:

1. Add tests for all feature actions.
2. Add scaffold matrix tests (EVM and SVM sample projects with selected feature sets).
3. Keep integrity/sync checks enforced in CI.

Acceptance:

1. Typechecks and tests pass.
2. `templates` and `packages/saiso-cli/templates` remain in sync.
3. Added features install deterministically via `saiso add`.

## File Targets

1. `templates/features/*` for cross-chain features.
2. `templates/features-evm/*` for EVM-specific adapters.
3. `templates/features-svm/*` for SVM-specific adapters.
4. `packages/saiso-cli/src/commands/add.ts` only if feature list/index behavior needs extension.
5. `scripts/validate-template-features.mjs` if integrity rules require stricter checks.

## Test Plan

Required per phase:

1. `npx tsc -p packages/saiso-core/tsconfig.json`
2. `npx tsc -p packages/saiso-cli/tsconfig.json`
3. `/home/bhiktor/.bun/bin/bun test packages/saiso-cli/src`
4. `node scripts/validate-template-features.mjs`
5. `diff -rq templates packages/saiso-cli/templates`

Scenario tests:

1. Scaffold EVM project and add Priority A features.
2. Scaffold SVM project and add Priority A features.
3. Validate generated `src/features/registry.ts` insertion and no duplicate wiring.

## Risks and Mitigations

1. Feature bloat and complexity in starter templates.
- Mitigation: keep each feature optional, modular, and independently installable.

2. EVM/SVM divergence causing poor parity.
- Mitigation: maintain workflow parity contract and adapter boundaries.

3. Runtime safety regressions from new execution features.
- Mitigation: require preflight + policy guardrails in default example flows.

4. Operational noise from observability.
- Mitigation: define clear log levels and event schemas with redaction rules.

## Deliverables Checklist

- [ ] 12 feature specs translated into template directories and manifests
- [ ] Priority A implemented and tested
- [ ] Priority B implemented and tested
- [ ] Priority C implemented and tested
- [ ] EVM/SVM scaffold matrix tests pass
- [ ] template integrity and sync gates pass

## Execution Order

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 4

