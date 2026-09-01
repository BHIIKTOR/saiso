# SAISO

> A developer-first toolkit for building, testing, and deploying **EVM and SVM** agents using ElizaOS with concurrent MCP server orchestration.

**SAISO** combines local orchestration, agent-aware CI/CD automation, and autonomous feedback loops to create a seamless development pipeline for AI agents that interact with **multiple blockchain networks simultaneously**. Whether you're developing cross-chain trading bots, multi-network governance tools, or complex DeFi automation routines, **SAISO** gives your agents the infrastructure they need to thrive across EVM and SVM ecosystems.

---

## 🚀 Features

### 1. 🧪 Multi-Server Agent Lab (`saiso dev`)

Spin up a complete multi-chain testing environment with one command:

- **Concurrent MCP Servers:** Run multiple EVM/SVM MCP server instances concurrently
- **Smart Resource Management:** Automatic port allocation (3001-3100) with conflict detection
- **Multi-Chain Support:** EVM networks plus SVM (Solana) support
- **Environment-Variable Security:** No local key storage - environment variables only
- **Agent Memory Persistence:** Chain-agnostic memory preservation across server changes
- **Real-time Monitoring:** Health checks, status reporting, and graceful shutdown handling

### 2. 🔗 Concurrent Multi-Server Architecture

Revolutionary multi-server orchestration for complex agent workflows:

- **User-Defined Server Names:** Descriptive server naming (e.g., "svm-trading", "eth-defi", "weather-bot")
- **Individual Server Configs:** Isolated JSON configurations in `.saiso/servers/` directory
- **Server-Specific Environments:** Clean environment variable organization per server
- **Environment Safety:** Automatic testnet-only testing with mainnet protection.
- **Monorepo Support:** Turbo-powered builds with intelligent caching.

---

### 3. 🧠 Multi-Environment Configuration

#### Environment Management

- **Testnet (Default):** Safe development environment with automatic faucet integration
- **Mainnet:** Production environment with confirmation prompts and safety checks
- **Devnet:** Experimental features and latest protocol updates

#### Configuration Features

- **dotenv Integration:** Multiple `.env` files (`.env.testnet`, `.env.mainnet`, `.env.devnet`)
- **Environment Switching:** Safe switching with backup and validation
- **Private Key Management:** Secure handling with masking and validation
- **Network Validation:** Automatic RPC and chain ID verification

---

## 📦 Tech Stack

- **Agent Runtime:** [ElizaOS](https://github.com/elizaOS/eliza)
- **Blockchain Interface:** EVM and SVM MCP orchestration
- **Build System:** Bun + Turbo (monorepo with intelligent caching)
- **CLI Framework:** Commander.js with beautiful UX and interactive prompts
- **Configuration:** dotenv with multi-environment support
- **CI/CD:** GitHub Actions with automated testing

---

## ✅ Why Use SAISO?

| Benefit                | Description                                                 |
| ---------------------- | ----------------------------------------------------------- |
| Developer UX           | One-command setup for EVM/SVM agents with beautiful CLI     |
| Configuration Wizard   | Interactive setup with validation and network testing       |
| Reliability            | Multi-environment testing with automated validation         |
| Safety                 | Testnet-first development with mainnet confirmation prompts |
| Environment Management | Safe switching with backups and dry-run testing             |
| Extensibility          | Template-driven feature system ready for expansion          |
---

## 🛠️ Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [Bun](https://bun.sh/) (recommended) or npm

### Global Installation (Recommended)

```bash
# Install SAISO globally from npm
npm install -g @saiso/cli

# Verify installation
saiso --help

# Create your first agent
saiso new my-agent --env testnet

# Navigate to your project
cd my-agent
bun install

# Configure your environment
cp .env.example .env
# Edit .env and add your PRIVATE_KEY

# Start development
saiso dev
```

### Development Installation

For contributing or using the latest development version:

```bash
# Clone and build the toolkit
git clone https://github.com/BHIIKTOR/saiso.git
cd saiso
bun install
bun run build

# Link CLI globally for development
cd packages/saiso-cli
npm link

# Now you can use 'saiso' command anywhere
saiso new my-agent --env testnet
```

### Available Commands

```bash
saiso new <project-name>          # Create a new multi-chain agent project
saiso dev                         # Start development environment
saiso config                      # Enhanced configuration management with wizard
saiso add <feature>               # Add features to your agent
saiso switch-env <env>            # Safe environment switching with backups
saiso switch-server <type>        # Server switching with backup/restore
saiso mcp                         # Multi-server management commands
saiso env                         # Environment variable management per server
saiso identity                    # Build/validate ERC-8004 discovery metadata
saiso policy                      # Validate payment/trust policy files
saiso runtime transport list      # List chat transport capabilities
saiso runtime goal list           # List conversational goal-runner records
saiso runtime goal create <id> --title "..."   # Create a goal run
saiso runtime goal action <id> --type request-approval|approve|start|pause|cancel|fail|complete
saiso docker                      # Docker doctor/ps/clean runtime commands
saiso test                        # Run comprehensive test suite
saiso test localnet --chain evm   # Run Dockerized localnet integration flow
saiso test add                    # Add test templates to your project
saiso status                      # Show detailed MCP server status
saiso health                      # Health checks and network diagnostics
saiso receipts                    # Payment receipt summary (use --json for machine output)
```

#### Multi-Server Management

SAISO's multi-server architecture allows concurrent operation of multiple configured servers:

```bash
# Add servers with user-defined names
saiso mcp add --name "svm-trading" --type svm --network solana-mainnet
saiso mcp add --name "eth-defi" --type evm --network ethereum

# Server operations
saiso mcp list                      # List all configured servers
saiso mcp start svm-trading         # Start specific server
saiso mcp stop eth-defi             # Stop specific server
saiso mcp restart svm-trading       # Restart server
saiso mcp status --resources        # Show resource allocations
saiso mcp call --tool premium-simulate --params '{}' --min-trust-score 0.7 --max-cost-usd 0.5 --routing-profile balanced

# Environment management per server
saiso env generate svm-trading      # Generate .env template for server
saiso env validate                  # Validate all server environments
saiso env list --show-values        # List environment configuration
```

#### Enhanced Configuration Management

SAISO includes powerful configuration management with rich UX:

```bash
# Interactive configuration wizard
saiso config --wizard

# Validate current environment
saiso config --validate

# Test network connectivity
saiso config --test-network

# Get/set individual values
saiso config --get rpcUrl
saiso config --set privateKey=0x...
```

#### Safe Environment Switching

Advanced environment switching with comprehensive safety features:

```bash
# Switch with automatic backup
saiso switch-env mainnet --backup

# Dry-run to see what would change
saiso switch-env mainnet --dry-run

# Force switch (skip validation)
saiso switch-env testnet --force
```

### Available Features

SAISO now exposes a broader feature surface across execution, policy, observability, and Privy-backed wallet workflows.

List all installable features at any time:

```bash
saiso add --list
```

Core feature categories:

- **Execution and Routing**
  - `quote_and_swap`
  - `tx_lifecycle_manager`
  - `cross_chain_intent_router`
- **Safety and Policy**
  - `preflight_risk_checks`
  - `policy_guardrails_runtime`
  - `allowance_and_permission_manager`
- **State and Operations**
  - `portfolio_state_and_pnl`
  - `event_ingest_and_triggers`
  - `scheduler_and_workflow_runner`
  - `observability_and_incident_hooks`
  - `oracle_and_market_data_layer`
  - `local_strategy_test_harness`
- **Foundational wallet/network tools**
  - `query_balance`
  - `send_tokens`
  - `interact_contract`
  - `gas_estimation`
  - `check_network_status`

Privy feature pack:

- **Generic Privy workflows**
  - `privy_client_base`
  - `privy_wallet_lifecycle`
  - `privy_balance_and_history`
  - `privy_transfer`
  - `privy_actions_swap`
  - `privy_policy_controls`
  - `privy_intents_router`
  - `privy_webhook_ingest`
  - `privy_accounts`
- **EVM-specific Privy workflows**
  - `privy_signing_evm`
  - `privy_advanced_execution_evm`
- **SVM-specific Privy workflows**
  - `privy_signing_svm`

Quick install examples:

```bash
# Generic + parity-safe features
saiso add preflight_risk_checks
saiso add tx_lifecycle_manager
saiso add quote_and_swap

# Privy foundation + wallet flows
# Privy runtime features install privy_client_base automatically when needed.
saiso add privy_wallet_lifecycle
saiso add privy_transfer

# Chain-specific Privy signing
saiso add privy_signing_evm     # in EVM projects
saiso add privy_signing_svm     # in SVM projects
```

Detailed Privy documentation:

- `spec/privy-template-expansion-01/README.md`
- `docs/privy-feature-pack.md`
- `docs/template-live-provider-smokes.md`

Execution semantics:

- `quote_and_swap` fetches quotes by default. With `execute: true`, it builds an executable transaction payload but does not sign or broadcast.
- `tx_lifecycle_manager` is read-only and classifies pending, confirmed, finalized, failed, or unknown transaction state.
- `policy_guardrails_runtime`, `preflight_risk_checks`, and `allowance_and_permission_manager` are decision layers; they do not submit transactions.
- `cross_chain_intent_router` plans multi-step routes (prepare → bridge → settle) and validates cost budgets; it does not execute the route.
- `event_ingest_and_triggers` normalizes incoming events and matches them against configured trigger rules.
- `local_strategy_test_harness` runs deterministic buy/sell scenarios locally and reports simulated PnL.
- `observability_and_incident_hooks` emits structured metric/trace/incident signals with severity classification.
- `oracle_and_market_data_layer` normalizes price/liquidity feeds and flags stale data against a freshness threshold.
- `portfolio_state_and_pnl` computes position values, PnL, and allocation drift from provided balances and prices.
- `scheduler_and_workflow_runner` executes checkpointed multi-step workflows and reports step status.
- Privy signing, transfer, accounts, swap, intents, policy controls, and advanced EVM execution features call Privy APIs and can authorize or move real assets when configured with live credentials. Use sandbox credentials or quote/read-only flows for first validation.
- `privy_webhook_ingest` verifies webhook signatures (HMAC-SHA256) and dispatches typed events.
- `gas_estimation` reads RPC fee data and optional price APIs; it does not submit transactions.

---

## Docker Workflows

SAISO supports both MCP runtime modes:

- `npx` (default)
- `docker` (containerized MCP runtime)

### Docker Runtime Diagnostics

```bash
saiso docker doctor
saiso docker ps
saiso docker clean
```

### Start Dev with Docker MCP

```bash
saiso dev --mcp docker
```

Optional overrides:

```bash
saiso dev --mcp docker \
  --docker-image ghcr.io/mcpdotdirect/evm-mcp-server:latest \
  --docker-pull-policy if-not-present \
  --docker-network bridge
```

### EVM Localnet Testing (Foundry Anvil)

```bash
saiso test localnet --chain evm
```

Localnet test flow:

1. Boots Anvil in Docker
2. Waits for RPC readiness (`http://127.0.0.1:8545`)
3. Runs `localnet:setup`, `localnet:deploy`, `localnet:test` scripts when present
4. Falls back to Foundry (`forge`) conventions when configured
5. Tears down resources (or keep with `--keep-on-fail`)

---

## 🏗️ Project Structure

```
saiso/
├── packages/
│   ├── saiso-cli/           # CLI tool with all commands
│   ├── saiso-core/          # Core utilities and scaffolding
│   ├── saiso-plugin-sdk/    # Plugin SDK and manifest contracts
│   ├── saiso-svm-mcp-server/# First-party SVM MCP server
│   ├── heretic-saiso/       # Heretic plugin (chat relay, policy, state)
│   ├── heretic-saiso-protocol-client/  # Heretic daemon protocol client
│   └── heretic-saiso-runtime/          # Heretic runtime worker
│   └── (archived legacy packages under spec/old-saiso/archive/)
├── templates/
│   ├── agent-evm/          # EVM agent template
│   ├── agent-svm/          # SVM agent template
│   └── features/           # Feature templates
├── docs/                   # Operator and feature integration guides
├── examples/               # Usage examples and documentation
├── .github/workflows/      # CI/CD templates
└── README.md
```

---

## 🧪 Example Usage

### Creating a New Agent

```bash
# Interactive creation
saiso new my-agent

# Quick creation with options
saiso new trading-bot --env testnet --agent-name "TradingBot" --yes

# Create with deployable service blueprint
saiso new paid-service-agent --service-blueprint --yes
```

Service blueprint scaffolds include:

- `src/service.ts` paid endpoint host
- `GET /healthz` + `GET /readyz`
- `GET /.well-known/agent-registration.json`
- `POST /paid/tool` payment-aware MCP tool execution

### Identity Discovery (ERC-8004)

```bash
# Build registration from current project config
saiso identity build

# Validate generated registration
saiso identity validate

# Print derived registration JSON without writing files
saiso identity show

# Sync local registration from remote registry API
saiso identity sync --registry-base-url https://registry.example

# CI drift check (fails when local and remote differ)
saiso identity sync --registry-base-url https://registry.example --dry-run --strict
```

### Policy Validation

```bash
# Validate default policy files
saiso policy validate

# Strict mode fails if policy files are missing
saiso policy validate --strict
```

### Hardening Gates (CI Parity)

Run the same hard gates locally before release/merge:

```bash
npx tsc -p packages/saiso-core/tsconfig.json
npx tsc -p packages/saiso-cli/tsconfig.json
bun test packages/saiso-core/tests
bun test packages/saiso-cli/src
bun test packages/saiso-core/tests/service-blueprint.test.ts
node spec/saiso-v1.0/scripts/smoke-x402-mpp.mjs
saiso policy validate --strict \
  --payment-file spec/hardening-01/fixtures/policies/payment-policy.json \
  --trust-file spec/hardening-01/fixtures/policies/trust-policy.json
```

Required CI settings:

- `IDENTITY_DRIFT_CHECK` repository variable (set to `true` to enable strict identity drift gate).
- `IDENTITY_REGISTRY_BASE_URL`, `IDENTITY_AGENT_REGISTRY`, `IDENTITY_AGENT_ID` repository secrets (identity drift gate).
- `NPM_TOKEN` repository secret (publish workflow).

### Development Workflow

```bash
# Start development environment
saiso dev --env testnet --mcp npx

# Check configuration
saiso config --list

# Switch to mainnet (with safety prompts)
saiso switch-env mainnet
```

### Generated Project Features

- **Multi-environment configuration** with `.env.testnet`, `.env.mainnet`, `.env.devnet`
- **Complete ElizaOS integration** with character configuration
- **TypeScript setup** with proper module resolution
- **Comprehensive README** with usage instructions
- **Git integration** with proper `.gitignore`

---

## 🧩 Roadmap

### ✅ MVP Complete
- [x] CLI tool with project scaffolding
- [x] Multi-environment configuration management
- [x] MCP server orchestration (npx)
- [x] ElizaOS integration
- [x] GitHub Actions CI/CD templates
- [x] Expanded feature template implementation (core + ROI + Privy packs)
- [x] Advanced gas estimation with MEV protection
- [x] Network status monitoring and health checks
- [x] **Multi-Server Concurrent Architecture** - Revolutionary concurrent server orchestration
- [x] **Multi-Chain Environment Management** - Server-specific environment variables
- [x] **Agent Memory Persistence** - Chain-agnostic memory preservation
- [x] **Enhanced CLI Commands** - `saiso mcp` and `saiso env` command suites
- [x] Comprehensive documentation

### 🚧 Next Phase
- [x] Complete testing framework (`saiso test` command)
- [x] User agent testing suite with extensible test generation
- [x] Unit test coverage for all packages
- [x] Full feature template implementations (all 26 features with real logic)
- [ ] Behavior testing framework (partial: `saiso test add` generates agent/MCP/actions templates)
- [ ] Agent self-debugging capabilities
- [ ] Auto-documentation generation
- [ ] Advanced deployment automation

### 🔮 Future Extensions
- [ ] Additional EVM/SVM features (staking, DEX integration, etc.)
- [ ] Terraform module for cloud deployment
- [ ] Agent behavior registry
- [ ] Nix + Docker hybrid environments

---

## 🤝 Contributing

Pull requests, EVM/SVM plugins, behavior templates, and feedback are welcome!

### Development Setup

```bash
git clone https://github.com/BHIIKTOR/saiso.git
cd saiso
bun install
bun run build

# Test the CLI
cd packages/saiso-cli
node dist/cli.js --help
```

### Adding Features

The feature template system is ready for expansion. Each feature should include:
- Source code module
- ElizaOS action/evaluator integration
- Test cases
- Documentation

---

## 📄 License

MIT

---

Built with ❤️ by the saiso Team.

For questions, issues, or contributions, please visit our [GitHub repository](https://github.com/BHIIKTOR/saiso).
