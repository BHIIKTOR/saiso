# Privy Intents Router

Invoke `PRIVY_INTENTS_ROUTER` to propose intents or inspect their status.

| Operation | HTTP endpoint | Required identifier |
| --- | --- | --- |
| transfer | POST /v1/intents/wallets/{walletId}/transfer | walletId |
| rpc | POST /v1/intents/wallets/{walletId}/rpc | walletId |
| get | GET /v1/intents/{intentId} | intentId |
| list | GET /v1/intents | none |
| update-policy | PATCH /v1/intents/policies/{policyId} | policyId |
| update-key-quorum | PATCH /v1/intents/key_quorums/{keyQuorumId} | keyQuorumId |

Transfer requires `payload.source` and `payload.destination` in Privy's transfer format, such as `{ source: { asset: 'usdc', amount: '10.0', chain: 'tempo' }, destination: { address: '0x...' } }`. The previous flat `to`/`amount` fields are insufficient.

RPC uses `rpcRequest` as the request body, with optional fields from `payload`. Policy/quorum operations propose changes to those resources using `payload`; they do not modify an existing intent and therefore require resource IDs rather than `intentId`.

Intents require separate authorization before execution. A successful creation response indicates submission, not transfer settlement. Mutations are not automatically retried.

References: [Transfer intents](https://docs.privy.io/transaction-management/intents/create/execute-transfer), [RPC intents](https://docs.privy.io/transaction-management/intents/create/execute-rpc), [Policy intents](https://docs.privy.io/transaction-management/intents/create/update-policy), [Quorum intents](https://docs.privy.io/transaction-management/intents/create/update-key-quorum).
