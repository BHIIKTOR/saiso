# SAISO v1.0 Plan: EVM + SVM, Agent Payments, and Trust Routing

## 1) Goals

SAISO v1.0 will:

1. Be EVM-first with first-class SVM support.
2. Remove SEI from active runtime, CLI choices, scaffolds, and templates.
3. Add production-grade payment rails for agentic flows using:
   - x402 (MCP + HTTP)
   - MPP (HTTP 402 retry + MCP/JSON-RPC-compatible parsing)
4. Add ERC-8004-aligned identity/trust metadata for discovery and routing.

## 2) Current-State Snapshot (Implemented)

The codebase now reflects the v1.0 target:

- Active server types: `evm`, `svm`
- Orchestrators:
  - `EvmMcpOrchestrator`
  - `SvmMcpOrchestrator`
- Payment layer:
  - policy engine
  - x402/MPP adapters and parsers
  - receipt persistence
  - payment-aware tool execution path (`invokeTool`)
- Trust layer:
  - ERC-8004-aligned registration model
  - trust scoring + policy
  - trust-aware server routing
- CLI:
  - EVM/SVM project creation and switching
  - payment/trust status surfacing
  - env generation includes payment/trust blocks

## 3) External Protocol Inputs (Research-Backed)

### x402 (Coinbase)

- x402 v2 with MCP and HTTP transport guidance.
- Facilitator endpoints (`/verify`, `/settle`) integrated as server-side compatibility points.
- MCP `_meta` paths supported for challenge/retry/receipt loops.

### MPP (Machine Payments Protocol)

- HTTP `402` challenge/credential/receipt retry flow integrated.
- JSON-RPC and MCP-compatible payment challenge parsing supported.
- Tempo chain connectivity included in staging smoke checks.

### ERC-8004 (Draft)

- Identity/discovery and trust metadata are modeled as config-level capability.
- Routing can incorporate trust score + reputation sources.
- Endpoint descriptors can advertise MCP/A2A/API references.

## 4) Target v1.0 Architecture

### 4.1 Chain Strategy

- Supported runtime targets:
  - EVM
  - SVM

### 4.2 Server Types

- `evm`: primary production server path
- `svm`: first-class server path

### 4.3 Payments

- Protocol-agnostic payment abstraction:
  - `PaymentChallenge`, `PaymentCredential`, `PaymentReceipt`, `PaymentPolicy`
- Adapters:
  - x402 (MCP + HTTP)
  - MPP (HTTP + compatible transport parsing)
- Guardrails:
  - max-per-request
  - daily budget
  - recipient allowlist/denylist

### 4.4 Trust/Discovery

- ERC-8004-aligned metadata:
  - identity references
  - endpoint descriptors
  - trust/reputation/validation sources
- Trust-aware routing:
  - capability + health + trust score + optional cost constraints

## 5) Detailed Phase Plan

## Phase 1: Type and Config Refactor

### Deliverables

1. Server types constrained to `evm|svm`.
2. Network inference and config loading are chain-agnostic.
3. Payment and trust sections are available in `SaisoConfig`.

### Exit Criteria

- `McpServerType` supports only `evm|svm`.
- `createMcpOrchestrator` defaults to `evm`.
- Config manager derives EVM/SVM values without SEI aliases.

## Phase 2: Orchestrator Modernization

### Deliverables

1. `SvmMcpOrchestrator` integrated.
2. Multi-server manager routes and executes across EVM/SVM.
3. Payment-aware MCP tool invocation implemented in concrete orchestrators.

### Exit Criteria

- `saiso mcp add --type svm` works end-to-end.
- `invokeTool` supports plain and paid tool flows.

## Phase 3: CLI + Template Realignment

### Deliverables

1. `saiso new` defaults to EVM and offers SVM.
2. `saiso add` resolves server type from config.
3. Templates/scaffolds are EVM/SVM-focused.

### Exit Criteria

- Fresh scaffolds require no SEI variables.
- Template trees include only active server families.

## Phase 4: Payment Layer (x402 + MPP)

### Deliverables

1. Payment abstraction + policy engine.
2. x402 MCP/HTTP support.
3. MPP HTTP flow + parser compatibility.
4. Receipt store for audit trail.

### Exit Criteria

- Paid tool calls complete through challenge -> credential -> retry.
- Receipts are persisted and readable for status/audit.

## Phase 5: ERC-8004 Trust/Discovery

### Deliverables

1. Identity/trust config blocks.
2. Trust scoring and policy primitives.
3. Routing that can prefer trusted providers.

### Exit Criteria

- Agent metadata includes trust/identity endpoint descriptors.
- Routing supports trust constraints.

## Phase 6: Release and Operations

### Deliverables

1. CI gates for core tests and staging smoke checks.
2. Staging smoke scripts for x402 + MPP ecosystem reachability.
3. Release artifacts (changelog, migration guide, checklist).

### Exit Criteria

- CI runs typechecks + core tests + payment smoke.
- Release docs are complete and aligned with code.

## 6) Testing and Release Gates

## 6.1 Required Tests

1. Type/config migration tests for EVM/SVM.
2. Payment integration tests:
   - x402 MCP challenge/retry
   - MPP HTTP retry
3. Orchestrator tool-invocation tests (EVM + SVM).
4. CLI behavior tests for EVM/SVM project setup.

## 6.2 Rollout Gates

1. Gate A: EVM default path stable.
2. Gate B: SVM orchestration stable.
3. Gate C: x402 + MPP staging smoke passes.
4. Gate D: identity/trust metadata visible and route-aware.

## 6.3 Publish Pipeline Gate

1. `scripts/release/validate-release.mjs` passes for target version.
2. `scripts/release/smoke-pack-install.mjs` passes for target version.
3. `.github/workflows/publish.yml` dry-run passes for core + CLI.
4. Real publish sequence is core first, then CLI once npm index visibility confirms `@saiso/core@version`.

## 7) Risk Register

1. Protocol churn risk:
   - MPP and ERC-8004 are still evolving.
   - Mitigation: adapters and versioned schemas.
2. Transport mismatch risk:
   - MCP/payment challenge shapes vary by implementation.
   - Mitigation: compatibility parsers and fallback handling.
3. External dependency availability:
   - Facilitator/RPC endpoints can be transient.
   - Mitigation: smoke checks + local fallback smoke path.

## 8) Definition of Done for SAISO v1.0

SAISO v1.0 is complete when:

1. New projects are EVM-first with SVM first-class support.
2. Active runtime and templates are free of SEI paths.
3. x402 and MPP payment flows are integrated end-to-end.
4. ERC-8004-aligned identity/trust metadata is available in config/routing.
5. CI and release artifacts are complete and validated.
