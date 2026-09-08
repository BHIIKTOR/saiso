# Privy Accounts

Install with `saiso add privy_accounts`. Invoke `PRIVY_ACCOUNTS` using app credentials from `privy_client_base`.

| Operation | HTTP endpoint |
| --- | --- |
| create | POST /v1/accounts |
| get | GET /v1/accounts/{accountId} |
| list | GET /v1/accounts |
| update | PATCH /v1/accounts/{accountId} |
| balance | GET /v1/accounts/{accountId}/balance |

Create/update use `payload` as the provider request body. Creation requires exactly one of `payload.wallet_ids` or `payload.wallets_configuration`, containing 1–5 wallets. For example: `{ operation: 'create', payload: { display_name: 'Agent', wallet_ids: ['wallet_id'] } }`.

Account chain configuration belongs inside `wallets_configuration`; the old top-level `network` and `chainFamily` are response context, not account API fields.

Results use `success`, `data.result`, and request metadata. Provider errors return `success: false`. Mutations are sent once; they are not automatically retried.

Reference: [Privy account creation](https://docs.privy.io/wallets/accounts/create).
