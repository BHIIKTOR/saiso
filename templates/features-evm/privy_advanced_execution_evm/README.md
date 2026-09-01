# Privy Advanced Execution (EVM Adapter)

## What It Adds

1. Scaffold 7702 auth signatures, user operations, and wallet send-calls.
2. EVM-specific execution path while preserving SAISO action parity.
3. Idempotency and request-expiry metadata for reliable retries.

## Endpoint Surface

1. wallets/advanced/evm/auth-signature
2. wallets/advanced/evm/user-operation
3. wallets/advanced/evm/send-call

## Usage

1. Install with `saiso add privy_advanced_execution_evm` in EVM projects.
2. Invoke action `PRIVY_ADVANCED_EXECUTION_EVM` with an operation (`auth-signature`, `user-operation`, or `send-call`) and wallet context.
3. Requires `PRIVY_APP_ID` and `PRIVY_APP_SECRET`; user operations and send-calls can move real assets when configured with live credentials.

## Output Contract

1. success
2. operation
3. chainFamily
4. requestId
5. data
6. meta.idempotencyKey
7. meta.expiresAt