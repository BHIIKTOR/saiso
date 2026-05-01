# Consolidation Lane

## Mission

Take currently partial feature implementations and scale them vertically into production-grade behavior while preserving EVM/SVM parity and paid-flow policy guarantees.

## Scope

In scope:

1. Execution stack consolidation
2. Automation and operations stack consolidation
3. State and intelligence stack consolidation
4. Payment and trust policy plane consolidation
5. Template quality hardening and drift cleanup
6. TS/JS runtime and code-path optimization plan

Out of scope:

1. net-new protocol integrations beyond existing x402/MPP path
2. non-parity chain family expansion

## Problem Statement

The current implementation has broad feature coverage but mixed depth:

1. Core runtime is relatively mature.
2. Several template feature packs remain scaffold-level.
3. Generated tests are not consistently useful out of the box.
4. Some diagnostics and template dependencies still show drift.

## Workstream C1: Execution Core Consolidation

Objective:

1. Unify `preflight_risk_checks`, `quote_and_swap`, `tx_lifecycle_manager`, and `policy_guardrails_runtime` into one deterministic execution pipeline.

Implementation:

1. Define shared execution middleware contract:
   - phases: `preflight -> plan -> simulate -> execute -> confirm -> classify -> persist`
2. Introduce deterministic failure taxonomy:
   - examples: `policy_denied`, `simulation_revert`, `slippage_exceeded`, `insufficient_liquidity`, `confirmation_timeout`, `upstream_unavailable`
3. Move common envelope and failure handling into reusable helpers under templates and CLI-generated source shape.
4. Keep chain-specific adapters for only execution-specific differences.
5. Add explicit idempotency and timeout fields to mutating action payloads.

Target paths:

1. `templates/features/preflight_risk_checks/*`
2. `templates/features/quote_and_swap/*`
3. `templates/features/tx_lifecycle_manager/*`
4. `templates/features/policy_guardrails_runtime/*`
5. `templates/features-evm/*` and `templates/features-svm/*` chain adapters
6. `packages/saiso-cli/templates/**` via sync

Acceptance criteria:

1. All four features share the same response/error contract.
2. All mutating actions honor idempotency key and timeout semantics.
3. EVM and SVM adapters return equivalent failure classes for equivalent conditions.

## Workstream C2: Automation and Ops Consolidation

Objective:

1. Merge fragmented automation features into a coherent workflow runtime surface.

Implementation:

1. Consolidate:
   - `event_ingest_and_triggers`
   - `scheduler_and_workflow_runner`
   - `observability_and_incident_hooks`
2. Add stable workflow run identifiers and step-state model:
   - `queued`, `running`, `retrying`, `failed`, `completed`, `dead_lettered`
3. Add replay-safe event keying and dedupe.
4. Add structured ops output schema with fixed keys:
   - `runId`, `step`, `status`, `attempt`, `latencyMs`, `reasonCode`
5. Add incident hook adapters (webhook base) with severity mapping.

Target paths:

1. `templates/features/event_ingest_and_triggers/*`
2. `templates/features/scheduler_and_workflow_runner/*`
3. `templates/features/observability_and_incident_hooks/*`

Acceptance criteria:

1. Scheduled and event-triggered runs share one state model.
2. Duplicate events do not create duplicate side effects.
3. Incident hooks are deterministic and testable with fixture sinks.

## Workstream C3: State and Intelligence Consolidation

Objective:

1. Improve decision quality by integrating market data, portfolio state, and routing context.

Implementation:

1. Consolidate:
   - `oracle_and_market_data_layer`
   - `portfolio_state_and_pnl`
   - `cross_chain_intent_router`
2. Add data quality primitives:
   - `source`, `timestamp`, `stalenessMs`, `confidence`, `normalizationVersion`
3. Add state snapshots with explicit derivation metadata:
   - balances, allocations, realized/unrealized pnl
4. Add route-decision trace object:
   - selected path, rejected candidates, policy checks, expected cost/latency.

Target paths:

1. `templates/features/oracle_and_market_data_layer/*`
2. `templates/features/portfolio_state_and_pnl/*`
3. `templates/features/cross_chain_intent_router/*`

Acceptance criteria:

1. Route decisions are explainable from persisted metadata.
2. PnL and allocation calculations declare data freshness assumptions.
3. Stale/low-confidence data can block or degrade action execution by policy.

## Workstream C4: Payment and Trust Plane Consolidation

Objective:

1. Keep paid execution policy-aware and enrich trust routing with payment reliability signals.

Implementation:

1. Add unified policy-evaluation explain helper for paid and non-paid guarded actions.
2. Normalize trust inputs used during routing and settlement.
3. Ensure receipt metadata consistently includes operation class and chain family context.
4. Ensure no credential-bearing material is persisted or logged.

Target paths:

1. `packages/saiso-core/src/payments/*`
2. `packages/saiso-core/src/trust/*`
3. `packages/saiso-core/src/mcp/server-registry.ts`
4. `packages/saiso-cli/src/commands/status.ts`
5. `packages/saiso-cli/src/commands/receipts.ts`

Acceptance criteria:

1. Routing can justify selection by trust profile and cost constraints.
2. Paid failure classes are stable and machine-parseable.
3. Credential hygiene remains enforced.

## Workstream C5: Template and Scaffolding Hardening

Objective:

1. Remove generation drift and improve out-of-box project quality.

Implementation:

1. Fix template package dependency drift to current SAISO package series.
2. Replace placeholder generated tests with runnable, minimal assertions.
3. Ensure chain-aware diagnostics in generated projects and CLI commands.
4. Keep source-of-truth policy:
   - edit `templates/`
   - sync to `packages/saiso-cli/templates/`
5. Keep integrity checks for feature manifests and file paths.

Acceptance criteria:

1. Newly scaffolded projects run tests without placeholder comments.
2. Health and diagnostics behavior is chain-family aware.
3. Template drift gate stays clean.

## Workstream C6: Performance and Code Optimization

Objective:

1. Improve runtime speed and reduce overhead in key TS/JS paths.

Implementation:

1. Identify hot paths:
   - payment receipt reads/summaries
   - policy evaluation loops
   - routing candidate sorting
   - JSON parsing in request paths
2. Add low-risk optimizations:
   - incremental/tail receipt read mode for summary commands
   - parse/cache opportunities for repeated CLI config loads
   - avoid duplicated serialization on common command output paths
3. Define performance budget baselines that testing lane will enforce.

Acceptance criteria:

1. Measurable latency/allocation improvements for selected hot paths.
2. No correctness regressions in policy/routing/payment behavior.

## Milestones

1. M1: C1 + C5 foundations complete
2. M2: C2 + C3 integrated behavior complete
3. M3: C4 + C6 complete and tied to tests/benchmarks

## Risks and Mitigation

1. Risk: Over-consolidation breaks backward compatibility.
   - Mitigation: preserve action names and adapters; only make contracts stricter in additive way.
2. Risk: Template updates diverge from CLI copies.
   - Mitigation: enforce sync and drift checks in CI and local scripts.
3. Risk: Performance changes alter behavior.
   - Mitigation: require testing lane contract and regression tests before merge.

## Definition of Done

1. Consolidated features are behavior-complete, not scaffold-only.
2. EVM/SVM parity is preserved in user-facing execution semantics.
3. Policy/trust/payment behavior remains deterministic.
4. Template output quality is materially improved for first-run usability.
