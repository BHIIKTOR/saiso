# Merchant Settlement Router Scaffold (x402 + mpp + Privy)

Scaffold for routing paid API/tool settlement across x402 and mpp with trust and cost controls.

## Quick Start

```bash
bash examples/merchant-settlement-router/scaffold.sh merchant-settlement-router
cd merchant-settlement-router
cp .env.example .env
saiso policy validate --strict
saiso dev
```

Run the local scaffold simulation:

```bash
bun src/index.ts
```

## Focus Areas

1. Recipient and protocol-level settlement routing.
2. Cost caps and per-operation trust floors.
3. Receipt-aware telemetry and routing profile selection.
4. Privy account and transfer support for treasury operations.
