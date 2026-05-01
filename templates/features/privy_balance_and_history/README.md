# Privy Balance and History

## What It Adds

1. Normalize balances and transaction history retrieval for managed wallets.
2. Chain-agnostic action envelope for evm and svm.
3. Idempotency and request-expiry metadata for mutating workflows.

## Endpoint Surface

1. wallets/get-balance
2. wallets/get-transactions
3. transactions/get

## Usage

1. Install with saiso add privy_balance_and_history.
2. Invoke action PRIVY_BALANCE_AND_HISTORY with wallet and network context.
3. Extend handler internals with concrete Privy API calls.

## Output Contract

1. success
2. operation
3. chainFamily
4. requestId
5. data
6. meta.idempotencyKey
7. meta.expiresAt
