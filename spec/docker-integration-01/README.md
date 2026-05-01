# SAISO Docker Deep Integration 01 Plan

## Objective

Make Docker a first-class runtime path for SAISO (not a placeholder), with production-grade behavior across:

1. MCP orchestration (`evm` and `svm`)
2. Service blueprint deployment
3. Localnet-driven app testing in containers (Foundry/Anvil)
4. Local reproducibility and CI validation
5. Security and operational safety

The goal is not "Docker references in docs"; the goal is a fully working Docker execution mode with deterministic behavior and tests.

## Current Baseline (As-Is)

1. Type surface still includes `McpServerMode = 'npx' | 'docker'`.
2. Active orchestrators route to Docker methods but those methods throw not-supported errors:
   - `packages/saiso-core/src/mcp/evm-orchestrator.ts`
   - `packages/saiso-core/src/mcp/svm-orchestrator.ts`
3. Config validation rejects Docker mode:
   - `packages/saiso-core/src/config/validation.ts`
   - `packages/saiso-core/src/config/manager.ts`
   - `packages/saiso-cli/src/core/config.ts`
4. CLI blocks Docker explicitly:
   - `packages/saiso-cli/src/commands/dev.ts`
5. Service blueprint scaffold creates a basic `Dockerfile`/`.dockerignore`, but no deeper runtime contract (compose profiles, health/restart policy, security defaults, Docker test lane).

## Scope

In scope:

1. Implement true Docker mode for MCP orchestrators.
2. Expose Docker mode in CLI/config without contradictory guardrails.
3. Introduce container runtime hardening defaults.
4. Add a deterministic EVM localnet testing harness using Foundry (Anvil) in Docker.
5. Add Docker-specific test coverage and CI lane.
6. Upgrade service blueprint Docker baseline (build/runtime ergonomics and security).

Out of scope:

1. New blockchain protocol integrations.
2. Reintroducing deprecated chain families.
3. Managed Kubernetes/operator support (future track).
4. Full SVM localnet validator orchestration in this first Docker hardening pass.

## Architecture Decisions

1. `npx` remains the default mode for fast local onboarding.
2. Docker mode is opt-in via config/CLI, and must be fully supported when selected.
3. Docker runtime logic is centralized in core helpers, not duplicated in each orchestrator.
4. Secrets are injected at runtime only; never baked into image layers.
5. All Docker-run servers must satisfy the same health/readiness contract as `npx` mode.
6. Localnet tests must be hermetic and ephemeral (fresh chain state per run by default).
7. Foundry/Anvil is the first-class EVM localnet stack for v1 of this plan.

## Phase 1 - Docker Runtime Contract and Config Surface

### Goal

Define one canonical contract for Docker-mode runtime settings across core and CLI.

### Tasks

1. Extend MCP config schema with a typed Docker runtime block:
   - `image`
   - `containerName`
   - `network`
   - `host`
   - `port`
   - `pullPolicy` (`always|if-not-present|never`)
   - `extraEnv` (allowlisted only)
   - `healthPath` (default `/health`)
   - `startupTimeoutMs` (bounded defaults, for deterministic failure windows)
2. Define default image mapping when `image` is omitted:
   - EVM: pinned `@mcpdotdirect/evm-mcp-server` runtime image tag
   - SVM: pinned `@mcpdotdirect/svm-mcp-server` runtime image tag
   - document override via env (`MCP_DOCKER_IMAGE`) and config field precedence
3. Keep backward compatibility with existing `MCP_SERVER_MODE` and default to `npx`.
4. Remove hard failure for Docker mode in config validators.
5. Add explicit Docker preflight validation (binary/daemon reachable) as runtime checks, not static schema errors.
6. Add config precedence contract for Docker runtime:
   - CLI flags
   - `.saiso/config.json` and env files
   - defaults

### Target Paths

1. `packages/saiso-core/src/types/mcp.ts`
2. `packages/saiso-core/src/config/manager.ts`
3. `packages/saiso-core/src/config/validation.ts`
4. `packages/saiso-cli/src/core/config.ts`
5. `packages/saiso-core/src/types/config.ts` (if Docker runtime config is surfaced at top-level)

### Acceptance Criteria

1. Config validation succeeds for valid Docker-mode configs.
2. Invalid Docker runtime options fail with actionable messages.
3. `npx` behavior remains unchanged.
4. Default image resolution is deterministic and test-covered for both server families.

## Phase 2 - Core Docker Runner Implementation

### Goal

Implement a reusable Docker process runner used by both EVM and SVM orchestrators.

### Tasks

1. Add shared helper (for example `docker-runtime.ts`) to:
   - create deterministic container names
   - tag containers with SAISO labels (`saiso.project`, `saiso.serverType`, `saiso.mode=docker`)
   - optionally pull image based on policy
   - start detached container with env/port bindings
   - capture container id robustly (`docker run --cidfile` or inspect fallback)
   - detect stale/conflicting container names and cleanly recover
   - stop/remove container on shutdown
   - provide helper methods for logs/inspect on failure
2. Implement `startDockerServer` and `stopDockerServer` for:
   - `EvmMcpOrchestrator`
   - `SvmMcpOrchestrator`
3. Keep health-check parity:
   - poll `/health`
   - bounded timeout
   - deterministic startup error messaging with command context
4. Add structured logging for Docker lifecycle events.
5. Ensure command execution is argument-safe (`spawn` with args, no shell interpolation).

### Target Paths

1. `packages/saiso-core/src/mcp/evm-orchestrator.ts`
2. `packages/saiso-core/src/mcp/svm-orchestrator.ts`
3. `packages/saiso-core/src/mcp/` (new shared Docker runner helper)

### Acceptance Criteria

1. `saiso dev --mcp docker` can start and stop EVM/SVM MCP servers.
2. Docker-started servers pass health checks before marked ready.
3. Interrupt/shutdown reliably cleans up containers.
4. On startup failure, user gets container logs + root-cause hint in one error path.

## Phase 3 - CLI UX and Operator Commands

### Goal

Make Docker mode operationally usable from CLI without hidden constraints.

### Tasks

1. Update `saiso dev` to accept both `npx` and `docker`.
   - allow explicit Docker flags (for example `--docker-image`, `--docker-network`, `--docker-pull-policy`)
2. Add Docker-specific failure hints:
   - Docker daemon unavailable
   - image pull denied
   - port already in use
3. Add an operator diagnostics command:
   - `saiso docker doctor` (checks docker binary, daemon, permissions, compose plugin)
   - `saiso docker ps` (optional, SAISO-labeled container status summary)
4. Add `saiso docker clean` for stale SAISO container/network cleanup with confirmation prompt.
5. Ensure project scaffolding can emit Docker-ready env template entries.

### Target Paths

1. `packages/saiso-cli/src/commands/dev.ts`
2. `packages/saiso-cli/src/commands/docker.ts` (new doctor command group)
3. `packages/saiso-cli/src/cli.ts` (register Docker command group)
4. `packages/saiso-cli/src/core/scaffolding.ts`
5. `packages/saiso-cli/src/commands/docker.test.ts` (new command tests)

### Acceptance Criteria

1. CLI exposes Docker as a supported mode consistently.
2. Failure messages are actionable and protocol-safe.
3. Scaffolded projects include clear Docker setup hints.
4. Docker diagnostics and cleanup commands are test-covered.

## Phase 4 - Service Blueprint Container Hardening

### Goal

Upgrade service blueprint from "basic Dockerfile exists" to production-usable container baseline.

### Tasks

1. Replace single-stage image with secure multi-stage build.
2. Run as non-root user in runtime stage.
3. Tighten image/runtime defaults:
   - minimal base
   - deterministic install path
   - explicit healthcheck
   - no secrets copied into image
   - readonly root filesystem where compatible
   - dropped Linux capabilities where compatible
4. Add generated `docker-compose.yml` for service blueprint with:
   - service container
   - optional MCP sidecar profiles (evm/svm)
   - explicit env file wiring
   - restart policy and health dependencies
5. Add compose override for local development (`docker-compose.override.yml`) with hot-reload profile where applicable.

### Target Paths

1. `packages/saiso-cli/src/core/scaffolding.ts`
2. `templates/agent-evm/*` and `templates/agent-svm/*` (if template-driven updates are required)
3. `templates/common/*` (if shared container templates are introduced)

### Acceptance Criteria

1. `saiso new --service-blueprint` outputs a secure Docker baseline.
2. `docker compose up` can boot service + selected MCP profile locally.
3. Health/readiness endpoints work behind containerized startup order.
4. Generated artifacts include clear extension points without manual Docker rewrites.

## Phase 5 - Localnet Testing Harness (Foundry/Anvil)

### Goal

Enable one-command, containerized EVM test execution where:

1. a local Anvil chain starts in Docker,
2. the user app boots against that chain,
3. integration tests execute automatically,
4. environment is torn down deterministically.

### Tasks

1. Add Docker Compose localnet profile for EVM testing:
   - `anvil` service (`ghcr.io/foundry-rs/foundry`)
   - optional app-under-test service
   - test-runner service (CLI/core tests against localnet)
2. Standardize localnet test environment contract:
   - `RPC_URL=http://anvil:8545`
   - `CHAIN_ID=31337`
   - deterministic funded test keys
   - explicit test-only network flag
   - payment protocols disabled by default in localnet runs unless explicitly overridden
3. Define project setup/test hooks for automatic user-app execution:
   - prefer `package.json` scripts when present:
     - `localnet:setup`
     - `localnet:deploy`
     - `localnet:test`
   - fallback for Foundry projects:
     - `forge build`
     - `forge script` for deploy step when configured
     - `forge test` (or Bun project tests) as localnet test execution
   - fail with actionable guidance if neither script hooks nor Foundry conventions are present
4. Add SAISO command surface for this flow:
   - `saiso test localnet --chain evm` (or equivalent)
   - includes setup, readiness wait, app/contracts deployment, test execution, teardown
5. Add scaffolded assets for generated projects:
   - `docker-compose.localnet.yml`
   - localnet test helper script
   - env template entries for localnet
6. Add failure diagnostics:
   - chain startup timeout
   - RPC readiness timeout
   - deployment failure (for example `forge script`/migration step)
   - app boot failure
   - test execution failure with logs snapshot
7. Add cleanup guard mode:
   - default: teardown resources
   - optional `--keep-on-fail` for debugging.

### Target Paths

1. `packages/saiso-cli/src/commands/test.ts` (add `localnet` subcommand group)
2. `packages/saiso-cli/src/core/localnet.ts` (new orchestration helper)
3. `packages/saiso-cli/src/core/scaffolding.ts`
4. `templates/agent-evm/*` (localnet compose/test templates)
5. `spec/docker-integration-01/` (sample localnet config docs)

### Acceptance Criteria

1. `saiso test localnet --chain evm` starts Anvil in Docker and runs tests end-to-end.
2. Test runs are repeatable and isolated from host wallets/mainnet settings.
3. App/contracts deployment to localnet is automatic and deterministic.
4. Teardown leaves no stale containers/networks by default.
5. Logs clearly show which stage failed when failures occur.
6. Localnet test runs do not consume live x402/mpp credentials unless explicitly enabled.
7. `--keep-on-fail` preserves resources for postmortem when explicitly requested.

## Phase 6 - Test Strategy and CI Docker Lane

### Goal

Prevent regressions by adding explicit Docker runtime tests and CI gating.

### Tasks

1. Add unit tests for Docker command generation and config parsing.
2. Add integration tests that run only when Docker is available:
   - orchestrator start/stop in Docker mode (evm + svm)
   - health check transitions
   - cleanup on interrupt
3. Add service blueprint container smoke test:
   - build image
   - run container
   - verify `GET /healthz` and `GET /readyz`
4. Add CI job `docker-quality`:
   - run on PR + push
   - skip gracefully if Docker unavailable only for local scripts; CI lane must require Docker.
5. Add CI localnet integration lane:
   - boot Foundry Anvil via Docker
   - execute `saiso test localnet --chain evm`
   - publish container logs on failure.
6. Add CI matrix split to keep runtime bounded:
   - `docker-runtime` (orchestrator + CLI docker commands)
   - `docker-localnet` (Anvil + app deploy/test flow)

### Target Paths

1. `packages/saiso-core/tests/` (new Docker-mode tests)
2. `packages/saiso-cli/src/**/*.test.ts` (CLI mode/doctor tests)
3. `.github/workflows/saso.yml`
4. `packages/saiso-cli/src/commands/test.ts` (localnet command tests)
5. `.github/workflows/` (optional split workflow file for docker-heavy lanes)

### Acceptance Criteria

1. Docker-mode regressions fail CI deterministically.
2. Test matrix covers both orchestrator families, service blueprint container boot, and localnet EVM integration.
3. CI artifact retention includes docker logs for failed runs.

## Phase 7 - Docs, Release, and Operational Runbook

### Goal

Make Docker usage discoverable, reproducible, and release-safe.

### Tasks

1. Update root docs for Docker mode:
   - prerequisite checks
   - mode selection
   - troubleshooting
   - localnet testing quickstart
   - mapping of CLI commands to docker compose operations
2. Add release checklist items for Docker:
   - Docker lane green
   - service image smoke green
   - localnet integration lane green
3. Add operator runbook for:
   - stale container cleanup
   - log collection
   - port/network overrides

### Target Paths

1. `README.md`
2. `spec/saiso-v1.0/release-checklist.md`
3. `spec/docker-integration-01/` (runbook companion files as needed)
4. `AGENTS.md` (operator/developer quick commands and pitfalls)

### Acceptance Criteria

1. A new contributor can run Docker mode end-to-end without hidden steps.
2. Release process explicitly validates Docker runtime behavior.
3. Runbook includes triage playbooks for startup, healthcheck, and compose-network failures.

## Security Requirements

1. No plaintext private keys written to disk by Docker helpers.
2. No secret values echoed in CLI logs.
3. Containers run with least privilege defaults where compatible.
4. Any optional host mounts are explicit and read-only by default.
5. Localnet test mode must default to mock/deterministic keys and disallow mainnet RPC endpoints.
6. Docker execution must enforce an env allowlist to reduce accidental secret leakage into containers.

## Validation Matrix

Required during implementation:

1. `npx tsc -p packages/saiso-core/tsconfig.json`
2. `npx tsc -p packages/saiso-cli/tsconfig.json`
3. `bun test packages/saiso-core/tests`
4. `bun test packages/saiso-cli/src`
5. `bun run packages/saiso-cli/src/cli.ts test localnet --chain evm` (where Docker is available)

Required after Docker lane lands:

1. Docker-mode orchestrator integration tests green (evm + svm).
2. Service blueprint Docker smoke green.
3. Localnet EVM harness test lane green.
4. Existing paid-flow and policy gates remain green.

## Execution Order

1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 4
5. Phase 5
6. Phase 6
7. Phase 7

Reasoning: establish contract first, implement runtime second, add deterministic localnet testing, then lock behavior in CI/docs.

## Definition of Done

Docker deep integration is complete when:

1. Docker mode is a real supported MCP runtime (not blocked, not throwing placeholders).
2. CLI and config surfaces are consistent and validated.
3. SAISO provides a deterministic Dockerized localnet test flow (Foundry/Anvil) for EVM apps.
4. Generated service blueprint has secure container defaults and compose workflow.
5. Docker/localnet test lanes run and gate CI.
6. Docs and release checklist reflect the real runtime contract.

## Implementation Status

- [x] Phase 1: Docker runtime contract parsed/validated in core + CLI config layers.
- [x] Phase 2: EVM/SVM orchestrators implement Docker lifecycle via shared runtime helper.
- [x] Phase 3: `saiso docker doctor|ps|clean` and `saiso dev --mcp docker` support landed.
- [x] Phase 4: Service blueprint scaffolding now emits hardened container + compose artifacts.
- [x] Phase 5: `saiso test localnet --chain evm` implemented with Foundry/Anvil flow orchestration.
- [x] Phase 6: Docker-focused test files and CI lanes (`docker-quality`, `docker-localnet`) added.
- [x] Phase 7: README, release checklist, and AGENTS operational guidance updated.
