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
