# Privy Actions Swap

## What It Adds

1. Quote token swaps, execute, and poll action status.
2. Chain-agnostic action envelope for evm and svm.
3. Idempotency and request-expiry metadata for mutating workflows.

## Endpoint Surface

1. wallets/swap/tokens
2. wallets/swap/quote
3. wallets/actions/get

## Usage

1. Install with saiso add privy_actions_swap.
2. Invoke action PRIVY_ACTIONS_SWAP with wallet and network context.
3. Extend handler internals with concrete Privy API calls.

## Output Contract

1. success
2. operation
3. chainFamily
4. requestId
5. data
6. meta.idempotencyKey
7. meta.expiresAt
