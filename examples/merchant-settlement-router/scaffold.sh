#!/usr/bin/env bash
set -euo pipefail
PROJECT_NAME="${1:-merchant-settlement-router}"
EXAMPLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

saiso new "${PROJECT_NAME}" --env testnet --agent-name "MerchantSettlementRouter" --description "x402/mpp settlement router with trust, receipts, and Privy treasury flows" --yes
cd "${PROJECT_NAME}"
bun install

FEATURES=(
  policy_guardrails_runtime
  observability_and_incident_hooks
  scheduler_and_workflow_runner
  preflight_risk_checks
  privy_client_base
  privy_accounts
  privy_transfer
  privy_policy_controls
)
for feature in "${FEATURES[@]}"; do saiso add "${feature}" --yes; done

mkdir -p .saiso config src
cp "${EXAMPLE_DIR}/policies/payment-policy.json" .saiso/payment-policy.json
cp "${EXAMPLE_DIR}/policies/trust-policy.json" .saiso/trust-policy.json
cp "${EXAMPLE_DIR}/config/settlement-routing.example.json" config/settlement-routing.json
cp "${EXAMPLE_DIR}/src/settlement-router.example.ts" src/settlement-router.example.ts
cp "${EXAMPLE_DIR}/src/index.ts" src/index.ts
cp "${EXAMPLE_DIR}/.env.example" .env.example
[ -f .env ] || cp .env.example .env

echo "Scaffold complete: ${PROJECT_NAME}"
