# MEV-Safe Execution Assistant Scaffold

Scaffold for an execution-focused assistant emphasizing preflight checks, lifecycle handling, slippage controls, and policy enforcement.

## Quick Start

```bash
bash examples/mev-safe-execution-assistant/scaffold.sh mev-safe-execution-assistant
cd mev-safe-execution-assistant
cp .env.example .env
saiso policy validate --strict
saiso dev
```

Run the local scaffold simulation:

```bash
bun src/index.ts
```

## Focus Areas

1. Simulation-first execution path.
2. Strict slippage and max-notional controls.
3. Transaction replacement/finality handling.
4. Privy-backed signing and advanced EVM execution.
