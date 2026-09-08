# Privy Actions Swap

Install with `saiso add privy_actions_swap`. Invoke `PRIVY_ACTIONS_SWAP`; all operations require `walletId`.

| Operation | HTTP endpoint |
| --- | --- |
| quote | POST /v1/wallets/{walletId}/swap/quote |
| execute | POST /v1/wallets/{walletId}/swap |
| status | GET /v1/wallets/{walletId}/actions/{actionId} |

Quote/execute map `network` (CAIP-2), `fromToken`, `toToken`, and `amount` (base units) to `source.caip2`, `source.asset_address`, `destination.asset_address`, `base_amount`, and `amount_type: exact_input`. `payload` can supply the provider body fields directly, including source/destination objects and amount type.

Supply `authorizationSignature` when the wallet's owner requires authorization. It must sign the exact request body, URL, and applicable headers; supply matching `expiresAt` and `idempotencyKey`. This feature does not generate owner signatures. Execution can move assets.

Results return the provider response in `data.result`; accepted asynchronous actions are not proof of settlement. Use `status` with both wallet and action IDs. Mutations are not automatically retried.

References: [Quotes](https://docs.privy.io/wallets/actions/swap/get-quote), [Execution](https://docs.privy.io/wallets/actions/swap/execute), [Action status](https://docs.privy.io/wallets/actions/status).
