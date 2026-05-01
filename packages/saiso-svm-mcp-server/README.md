# @saiso/svm-mcp-server

First-party SAISO SVM MCP server with canonical Solana/SVM operations for generated SAISO projects.

## Install

```bash
npm install @saiso/svm-mcp-server@rc
```

The package also exposes a binary:

```bash
saiso-svm-mcp-server --help
```

## What It Provides

- SVM account and balance query tools
- SVM transaction-oriented MCP surfaces for generated agents
- parity coverage for SAISO projects that need both EVM and SVM server families

Most users receive this package through SVM project templates:

```bash
npm install -g @saiso/cli@rc
saiso new my-svm-agent --template agent-svm --env testnet
```

## Repository

https://github.com/BHIIKTOR/saiso
