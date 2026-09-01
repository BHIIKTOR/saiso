# Privy Intents Router

## What It Adds

1. Create and route transfer or RPC intents with status polling.
2. Update intent policies and key quorums.
3. Chain-agnostic action envelope for evm and svm.

## Endpoint Surface

1. intents/transfer
2. intents/rpc
3. intents/get
4. intents/list
5. intents/update-policy
6. intents/update-key-quorum

## Usage

1. Install with `saiso add privy_intents_router`.
2. Invoke action `PRIVY_INTENTS_ROUTER` with an operation (`transfer`, `rpc`, `get`, `list`, `update-policy`, or `update-key-quorum`) and intent context.
3. Requires `PRIVY_APP_ID` and `PRIVY_APP_SECRET`; transfer intents can move real assets when configured with live credentials.

## Output Contract

1. success
2. operation
3. chainFamily
4. requestId
5. data
6. meta.idempotencyKey
7. meta.expiresAt