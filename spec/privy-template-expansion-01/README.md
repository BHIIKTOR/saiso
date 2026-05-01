# SAISO Privy Template Expansion Plan 01

## Objective

Expand SAISO template feature surface with first-class Privy-backed capabilities across EVM and SVM while preserving parity, deterministic installation, and existing CI drift guarantees.

Primary outcomes:

1. Add a Privy-centered feature stack that materially increases what generated projects can do.
2. Keep EVM/SVM parity for shared workflows and provide chain-specific features where protocol differences require it.
3. Keep template quality gates strict: sync drift, feature manifest integrity, deterministic `saiso add` integration.

## Success Criteria

1. At least 10 new Privy-oriented features are available via `saiso add --list`.
2. Shared workflows (wallet lifecycle, balance/history, transfers, action status) work for both EVM and SVM with a consistent action contract.
3. Chain-specific signing features exist for both families:
- EVM: typed data, personal sign, tx signing/sending, 7702 authorization, user op/calls.
- SVM: sign message, sign tx, sign-and-send.
4. Policy/intents/webhooks features are scaffolded with runnable templates and tests.
5. CI catches template/config drift and feature missing-file regressions.

## Current Baseline

Current templates include:

1. Generic features: `query_balance`, `send_tokens`, `interact_contract`, `gas_estimation`, `check_network_status`.
2. EVM-specific feature: `features-evm/gas_estimation`.
3. No `features-svm` directory yet.

Privy API/documentation surface (confirmed from docs sitemap) includes:

1. Wallet lifecycle and wallet operations (`wallets/create|get|get-balance|get-transactions|transfer|authenticate`).
2. EVM wallet methods (`eth-send-transaction`, `eth-sign-transaction`, `personal-sign`, `eth-signtypeddata-v4`, `eth-sign-user-operation`, `wallet-send-calls`, `eth-sign-7702-authorization`).
3. SVM wallet methods (`solana/sign-transaction`, `solana/sign-and-send-transaction`, `solana/sign-message`).
4. Wallet actions/swap (`wallets/actions/get`, `wallets/swap/quote`, `wallets/swap/tokens`).
5. Controls and policy APIs (`policies`, `rules`, `condition-sets`, `key-quorums`).
6. Intents APIs (`intents/transfer`, `intents/rpc`, `intents/get|list`, policy/key-quorum updates).
7. Reliability/security hooks (`authorization-signatures`, `idempotency-keys`, `request-expiry`).
8. Webhooks across tx lifecycle, wallet events, user events, intents, and swap/transfer actions.

## Design Principles

1. Parity-first where reasonable:
- Shared feature APIs should be chain-agnostic and select EVM/SVM adapters internally.
2. Chain specialization only where required:
- Keep signing/execution-specific logic in `features-evm` and `features-svm`.
3. Source-of-truth discipline:
- Edit only root `templates/**`, then sync to `packages/saiso-cli/templates/**`.
4. Deterministic add flow:
- Use feature registry markers, never regex mutation of action arrays.
5. Security-by-default:
- Favor idempotency keys, request expiry, signed auth headers, and explicit failure classes.

## Directory and Feature Taxonomy

New/expanded template layout:

1. `templates/features/`:
- cross-chain Privy features (generic)
2. `templates/features-evm/`:
- EVM-specific Privy features
3. `templates/features-svm/`:
- SVM-specific Privy features (new)

## Feature Backlog (Implementation Targets)

### Generic Features (`templates/features`)

1. `privy_client_base`
- Purpose: shared Privy client, auth, retries, idempotency helpers, request expiry helper.
- Endpoints touched: broad (foundation utility feature).
- Files (planned):
  - `src/integrations/privy/client.ts`
  - `src/integrations/privy/auth.ts`
  - `src/integrations/privy/types.ts`
  - `src/integrations/privy/errors.ts`
  - `src/integrations/privy/retry.ts`

2. `privy_wallet_lifecycle`
- Purpose: create/get/list/update/authenticate wallet workflows.
- Endpoints: `wallets/create|get|get-all|get-by-address|update|authenticate`.

3. `privy_balance_and_history`
- Purpose: wallet balance, tx history, tx fetch normalization.
- Endpoints: `wallets/get-balance`, `wallets/get-transactions`, `transactions/get`.

4. `privy_transfer`
- Purpose: chain-aware transfer action through one SAISO interface.
- Endpoints: `wallets/transfer` (+ chain adapter metadata).

5. `privy_actions_swap`
- Purpose: token catalog + quote + execute + action status polling.
- Endpoints: `wallets/swap/tokens`, `wallets/swap/quote`, `wallets/actions/get`.

6. `privy_policy_controls`
- Purpose: policy/rules/condition-sets/key-quorums lifecycle.
- Endpoints: `policies/*`, `policies/rules/*`, `condition-sets/*`, `key-quorums/*`.

7. `privy_intents_router`
- Purpose: intent-based transfer/rpc plus status retrieval and update hooks.
- Endpoints: `intents/transfer`, `intents/rpc`, `intents/get|list|update-policy|update-key-quorum`.

8. `privy_webhook_ingest`
- Purpose: webhook verification + dispatcher + typed handlers.
- Endpoints/events: transaction, wallet, wallet-action, user, intents.

9. `privy_accounts`
- Purpose: managed account CRUD and balance workflows.
- Endpoints: `accounts/create|get|list|update|balance`.

### EVM-Specific Features (`templates/features-evm`)

10. `privy_signing_evm`
- Purpose: typed-data signing, personal-sign, tx signing/sending.
- Endpoints: `wallets/ethereum/personal-sign`, `eth-signtypeddata-v4`, `eth-sign-transaction`, `eth-send-transaction`, `secp256k1-sign`.

11. `privy_advanced_execution_evm`
- Purpose: 7702 auth signatures, user operations, send-calls execution.
- Endpoints: `eth-sign-7702-authorization`, `eth-sign-user-operation`, `wallet-send-calls`.

### SVM-Specific Features (`templates/features-svm`)

12. `privy_signing_svm`
- Purpose: Solana message signing, tx signing, sign-and-send.
- Endpoints: `wallets/solana/sign-message`, `sign-transaction`, `sign-and-send-transaction`.

## Parity Contract for Privy Features

Shared action contract shape (for generic features):

1. Input:
- `chainFamily: 'evm' | 'svm'`
- `walletId` and/or `walletAddress`
- `network` (CAIP2 or SAISO network name)
- operation-specific payload

2. Output:
- `success: boolean`
- `operation: string`
- `chainFamily: 'evm' | 'svm'`
- `requestId?: string`
- `data?: object`
- `error?: { code: string; message: string; retryable?: boolean }`
- `meta?: { idempotencyKey?: string; expiresAt?: string; actionId?: string }`

3. Reliability requirements:
- always pass idempotency key for mutating operations
- support request-expiry headers/options
- normalize Privy auth-signature handling in base client

## Environment Variables Standardization

Required base variables for Privy features:

1. `PRIVY_APP_ID`
2. `PRIVY_APP_SECRET`

Optional but recommended:

1. `PRIVY_BASE_URL`
2. `PRIVY_REQUEST_TIMEOUT_MS`
3. `PRIVY_REQUEST_EXPIRY_MS`
4. `PRIVY_RETRY_MAX_ATTEMPTS`
5. `PRIVY_RETRY_BASE_DELAY_MS`

Feature-specific optional vars:

1. `PRIVY_WEBHOOK_SECRET`
2. `PRIVY_DEFAULT_WALLET_ID`
3. `PRIVY_SWAP_SLIPPAGE_BPS`
4. `PRIVY_INTENT_POLL_INTERVAL_MS`
5. `PRIVY_INTENT_POLL_TIMEOUT_MS`

## Implementation Phases

## Phase 0: Scaffolding and Contract Prep

Tasks:

1. Add `templates/features-svm/` tree.
2. Add feature naming/version conventions for all new Privy features.
3. Ensure `saiso add --list` includes new feature set (with server compatibility).
4. Freeze shared action response contract and error taxonomy.

Acceptance:

1. Directory and configs exist for all planned features.
2. CLI lists new features with correct server compatibility labels.

## Phase 1: Foundation and Core Wallet Flows

Tasks:

1. Implement `privy_client_base`.
2. Implement `privy_wallet_lifecycle`.
3. Implement `privy_balance_and_history`.
4. Implement `privy_transfer`.

Acceptance:

1. EVM and SVM projects can create/query wallets and balances through Privy-backed features.
2. Mutating operations include idempotency + expiry behavior.

## Phase 2: Chain-Specific Signing Parity

Tasks:

1. Implement `privy_signing_evm`.
2. Implement `privy_signing_svm`.
3. Implement shared docs/examples demonstrating equivalent signing flows.

Acceptance:

1. EVM and SVM signing features each pass unit and template tests.
2. Parity docs show 1:1 flow mapping for message and tx signing semantics.

## Phase 3: Advanced Execution and Actions

Tasks:

1. Implement `privy_advanced_execution_evm`.
2. Implement `privy_actions_swap` with action polling/state transitions.
3. Add failure classification for quote/execute/status workflows.

Acceptance:

1. Swap feature supports quote + execute + status retrieval.
2. EVM advanced execution supports 7702/user-op/send-calls scaffolds.

## Phase 4: Policy, Intents, and Webhooks

Tasks:

1. Implement `privy_policy_controls`.
2. Implement `privy_intents_router`.
3. Implement `privy_webhook_ingest` with signature verification + dispatching.
4. Implement `privy_accounts`.

Acceptance:

1. Policy and intent flows are scaffolded with runnable handlers.
2. Webhook feature can process tx and action events with deterministic parsing.

## Phase 5: Hardening and Drift Gates

Tasks:

1. Add template tests for each new feature (unit-level for action behavior).
2. Add feature integrity checks for new directories/files.
3. Add scaffold matrix smoke for EVM and SVM projects with selected Privy features.
4. Keep sync drift gate green (`templates` vs `packages/saiso-cli/templates`).

Acceptance:

1. CI passes with added tests.
2. No template drift.
3. `saiso add` remains deterministic for all new features.

## Test Strategy

Required:

1. `npx tsc -p packages/saiso-core/tsconfig.json`
2. `npx tsc -p packages/saiso-cli/tsconfig.json`
3. `bun test packages/saiso-cli/src`
4. `node scripts/validate-template-features.mjs`
5. `diff -rq templates packages/saiso-cli/templates`

Feature tests (new):

1. Action-level unit tests for each Privy feature template file.
2. Contract fixture tests with mocked Privy responses.
3. Error-path tests (auth failure, timeout, rate limit, policy denied).
4. Idempotency/retry tests for mutating operations.

Scenario tests:

1. Scaffold EVM agent -> add `privy_client_base` + `privy_signing_evm` + `privy_actions_swap`.
2. Scaffold SVM agent -> add `privy_client_base` + `privy_signing_svm` + `privy_transfer`.
3. Validate generated `src/features/registry.ts` deterministic insertion.

Live-gated tests (optional in CI, required pre-release):

1. Privy sandbox credentials runbook for one EVM and one Solana network.
2. Webhook event replay fixtures for tx and wallet-action lifecycle.

## Risk Register

1. API churn in Privy endpoints or payload shapes.
- Mitigation: centralize endpoint adapters in `privy_client_base` and use fixture contract tests.

2. Feature explosion makes `saiso add --list` hard to manage.
- Mitigation: add feature tags/category output and server-compatibility display.

3. EVM and SVM semantics diverge for advanced execution.
- Mitigation: keep parity at user flow/interface level, not protocol internals.

4. Secret handling and auth signature leakage in logs.
- Mitigation: redact sensitive headers/tokens in all feature callbacks and error serialization.

## Deliverables Checklist

- [x] `templates/features-svm/` introduced and populated
- [x] 9 generic Privy features implemented
- [x] 2 EVM-specific Privy features implemented
- [x] 1 SVM-specific Privy feature implemented
- [x] shared Privy client foundation feature implemented
- [x] deterministic `saiso add` behavior validated across all features
- [x] template integrity + sync drift gates green
- [x] scenario scaffold/add smoke passes for EVM and SVM

Implementation status:

1. Completed in template source-of-truth under `templates/features*`.
2. Synced into `packages/saiso-cli/templates`.
3. Validated with `saiso add --list`, template integrity checks, sync diff checks, and test/typecheck runs.

## Recommended Execution Order

1. `privy_client_base`
2. `privy_wallet_lifecycle`
3. `privy_balance_and_history`
4. `privy_transfer`
5. `privy_signing_evm` + `privy_signing_svm`
6. `privy_actions_swap`
7. `privy_policy_controls`
8. `privy_intents_router`
9. `privy_webhook_ingest`
10. `privy_accounts`
11. `privy_advanced_execution_evm`
12. hardening, matrix tests, drift pass

## Notes for Implementation Turn

When implementation begins, execute in small batches and keep each batch mergeable:

1. Add 2-3 features per batch max.
2. Run typecheck + template integrity + sync diff each batch.
3. Update docs in each feature directory as part of the same batch.
4. Keep root `templates/` as source-of-truth, then sync.
