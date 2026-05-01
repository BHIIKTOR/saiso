#!/usr/bin/env bash
set -euo pipefail
PROJECT_NAME="${1:-mev-safe-execution-assistant}"
EXAMPLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

saiso new "${PROJECT_NAME}" --env testnet --agent-name "MevSafeExecutionAssistant" --description "MEV-safe execution assistant with policy guardrails and Privy signing" --yes
cd "${PROJECT_NAME}"
bun install

FEATURES=(
  preflight_risk_checks
  tx_lifecycle_manager
  quote_and_swap
  policy_guardrails_runtime
  observability_and_incident_hooks
  local_strategy_test_harness
  oracle_and_market_data_layer
  privy_client_base
  privy_wallet_lifecycle
  privy_transfer
  privy_signing_evm
  privy_advanced_execution_evm
)
for feature in "${FEATURES[@]}"; do saiso add "${feature}" --yes; done

mkdir -p .saiso config src
cp "${EXAMPLE_DIR}/policies/payment-policy.json" .saiso/payment-policy.json
cp "${EXAMPLE_DIR}/policies/trust-policy.json" .saiso/trust-policy.json
cp "${EXAMPLE_DIR}/config/execution-limits.example.json" config/execution-limits.json
cp "${EXAMPLE_DIR}/src/mev-safe-execution.example.ts" src/mev-safe-execution.example.ts
cp "${EXAMPLE_DIR}/src/index.ts" src/index.ts
cp "${EXAMPLE_DIR}/.env.example" .env.example
[ -f .env ] || cp .env.example .env

echo "Scaffold complete: ${PROJECT_NAME}"
