# SAISO v1.0 Release Checklist

## Code and Contracts

- [x] `McpServerType` and CLI server options are `evm|svm` only.
- [x] No active SEI code paths remain in `packages/saiso-core/src` and `packages/saiso-cli/src`.
- [x] EVM/SVM orchestrators expose `invokeTool` with payment-aware handling.

## Payments and Trust

- [x] x402 and MPP adapters compile and test cleanly.
- [x] Receipt persistence works for paid flows.
- [x] Trust scoring/policy modules are exported and routable.
- [x] `saiso mcp call` supports paid execution inputs and routed/server execution.
- [x] `saiso status` reports derived payment reliability/trust signals.

## Validation

- [x] `npx tsc -p packages/saiso-core/tsconfig.json`
- [x] `npx tsc -p packages/saiso-cli/tsconfig.json`
- [x] `bun test packages/saiso-core/tests`
- [x] `bun test packages/saiso-cli/src`
- [x] `bun test packages/saiso-core/tests/service-blueprint.test.ts`
- [x] `node spec/saiso-v1.0/scripts/smoke-x402-mpp.mjs`
- [x] `saiso policy validate --strict --payment-file spec/hardening-01/fixtures/policies/payment-policy.json --trust-file spec/hardening-01/fixtures/policies/trust-policy.json`
- [x] Optional service blueprint scaffold validates:
  - [x] `saiso new <name> --service-blueprint --yes`
  - [x] generated service exposes `/healthz`, `/readyz`, and `/.well-known/agent-registration.json`
  - [x] automated endpoint behavior tests pass (`packages/saiso-core/tests/service-blueprint.test.ts`)

## CI

- [x] `.github/workflows/saso.yml` contains:
  - [x] core typechecks
  - [x] core tests
  - [x] CLI test lane
  - [x] explicit service blueprint endpoint lane
  - [x] strict policy validation lane (fixture-backed)
  - [x] staging payment smoke run
  - [x] optional identity drift gate (`identity sync --dry-run --strict`) behind `IDENTITY_DRIFT_CHECK=true`
  - [x] docker-quality lane (docker runtime + CLI docker tests)
  - [x] docker-localnet lane (`saiso test localnet --chain evm`)
- [x] `.github/workflows/live-paid-smoke.yml` exists for manual secret-backed paid validation.
- [x] `.github/workflows/publish.yml` exists for validated package publishing.
- [x] Release scripts exist for:
  - [x] release metadata validation
  - [x] pack/install smoke verification
  - [x] CLI dependency rewrite for publish

## Documentation

- [x] `spec/saiso-v1.0/README.md` matches implemented architecture.
- [x] `spec/saiso-v1.0/implementation-checklist.md` reflects delivery state.
- [x] `spec/saiso-v1.0/MIGRATION.md` covers env/config migration.
- [x] `spec/saiso-v1.0/CHANGELOG.md` summarizes release deltas.
- [x] `spec/saiso-v1.0/publish-pipeline.md` documents publish workflow and secrets.
- [x] Root `README.md` documents docker runtime commands and localnet test flow.
- [x] `AGENTS.md` includes docker/localnet operator guidance.

## Docker and Localnet

- [x] MCP docker mode is supported for active EVM/SVM orchestrators.
- [x] `saiso dev --mcp docker` works with docker runtime config overrides.
- [x] `saiso docker doctor|ps|clean` commands are available.
- [x] `saiso test localnet --chain evm` runs a Dockerized Foundry Anvil flow.
- [x] Service blueprint scaffolding includes hardened Docker artifacts:
  - [x] multi-stage `Dockerfile`
  - [x] `docker-compose.yml` with optional EVM/SVM sidecar profiles
  - [x] `docker-compose.localnet.yml` for localnet testing

## Required CI Settings

- [x] Repo variable: `IDENTITY_DRIFT_CHECK` (set `true` to enforce identity drift gate).
- [x] Repo secret: `IDENTITY_REGISTRY_BASE_URL` (required when drift gate enabled).
- [x] Repo secret: `IDENTITY_AGENT_REGISTRY` (required when drift gate enabled).
- [x] Repo secret: `IDENTITY_AGENT_ID` (required when drift gate enabled).
- [x] Repo secret: `NPM_TOKEN` (required for publish workflow).
