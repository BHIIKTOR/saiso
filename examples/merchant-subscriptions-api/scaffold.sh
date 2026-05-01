#!/usr/bin/env bash
set -euo pipefail
PROJECT_NAME="${1:-merchant-subscriptions-api}"
EXAMPLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

saiso new "${PROJECT_NAME}" --env testnet --agent-name "MerchantSubscriptionsApi" --description "Service-backend scaffold for subscriptions and recurring payments with x402/mpp + Privy" --service-blueprint --yes
cd "${PROJECT_NAME}"
bun install

FEATURES=(
  policy_guardrails_runtime
  scheduler_and_workflow_runner
  observability_and_incident_hooks
  event_ingest_and_triggers
  preflight_risk_checks
  privy_client_base
  privy_accounts
  privy_wallet_lifecycle
  privy_transfer
  privy_intents_router
  privy_policy_controls
  privy_webhook_ingest
)
for feature in "${FEATURES[@]}"; do saiso add "${feature}" --yes; done

mkdir -p .saiso config src
cp "${EXAMPLE_DIR}/policies/payment-policy.json" .saiso/payment-policy.json
cp "${EXAMPLE_DIR}/policies/trust-policy.json" .saiso/trust-policy.json
cp "${EXAMPLE_DIR}/config/subscriptions.example.json" config/subscriptions.json
cp "${EXAMPLE_DIR}/src/subscriptions-api.example.ts" src/subscriptions-api.example.ts
cp "${EXAMPLE_DIR}/src/index.ts" src/index.ts
cp "${EXAMPLE_DIR}/.env.example" .env.example
[ -f .env ] || cp .env.example .env

echo "Scaffold complete: ${PROJECT_NAME}"
echo "Run: bun src/index.ts"
echo "Then: npm run build && npm run service:start"
