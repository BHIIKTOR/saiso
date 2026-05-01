# SAISO Examples

This directory contains example projects demonstrating how to use the SAISO toolkit to build EVM and SVM agents.

## Token Transfer Agent

A simple agent that can send tokens and check balances.

```bash
# Create the example project
saiso new token-transfer-agent --env testnet --yes

# Navigate to the project
cd token-transfer-agent

# Install dependencies
bun install

# Configure your private key
cp .env.example .env
# Edit .env and add your PRIVATE_KEY

# Start development
saiso dev
```

## Available Scaffolds

- **telegram-arb-yield-bot**: Telegram arbitrage scaffold with yield, PnL reporting, risk limits, and Privy features
- **telegram-market-maker-bot**: Telegram market-maker scaffold with inventory/spread controls and Privy wallet ops
- **telegram-perps-funding-capture-bot**: Funding-capture scaffold with leverage/position limits and Telegram controls
- **yield-rotation-steward**: Yield venue rotation scaffold with allocation and drawdown controls
- **mev-safe-execution-assistant**: Execution hardening scaffold with simulation-first checks and advanced EVM signing
- **merchant-settlement-router**: x402/mpp settlement routing scaffold with trust-aware protocol selection
- **merchant-subscriptions-api**: Service-backend scaffold for subscriptions and recurring charges with x402/mpp + Privy

## Telegram Arb Yield Bot Scaffold

Use the new detailed scaffold under:

- `examples/telegram-arb-yield-bot/`

One-command scaffold:

```bash
bash examples/telegram-arb-yield-bot/scaffold.sh telegram-arb-yield-bot
```

This generates an EVM agent and installs:

1. Arb/yield execution and safety features (`quote_and_swap`, `preflight_risk_checks`, `tx_lifecycle_manager`).
2. PnL and ops features (`portfolio_state_and_pnl`, `scheduler_and_workflow_runner`, `observability_and_incident_hooks`).
3. Limits and policy controls (`policy_guardrails_runtime` + seeded policy JSON files).
4. Privy foundation and wallet/signing flows (`privy_client_base`, `privy_wallet_lifecycle`, `privy_transfer`, `privy_signing_evm`, `privy_advanced_execution_evm`).

See:

- `examples/telegram-arb-yield-bot/README.md`

## Additional New Scaffolds

### Telegram Market-Maker Bot

```bash
bash examples/telegram-market-maker-bot/scaffold.sh telegram-market-maker-bot
```

See:

- `examples/telegram-market-maker-bot/README.md`

### Telegram Perps Funding-Capture Bot

```bash
bash examples/telegram-perps-funding-capture-bot/scaffold.sh telegram-perps-funding-capture-bot
```

See:

- `examples/telegram-perps-funding-capture-bot/README.md`

### Yield Rotation Steward

```bash
bash examples/yield-rotation-steward/scaffold.sh yield-rotation-steward
```

See:

- `examples/yield-rotation-steward/README.md`

### MEV-Safe Execution Assistant

```bash
bash examples/mev-safe-execution-assistant/scaffold.sh mev-safe-execution-assistant
```

See:

- `examples/mev-safe-execution-assistant/README.md`

### Merchant Settlement Router (x402/mpp)

```bash
bash examples/merchant-settlement-router/scaffold.sh merchant-settlement-router
```

See:

- `examples/merchant-settlement-router/README.md`

### Merchant Subscriptions API (Recurring Billing)

```bash
bash examples/merchant-subscriptions-api/scaffold.sh merchant-subscriptions-api
```

See:

- `examples/merchant-subscriptions-api/README.md`

## Runnable Local Simulations

Each scaffold now includes a `src/index.ts` that runs a self-contained demo flow:

```bash
bun examples/telegram-arb-yield-bot/src/index.ts
bun examples/telegram-market-maker-bot/src/index.ts
bun examples/telegram-perps-funding-capture-bot/src/index.ts
bun examples/yield-rotation-steward/src/index.ts
bun examples/mev-safe-execution-assistant/src/index.ts
bun examples/merchant-settlement-router/src/index.ts
bun examples/merchant-subscriptions-api/src/index.ts
```

## Creating Your Own Agent

```bash
# Create a new agent project
saiso new my-agent --env testnet

# Add baseline features
cd my-agent
saiso add preflight_risk_checks
saiso add tx_lifecycle_manager
saiso add quote_and_swap

# Add Privy foundation
saiso add privy_client_base
saiso add privy_wallet_lifecycle
saiso add privy_transfer

# Inspect full feature catalog
saiso add --list

# Then add chain-specific signing
saiso add privy_signing_evm   # EVM projects
saiso add privy_signing_svm   # SVM projects

# Optional core wallet features
saiso add send_tokens
saiso add query_balance
saiso add interact_contract

# Start development
saiso dev
```

## Features Available

Current high-value feature groups:

- Reliability and policy: `preflight_risk_checks`, `tx_lifecycle_manager`, `policy_guardrails_runtime`, `allowance_and_permission_manager`
- Execution and automation: `quote_and_swap`, `event_ingest_and_triggers`, `scheduler_and_workflow_runner`, `cross_chain_intent_router`
- Operations: `portfolio_state_and_pnl`, `oracle_and_market_data_layer`, `observability_and_incident_hooks`, `local_strategy_test_harness`
- Wallet/network basics: `send_tokens`, `query_balance`, `interact_contract`, `gas_estimation`, `check_network_status`
- Privy pack: `privy_client_base`, `privy_wallet_lifecycle`, `privy_balance_and_history`, `privy_transfer`, `privy_actions_swap`, `privy_policy_controls`, `privy_intents_router`, `privy_webhook_ingest`, `privy_accounts`, `privy_signing_evm`, `privy_signing_svm`, `privy_advanced_execution_evm`

Always use `saiso add --list` in your current project for the exact server-compatible set.

Detailed Privy docs:

- `docs/privy-feature-pack.md`
- `spec/privy-template-expansion-01/README.md`

## Environment Management

SAISO supports multiple environments:

- **testnet**: Safe for development (default)
- **mainnet**: Production with real funds
- **devnet**: Experimental features

Switch between environments:

```bash
saiso switch-env mainnet  # Requires confirmation
saiso switch-env testnet  # Safe for development
```

## Getting Help

- [SAISO Documentation](https://github.com/bhiktor/saiso)
- [ElizaOS Documentation](https://github.com/elizaOS/eliza)
- [Ethereum Documentation](https://ethereum.org/en/developers/docs/)
- [Solana Documentation](https://solana.com/docs)
