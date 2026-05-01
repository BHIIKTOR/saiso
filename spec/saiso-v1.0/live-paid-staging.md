# Live Paid Staging Requirements

This smoke suite executes **real paid retries** against staging endpoints using secret-provided credentials.

## Required Environment Variables

Configure at least one protocol path:

## x402 path

- `LIVE_X402_URL`
- `LIVE_X402_CREDENTIAL_JSON`

`LIVE_X402_CREDENTIAL_JSON` supports:

1. JSON object payload (sent as `X-PAYMENT` JSON string)
2. Raw encoded header string
3. Header map wrapper:
   `{"headers":{"X-PAYMENT":"...","PAYMENT-SIGNATURE":"..."}}`

Optional:

- `LIVE_X402_REQUEST_METHOD` (default `GET`)
- `LIVE_X402_REQUEST_BODY_JSON` (default `{}`)

## MPP path

- `LIVE_MPP_URL`
- `LIVE_MPP_CREDENTIAL_JSON`

`LIVE_MPP_CREDENTIAL_JSON` supports:

1. JSON object payload (sent as `Payment` JSON string)
2. Raw encoded header string
3. Header map wrapper:
   `{"headers":{"Payment":"..."}}`

Optional:

- `LIVE_MPP_REQUEST_METHOD` (default `GET`)
- `LIVE_MPP_REQUEST_BODY_JSON` (default `{}`)

## Expected Behavior

1. First request returns `402 Payment Required`.
2. Retry request with payment header succeeds (`2xx`).
3. Script outputs a JSON summary including initial and settled status codes.

## Run Locally

Create an env file from the template:

```bash
cp spec/saiso-v1.0/.env.paid-live.example spec/saiso-v1.0/.env.paid-live
```

Fill `spec/saiso-v1.0/.env.paid-live` with real credential JSON objects.

Then run:

```bash
set -a
source spec/saiso-v1.0/.env.paid-live
set +a

npm run smoke:staging:paid-live:validate
npm run smoke:staging:paid-live
```

## CI

Use `.github/workflows/live-paid-smoke.yml` with repository/environment secrets:

- `LIVE_X402_URL`
- `LIVE_X402_CREDENTIAL_JSON`
- `LIVE_X402_REQUEST_METHOD`
- `LIVE_X402_REQUEST_BODY_JSON`
- `LIVE_MPP_URL`
- `LIVE_MPP_CREDENTIAL_JSON`
- `LIVE_MPP_REQUEST_METHOD`
- `LIVE_MPP_REQUEST_BODY_JSON`

## Premium Tool Invocation Evidence

For premium paid-tool probes, run a routed MCP call and capture receipts:

```bash
saiso mcp call \
  --tool premium-simulate \
  --params '{"tx":"0x","dryRun":true}' \
  --paid \
  --payment-protocol auto \
  --amount-usd 0.2 \
  --recipient pay.example \
  --operation-class high-risk \
  --routing-profile balanced

saiso receipts --json
```

Expected evidence:

1. MCP call returns `402 -> settled 2xx` in tool result path.
2. `saiso receipts --json` shows a new success entry with protocol and settlement reference.
