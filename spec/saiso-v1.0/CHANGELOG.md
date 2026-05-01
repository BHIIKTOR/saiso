# SAISO v1.0 Changelog (Draft)

## Added

- Payment framework:
  - x402 MCP/HTTP adapter support
  - MPP HTTP `402` retry support
  - payment policy evaluation and budget guards
  - payment receipt persistence for audit/status
- Trust framework:
  - ERC-8004-aligned identity/registration types
  - trust policy + scoring primitives
  - trust-aware server routing
- Orchestrator execution:
  - real `invokeTool` JSON-RPC tool-call path for EVM/SVM
  - payment-aware challenge/retry handling in tool execution
- Staging smoke suite:
  - x402 facilitator connectivity checks
  - Tempo RPC connectivity check for MPP ecosystem
  - local MPP `402` retry path validation

## Changed

- Core and CLI server surfaces are now EVM/SVM-only.
- Config/env management is chain-agnostic and no longer depends on SEI aliases.
- Scaffolding and templates now target EVM/SVM active paths.
- CI now includes:
  - core + CLI typechecks
  - core test suite
  - staging payment smoke checks

## Removed

- Active SEI orchestrator path from `@saiso/core`.
- SEI-specific template trees from active project scaffolding.
- SEI server type from current MCP server type contracts.
