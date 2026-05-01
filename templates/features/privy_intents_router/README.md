# Privy Intents Router

## What It Adds

1. Create and route transfer or RPC intents with status polling.
2. Chain-agnostic action envelope for evm and svm.
3. Idempotency and request-expiry metadata for mutating workflows.

## Endpoint Surface

1. intents/transfer
2. intents/rpc
3. intents/get
4. intents/list
5. intents/update-policy
6. intents/update-key-quorum

## Usage

1. Install with saiso add privy_intents_router.
2. Invoke action PRIVY_INTENTS_ROUTER with wallet and network context.
3. Extend handler internals with concrete Privy API calls.

## Output Contract

1. success
2. operation
3. chainFamily
4. requestId
5. data
6. meta.idempotencyKey
7. meta.expiresAt
