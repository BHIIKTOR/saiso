# Privy Accounts

## What It Adds

1. Create, get, list, update, and query balances for Privy accounts.
2. Chain-agnostic action envelope for evm and svm.
3. Idempotency and request-expiry metadata for mutating workflows.

## Endpoint Surface

1. accounts/create
2. accounts/get
3. accounts/list
4. accounts/update
5. accounts/balance

## Usage

1. Install with `saiso add privy_accounts`.
2. Invoke action `PRIVY_ACCOUNTS` with an operation and account context.
3. Requires `PRIVY_APP_ID` and `PRIVY_APP_SECRET`; can move real assets when configured with live credentials.

## Output Contract

1. success
2. operation
3. chainFamily
4. requestId
5. data
6. meta.idempotencyKey
7. meta.expiresAt