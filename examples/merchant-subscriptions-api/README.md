# Merchant Subscriptions API Scaffold (x402 + mpp + Privy)

Scaffold for a subscription and recurring-payment backend with:

1. Service blueprint API host.
2. x402/mpp payment policy routing.
3. Privy accounts and wallet operations.
4. Recurring billing schedules and entitlement checks.

## Quick Start

```bash
bash examples/merchant-subscriptions-api/scaffold.sh merchant-subscriptions-api
cd merchant-subscriptions-api
cp .env.example .env
# fill APP secrets and provider credentials
saiso policy validate --strict
npm run build
npm run service:start
```

Run the local scaffold simulation:

```bash
bun src/index.ts
```

## API Shape (suggested)

1. `POST /api/subscriptions`
- create subscription contract and customer mapping.

2. `POST /api/subscriptions/:id/charge`
- execute one recurring charge through x402/mpp route.

3. `GET /api/subscriptions/:id/status`
- show active state, next billing date, arrears, and last receipt.

4. `POST /api/subscriptions/:id/cancel`
- stop recurring billing and freeze entitlement.

5. `POST /api/entitlements/check`
- runtime entitlement check for protected resources.
