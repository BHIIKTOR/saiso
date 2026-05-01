# Telegram Market-Maker Bot Scaffold (EVM + Privy)

Scaffold for a Telegram-managed market-maker bot with:

1. Two-sided quoting and inventory control.
2. PnL snapshots and command-based reporting.
3. Position, spread, and drawdown limits.
4. Privy wallet and signing features.

## Quick Start

```bash
bash examples/telegram-market-maker-bot/scaffold.sh telegram-market-maker-bot
cd telegram-market-maker-bot
cp .env.example .env
# edit TELEGRAM_* and PRIVY_* values
saiso policy validate --strict
saiso dev
```

Run the local scaffold simulation:

```bash
bun src/index.ts
```

## Suggested Telegram Commands

1. `/status`
2. `/pnl`
3. `/quotes`
4. `/inventory`
5. `/mm on|off`
6. `/limits`

## Installed Feature Set

1. `preflight_risk_checks`
2. `tx_lifecycle_manager`
3. `quote_and_swap`
4. `portfolio_state_and_pnl`
5. `policy_guardrails_runtime`
6. `scheduler_and_workflow_runner`
7. `oracle_and_market_data_layer`
8. `observability_and_incident_hooks`
9. `privy_client_base`
10. `privy_wallet_lifecycle`
11. `privy_balance_and_history`
12. `privy_transfer`
13. `privy_signing_evm`
