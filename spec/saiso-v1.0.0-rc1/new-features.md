# New Features Lane

## Mission

Add high-ROI horizontal capabilities that increase operator leverage, improve chain intelligence, and make scaffolded agents more production-ready out of the box.

## Scope

In scope:

1. Performance and benchmark governance (tracked as `T-005`).
2. Additional transport extensibility proof via a second adapter (tracked as `T-011`).
3. Operator-awareness features (run health, execution explainability, actionable telemetry).
4. Ecosystem integration surface that strengthens default agent capabilities without breaking EVM/SVM parity.

Out of scope:

1. Replacing existing payment/trust contracts (`x402`, `mpp`, trust profiles).
2. Adding unsupported chain families beyond EVM/SVM in rc1.

## Guiding Principles

1. Every feature must be measurable in operator value.
2. Features must expose deterministic machine-readable outputs for CI and automation.
3. New surface should be additive and backward-compatible for existing generated projects.
4. EVM/SVM parity is required at behavior-contract level.

## Workstream F1: Benchmark Harness and CI Budget Gates (`T-005`)

Objective:

1. Prevent silent TS/JS performance regressions in high-frequency paths.

Implementation:

1. Add benchmark runner and baseline snapshots for:
   - routing candidate selection
   - policy evaluation
   - receipt summarization and aggregation
   - request/response parsing hot paths
2. Add `perf:bench` command and CI budget checks.
3. Emit benchmark artifacts for trend analysis.

Target paths:

1. `scripts/bench/**`
2. package-level benchmark entrypoints and scripts
3. `.github/workflows/**` performance lane updates

Acceptance criteria:

1. Benchmark lane is deterministic with fixed seeds.
2. Budget breaches fail CI with actionable delta output.

## Workstream F2: Operational Awareness Feature Pack

Objective:

1. Give operators a complete, low-friction runtime picture for diagnosis and control.

Implementation:

1. Add normalized run summaries with stable fields:
   - `runId`, `agentId`, `chainFamily`, `operationClass`, `status`, `latencyMs`, `errorClass`
2. Add explain endpoints/commands for route and policy decisions.
3. Add incident-focused output mode tuned for alerting pipelines.

Target paths:

1. `packages/saiso-cli/src/commands/**`
2. `packages/saiso-core/src/**` observability/tracing helpers
3. templates for generated operator dashboards/log hooks

Acceptance criteria:

1. Operator commands return deterministic JSON for automation.
2. Error classes are stable and documented across failure modes.

## Workstream F3: Chain Intelligence Expansion

Objective:

1. Improve default action quality by increasing market/state context quality.

Implementation:

1. Add richer route comparison metadata and cost/latency confidence fields.
2. Add freshness and confidence gates for market/oracle-driven decisions.
3. Add state snapshots that can be consumed by strategy agents without custom glue code.

Target paths:

1. `templates/features/oracle_and_market_data_layer/*`
2. `templates/features/cross_chain_intent_router/*`
3. `templates/features/portfolio_state_and_pnl/*`

Acceptance criteria:

1. Actions can explain why routes were selected/rejected.
2. Stale/low-confidence state is surfaced and policy-enforceable.

## Workstream F4: Integration Surface Packs

Objective:

1. Increase out-of-box usefulness for teams building production agents.

Implementation:

1. Add hardened integration packs with deterministic contracts for:
   - notifications/webhooks
   - analytics/event forwarding
   - external service adapters used by generated projects
2. Provide chain-agnostic envelopes and chain-aware payload adapters.

Target paths:

1. `templates/features/**`
2. `templates/features-evm/**`
3. `templates/features-svm/**`

Acceptance criteria:

1. New packs pass template integrity validation.
2. Generated scaffolds are functional without placeholder edits.

## Workstream F5: Second Chat Adapter Extensibility Proof (`T-011`)

Objective:

1. Prove transport architecture is extensible and not Telegram-specific.

Implementation:

1. Implement a second adapter over the same transport contract.
2. Reuse shared conformance fixtures and mode negotiation behavior.
3. Validate capability fallbacks and deterministic unsupported-feature errors.

Target paths:

1. transport adapter modules under runtime/CLI
2. shared transport conformance test fixtures

Acceptance criteria:

1. Adapter passes the shared transport conformance suite.
2. No adapter-specific behavioral drift at contract boundary.

## Milestones

1. NF1: `F1` benchmark harness operational.
2. NF2: `F2` and `F3` feature depth complete.
3. NF3: `F4` packs hardened and `F5` extensibility proof complete.

## Risks and Mitigation

1. Risk: Feature sprawl without measurable value.
   - Mitigation: enforce acceptance criteria tied to deterministic outputs and operator outcomes.
2. Risk: CI cost growth from new lanes.
   - Mitigation: stage heavy lanes with cache strategy and deterministic subset runs.
3. Risk: Parity drift between EVM and SVM variants.
   - Mitigation: require parity-contract checks in testing lane.

## Definition of Done

1. Tracked items `T-005` and `T-011` are completed with green CI evidence.
2. Added features produce deterministic machine-readable outputs.
3. Generated projects gain usable capabilities without placeholder-only scaffolding.
