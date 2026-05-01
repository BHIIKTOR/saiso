# Telegram Arb Yield Bot Scaffold (EVM + Privy)

This example shows how to scaffold a Telegram-driven arbitrage bot with:

1. Arbitrage execution workflows.
2. Yield strategy hooks.
3. PnL tracking and Telegram status reporting.
4. Hard limits and policy guardrails.
5. Privy-backed wallet/account/signing capabilities.

## What This Scaffold Adds

The scaffold script creates a SAISO EVM project, installs a focused feature set, and drops in baseline config files for limits and policies.

Installed features:

1. `preflight_risk_checks`
2. `tx_lifecycle_manager`
3. `quote_and_swap`
4. `portfolio_state_and_pnl`
5. `policy_guardrails_runtime`
6. `scheduler_and_workflow_runner`
7. `oracle_and_market_data_layer`
8. `observability_and_incident_hooks`
9. `local_strategy_test_harness`
10. `privy_client_base`
11. `privy_wallet_lifecycle`
12. `privy_balance_and_history`
13. `privy_transfer`
14. `privy_actions_swap`
15. `privy_policy_controls`
16. `privy_intents_router`
17. `privy_webhook_ingest`
18. `privy_accounts`
19. `privy_signing_evm`
20. `privy_advanced_execution_evm`

## Quick Start

From repository root:

```bash
bash examples/telegram-arb-yield-bot/scaffold.sh telegram-arb-yield-bot
```

Then in the generated project:

```bash
cd telegram-arb-yield-bot
cp .env.example .env
# edit .env with your credentials
saiso policy validate --strict
saiso add --list
saiso dev
```

Run the local scaffold simulation:

```bash
bun src/index.ts
```

## Telegram Command Surface (Suggested)

1. `/status`
- show balances, active routes, and latest PnL snapshot.

2. `/pnl`
- show realized and unrealized PnL with daily and cumulative windows.

3. `/limits`
- show per-trade notional cap, daily loss cap, and max concurrent routes.

4. `/arb on|off`
- pause/resume route execution.

5. `/yield on|off`
- pause/resume yield allocations.

6. `/rebalance`
- run one-shot rebalance within configured risk limits.

## Strategy Components

1. Route discovery and quote validation:
- use `quote_and_swap` + `oracle_and_market_data_layer`.

2. Safety gate before every mutating action:
- use `preflight_risk_checks` + `policy_guardrails_runtime`.

3. Transaction progress and error classification:
- use `tx_lifecycle_manager`.

4. Yield leg execution:
- represent yield venues as scheduled intents through `scheduler_and_workflow_runner`.

5. PnL and state snapshots:
- use `portfolio_state_and_pnl` for periodic snapshots and Telegram reporting.

6. Privy wallet and signing controls:
- use `privy_wallet_lifecycle`, `privy_signing_evm`, and `privy_advanced_execution_evm`.

## Limits and Guardrails

This example includes:

1. `config/arb-yield-limits.example.json`
- strategy-level notional, slippage, loss, and exposure controls.

2. `policies/payment-policy.json`
- paid call budget and per-tool spend caps.

3. `policies/trust-policy.json`
- minimum trust score and routing profile.

Copy these into your generated project before first live run.

## Files in This Example Folder

1. `scaffold.sh`
- one-shot scaffold script.

2. `.env.example`
- environment template including Telegram + Privy fields.

3. `config/arb-yield-limits.example.json`
- recommended strategy limits.

4. `policies/payment-policy.json`
- baseline paid-policy file.

5. `policies/trust-policy.json`
- baseline trust-policy file.

6. `src/telegram-bot.example.ts`
- minimal command-handling and PnL message formatting scaffold.

7. `src/index.ts`
- runnable local simulation using the scaffold helpers.

## Operational Notes

1. Start on testnet only.
2. Keep max per-trade notional low until end-to-end validation passes.
3. Enable live execution only after dry-run and paper mode show stable behavior.
4. Keep all secrets in `.env` only; never commit key material.
