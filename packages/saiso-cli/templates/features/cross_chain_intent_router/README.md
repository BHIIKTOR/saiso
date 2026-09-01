# Cross-Chain Intent Router

## What It Adds

1. Plan intent-driven routes across multiple chains (prepare → bridge → settle).
2. Validate the route against cost budgets and trust thresholds.
3. Return a deterministic route plan with a normalized SAISO envelope.

## Inputs

- `intent`: intent type (default `transfer`)
- `sourceChain` / `destinationChain`: chain families for the route
- `amountUsd`: estimated route value
- `maxCostUsd`: override the configured `PAYMENT_MAX_PER_REQUEST_USD` budget
- `minTrustScore`: override the configured `TRUST_MIN_SCORE` threshold

## Usage

1. Install with `saiso add cross_chain_intent_router`.
2. Invoke action `CROSS_CHAIN_INTENT_ROUTER` with chainFamily, intent, and optional policy overrides.
3. The action returns a route plan; it does not execute the route.

## Output Contract

1. success
2. operation
3. chainFamily
4. data.plan
5. data.policy
6. data.violations
7. meta