# SAISO Hardening 01 Plan

## Objective

Harden the current SAISO feature set for production reliability and operational safety.

This plan intentionally prioritizes:

1. deterministic behavior,
2. strict failure handling,
3. reproducible CI gates,
4. safe handling of payment credentials and receipts,
5. stable operator-facing diagnostics.

No net-new product surface is required to complete this plan.

## Scope

In scope:

1. Payment + routing failure-mode correctness.
2. Policy precedence determinism (`CLI > policy file > env > defaults`).
3. Service blueprint endpoint hardening.
4. CI gates for identity drift + service behavior + policy validation.
5. Secret/credential hygiene in logs and persisted artifacts.
6. Observability improvements for paid-flow operations.

Out of scope:

1. New protocol integrations.
2. New chain families.
3. New premium feature packs.

## Baseline Assumptions

1. Active runtime server families are `evm` and `svm` only.
2. Paid-flow protocols are `x402` and `mpp` only.
3. Existing staging smoke remains required:
   - `npm run -s smoke:staging:payments`
4. Existing core test lane remains required:
   - `bun test packages/saiso-core/tests`

## Workstream A: Failure-Mode Test Expansion

### Goal

Make all expected failures explicit and test-locked.

### Tasks

1. Add tests for payment and routing denial/error paths:
   - missing credentials
   - unsupported/malformed credential payloads
   - recipient denied by policy
   - tool amount over limit
   - operation-class trust-floor violations
   - no routing candidate found
2. Add service endpoint failure tests:
   - malformed JSON body
   - invalid method/path combinations
   - missing registration file behavior
   - orchestrator throw propagation shape
3. Add parser edge-case tests for challenge/receipt extraction.

### Target Paths

1. `packages/saiso-core/tests/*.test.ts`
2. `packages/saiso-cli/src/commands/mcp.ts` (only if test-required fixes surface)
3. `packages/saiso-core/src/service/blueprint.ts` (only if test-required fixes surface)

### Exit Criteria

1. New failure-mode tests pass and are non-flaky.
2. All error paths return deterministic, inspectable messages.

## Workstream B: Policy Precedence Determinism

### Goal

Guarantee and document one precedence rule across runtime entry points.

### Precedence Contract

1. CLI flags
2. `.saiso/payment-policy.json` and `.saiso/trust-policy.json`
3. environment variables
4. default values

### Tasks

1. Encode precedence behavior in a shared resolver helper.
2. Add tests for each override layer and tie-break scenario.
3. Ensure `saiso mcp call` and service blueprint follow identical precedence where applicable.
4. Validate policy files in strict mode for CI usage.

### Target Paths

1. `packages/saiso-cli/src/core/policy.ts`
2. `packages/saiso-cli/src/commands/mcp.ts`
3. `packages/saiso-core/src/config/manager.ts`
4. `packages/saiso-core/tests/*policy*.test.ts`

### Exit Criteria

1. Precedence tests prove deterministic outcomes across layers.
2. No ambiguous merge behavior remains.

## Workstream C: Service Blueprint Endpoint Hardening

### Goal

Make generated service endpoints robust under invalid/malicious input.

### Tasks

1. Enforce request body constraints:
   - JSON object only
   - maximum body size guard
2. Enforce strict endpoint/method contract:
   - `GET /healthz`
   - `GET /readyz`
   - `GET /.well-known/agent-registration.json`
   - `POST /paid/tool`
3. Normalize error response schema:
   - `{ error: string, code?: string }`
4. Ensure readiness transitions are safe during shutdown.
5. Ensure missing discovery file behavior is deterministic.

### Target Paths

1. `packages/saiso-core/src/service/blueprint.ts`
2. `packages/saiso-cli/src/core/scaffolding.ts`
3. `packages/saiso-core/tests/service-blueprint.test.ts`

### Exit Criteria

1. Service tests cover both success and reject paths.
2. Response schema is stable and documented.

## Workstream D: CI Hard Gates

### Goal

Block merges/releases when hardening invariants regress.

### Tasks

1. Keep required gates:
   - core typecheck
   - CLI typecheck
   - core test suite
   - staging payment smoke
2. Enable and document identity drift gate:
   - `identity sync --dry-run --strict`
3. Add/keep policy validation gate in CI:
   - `saiso policy validate --strict` where project policy files are expected
4. Ensure service blueprint tests run in CI lane.

### Target Paths

1. `.github/workflows/saso.yml`
2. `spec/saiso-v1.0/release-checklist.md`
3. `README.md` (operator setup notes)

### Exit Criteria

1. All hardening gates are green in CI.
2. Required repo vars/secrets are documented.

## Workstream E: Secret and Credential Hygiene

### Goal

Prevent leakage of sensitive payment credentials in logs/artifacts.

### Tasks

1. Audit logging around:
   - payment credential parsing
   - tool execution errors
   - receipt summaries
2. Redact high-risk keys by default (for example `authorization`, `payment`, `x-payment`, `token`, `signature`).
3. Ensure persisted receipts contain settlement metadata but not raw credential payloads.
4. Add tests asserting no credential material appears in formatted outputs.

### Target Paths

1. `packages/saiso-core/src/payments/receipts-store.ts`
2. `packages/saiso-cli/src/commands/receipts.ts`
3. `packages/saiso-cli/src/commands/status.ts`
4. `packages/saiso-core/tests/*receipt*.test.ts`

### Exit Criteria

1. No raw credential/token exposure in standard logs and summaries.
2. Redaction behavior is tested.

## Workstream F: Paid-Flow Observability Stability

### Goal

Provide stable, machine-usable diagnostics for operators.

### Tasks

1. Add structured failure classification fields for paid flow errors.
2. Ensure `saiso receipts --json` and `saiso status` include stable keys:
   - protocol
   - success/failure class
   - reference
   - timestamp
3. Add tests to lock JSON output schema keys.

### Target Paths

1. `packages/saiso-cli/src/commands/receipts.ts`
2. `packages/saiso-cli/src/commands/status.ts`
3. `packages/saiso-core/tests/*paid*.test.ts`

### Exit Criteria

1. Output schemas are stable and tested.
2. Operators can automate alerting/reporting without brittle parsing.

## Execution Order

1. Workstream A (failure-mode tests)
2. Workstream B (policy determinism)
3. Workstream C (service hardening)
4. Workstream E (secret hygiene)
5. Workstream F (observability stability)
6. Workstream D (CI hard gates finalization)

Reasoning: establish correctness first, then enforce it in CI.

## Validation Matrix

Required on each hardening merge:

1. `npx tsc -p packages/saiso-core/tsconfig.json`
2. `npx tsc -p packages/saiso-cli/tsconfig.json`
3. `bun test packages/saiso-core/tests`
4. `npm run -s smoke:staging:payments`

Required before tagging release:

1. CI hardening gates green.
2. Identity drift gate green (when enabled).
3. Release checklist hardening items checked.

## Definition of Done

Hardening-01 is complete when:

1. Failure paths are test-covered and deterministic.
2. Policy precedence is explicitly tested and stable.
3. Service blueprint endpoints are resilient to malformed inputs.
4. CI blocks merges on hardening regressions.
5. Logs/receipts avoid credential leakage.
6. Paid-flow diagnostics are stable and machine-parseable.

## Implementation Status (2026-04-08)

- [x] Workstream A completed
  - Failure-mode tests expanded across routing, parsers, paid HTTP client, and service endpoints.
- [x] Workstream B completed
  - Shared precedence resolver implemented and wired into `saiso mcp call`.
  - Precedence contract locked with CLI/core tests.
- [x] Workstream C completed
  - Service blueprint enforces strict endpoint/method contract.
  - Body-size guard added with deterministic `413 REQUEST_BODY_TOO_LARGE`.
  - Error schema stabilized with deterministic `code` fields.
  - Shutdown-aware readiness behavior added (`isShuttingDown` + safe scaffold shutdown flow).
- [x] Workstream E completed
  - Receipt persistence now redacts sensitive keys (`authorization`, `payment`, `x-payment`, `token`, `signature`, `credential`, `proof`).
  - Receipt hygiene tests lock no secret leakage in persisted artifacts/observability views.
- [x] Workstream F completed
  - Structured `outcomeClass` diagnostics added for paid-flow receipts and failure persistence.
  - `saiso receipts --json` and `saiso status --json` emit stable paid diagnostics summaries with protocol/outcome/reference/timestamp in recent events.
  - JSON schema keys locked by tests in CLI observability helpers.
- [x] Workstream D completed
  - CI includes core typechecks, full core tests, explicit service blueprint lane, strict policy validation gate, staging payment smoke, and optional identity drift gate.
  - Fixture-backed strict policy validation command added for CI reproducibility.
