# SAISO v1.0 Addendum 01: Immediate Work Priorities

This addendum captures the recommended next execution order for project hardening after current implementation and live-payment validation work.

## Priority 1: Fix live paid smoke reliability

`spec/saiso-v1.0/scripts/smoke-paid-live.mjs` currently sends a JSON body for all methods. This breaks valid `GET` paid endpoints.

### Actions

1. Make request construction method-aware (`GET`/`HEAD` without body).
2. Re-run local smoke + live smoke validation.
3. Keep CI workflow behavior aligned with the fixed script.

## Priority 2: Align x402 live smoke with real x402 v2 behavior

Current smoke assumptions are too simplified for some production providers.

### Actions

1. Support realistic x402 v2 header format for paid retries.
2. Parse and report settlement references consistently from response headers.
3. Validate against at least one known live x402 endpoint.

## Priority 3: Resolve CLI/runtime server type drift

`packages/saiso-cli/src/commands/mcp.ts` accepts `utility/custom` server types, while active orchestration is EVM/SVM-focused.

### Actions

1. Either implement orchestration for `utility/custom`, or
2. Restrict CLI add-path to `evm|svm` only.
3. Keep docs and help text consistent with runtime behavior.

## Priority 4: Handle Docker mode explicitly

EVM/SVM orchestrators currently expose docker mode but throw not-implemented errors.

### Actions

1. Implement docker start/stop path in orchestrators, or
2. Remove/gate docker mode from user-facing command paths.
3. Update status/help output to avoid false expectations.

## Priority 5: Add deterministic paid E2E integration lane

Unit coverage exists, but end-to-end payment behavior should be validated in a deterministic integration flow.

### Actions

1. Add integration tests for `402 -> credential -> retry -> receipt`.
2. Cover both x402 and MPP paths.
3. Include CLI tool-call path coverage where feasible.

## Priority 6: Improve payment observability

Operators need quick insight into settlement health.

### Actions

1. Add receipt summary command/script (recent receipts, success rate, references).
2. Surface protocol-level failure signals in status output.
3. Keep output concise and machine-parsable.

## Priority 7: Feature expansion after hardening

Only after priorities 1-6 are stable:

1. Expand premium paid-tool integrations.
2. Strengthen trust-weighted routing defaults.
3. Increase ERC-8004 discovery/runtime usage.

### Status

- Trust-weighted routing defaults have been implemented:
  - registry candidate ordering now prioritizes trust score and cost-aware tie-breaks
  - CLI routing supports `--min-trust-score` and `--max-cost-usd`
  - trust policy `minTrustScore` is used as default routing floor when enabled
- Premium paid-tool integration starter paths have been added:
  - generated agent templates include optional premium paid probe wiring
  - probes use payment-aware tool execution with env-based credential resolvers
- ERC-8004 discovery/runtime usage has been expanded:
  - `saiso identity` command (`build`, `show`, `validate`) added
  - `saiso identity sync` added for remote registry -> local file reconciliation
  - `saiso identity sync --dry-run --strict` supports CI drift gating
  - scaffolding now generates `.well-known/agent-registration.json` starter metadata

## Execution Rule

Follow this order strictly:

1. Stabilization/hardening (Priorities 1-6)
2. Product-facing feature expansion (Priority 7)

This keeps operational risk low while preserving delivery speed.
