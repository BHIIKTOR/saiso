# Privy Wallet Lifecycle

## What It Adds

1. Create, get, list, update, and authenticate managed wallets.
2. Chain-agnostic action envelope for evm and svm.
3. Idempotency and request-expiry metadata for mutating workflows.

## Endpoint Surface

1. wallets/create
2. wallets/get
3. wallets/get-all
4. wallets/get-by-address
5. wallets/update
6. wallets/authenticate

## Usage

1. Install with saiso add privy_wallet_lifecycle.
2. Invoke action PRIVY_WALLET_LIFECYCLE with wallet and network context.
3. Extend handler internals with concrete Privy API calls.

## Output Contract

1. success
2. operation
3. chainFamily
4. requestId
5. data
6. meta.idempotencyKey
7. meta.expiresAt
