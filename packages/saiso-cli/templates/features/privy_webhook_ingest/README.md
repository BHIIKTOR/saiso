# Privy Webhook Ingest

## What It Adds

1. Verify webhook signatures and dispatch typed wallet, tx, and action events.
2. Chain-agnostic action envelope for evm and svm.
3. Idempotency and request-expiry metadata for mutating workflows.

## Endpoint Surface

1. transaction events
2. wallet events
3. wallet action events
4. user events
5. intents events

## Usage

1. Install with saiso add privy_webhook_ingest.
2. Invoke action PRIVY_WEBHOOK_INGEST with wallet and network context.
3. Extend handler internals with concrete Privy API calls.

## Output Contract

1. success
2. operation
3. chainFamily
4. requestId
5. data
6. meta.idempotencyKey
7. meta.expiresAt
