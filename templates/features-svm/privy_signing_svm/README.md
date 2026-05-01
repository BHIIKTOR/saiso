# Privy Signing (SVM Adapter)

## What It Adds

1. Sign Solana messages and transactions for SVM wallets.
2. SVM-specific execution path while preserving SAISO action parity.
3. Idempotency and request-expiry metadata for reliable retries.

## Endpoint Surface

1. wallets/solana/sign-message
2. wallets/solana/sign-transaction
3. wallets/solana/sign-and-send-transaction

## Usage

1. Install with saiso add privy_signing_svm in an SVM project.
2. Invoke action PRIVY_SIGNING_SVM with wallet/network context.
3. Extend adapter internals with concrete Privy API wiring.
