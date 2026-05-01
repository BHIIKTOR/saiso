# Privy Advanced Execution (EVM Adapter)

## What It Adds

1. Scaffold 7702 auth signatures, user operations, and wallet send-calls.
2. EVM-specific execution path while preserving SAISO action parity.
3. Idempotency and request-expiry metadata for reliable retries.

## Endpoint Surface

1. wallets/ethereum/eth-sign-7702-authorization
2. wallets/ethereum/eth-sign-user-operation
3. wallets/ethereum/wallet-send-calls

## Usage

1. Install with saiso add privy_advanced_execution_evm in an EVM project.
2. Invoke action PRIVY_ADVANCED_EXECUTION_EVM with wallet/network context.
3. Extend adapter internals with concrete Privy API wiring.
