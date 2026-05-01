# @saiso/core

Core runtime modules used by generated SAISO projects and by `@saiso/cli`.

## Install

```bash
npm install @saiso/core@rc
```

## What It Provides

- configuration loading, validation, and environment helpers
- EVM and SVM MCP orchestration primitives
- Docker runtime helpers for local development flows
- x402 and MPP payment parsing, policy checks, and receipt storage
- identity and trust modules for discovery metadata and trust-aware routing
- service blueprint utilities used by generated agents and feature templates

## Usage

Most users consume this package through the CLI-generated project templates:

```bash
npm install -g @saiso/cli@rc
saiso new my-agent --env testnet
```

Direct package imports are intended for SAISO runtime integrations and custom template authors.

## Repository

https://github.com/BHIIKTOR/saiso
