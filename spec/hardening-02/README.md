# SAISO Hardening 02 Plan

## Objective

Address the 7 remaining reliability and release-integrity gaps:

1. Initialize git repository and baseline release hygiene.
2. Fix environment precedence semantics.
3. Enforce payment daily budget behavior.
4. Correct CLI reported version.
5. Add dedicated CLI test lane in CI.
6. Resolve dual-orchestrator and Docker ghost surface drift.
7. Fix config wizard hardcoded environment behavior.

## Scope

In scope:

1. Code changes in CLI/core where behavior is currently misleading or non-deterministic.
2. CI updates to enforce CLI test coverage and release checks.
3. Spec/docs updates reflecting new behavior and deprecations.

Out of scope:

1. New protocols/chains/features.
2. Full Docker runtime support for active EVM/SVM orchestrators.

## Execution Order

1. P0 - Repo and release hygiene (`git`, version correctness).
2. P1 - Runtime safety fixes (env precedence + daily budget enforcement).
3. P2 - CI enforceability (CLI lane + required gates).
4. P3 - Surface cleanup (orchestrator consolidation and Docker messaging).
5. P4 - UX correctness (config wizard interactive env selection).

Reasoning: unblock release mechanics first, then fix safety semantics, then enforce in CI, then clean architecture and UX.

## Workstream 1 - Git Repository Baseline

### Goal

Make the project operable for normal release lifecycle.

### Tasks

1. Initialize git in project root if absent.
2. Create baseline branch strategy docs (`main`, `develop`, feature branches).
3. Add/verify `.gitignore` for sensitive and generated files:
- `.env*`
- `.saiso/payments/receipts.ndjson`
- wallet fixtures and local key artifacts
- dist/build outputs where appropriate
4. Confirm release scripts and workflows can run under git context.

### Acceptance Criteria

1. `git rev-parse --is-inside-work-tree` returns `true`.
2. No sensitive artifacts are staged by default.
3. Release scripts referencing tags/refs can run without git errors.

### Validation

1. `git status`
2. `git check-ignore -v <sample sensitive file>`

## Workstream 2 - Environment Precedence Semantics

### Goal

Make environment file loading deterministic and aligned with documented precedence.

### Required Contract

For file loading:

1. `.env`
2. `.env.<env>`
3. `.env.local`
4. `.env.<env>.local`

Last loaded must override earlier values.

### Tasks

1. Update dotenv load behavior (`override: true` for layered loading path or equivalent explicit merge).
2. Ensure comments and docs match implementation.
3. Add regression tests for override semantics.

### Target Paths

1. `packages/saiso-core/src/config/manager.ts`
2. `packages/saiso-core/src/config/environment.ts` (if used by runtime path)
3. `packages/saiso-core/tests/*config*.test.ts`

### Acceptance Criteria

1. A variable defined in `.env.<env>.local` wins over all lower layers.
2. Tests lock precedence behavior.

## Workstream 3 - Daily Budget Enforcement

### Goal

Ensure `payment.dailyBudgetUsd` is enforced or explicitly removed.

### Tasks

1. Add budget check in payment policy path before settlement.
2. Track daily spend using persisted receipts (UTC day boundary).
3. Define deterministic failure reason/code when budget exceeded.
4. Add tests for:
- under budget -> allowed
- exact budget -> allowed (or denied; choose and document)
- over budget -> denied
- day rollover resets budget accounting

### Target Paths

1. `packages/saiso-core/src/payments/policy.ts`
2. `packages/saiso-core/src/mcp/orchestrator.ts`
3. `packages/saiso-core/src/payments/receipts-store.ts` (read helpers as needed)
4. `packages/saiso-core/tests/*payment*.test.ts`

### Acceptance Criteria

1. Budget is enforced consistently in paid flows.
2. Failure classification is machine-readable and test-covered.

## Workstream 4 - CLI Version Correctness

### Goal

Prevent version drift between package metadata and CLI output.

### Tasks

1. Replace hardcoded Commander version with package-driven value.
2. Ensure build output preserves correct runtime version.
3. Add a simple CLI test asserting `--version` matches package version.

### Target Paths

1. `packages/saiso-cli/src/cli.ts`
2. `packages/saiso-cli/package.json`
3. `packages/saiso-cli/src/**/*.test.ts`

### Acceptance Criteria

1. `saiso --version` reports `packages/saiso-cli/package.json` version.

## Workstream 5 - Dedicated CLI Test Lane in CI

### Goal

Gate user-facing behavior regressions in CI.

### Tasks

1. Add explicit CLI test step in CI workflow.
2. Keep core and staging gates intact.
3. Document local parity commands.

### Target Paths

1. `.github/workflows/saso.yml`
2. `README.md`
3. `spec/saiso-v1.0/release-checklist.md`

### Acceptance Criteria

1. CI runs `bun test` for CLI test files explicitly.
2. CI fails on CLI test regressions.

## Workstream 6 - Orchestrator/Docker Surface Cleanup

### Goal

Eliminate dead-path confusion and align Docker messaging with reality.

### Tasks

1. Decide single orchestrator source of truth for runtime (`@saiso/core` factory).
2. Deprecate/remove unused local orchestrator implementation if truly unused.
3. Remove contradictory fallback messaging suggesting Docker mode where unsupported.
4. Align help text/options/docs to only supported modes (`npx`) for active runtime.

### Target Paths

1. `packages/saiso-cli/src/core/mcp-orchestration.ts`
2. `packages/saiso-cli/src/commands/dev.ts`
3. CLI docs/spec references mentioning Docker for active runtime.

### Acceptance Criteria

1. No command path suggests unsupported Docker fallback.
2. No dead orchestrator path remains without explicit deprecation note.

## Workstream 7 - Config Wizard Environment Selection

### Goal

Make wizard behavior match user expectation and dependency footprint.

### Tasks

1. Replace hardcoded `selectedEnv = 'testnet'` with interactive environment prompt.
2. Keep non-interactive mode deterministic (`--env` or safe default).
3. Add tests for wizard selection mapping to generated env files.

### Target Paths

1. `packages/saiso-cli/src/commands/config.ts`
2. `packages/saiso-cli/src/**/*.test.ts`

### Acceptance Criteria

1. Wizard allows selecting `testnet|mainnet|devnet`.
2. Generated file and follow-up instructions match selected environment.

## Cross-Cutting Testing Requirements

Required on each merge for Hardening-02:

1. `npx tsc -p packages/saiso-core/tsconfig.json`
2. `npx tsc -p packages/saiso-cli/tsconfig.json`
3. `bun test packages/saiso-core/tests`
4. `bun test packages/saiso-cli`
5. `node spec/saiso-v1.0/scripts/smoke-x402-mpp.mjs`

Additional targeted checks:

1. env precedence regression test suite
2. payment daily budget enforcement tests
3. `saiso --version` assertion
4. config wizard selection test

## Risks and Mitigations

1. Budget enforcement may break existing paid flows in CI/smoke.
- Mitigation: add clear failure class and tune fixture budgets for tests.
2. Env precedence change can alter current behavior unexpectedly.
- Mitigation: ship with tests + migration note + explicit release note.
3. Removing local orchestrator code may impact hidden scripts.
- Mitigation: search references first, deprecate in one release if uncertain.

## Definition of Done

Hardening-02 is complete when:

1. All 7 points are implemented and test-covered.
2. CI enforces both core and CLI regressions.
3. Release/reporting surfaces are behaviorally consistent with docs.
4. No stale/contradictory runtime guidance remains for unsupported Docker mode.

## Implementation Status (2026-04-08)

- [x] 1. Git repository baseline
  - Initialized git repository in project root.
  - Default branch ref set to `main`.
  - Added root `.gitignore` with environment, receipt, wallet, and build artifact protections.
  - Added branch strategy document: `spec/hardening-02/branch-strategy.md`.
- [x] 2. Environment precedence semantics
  - Fixed layered env file precedence to preserve `.env.<env>.local > .env.local > .env.<env> > .env` under `override=false`.
  - Added regression tests for layered precedence + process env non-override behavior.
- [x] 3. Daily budget enforcement
  - Added `dailyBudgetUsd` enforcement in `PaymentPolicyEngine`.
  - Added daily spend accounting from receipts (`PaymentReceiptStore.getDailySpendUsd`).
  - Wired orchestrator policy runtime to include daily spend context and deterministic denial behavior.
  - Added tests for allowed-at-budget, denied-over-budget, and UTC rollover behavior.
- [x] 4. CLI version correctness
  - Removed hardcoded CLI version and sourced from `packages/saiso-cli/package.json`.
  - Added CLI version test.
- [x] 5. Dedicated CLI test lane in CI
  - Added explicit CLI test lane in `.github/workflows/saso.yml`.
  - Updated release checklist and README hardening-gate parity docs.
- [x] 6. Orchestrator/Docker surface cleanup
  - Removed unused local CLI orchestrator module and export.
  - Kept runtime orchestrator source-of-truth at `@saiso/core` factory.
  - Removed contradictory Docker fallback suggestion in `saiso dev`.
- [x] 7. Config wizard environment selection
  - Added real environment selection via `inquirer` in interactive terminals.
  - Added deterministic non-interactive and `SAISO_WIZARD_ENV` override behavior.
  - Added tests for environment override + env-to-file mapping.
