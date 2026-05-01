#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${1:-telegram-market-maker-bot}"
EXAMPLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

saiso new "${PROJECT_NAME}" --env testnet --agent-name "TelegramMarketMakerBot" --description "Telegram EVM market-maker bot with PnL, limits, and Privy" --yes
cd "${PROJECT_NAME}"
bun install

FEATURES=(
  preflight_risk_checks
  tx_lifecycle_manager
  quote_and_swap
  portfolio_state_and_pnl
  policy_guardrails_runtime
  scheduler_and_workflow_runner
  oracle_and_market_data_layer
  observability_and_incident_hooks
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
cp "${EXAMPLE_DIR}/config/market-maker-limits.example.json" config/market-maker-limits.json
cp "${EXAMPLE_DIR}/src/telegram-market-maker.example.ts" src/telegram-market-maker.example.ts
cp "${EXAMPLE_DIR}/src/index.ts" src/index.ts
cp "${EXAMPLE_DIR}/.env.example" .env.example
[ -f .env ] || cp .env.example .env

echo "Scaffold complete: ${PROJECT_NAME}"
