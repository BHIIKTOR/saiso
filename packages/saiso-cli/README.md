# @saiso/cli

SAISO is a developer-first CLI for building, testing, and publishing EVM and SVM blockchain agents with ElizaOS-style runtime patterns, MCP server orchestration, payment-aware tool calls, policy guardrails, and template-based feature installation.

## Install

```bash
npm install -g @saiso/cli@rc
```

The package installs the `saiso` binary:

```bash
saiso --help
saiso new my-agent --env testnet
cd my-agent
bun install
saiso add gas_estimation --yes
saiso dev
```

## Common Feature Installs

```bash
saiso add privy_client_base --yes
saiso add privy_wallet_lifecycle --yes
saiso add privy_balance_and_history --yes
saiso add privy_transfer --yes
saiso add privy_signing_evm --yes
saiso add gas_estimation --yes
```

## Repository

Source, docs, release notes, and issue tracking live at:

https://github.com/BHIIKTOR/saiso
