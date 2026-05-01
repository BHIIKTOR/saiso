# Privy Signing (EVM Adapter)

## What It Adds

1. Sign messages, typed data, and transactions for EVM wallets.
2. EVM-specific execution path while preserving SAISO action parity.
3. Idempotency and request-expiry metadata for reliable retries.

## Endpoint Surface

1. wallets/ethereum/personal-sign
2. wallets/ethereum/eth-signtypeddata-v4
3. wallets/ethereum/eth-sign-transaction
4. wallets/ethereum/eth-send-transaction
5. wallets/ethereum/secp256k1-sign

## Usage

1. Install with saiso add privy_signing_evm in an EVM project.
2. Invoke action PRIVY_SIGNING_EVM with wallet/network context.
3. Extend adapter internals with concrete Privy API wiring.
