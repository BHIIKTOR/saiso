# SAISO SVM/EVM Parity and Template Fix Plan

## Objective

Deliver full SAISO EVM/SVM flow parity with a first-party SVM MCP server and remove broken template/runtime drift.

Primary outcomes:

1. Replace legacy SVM runtime dependency with SAISO-owned SVM MCP server.
2. Keep EVM/SVM flows 1:1 through a canonical parity operation contract.
3. Repair template system and `saiso add` integration reliability.
4. Ensure paid flows (`x402`/`mpp`) remain policy-aware and receipt-aware for both EVM and SVM.

Parity in this plan means user-visible flow parity, not byte-identical internals.

## Approved Direction

1. Build a first-party SVM MCP server (`@saiso/svm-mcp-server`) and remove `@mcpdotdirect/svm-mcp-server` references.
2. Keep parity by exposing a stable SAISO canonical operation layer across EVM and SVM.
3. Use Solana Agent Kit as an internal capability provider (optional), not as public contract surface.

## Execution Order

1. Phase 0 and Phase 1 (parity contract + first-party SVM server).
2. Phase 2 (core runtime migration).
3. Phase 3 (template system and `saiso add` hardening).
4. Phase 4 (payment/trust parity hardening).
5. Phase 5 (drift prevention and CI gates).

## Scope

In scope:

1. New package implementation for SVM MCP server.
2. Core orchestrator wiring to first-party SVM server.
3. Template and CLI feature-install hardening.
4. Payment and trust parity plumbing updates where required for SVM.
5. CI/test updates for parity and drift prevention.

Out of scope:

1. Non-parity advanced SVM DeFi verticals as mandatory default surface.
2. Full production rollout automation for external registry publishing in this pass.

## 1:1 User Flow Parity Requirements

For both EVM and SVM generated projects, the following flows MUST exist with equivalent UX:

1. `saiso new` scaffold path works and produces runnable project.
2. `saiso dev` starts MCP runtime and reports healthy startup.
3. `saiso add <feature>` installs and wires feature without manual edits.
4. `saiso mcp call` can run canonical parity operations.
5. Optional paid probe path can challenge/retry with `x402` or `mpp`.
6. `saiso policy validate` works consistently before paid runs.

## Canonical Parity Contract (v1)

Canonical operation IDs (both families):

1. `network.status`
2. `wallet.address`
3. `wallet.native_balance`
4. `token.balance`
5. `token.transfer`
6. `tx.simulate`
7. `tx.estimate_fee`
8. `contract.read`
9. `contract.write`

Response envelope contract:

1. `success: boolean`
2. `data?: object`
3. `error?: { code: string; message: string }`
4. `network: string`
5. `chainFamily: 'evm' | 'svm'`
6. `txHash?: string`
7. `receipt?: object`
8. `cost?: object`
9. `meta?: object`

Implementation policy:

1. EVM keeps existing tool names/capabilities but adds canonical aliases where needed.
2. SVM first-party server implements canonical operations directly and may provide legacy aliases for compatibility.

Legacy compatibility aliases (required in this pass):

1. `get-balance` -> `wallet.native_balance`
2. `send-sol` -> `token.transfer` (native SOL mode)
3. `send-spl-token` -> `token.transfer` (token mode)
4. `read-program-account` -> `contract.read`
5. `simulate-transaction` -> `tx.simulate`

## Phase Plan

## Phase 0: Contract and Architecture Freeze

Tasks:

1. Define parity contract file and operation schemas in core.
2. Add provider model docs (`svm provider: saiso default, optional sak backend`).
3. Define compatibility rules (additive changes only in v1).

Acceptance:

1. Contract file exists and is imported by SVM server + tests.
2. Runtime docs reflect first-party SVM default.

## Phase 1: First-Party SVM MCP Server

Tasks:

1. Create `packages/saiso-svm-mcp-server` package.
2. Implement HTTP JSON-RPC endpoint for `tools/call` and health endpoints.
3. Implement canonical parity operations using Solana RPC (`@solana/web3.js` + SPL token helpers).
4. Add compatibility aliases for existing SVM names:
- `get-balance`
- `send-sol`
- `send-spl-token`
- `read-program-account`
- `simulate-transaction`
5. Keep `getCapabilities()` tool listing backward-compatible for existing CLI UX while canonical operations are available for parity tests.

Acceptance:

1. Server boots from CLI/orchestrator.
2. Health check passes.
3. Canonical and legacy aliases both execute.

## Phase 2: Orchestrator Runtime Migration

Tasks:

1. Update `SvmMcpOrchestrator` npx startup package to `@saiso/svm-mcp-server`.
2. Update docker defaults and docs from legacy image to SAISO image defaults.
3. Preserve payment-aware invocation path unchanged.
4. Preserve existing SVM orchestrator tests by supporting both canonical and legacy operation IDs.

Acceptance:

1. `SvmMcpOrchestrator` starts with first-party package.
2. No code references remain to `@mcpdotdirect/svm-mcp-server`.
3. User-facing startup logs remain consistent with EVM startup semantics.

## Phase 3: Template System Repair (9 Issues)

Tasks:

1. Set root `/templates` as source of truth and sync to CLI templates.
2. Fix missing `features-evm/gas_estimation` assets.
3. Update stale dependencies and remove nonexistent SVM package reference.
4. Replace fragile `actions: []` regex integration strategy in `saiso add` with deterministic feature-registry insertion.
5. Fix feature test path imports and test runner consistency (`bun:test`).
6. Ensure required feature dependencies are declared.
7. Fix SVM template EVM-content drift.
8. Remove unavailable feature mentions (`multi_send`).
9. Fix generic env semantic drift (`NETWORK` and server port consistency).
10. Ensure EVM and SVM templates both include paid probe and policy guidance for `x402` and `mpp`.
11. Ensure template source-of-truth policy:
- edit only `/templates`
- sync to `packages/saiso-cli/templates`
- CI fails if drift detected
12. Add explicit sync command to project scripts and contributor docs.

Acceptance:

1. All 9 issues closed and test-covered.
2. `saiso new` + `saiso add` works for both EVM/SVM templates.
3. No template references to unavailable package names or nonexistent features.

## Phase 4: Payment and Trust Parity Hardening

Tasks:

1. Keep `x402`/`mpp` challenge-retry path protocol-aware for EVM and SVM tool calls.
2. Add chain/method metadata normalization in persisted receipts.
3. Ensure trust/routing can consume SVM payment reliability equally.

Acceptance:

1. Paid SVM flow executes same policy and receipt lifecycle as EVM.
2. Receipt schema includes sufficient metadata for parity scoring.
3. Paid probe behavior is equivalent in EVM and SVM templates (`SAISO_PREMIUM_*` controls).

## Phase 5: Drift Prevention and CI Gates

Tasks:

1. Add template integrity test (config file entries must exist).
2. Add template sync drift gate (`templates` vs `packages/saiso-cli/templates`).
3. Add scaffold/add/build/test matrix for EVM and SVM.
4. Add parity-operation smoke tests validating same canonical calls across EVM and SVM adapters.

Acceptance:

1. CI fails on template drift and feature manifest drift.
2. CI validates EVM/SVM parity smoke paths.
3. CI includes at least one canonical operation parity assertion across both families.

## 9-Issue Closure Map

1. Missing `features-evm/gas_estimation` files -> Phase 3
2. Stale/unresolvable template deps -> Phase 3
3. Add-command integration mismatch (`actions` regex) -> Phase 3
4. Broken feature test import paths -> Phase 3
5. Test framework inconsistency (`vitest` vs `bun:test`) -> Phase 3
6. Missing required dependencies in feature installs -> Phase 3
7. SVM template EVM wording/settings drift -> Phase 3
8. Docs mention unavailable `multi_send` -> Phase 3
9. Generic env semantic drift (`NETWORK`/port) -> Phase 3

## Completion Checklist

- [x] `@saiso/svm-mcp-server` package added and buildable
- [x] SVM orchestrator uses first-party package and health checks pass
- [x] Legacy SVM package references removed from runtime/templates/docs
- [x] All 9 template issues fixed
- [x] `saiso add` deterministic integration path implemented
- [x] EVM and SVM templates both include paid probe env/docs
- [x] Canonical parity operations available for both families
- [x] Payment/trust metadata parity updates completed
- [x] Template drift CI gate implemented
- [x] Parity smoke/test matrix green

## Implementation Workstreams

1. `WS-A`: `@saiso/svm-mcp-server` package + tests.
2. `WS-B`: core orchestrator migration and defaults.
3. `WS-C`: template and `saiso add` hardening.
4. `WS-D`: payment/trust parity metadata and tests.
5. `WS-E`: CI drift gates and parity smoke.

## Test Plan

Required:

1. `npx tsc -p packages/saiso-core/tsconfig.json`
2. `npx tsc -p packages/saiso-cli/tsconfig.json`
3. `npx tsc -p packages/saiso-svm-mcp-server/tsconfig.json`
4. `bun test packages/saiso-core/tests`
5. `bun test packages/saiso-cli`
6. `bun test packages/saiso-svm-mcp-server/tests`

Scenario tests:

1. scaffold EVM template -> install -> build
2. scaffold SVM template -> install -> build
3. add feature in EVM + SVM projects and validate integration output
4. payment parser/receipt parity for protocol responses
5. canonical parity-op smoke for EVM and SVM using shared assertions

Template sync validation commands:

1. `npm run --prefix packages/saiso-cli sync-templates`
2. `diff -rq templates packages/saiso-cli/templates`

## Drift Review Protocol (Code vs Plan)

Each drift pass MUST run:

1. Plan requirement inventory from this README.
2. Code grep and file inspection for each requirement.
3. Gap classification:
- `missing`
- `partial`
- `implemented`
4. Patch all `missing` and `partial` gaps before closing the pass.
5. Re-run targeted tests for patched areas.

## Drift Pass Log

1. `Pass-1`: Runtime/package parity pass
- Status: implemented
- Gaps fixed:
  - first-party package scaffold (`packages/saiso-svm-mcp-server`)
  - SVM orchestrator runtime migration to `@saiso/svm-mcp-server`
  - canonical/legacy SVM resolution path

2. `Pass-2`: Template and add-command pass
- Status: implemented
- Gaps fixed:
  - root templates set as source of truth and re-synced
  - removed stale `multi_send` references
  - fixed SVM template package/docs to first-party package
  - deterministic feature-registry insertion replacing `actions: []` regex flow

3. `Pass-3`: CI/release drift gate pass
- Status: implemented
- Gaps fixed:
  - template integrity script (`scripts/validate-template-features.mjs`)
  - CI drift checks (`diff -rq templates packages/saiso-cli/templates`)
  - release validation + smoke-pack include `@saiso/svm-mcp-server`
  - publish workflow includes SVM MCP server package publish job

4. `Pass-4`: Verification pass
- Status: implemented
- Validation:
  - typechecks: core, cli, svm-mcp-server
  - tests: core suite, cli suite (+ add registry tests), svm-mcp-server tests
  - template integrity + sync gates green
  - release smoke-pack/install green with core+svm+cli tarballs

## Risks and Mitigations

1. Solana Agent Kit Node runtime floor is higher than SAISO baseline.
- Mitigation: keep SAK optional backend and preserve native SVM implementation path for Node 18+ baseline.

2. Breaking existing tests relying on legacy SVM tool names.
- Mitigation: provide legacy aliases in SVM server and incrementally migrate tests.

3. Template dual-tree drift returning.
- Mitigation: add explicit CI drift gate and one source-of-truth policy.

## Definition of Done

1. First-party SVM MCP server is integrated and default.
2. Legacy SVM package references removed.
3. All 9 template issues resolved.
4. EVM/SVM parity operations available and tested.
5. Payment/trust flow parity validated.
6. Template drift prevention in CI is active.

## Target File Map

Core/runtime targets:

1. `packages/saiso-core/src/mcp/svm-orchestrator.ts`
2. `packages/saiso-core/src/constants/docker.ts`
3. `packages/saiso-core/src/mcp/orchestrator.ts`
4. `packages/saiso-core/src/payments/receipts-store.ts`
5. `packages/saiso-core/src/types/*` (parity schema types as needed)

CLI/template targets:

1. `packages/saiso-cli/src/commands/add.ts`
2. `packages/saiso-cli/src/core/scaffolding.ts`
3. `templates/**`
4. `packages/saiso-cli/templates/**` (sync artifact)

New package targets:

1. `packages/saiso-svm-mcp-server/package.json`
2. `packages/saiso-svm-mcp-server/src/*`
3. `packages/saiso-svm-mcp-server/tests/*`

## Revision Log

1. `R0` - Initial approved direction captured and expanded into executable phases.
2. `R1` - Added explicit execution order, compatibility alias contract, and target file map.
3. `R2` - Added user-flow parity requirements and stricter acceptance criteria.
4. `R3` - Added completion checklist and drift-review protocol.
5. `R4` - Added explicit template sync command/validation requirements.
6. `R5` - Locked first-party SVM MCP package + orchestrator migration details.
7. `R6` - Locked deterministic `saiso add` registry integration and tests.
8. `R7` - Locked template parity and stale reference removal details.
9. `R8` - Locked CI drift gates and release pipeline updates for SVM package.
10. `R9` - Recorded drift pass outcomes and validation status.
