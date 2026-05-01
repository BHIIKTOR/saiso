# Template Live Provider Smokes

Use this runbook after installing the expanded templates into a generated project. These checks intentionally exercise provider connectivity without requiring private keys unless noted.

## Shared Response Contract

Expanded feature actions return:

- `success`: boolean
- `operation`: stable feature id
- `chainFamily`: `evm`, `svm`, or `cross`
- `data`: provider result or normalized decision details
- `error`: `{ code, message }` on failure
- `meta`: includes `requestId` and `latencyMs`; provider-backed actions also include provider context where useful

## EVM Quote and Swap

Environment:

```bash
ZEROX_SWAP_API_BASE=https://api.0x.org/swap/allowance-holder
ZEROX_API_KEY=<required-for-hosted-0x-api>
CHAIN_ID=1
WALLET_ADDRESS=<optional-taker-address>
```

Hosted 0x requests fail before network access when `ZEROX_API_KEY` is missing:

```json
{
  "success": false,
  "operation": "quote_and_swap",
  "chainFamily": "evm",
  "error": {
    "code": "quote_provider_auth_required",
    "message": "ZEROX_API_KEY is required for hosted 0x swap API"
  },
  "meta": {
    "provider": "0x",
    "requiredEnv": ["ZEROX_API_KEY"]
  }
}
```

Custom quote providers can be used without `ZEROX_API_KEY` by setting `quoteProvider: "custom"` and `quoteUrl`, or by pointing `ZEROX_SWAP_API_BASE` at a non-`api.0x.org` proxy.

Dry-run quote payload:

```json
{
  "chainFamily": "evm",
  "sellToken": "ETH",
  "buyToken": "USDC",
  "sellAmount": "1000000000000000000",
  "dryRun": true
}
```

Execution-intent payload, which returns a transaction request but does not broadcast:

```json
{
  "chainFamily": "evm",
  "sellToken": "ETH",
  "buyToken": "USDC",
  "sellAmount": "1000000000000000000",
  "takerAddress": "0x0000000000000000000000000000000000000001",
  "slippageBps": 50,
  "execute": true
}
```

## SVM Quote and Swap

Environment:

```bash
JUPITER_QUOTE_API_BASE=https://lite-api.jup.ag/swap/v1
WALLET_ADDRESS=<optional-solana-wallet-address>
```

Dry-run quote payload:

```json
{
  "chainFamily": "svm",
  "inputMint": "So11111111111111111111111111111111111111112",
  "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "amount": "1000000",
  "slippageBps": 50
}
```

Set `execute: true` only when `WALLET_ADDRESS` or `walletAddress` is configured; the action builds a Jupiter swap transaction and does not sign or broadcast it.

## Privy Feature Pack

Install any Privy runtime feature and `saiso add` will install `privy_client_base` first:

```bash
saiso add privy_transfer
saiso add privy_signing_evm
saiso add privy_signing_svm
```

Environment:

```bash
PRIVY_APP_ID=<app-id>
PRIVY_APP_SECRET=<app-secret>
PRIVY_BASE_URL=https://api.privy.io/v1
PRIVY_REQUEST_TIMEOUT_MS=30000
PRIVY_REQUEST_EXPIRY_MS=120000
PRIVY_RETRY_MAX_ATTEMPTS=3
PRIVY_RETRY_BASE_DELAY_MS=200
PRIVY_DEFAULT_WALLET_ID=<optional-wallet-id>
```

Wallet lifecycle:

```json
{
  "chainFamily": "evm",
  "operation": "create_wallet",
  "network": "ethereum"
}
```

Balance query:

```json
{
  "operation": "balances",
  "walletId": "wallet_123",
  "network": "ethereum"
}
```

Transfer:

```json
{
  "chainFamily": "evm",
  "walletId": "wallet_123",
  "to": "0x0000000000000000000000000000000000000001",
  "amount": "0.01",
  "asset": "ETH"
}
```

EVM signing:

```json
{
  "walletId": "wallet_123",
  "method": "personal_sign",
  "message": "saiso-live-privy-ok"
}
```

SVM signing:

```json
{
  "walletId": "wallet_123",
  "method": "signMessage",
  "message": "saiso-live-privy-ok"
}
```

## Gas Estimation

Environment:

```bash
RPC_URL=<evm-rpc-url>
CHAIN_ID=1
ETH_PRICE_API_URL=<optional-json-price-endpoint>
ETH_PRICE_USD_FALLBACK=3500
GAS_PRICE_API_KEY=<optional-price-api-key>
MEV_PROTECTION_ENABLED=false
```

Price endpoint responses may use any of these fields: `usd`, `price`, `priceUsd`, `nativeTokenPriceUsd`, `ethereum.usd`, `data.amount`, `data.usd`, or `rates.USD`.

Payload:

```json
{
  "to": "0x0000000000000000000000000000000000000001",
  "value": "0.01",
  "speed": "standard",
  "includeUsdPrice": true
}
```

## Policy and Preflight

Environment:

```bash
PAYMENT_MAX_PER_REQUEST_USD=5
TRUST_MIN_SCORE=0.7
PAYMENT_ALLOWED_RECIPIENTS=0xabc,0xdef
PAYMENT_BLOCKED_RECIPIENTS=0xblocked
POLICY_REQUIRE_DRY_RUN=false
```

Policy-only payload:

```json
{
  "chainFamily": "evm",
  "amountUsd": 2,
  "trustScore": 0.9,
  "recipient": "0xabc",
  "dryRun": true
}
```

Preflight payload:

```json
{
  "chainFamily": "evm",
  "amountUsd": 2,
  "trustScore": 0.9,
  "recipient": "0xabc",
  "simulation": {
    "success": true,
    "gasUsed": "21000"
  }
}
