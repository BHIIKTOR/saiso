# SAISO Installation Guide

## Global CLI Installation

SAISO can be installed as a global CLI tool for easy access from anywhere on your system.

### Method 1: Install from npm (Recommended)

```bash
# Install the scoped CLI package
npm install -g @saiso/cli

# Verify installation
saiso --help

# Create your first project
saiso new my-agent --env testnet
```

### Method 2: Local Development Installation

If you're contributing to SAISO or want to use the latest development version:

```bash
# Clone the repository
git clone https://github.com/bhiktor/saiso.git
cd saiso

# Install dependencies and build
bun install
bun run build

# Link the CLI globally
cd packages/saiso-cli
npm link

# Verify installation
saiso --help
```

### Method 3: GitHub Development Install

```bash
# Install directly from the repository
npm install -g github:bhiktor/saiso#packages/saiso-cli
```

## Usage

After installation, you can use the `saiso` command from anywhere:

```bash
# Create a new agent project
saiso new my-trading-bot --env testnet

# Navigate to your project
cd my-trading-bot

# Install dependencies
bun install

# Configure your environment
cp .env.example .env
# Edit .env with your PRIVATE_KEY

# Start development
saiso dev
```

## Available Commands

- `saiso new <project-name>` - Create a new EVM/SVM agent project
- `saiso dev` - Start development environment with MCP server
- `saiso config` - Manage project configuration
- `saiso add <feature>` - Add feature templates to your project
- `saiso add --list` - List all available features (includes Privy pack features)
- `saiso test` - Run test workflows
- `saiso switch-env <env>` - Switch between environments with safety checks
- `saiso mcp ...` - Manage MCP servers and run paid/trust-aware calls
- `saiso env ...` - Generate and validate server environment templates
- `saiso identity ...` - Build, validate, and sync discovery metadata
- `saiso policy validate` - Validate runtime policy files
- `saiso receipts` - Inspect payment receipts
- `saiso docker ...` - Run docker diagnostics and runtime lifecycle commands

## Privy Feature Quickstart

After creating a project, add Privy support in this order:

```bash
saiso add privy_client_base
saiso add privy_wallet_lifecycle
saiso add privy_balance_and_history
saiso add privy_transfer
```

Then add chain-specific signing:

```bash
# EVM projects
saiso add privy_signing_evm

# SVM projects
saiso add privy_signing_svm
```

Required env vars:

```bash
PRIVY_APP_ID=your_privy_app_id
PRIVY_APP_SECRET=your_privy_app_secret
```

## Uninstallation

To remove the global CLI:

```bash
# If installed via npm
npm uninstall -g @saiso/cli

# If installed via npm link
npm unlink -g saiso
```

## Troubleshooting

### Permission Issues

If you encounter permission errors during global installation:

```bash
# Use npx instead of global install
npx @saiso/cli new my-agent

# Or configure npm to use a different directory
npm config set prefix ~/.local
export PATH=~/.local/bin:$PATH
```

### Node.js Version

SAISO requires Node.js v18 or higher. Check your version:

```bash
node --version
```

If you need to update Node.js, visit [nodejs.org](https://nodejs.org/) or use a version manager like [nvm](https://github.com/nvm-sh/nvm).

### Dependencies

SAISO works best with [Bun](https://bun.sh/) but also supports npm:

```bash
# Install Bun (recommended)
curl -fsSL https://bun.sh/install | bash

# Or use npm (built into Node.js)
# No additional installation needed
```

## Support

- [GitHub Issues](https://github.com/bhiktor/saiso/issues)
- [Documentation](https://github.com/bhiktor/saiso#readme)
- [Examples](https://github.com/bhiktor/saiso/tree/main/examples)
