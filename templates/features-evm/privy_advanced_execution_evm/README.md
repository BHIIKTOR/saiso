# Privy Advanced EVM Execution

Invoke `PRIVY_ADVANCED_EXECUTION_EVM` with `walletId`, an operation, and `payload.params` in Privy RPC format.

All operations use `POST /v1/wallets/{walletId}/rpc`:

| Operation | RPC method |
| --- | --- |
| auth-signature | eth_sign7702Authorization |
| user-operation | eth_signUserOperation |
| send-call | wallet_sendCalls |

`send-call` also requires CAIP-2 chain context through `network` or `payload.caip2`. `payload` supplies the RPC fields; the selected operation determines the method and cannot be overridden through the payload.

`auth-signature` signs an EIP-7702 authorization; it does not create an HTTP request authorization signature. Supply `authorizationSignature` when wallet ownership requires one, along with matching `expiresAt` and `idempotencyKey`. Owner-signature construction remains the caller's responsibility.

Signing results and asynchronous submissions are returned in `data.result`. A successful HTTP response does not imply settlement. Mutations are not automatically retried.

References: [EIP-7702](https://docs.privy.io/wallets/using-wallets/ethereum/sign-7702-authorization), [RPC schemas](https://docs.privy.io/api-reference/intents/list).
