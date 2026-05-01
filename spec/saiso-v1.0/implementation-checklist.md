# SAISO v1.0 Implementation Checklist

## A) Baseline and Server Surface

- [x] Remove SEI from active server type contracts in core and CLI.
- [x] Keep active orchestrators to `evm` and `svm`.
- [x] Remove SEI-only template paths from active scaffolding logic.

## B) Type System and Config

- [x] `McpServerType` constrained to `evm|svm`.
- [x] `ServerType` constrained to `evm|svm|utility|custom`.
- [x] Remove SEI environment alias usage from config manager and env helpers.
- [x] Keep payment and trust config sections in `SaisoConfig`.

## C) Orchestration

- [x] `SvmMcpOrchestrator` integrated.
- [x] `createMcpOrchestrator` routes only `evm|svm`.
- [x] Multi-server manager supports EVM/SVM routing + execution.
- [x] Add real `invokeTool` implementation with JSON-RPC tool calls.
- [x] Wire payment-aware retries into concrete EVM/SVM tool execution paths.

## D) CLI and Scaffolding

- [x] `saiso new` defaults to EVM and supports SVM selection.
- [x] `saiso add` resolves server type from loaded config.
- [x] `saiso mcp` validates `evm|svm` active server types.
- [x] `saiso env` includes payment/trust policy scaffolding.
- [x] CLI identity text and banner are EVM/SVM aligned.

## E) Templates

- [x] `templates/agent-evm` and `templates/agent-svm` are active.
- [x] Remove `templates/agent-sei` from active template tree.
- [x] Remove `templates/features-sei` from active template tree.
- [x] Keep generated `.saiso/payment-policy.json` and `.saiso/trust-policy.json` support.

## F) Payment Protocol Layer

- [x] Add payment challenge/credential/receipt abstractions.
- [x] Add x402 MCP + facilitator client support.
- [x] Add MPP HTTP `402` retry support and parser compatibility.
- [x] Persist payment receipts for status/audit.
- [x] Add orchestration tests for paid tool invocation.

## G) ERC-8004 Trust/Discovery Layer

- [x] Add ERC-8004-aligned registration and config metadata structures.
- [x] Add trust scoring and policy modules.
- [x] Add trust-aware routing in server registry.
- [x] Expose trust/payment metadata in CLI status output.

## H) QA and Release Gates

- [x] Core typecheck passes.
- [x] CLI typecheck passes.
- [x] Core tests pass:
  - [x] config migration
  - [x] payment HTTP flows
  - [x] payment-aware tool orchestration
- [x] Add staging smoke script for x402 + MPP.
- [x] Run staging smoke script with live endpoint checks.
- [x] Add live paid staging smoke script with secret-backed credential inputs.
- [x] Add CI jobs for typechecks, tests, and staging smoke.
- [x] Add manual CI job for secret-backed live paid smoke with env validation.

## I) Release Artifacts

- [x] v1.0 plan/spec updated to match current implementation.
- [x] v1.0 changelog draft.
- [x] v1.0 migration guide.
- [x] v1.0 release checklist.
- [x] v1.0 paid staging + paid tool execution implementation plan.
- [x] v1.0 publish pipeline guide.
- [x] Publish workflow with core->cli sequencing and dry-run support.
- [x] Release scripts for validate, prepare-cli-publish, and pack/install smoke.
