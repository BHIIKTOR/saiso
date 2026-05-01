# @saiso/cli

SAISO is a developer-first CLI for building, testing, and publishing EVM and SVM blockchain agents. It scaffolds agent projects, installs template features, runs local MCP workflows, and keeps payment, policy, identity, and trust behavior close to the generated project.

## Install

```bash
npm install -g @saiso/cli@rc
```

The package installs the `saiso` binary:

```bash
saiso --help
```

## Quickstart

```bash
saiso new my-agent --env testnet
cd my-agent
bun install
saiso add gas_estimation --yes
bun test
```

For the current Privy wallet workflow:

```bash
saiso add privy_client_base --yes
saiso add privy_wallet_lifecycle --yes
saiso add privy_balance_and_history --yes
saiso add privy_transfer --yes
saiso add privy_signing_evm --yes
```

Privy features require:

```bash
PRIVY_APP_ID=...
PRIVY_APP_SECRET=...
```

## Common Commands

```bash
saiso new <name> --env testnet
saiso add --list
saiso add <feature> --yes
saiso dev
saiso mcp list
saiso mcp call --tool <tool> --params '{}'
saiso policy validate
saiso identity build
saiso identity validate
saiso receipts --json
saiso docker doctor
saiso test localnet --chain evm
```

## Included Templates

The CLI includes base EVM/SVM agent templates plus installable feature templates for:

- Privy wallet lifecycle, balance/history, transfers, EVM signing, and SVM signing
- gas estimation and transaction lifecycle support
- quote and swap helpers for EVM and SVM
- policy guardrails, preflight checks, local strategy testing, and observability hooks
- identity, trust-aware routing, and payment-aware execution surfaces

## Payment and Provider Notes

SAISO templates include support for x402 and MPP paid tool flows. Hosted 0x quote/swap flows require a 0x API key:

```bash
ZEROX_API_KEY=...
```

Live paid smoke tests may also require protocol-specific wallet or facilitator credentials. Validate local policy before paid runs:

```bash
saiso policy validate
```

## Repository

Source, docs, release notes, and issue tracking live at:

https://github.com/BHIIKTOR/saiso
