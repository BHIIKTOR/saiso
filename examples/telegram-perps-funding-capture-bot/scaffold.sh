#!/usr/bin/env bash
set -euo pipefail
PROJECT_NAME="${1:-telegram-perps-funding-capture-bot}"
EXAMPLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

saiso new "${PROJECT_NAME}" --env testnet --agent-name "TelegramPerpsFundingCaptureBot" --description "Telegram perps funding-capture bot with limits, PnL, and Privy" --yes
cd "${PROJECT_NAME}"
bun install

FEATURES=(
  preflight_risk_checks
  tx_lifecycle_manager
  policy_guardrails_runtime
  portfolio_state_and_pnl
  scheduler_and_workflow_runner
  oracle_and_market_data_layer
  observability_and_incident_hooks
  cross_chain_intent_router
  privy_client_base
  privy_wallet_lifecycle
  privy_balance_and_history
  privy_transfer
  privy_signing_evm
)
for feature in "${FEATURES[@]}"; do saiso add "${feature}" --yes; done

mkdir -p .saiso config src
cp "${EXAMPLE_DIR}/policies/payment-policy.json" .saiso/payment-policy.json
cp "${EXAMPLE_DIR}/policies/trust-policy.json" .saiso/trust-policy.json
cp "${EXAMPLE_DIR}/config/perps-funding-limits.example.json" config/perps-funding-limits.json
cp "${EXAMPLE_DIR}/src/telegram-perps.example.ts" src/telegram-perps.example.ts
cp "${EXAMPLE_DIR}/src/index.ts" src/index.ts
cp "${EXAMPLE_DIR}/.env.example" .env.example
[ -f .env ] || cp .env.example .env

echo "Scaffold complete: ${PROJECT_NAME}"
