**Prompt for Generative AI to Build the Project "Saiso" — A Node.js/TypeScript Toolkit for SEI EVM Agents**

---

### 🎯 Objective

You are an advanced AI development assistant. Your task is to implement the full stack of a project called **Saiso** — a developer-first CLI toolkit for building, testing, and deploying LLM agents that interact with the **SEI EVM blockchain**. You must scaffold infrastructure, CLI tooling, agent features, and automation workflows using **Node.js** and **TypeScript** only. No Python is allowed.

---

### 📁 Project Structure

Generate the following directory structure:

```
saiso/
├── packages/
│   ├── saiso-core/           # Agent scaffolding, feature registry, shared logic
│   ├── saiso-cli/            # CLI entry point (saiso new, saiso add, etc.)
│   ├── mcp-orchestration/   # sei-mcp-server Docker setup for SEI EVM
├── templates/
│   ├── agent/               # Project scaffolding for new agents
│   └── features/            # Code templates for addable features
│       ├── send_tokens/
│       ├── query_balance/
│       └── interact_contract/
│       └── ...
├── .github/
│   └── workflows/
│       └── saiso.yml         # CI/CD pipeline for Saiso agents
├── README.md
└── examples/
    └── token-transfer-agent/
```

---

### 🧪 CLI Tool: `saiso-cli`

Create a CLI in TypeScript using `commander`. The command structure should be simple and modular to support easy expansion in the future:

* `saiso new {PROJECT_NAME}`

  * Clones project structure from `templates/agent`
  * Initializes an ElizaOS agent wired with `plugin-sei`
  * Generates `.env`, `config.json`, and MCP interface bootstrap files

* `saiso add {FEATURE} {FEATURE_NAME}`

  * Copies code from `templates/features/{FEATURE}` into the active agent
  * Registers feature in agent manifest and plugin bindings
  * Adds test stub and usage reference in the docs folder

* `saiso test`

  * Runs all registered behavior and integration tests

* `saiso dev`

  * Starts the local dev environment
  * Spins up `sei-mcp-server` via Docker Compose
  * Monitors live output, logs from the agent
  * Launches the running agent in debug mode
  * Suggests code or prompt fixes based on error messages
  * Auto-generates or updates documentation if behavior changes

Each CLI command should be cleanly separated in its own module and support async handling, consistent logging, and CLI argument validation.

---

### ⚙️ MCP Server Orchestration: `mcp-orchestration`

Provide:

* Docker Compose configuration for `sei-mcp-server`
* Auto-wire RPC/REST endpoints to SEI EVM
* Load wallet keys from `.env` securely
* Script for testnet faucet funding requests

---

### 🤖 Agent Behavior Core: `saiso-core`

Implement:

* Base ElizaOS agent setup with `plugin-sei`
* Behavior registry loaded from project structure
* Agent lifecycle hooks (pre-run validation, post-run logs, webhook deploy alert)
* Agent self-debugging logic that:

  * Parses logs for common errors
  * Maps problems to known prompt/code issues
  * Offers suggestion output (stdout or as markdown file)

---

### 🧰 Templates

#### `templates/agent/`

* Fully working SEI EVM Eliza agent skeleton
* Integrated `.env` with MCP + wallet config
* Scripts for `start`, `dev`, and `test`
* Pre-configured logging and docs folder

#### `templates/features/`

* `send_tokens/` — prompts and code to send SEI to any EVM wallet address
* `query_balance/` — behavior that checks wallet balance and formats result
* `interact_contract/` — behavior that performs contract method call with args
* `check_network_status/` — queries SEI EVM block height and network health
* `track_transactions/` — monitors a wallet address for recent transactions
* `copy_activity/` — copy a wallet activity with some defined configurations, for example it the wallet swaps 100 usdc for a token we should be able to swap accordingly to a config for our funds.
* `stake_tokens/` — sends staking transactions to validators (if supported)
* `get_contract_events/` — queries or subscribes to smart contract events
* `multi_send/` — batch sends SEI to multiple wallet addresses
* `gas_estimation/` — estimates gas usage for upcoming transactions
* `auto_swap/` — integrates with an EVM DEX to swap SEI with another token

Each feature includes:

* Source code module
* Corresponding prompt or plugin call
* Jest test case stub
* Docs entry stub

---

### ✅ GitHub Actions CI: `.github/workflows/saiso.yml`

CI/CD template that:

* Boots ephemeral MCP server
* Runs `saiso test`
* Validates behavior registry
* Fails on prompt mismatch or plugin runtime error
* On success, deploys to staging environment (optional)

---

### 🧠 Expected Agent Autonomy

Ensure agents can:

* Analyze logs and identify common issues
* Generate suggestions for fixing prompt/code conflicts
* Automatically write or update documentation (markdown)
* Push deployment notifications via webhook

---

### 🧩 Output Instructions

Your output must use **Node.js + TypeScript only**. All code must be modular, typed, and organized using template-driven scaffolding. Avoid monolithic CLI scripts — use a clean command architecture with future-proof extension paths.

**Begin building.**
