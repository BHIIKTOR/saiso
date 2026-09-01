# Privy Webhook Ingest

## What It Adds

1. Verify webhook signatures using HMAC-SHA256 with timing-safe comparison.
2. Dispatch typed wallet, transaction, action, user, and intents events.
3. Chain-agnostic action envelope for evm and svm.

## Endpoint Surface

1. transaction events
2. wallet events
3. wallet action events
4. user events
5. intents events

## Usage

1. Install with `saiso add privy_webhook_ingest`.
2. Invoke action `PRIVY_WEBHOOK_INGEST` with a signature and event payload.
3. Requires `PRIVY_WEBHOOK_SECRET` to verify signatures.

## Output Contract

1. success
2. operation
3. chainFamily
4. requestId
5. data.verified
6. data.event
7. meta