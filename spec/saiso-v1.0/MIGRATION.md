# SAISO v1.0 Migration Guide

This guide describes migration to the EVM/SVM-focused v1.0 surface.

## 1) Server Type Migration

- Supported server types in v1.0:
  - `evm`
  - `svm`
- Remove any `sei` references in project config and `.saiso/servers/*.json`.

## 2) Environment Variable Migration

Use these canonical variables:

- `SAISO_NETWORK`
- `CHAIN_ID`
- `RPC_URL`
- `PRIVATE_KEY`
- `MCP_SERVER_TYPE`

Remove deprecated aliases:

- `SEI_NETWORK`
- `SEI_CHAIN_ID`
- `SEI_RPC_URL`
- `SEI_WS_RPC_URL`
- `SEI_PRIVATE_KEY`
- `SEI_AGENT_NAME`

## 3) Template and Scaffolding Migration

- Regenerate projects with:
  - `saiso new <project> --server evm`
  - `saiso new <project> --server svm`
- Remove old SEI-only template assets if copied into downstream repos.

## 4) Payment Configuration

Enable payment controls in env:

```env
PAYMENT_ENABLED=true
PAYMENT_PREFERRED_PROTOCOL=auto
PAYMENT_MAX_PER_REQUEST_USD=5
PAYMENT_DAILY_BUDGET_USD=50
```

Optional recipient filters:

```env
PAYMENT_ALLOWED_RECIPIENTS=api.vendor.xyz,0xabc...
PAYMENT_BLOCKED_RECIPIENTS=malicious.example
```

## 5) Trust Configuration

```env
TRUST_ENABLED=true
TRUST_MIN_SCORE=0.6
IDENTITY_X402_SUPPORT=true
```

Optional identity metadata:

```env
IDENTITY_AGENT_REGISTRY=https://registry.example
IDENTITY_AGENT_ID=did:pkh:eip155:1:0x...
IDENTITY_AGENT_URI=https://agent.example/.well-known/agent.json
IDENTITY_ENDPOINTS=[{"name":"mcp","endpoint":"https://agent.example/mcp","version":"1.0"}]
```

## 6) Validation

Run these checks after migration:

```bash
npx tsc -p packages/saiso-core/tsconfig.json
npx tsc -p packages/saiso-cli/tsconfig.json
bun test packages/saiso-core/tests
node spec/saiso-v1.0/scripts/smoke-x402-mpp.mjs
```
