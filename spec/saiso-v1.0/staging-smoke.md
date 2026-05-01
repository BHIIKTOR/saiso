# SAISO v1.0 Staging Smoke Checks

This smoke suite validates payment-path connectivity and retry behavior for x402 + MPP.

## Checks

1. x402 facilitator connectivity:
   - `POST /verify` with empty payload should return `400` JSON
   - `POST /settle` with empty payload should return `400` JSON
2. MPP ecosystem chain connectivity:
   - `eth_chainId` against Tempo RPC should return JSON-RPC success
3. Local MPP 402 retry path:
   - local service returns `402`
   - retry with `Payment` header returns `200`

## Usage

```bash
# Optional: load variables from spec file
set -a
source spec/saiso-v1.0/.env.staging.example
set +a

node spec/saiso-v1.0/scripts/smoke-x402-mpp.mjs
```

### Offline mode

```bash
SAISO_SMOKE_SKIP_NETWORK=true node spec/saiso-v1.0/scripts/smoke-x402-mpp.mjs
```
