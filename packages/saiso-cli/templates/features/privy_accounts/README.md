# Privy Accounts

## What It Adds

1. Create and manage accounts plus account balance retrieval.
2. Chain-agnostic action envelope for evm and svm.
3. Idempotency and request-expiry metadata for mutating workflows.

## Endpoint Surface

1. accounts/create
2. accounts/get
3. accounts/list
4. accounts/update
5. accounts/balance

## Usage

1. Install with saiso add privy_accounts.
2. Invoke action PRIVY_ACCOUNTS with wallet and network context.
3. Extend handler internals with concrete Privy API calls.

## Output Contract

1. success
2. operation
3. chainFamily
4. requestId
5. data
6. meta.idempotencyKey
7. meta.expiresAt
