# Protocol Integration Map: x402, MPP, ERC-8004 in SAISO

This document lists concrete, repo-specific insertion points for payment and trust protocols.

## 1) x402 Integration Map

## 1.1 MCP Paid Tools (Highest Impact)

### Why here

SAISO already routes tool execution via MCP orchestrators and server lifecycle managers. x402 is already well-defined for MCP `_meta` fields.

### Add here

- `packages/saiso-core/src/mcp/orchestrator.ts`
  - add payment-aware execution contract for tool call wrappers
- `packages/saiso-core/src/mcp/evm-orchestrator.ts`
  - add optional paid-tool wrapper for premium operations
- new file `packages/saiso-core/src/payments/adapters/x402-mcp.ts`
  - parse payment-required challenge from MCP responses
  - attach `_meta["x402/payment"]` on retry
  - read `_meta["x402/payment-response"]` receipts

### Good first paid operations

1. premium simulation/estimation tools
2. premium market data and risk checks
3. cross-chain route computation tools

## 1.2 HTTP Connectors for Agent Sidecar Calls

### Why here

Many agent flows call external APIs outside MCP. x402 HTTP transport handles API monetization directly.

### Add here

- new file `packages/saiso-core/src/payments/http-client.ts`
  - outbound `fetch` wrapper with automatic x402 challenge handling
- expose via `packages/saiso-core/src/index.ts`
- scaffold usage in `templates/agent-evm/src/index.ts.template` and future `templates/agent-svm/*`

### Use cases

1. paid market/analytics APIs
2. paid compliance/sanctions/risk APIs
3. paid inference endpoints used in autonomous loops

## 1.3 A2A Flows (Planned)

### Why here

Agent-to-agent commerce is a direct target for SAISO. x402 has A2A transport docs.

### Add here

- new module `packages/saiso-core/src/payments/adapters/x402-a2a.ts`
- optional CLI command group:
  - `packages/saiso-cli/src/commands/payment.ts` (`init`, `policy`, `status`)

## 2) MPP Integration Map

## 2.1 Outbound Paid Fetch for Agents

### Why here

MPP has mature `402` request/retry semantics and drop-in fetch integration (`mppx`) with wallet-backed signing.

### Add here

- `packages/saiso-core/src/payments/adapters/mpp-http.ts`
  - `mppx` client factory + fetch wrapper
- config hooks in:
  - `packages/saiso-core/src/types/config.ts`
  - `packages/saiso-core/src/config/manager.ts`
- env generation:
  - `packages/saiso-cli/src/commands/env.ts`

### Settings to add

1. payment method list and priority (`x402`, `mpp`)
2. max spend per request/day
3. recipient allowlist
4. default chain/method preference

## 2.2 Service Monetization for SAISO-Generated Servers

### Why here

SAISO can become both a paid-client and paid-server toolkit. MPP includes server middleware patterns.

### Add here

- create paid endpoint wrappers in templates:
  - `templates/agent-evm/src/index.ts.template`
  - future `templates/agent-svm/src/index.ts.template`
- optional service helper module:
  - `packages/saiso-core/src/payments/server/mpp-charge.ts`

### Use cases

1. paid research endpoints exposed by SAISO agents
2. paid on-chain execution services
3. paywalled webhook or automation triggers

## 2.3 MCP/JSON-RPC Transport Alignment

### Why here

MPP transport drafts define JSON-RPC and MCP signaling conventions. SAISO can support both x402 and MPP style challenge formats.

### Add here

- `packages/saiso-core/src/payments/parsers/jsonrpc-payment.ts`
- `packages/saiso-core/src/payments/parsers/mcp-payment.ts`

### Result

SAISO clients can recognize multiple payment challenge formats without hard-failing.

## 3) ERC-8004 Integration Map

## 3.1 Agent Identity and Discovery Metadata

### Why here

SAISO already scaffolds agent projects and keeps config metadata. ERC-8004 aligns with publishing portable identities and endpoints.

### Add here

- `packages/saiso-core/src/types/config.ts`
  - add `identity` and `trust` blocks
- new file `packages/saiso-core/src/identity/erc8004-registration.ts`
- template output:
  - `templates/agent*/` include `.well-known/agent-registration.json` generator hooks

### Data to include

1. MCP endpoints
2. A2A endpoint (if present)
3. payment support flags (`x402Support`, MPP capability)
4. supported trust modes

## 3.2 Reputation and Validation Signals for Routing

### Why here

SAISO already has server registry and routing criteria logic.

### Add here

- `packages/saiso-core/src/mcp/server-registry.ts`
  - add trust score and reputation metadata to server instance selection
- `packages/saiso-core/src/mcp/multi-server-manager.ts`
  - persist trust metadata with server configs in `.saiso/servers/*.json`
- new module:
  - `packages/saiso-core/src/trust/scoring.ts`

### Result

Route to providers/servers by capability + cost + trust score, not just capability.

## 3.3 Payment-to-Reputation Bridge

### Why here

ERC-8004 leaves payments orthogonal; x402/MPP receipts can enrich reputation records.

### Add here

- `packages/saiso-core/src/payments/receipts-store.ts`
- `packages/saiso-core/src/trust/reputation-bridge.ts`

### Behavior

1. successful settlement receipts become positive reliability signals
2. repeated payment verification failures become negative risk signals

## 4) Additional Places to Embed x402/MPP/ERC-8004 in SAISO UX

## 4.1 `saiso add` Marketplace Patterns

- file: `packages/saiso-cli/src/commands/add.ts`
- future: paid feature packs (premium strategy/action templates) gated by x402 or MPP

## 4.2 `saiso mcp` Server Profiles

- file: `packages/saiso-cli/src/commands/mcp.ts`
- add server profile metadata:
  - accepts payments (`x402`, `mpp`)
  - trust profile source (`erc8004`)
  - supported paid operations

## 4.3 `saiso status` and `saiso health`

- files:
  - `packages/saiso-cli/src/commands/status.ts`
  - `packages/saiso-cli/src/commands/health.ts`
- add output for:
  - payment mode enabled/disabled
  - receipt counts/failures
  - trust/reputation summary

## 4.4 Generated Project Policy Files

- file: `packages/saiso-cli/src/core/scaffolding.ts`
- add generated files:
  - `.saiso/payment-policy.json`
  - `.saiso/trust-policy.json`

## 5) Implementation Order Recommendation

1. x402 MCP paid tool flow first (closest to current architecture).
2. MPP outbound HTTP client flow second.
3. ERC-8004 metadata + routing enrichment third.
4. Advanced A2A and monetized feature marketplace fourth.
