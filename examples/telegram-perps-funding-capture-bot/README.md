# Telegram Perps Funding-Capture Bot Scaffold

Scaffold for a Telegram-controlled funding-capture bot with:

1. Funding-rate opportunity checks.
2. Position and leverage controls.
3. PnL and risk telemetry.
4. Privy-backed wallet/signing support.

## Quick Start

```bash
bash examples/telegram-perps-funding-capture-bot/scaffold.sh telegram-perps-funding-capture-bot
cd telegram-perps-funding-capture-bot
cp .env.example .env
saiso policy validate --strict
saiso dev
```

Run the local scaffold simulation:

```bash
bun src/index.ts
```

## Suggested Commands

1. `/status`
2. `/funding`
3. `/positions`
4. `/pnl`
5. `/perps on|off`
6. `/risk`
