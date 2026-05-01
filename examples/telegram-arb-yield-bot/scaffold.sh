#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${1:-telegram-arb-yield-bot}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXAMPLE_DIR="${SCRIPT_DIR}"

if ! command -v saiso >/dev/null 2>&1; then
  echo "saiso CLI is required in PATH"
  exit 1
fi

echo "[1/7] Creating SAISO project: ${PROJECT_NAME}"
saiso new "${PROJECT_NAME}" \
  --env testnet \
  --agent-name "TelegramArbYieldBot" \
  --description "Telegram arbitrage bot with yield, pnl tracking, limits, and Privy wallet flows" \
  --yes

cd "${PROJECT_NAME}"

echo "[2/7] Installing project dependencies"
bun install

echo "[3/7] Installing feature pack"
FEATURES=(
  preflight_risk_checks
  tx_lifecycle_manager
  quote_and_swap
  portfolio_state_and_pnl
  policy_guardrails_runtime
  scheduler_and_workflow_runner
  oracle_and_market_data_layer
  observability_and_incident_hooks
  local_strategy_test_harness
  privy_client_base
  privy_wallet_lifecycle
  privy_balance_and_history
  privy_transfer
  privy_actions_swap
  privy_policy_controls
  privy_intents_router
  privy_webhook_ingest
  privy_accounts
  privy_signing_evm
  privy_advanced_execution_evm
)

for feature in "${FEATURES[@]}"; do
  echo "  -> saiso add ${feature}"
  saiso add "${feature}" --yes
done

echo "[4/7] Seeding policy and strategy config"
mkdir -p .saiso config src
cp "${EXAMPLE_DIR}/policies/payment-policy.json" .saiso/payment-policy.json
cp "${EXAMPLE_DIR}/policies/trust-policy.json" .saiso/trust-policy.json
cp "${EXAMPLE_DIR}/config/arb-yield-limits.example.json" config/arb-yield-limits.json
cp "${EXAMPLE_DIR}/src/telegram-bot.example.ts" src/telegram-bot.example.ts
cp "${EXAMPLE_DIR}/src/index.ts" src/index.ts

echo "[5/7] Writing env template"
cp "${EXAMPLE_DIR}/.env.example" .env.example

if [ ! -f .env ]; then
  cp .env.example .env
fi

echo "[6/7] Running policy validation"
saiso policy validate --strict || true

echo "[7/7] Done"
echo ""
echo "Next steps:"
echo "  cd ${PROJECT_NAME}"
echo "  edit .env and fill TELEGRAM_* + PRIVY_* values"
echo "  bun src/index.ts"
echo "  saiso dev"
echo ""
echo "Optional checks:"
echo "  saiso add --list"
echo "  saiso policy validate --strict"
