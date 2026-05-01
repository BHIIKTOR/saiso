# Privy Transfer

## What It Adds

1. Execute chain-aware transfers through a single Privy-backed action.
2. Chain-agnostic action envelope for evm and svm.
3. Idempotency and request-expiry metadata for mutating workflows.

## Endpoint Surface

1. wallets/transfer

## Usage

1. Install with saiso add privy_transfer.
2. Invoke action PRIVY_TRANSFER with wallet and network context.
3. Extend handler internals with concrete Privy API calls.

## Output Contract

1. success
2. operation
3. chainFamily
4. requestId
5. data
6. meta.idempotencyKey
7. meta.expiresAt
