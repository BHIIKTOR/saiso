# Privy Policy Controls

Invoke `PRIVY_POLICY_CONTROLS` with an operation and the provider request body in `payload`.

| Operation | HTTP endpoint |
| --- | --- |
| create-policy | POST /v1/policies |
| create-rule | POST /v1/policies/{policyId}/rules |
| create-condition-set | POST /v1/condition_sets |
| create-key-quorum | POST /v1/key_quorums |

`create-rule` requires `policyId`. Supply `authorizationSignature` when required by resource ownership, together with the exact `expiresAt`, `idempotencyKey`, and payload used to construct the signature. Signature generation remains the caller's responsibility.

`list-policies` returns an explicit unsupported error without making a request: a current REST contract for that operation has not been verified. Unknown operation names also fail before any request.

Provider errors return `success: false`. Mutations are not automatically retried.

References: [Policies](https://docs.privy.io/api-reference/policies/create), [Rules](https://docs.privy.io/api-reference/policies/rules/create), [Condition sets](https://docs.privy.io/api-reference/condition-sets/create), [Key quorums](https://docs.privy.io/api-reference/key-quorums/create).
