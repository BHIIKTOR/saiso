# Privy Client Base

## What It Adds

1. Shared Privy HTTP client foundation with auth, timeout, retry, idempotency, and request-expiry helpers.
2. Lightweight error taxonomy (`PrivyClientError`) with retryability hints.
3. Reusable integration files for all Privy wallet/account/policy features.

## Files Added

1. `src/actions/privyClientBase.ts`
2. `src/integrations/privy/client.ts`
3. `src/integrations/privy/auth.ts`
4. `src/integrations/privy/types.ts`
5. `src/integrations/privy/errors.ts`
6. `src/integrations/privy/retry.ts`

## Usage

1. Install with `saiso add privy_client_base`.
2. Configure `PRIVY_APP_ID` and `PRIVY_APP_SECRET`.
3. Use `createPrivyClient(...)` inside downstream Privy feature actions.

## Output Contract

1. `success`
2. `operation`
3. `chainFamily`
4. `requestId`
5. `data`
6. `meta.idempotencyKey`
7. `meta.expiresAt`

## Transport behavior

Requests include Basic authentication and `privy-app-id`. `idempotencyKey` is sent as `privy-idempotency-key`; ISO `expiresAt` is converted to Unix milliseconds in `privy-request-expiry`. Invalid or expired requests fail before HTTP.

Only GET requests retry transient transport errors, HTTP 429, or HTTP 5xx, within `PRIVY_RETRY_MAX_ATTEMPTS`. Permanent HTTP errors and invalid JSON are not retried. POST/PATCH/PUT/DELETE requests are sent once, including after a lost response; reconcile uncertain writes with provider state before deciding to retry. Supplying an idempotency key does not establish that every endpoint supports replay protection.

New accounts/swap/intents/policy/advanced templates generate UUID idempotency keys when omitted. Callers who need to identify the same logical request across invocations must supply their own stable key. For owner-authorized requests, the signature and explicit expiry/key must match the exact provider request.

Reference: [Privy REST authentication](https://docs.privy.io/basics/rest-api/setup), [policy idempotency](https://docs.privy.io/api-reference/policies/create), [request expiry](https://docs.privy.io/api-reference/policies/rules/create).
