# SAISO Privy Feature Pack Guide

This guide documents the Privy feature surface added to SAISO templates, including parity expectations across EVM and SVM, installation order, environment variables, action contracts, and testing workflows.

## Scope

The Privy feature pack introduces:

1. 9 generic features under `templates/features`.
2. 2 EVM-specific features under `templates/features-evm`.
3. 1 SVM-specific feature under `templates/features-svm`.
4. A shared Privy client foundation (`privy_client_base`) with auth, retry, idempotency, and request-expiry helpers.

## Feature Matrix

### Generic (`templates/features`)

1. `privy_client_base`
2. `privy_wallet_lifecycle`
3. `privy_balance_and_history`
4. `privy_transfer`
5. `privy_actions_swap`
6. `privy_policy_controls`
7. `privy_intents_router`
8. `privy_webhook_ingest`
9. `privy_accounts`

### EVM-specific (`templates/features-evm`)

1. `privy_signing_evm`
2. `privy_advanced_execution_evm`

### SVM-specific (`templates/features-svm`)

1. `privy_signing_svm`

## Dependency Behavior

`saiso add` installs `privy_client_base` automatically before wallet lifecycle, balance/history, transfer, and chain-specific signing features. You can still install `privy_client_base` directly when you want only the shared client files.

Recommended operator flow:

1. `privy_client_base`
2. `privy_wallet_lifecycle`
3. `privy_balance_and_history`
4. `privy_transfer`
5. `privy_signing_evm` or `privy_signing_svm`
6. `privy_actions_swap`
7. `privy_policy_controls`
8. `privy_intents_router`
9. `privy_webhook_ingest`
10. `privy_accounts`
11. `privy_advanced_execution_evm` (EVM projects only)

## Environment Variables

### Required

```bash
PRIVY_APP_ID=<app-id>
PRIVY_APP_SECRET=<app-secret>
```

### Recommended optional

```bash
PRIVY_BASE_URL=https://api.privy.io/v1
PRIVY_REQUEST_TIMEOUT_MS=30000
PRIVY_REQUEST_EXPIRY_MS=120000
PRIVY_RETRY_MAX_ATTEMPTS=3
PRIVY_RETRY_BASE_DELAY_MS=200
PRIVY_DEFAULT_WALLET_ID=<optional-default-wallet>
```

### Feature-specific optional

```bash
PRIVY_WEBHOOK_SECRET=<webhook-secret>
PRIVY_SWAP_SLIPPAGE_BPS=50
PRIVY_INTENT_POLL_INTERVAL_MS=2000
PRIVY_INTENT_POLL_TIMEOUT_MS=120000
```

## Shared Action Contract

HTTP-backed Privy features use the envelope below, with operation-specific identifiers and provider request bodies described in each feature's README. Webhook verification instead takes raw bytes and Svix headers and returns `data.verified` plus the authenticated event; it has no idempotency/expiry request metadata.

### Input

1. `chainFamily`: `evm` or `svm`.
2. `walletId` and/or `walletAddress`.
3. `network`.
4. `payload`.
5. Optional request controls: `requestId`, `idempotencyKey`, `expiresAt`.

### Output

1. `success`.
2. `operation`.
3. `chainFamily`.
4. `requestId`.
5. `data`.
6. `meta.idempotencyKey`.
7. `meta.expiresAt`.
8. `meta.latencyMs`.

## Privy Client Base (`privy_client_base`)

`privy_client_base` adds reusable integration files in generated projects:

1. `src/integrations/privy/client.ts`
2. `src/integrations/privy/auth.ts`
3. `src/integrations/privy/types.ts`
4. `src/integrations/privy/errors.ts`
5. `src/integrations/privy/retry.ts`

Key behavior:

1. Basic auth header generation from app credentials.
2. Retry with exponential backoff.
3. Request timeout via `AbortController`.
4. Idempotency and request-expiry header support for mutating requests.
5. Header redaction in error detail payloads.

## Feature Details

### `privy_wallet_lifecycle`

Purpose:

1. Scaffold wallet create/get/list/update/authenticate workflows.

Endpoint mapping:

1. `wallets/create`
2. `wallets/get`
3. `wallets/get-all`
4. `wallets/get-by-address`
5. `wallets/update`
6. `wallets/authenticate`

### `privy_balance_and_history`

Purpose:

1. Normalize wallet balances and transaction history retrieval.

Endpoint mapping:

1. `wallets/get-balance`
2. `wallets/get-transactions`
3. `transactions/get`

### `privy_transfer`

Purpose:

1. Unify transfer flow through one action contract across chain families.

Endpoint mapping:

1. `wallets/transfer`

### `privy_actions_swap`

Purpose:

1. Quote, execute, and action status retrieval flows; walletId is required for each.

Endpoint mapping:

1. `POST /v1/wallets/{walletId}/swap/quote`
2. `POST /v1/wallets/{walletId}/swap`
3. `GET /v1/wallets/{walletId}/actions/{actionId}`

### `privy_policy_controls`

Purpose:

1. Manage policy/rules/condition set/key quorum administration flows.

Endpoint mapping:

1. `POST /v1/policies`
2. `POST /v1/policies/{policyId}/rules`
3. `POST /v1/condition_sets`
4. `POST /v1/key_quorums`

`list-policies` is explicitly unsupported until a REST contract is verified.

### `privy_intents_router`

Purpose:

1. Intent-centric transfer/rpc flows plus status and update operations.

Endpoint mapping:

1. `POST /v1/intents/wallets/{walletId}/transfer`
2. `POST /v1/intents/wallets/{walletId}/rpc`
3. `GET /v1/intents/{intentId}`
4. `GET /v1/intents`
5. `PATCH /v1/intents/policies/{policyId}`
6. `PATCH /v1/intents/key_quorums/{keyQuorumId}`

### `privy_webhook_ingest`

Purpose:

1. Svix signature verification over raw request bytes and return of the authenticated event. The receiver owns downstream dispatch and delivery deduplication.

Event families:

1. Transaction events.
2. Wallet events.
3. Wallet action events.
4. User events.
5. Intent events.

### `privy_accounts`

Purpose:

1. Account CRUD and account-balance workflows.

Endpoint mapping:

1. `POST /v1/accounts`
2. `GET /v1/accounts/{accountId}`
3. `GET /v1/accounts`
4. `PATCH /v1/accounts/{accountId}`
5. `GET /v1/accounts/{accountId}/balance`

### `privy_signing_evm` (EVM adapter)

Purpose:

1. EVM-specific signing and tx send semantics.

Endpoint mapping:

1. `wallets/ethereum/personal-sign`
2. `wallets/ethereum/eth-signtypeddata-v4`
3. `wallets/ethereum/eth-sign-transaction`
4. `wallets/ethereum/eth-send-transaction`
5. `wallets/ethereum/secp256k1-sign`

### `privy_advanced_execution_evm` (EVM adapter)

Purpose:

1. Execute advanced EVM pathways (7702 auth, user operations, send-calls).

Endpoint mapping:

All three use `POST /v1/wallets/{walletId}/rpc` with methods:

1. `eth_sign7702Authorization`
2. `eth_signUserOperation`
3. `wallet_sendCalls`

### `privy_signing_svm` (SVM adapter)

Purpose:

1. SVM-native message and transaction signing.

Endpoint mapping:

1. `wallets/solana/sign-message`
2. `wallets/solana/sign-transaction`
3. `wallets/solana/sign-and-send-transaction`

## Example Build Flows

### EVM workflow

```bash
saiso add privy_wallet_lifecycle
saiso add privy_transfer
saiso add privy_signing_evm
saiso add privy_actions_swap
```

### SVM workflow

```bash
saiso add privy_wallet_lifecycle
saiso add privy_transfer
saiso add privy_signing_svm
saiso add privy_intents_router
```

### Policy and webhook workflow

```bash
saiso add privy_policy_controls
saiso add privy_webhook_ingest
saiso add privy_accounts
```

## Validation and Drift Checks

Run these commands after template/doc updates:

```bash
node scripts/validate-template-features.mjs
npm --workspace packages/saiso-cli run sync-templates
diff -rq templates packages/saiso-cli/templates
npx tsc -p packages/saiso-core/tsconfig.json
npx tsc -p packages/saiso-cli/tsconfig.json
PATH=/home/bhiktor/.bun/bin:$PATH bun test packages/saiso-cli/src
```

## Operational Notes

1. Root `templates/` is source-of-truth.
2. Always sync to `packages/saiso-cli/templates` after edits.
3. Keep feature installs deterministic via marker-based registry insertion.
4. Keep credentials out of logs and commits.

## Troubleshooting

1. If `saiso add <feature>` fails with missing config:
- Verify `templates/features*/<feature>/config.json` exists.
- Re-run `node scripts/validate-template-features.mjs`.

2. If template drift appears:
- Run `npm --workspace packages/saiso-cli run sync-templates`.
- Re-check with `diff -rq templates packages/saiso-cli/templates`.

3. If Privy requests fail during implementation:
- Confirm `PRIVY_APP_ID` and `PRIVY_APP_SECRET` are set.
- Validate base URL and timeout settings.
- Inspect retryable error classification in `PrivyClientError`.

## Corrective contract audit (2026-09-07)

The accounts, swap, intents, policy controls, and advanced EVM templates now have local HTTP contract tests against the documented paths and request formats. The shared client sends Basic authentication plus `privy-app-id`, `privy-idempotency-key`, and `privy-request-expiry` (Unix milliseconds). Retryable GET failures are retried within the configured attempt limit. Writes are sent once because idempotency support differs across endpoints; an ambiguous response must be reconciled with the provider before a caller retries.

This is documentation-based verification and local mocked transport coverage, not evidence of live account eligibility, wallet ownership authorization, or settlement. Other legacy Privy signing/transfer templates were not included in this endpoint audit.

### Input migration

- Webhooks require `rawBody`, lowercase Svix headers, and `PRIVY_WEBHOOK_SECRET`. The prior parsed `payload` / separate `event` / hex `signature` interface is rejected. Deliveries outside a five-minute timestamp window are rejected; deduplicate `svix-id` in the receiver.
- Account creation requires `payload.wallet_ids` or `payload.wallets_configuration`; a flat chain/network field is not an account creation body.
- Swap quote/execute use source/destination asset objects and base-unit amounts. Status requires both wallet and action IDs.
- Transfer intents require provider-shaped `payload.source` and `payload.destination`. RPC intents use `rpcRequest`. Policy and quorum intents require `policyId` and `keyQuorumId`, not an existing intent ID.
- Advanced EVM requests require `walletId` and `payload.params`. `send-call` also needs CAIP-2 chain context.
- For operations requiring owner authorization, callers supply `authorizationSignature` matching the exact body, URL, and headers, including explicit `expiresAt` and `idempotencyKey`. These templates do not create owner signatures.
- `list-policies` is rejected before HTTP because its REST contract has not been verified.

### Sources

- [REST authentication](https://docs.privy.io/basics/rest-api/setup)
- [Accounts](https://docs.privy.io/wallets/accounts/create)
- [Swap quotes](https://docs.privy.io/wallets/actions/swap/get-quote), [execution](https://docs.privy.io/wallets/actions/swap/execute), [status](https://docs.privy.io/wallets/actions/status)
- [Transfer intents](https://docs.privy.io/transaction-management/intents/create/execute-transfer), [RPC intents](https://docs.privy.io/transaction-management/intents/create/execute-rpc), [policy intents](https://docs.privy.io/transaction-management/intents/create/update-policy), [quorum intents](https://docs.privy.io/transaction-management/intents/create/update-key-quorum)
- [Policies and idempotency](https://docs.privy.io/api-reference/policies/create), [rule authorization and expiry](https://docs.privy.io/api-reference/policies/rules/create), [condition sets](https://docs.privy.io/api-reference/condition-sets/create), [key quorums](https://docs.privy.io/api-reference/key-quorums/create)
- [EIP-7702 signing](https://docs.privy.io/wallets/using-wallets/ethereum/sign-7702-authorization), [RPC request schemas](https://docs.privy.io/api-reference/intents/list)
- [Privy webhook verification](https://docs.privy.io/api-reference/webhooks/overview), [Svix manual signature verification](https://docs.svix.com/receiving/verifying-payloads/how-manual)
