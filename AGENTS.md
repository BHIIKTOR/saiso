# SAISO Agent Operator Notes

This file captures the highest-value context from recent implementation and live-testing work.

## Project Snapshot

- Project is `saiso` (v1.0.0-rc1), EVM-first with first-class SVM support.
- Active runtime server families are `evm` and `svm`.
- Payments are integrated in core for `x402` and `mpp`.
- Identity/trust modules are present with ERC-8004-aligned structures.
- SEI is not part of active runtime scope.

Key paths:

- `packages/saiso-core/src/mcp/`
- `packages/saiso-core/src/payments/`
- `packages/saiso-core/src/identity/`
- `packages/saiso-core/src/trust/`
- `packages/saiso-cli/src/commands/`
- `spec/saiso-v1.0/`

## Fast Local Workflow

Install + validate quickly:

```bash
bun install
npx tsc -p packages/saiso-core/tsconfig.json
npx tsc -p packages/saiso-cli/tsconfig.json
bun test packages/saiso-core/tests
```

Core payment connectivity smoke:

```bash
npm run smoke:staging:payments
```

Expected:

- x402 facilitator `/verify` and `/settle` return `400` (connectivity check contract)
- Tempo RPC responds (chain id `0x1079`)
- local MPP retry check settles `200`

Live paid smoke (scripted) now supports method-safe requests and flexible credential formats:

- object payload
- literal encoded header string
- explicit header map wrapper (`{"headers":{...}}`)

## What x402 + MPP Provide to SAISO

- Paid tool/API execution paths instead of hard-failing on `402 Payment Required`.
- Protocol-aware challenge parsing and credential retry:
  - x402: MCP `_meta` and HTTP style support.
  - MPP: HTTP `Payment` header flow plus MCP/JSON-RPC-compatible parsing.
- Policy guardrails before spend:
  - max per request
  - recipient allow/block lists
- Receipt persistence for audit + derived trust signals.
- Trust/routing can include payment reliability + trust score, not just capability matching.

## Live Testing Runbook (Efficient Path)

Use direct protocol tools for reliable live validation.

### x402 live

- Preferred: `x402-proxy fetch ...` against known x402 endpoints.
- Confirm `402 -> 200` and capture settlement transaction from `payment-response`.

### MPP live

- Use `mppx` with `MPPX_PRIVATE_KEY` (not `MPP_KEY`).
- For OpenAI-over-Tempo style endpoints, a successful paid request confirms funding/flow.

Example MPP probe:

```bash
MPPX_PRIVATE_KEY=<key> mppx https://openai.mpp.tempo.xyz/v1/chat/completions \
  -X POST \
  -J '{"model":"gpt-4.1-mini","messages":[{"role":"user","content":"Reply with exactly: saiso-live-mpp-ok"}]}' \
  -M deposit=2 \
  --format json
```

## Known Gaps and Workarounds

1. Tempo RPC balance reads are not always reliable for wallet accounting.
- Impact: `eth_getBalance` and some `eth_call` results can be placeholder/invalid for balance reporting.
- Workaround: verify Tempo wallet balances with explorer UI and confirm operability via successful paid MPP requests.

## Secrets and Wallet Handling

- Local wallet fixture exists at `spec/saiso-v1.0/.wallets.polygon.local.json`.
- Treat it as sensitive material.
- Never commit private keys or paste them into issues/PRs.
- Keep `.gitignore` protections intact for local wallet/env files.

## Release/Publish Workflow

Use release scripts in sequence:

```bash
node scripts/release/validate-release.mjs --version <version>
node scripts/release/smoke-pack-install.mjs --version <version>
```

Publish pipeline intent:

- publish `@saiso/core` first
- wait for npm index visibility
- publish `saiso` CLI after core resolves at target version

Workflow files:

- `.github/workflows/saso.yml`
- `.github/workflows/live-paid-smoke.yml`
- `.github/workflows/publish.yml`

## Practical Day-to-Day Defaults

- Default to EVM/SVM only.
- Prefer `npx` for fastest iteration, use `docker` for hermetic runtime and CI parity.
- Use `rg` for codebase search.
- Run `smoke:staging:payments` before deeper debugging.
- Use `saiso receipts --json` for machine-readable payment health snapshots.
- Validate container runtime with `saiso docker doctor`.
- Inspect SAISO containers with `saiso docker ps` and cleanup with `saiso docker clean`.
- Run hermetic localnet tests with `saiso test localnet --chain evm` (Foundry Anvil Docker flow).
- Routing now defaults to trust-aware behavior; use `saiso mcp call --min-trust-score <0-1> --max-cost-usd <n>` when you need explicit constraints.
- Use `--routing-profile trust-first|cost-first|balanced` for deterministic routing strategy overrides.
- Generate and validate discovery metadata with `saiso identity build` and `saiso identity validate`.
- Sync local discovery metadata from remote registry with `saiso identity sync --registry-base-url <url>`.
- For CI drift gates: `saiso identity sync --registry-base-url <url> --dry-run --strict`.
- Validate local policy files before paid runs: `saiso policy validate`.
- For template-based premium paid probes set `SAISO_PREMIUM_PROBE=true` with recipient + protocol credentials in env.
- For live paid verification, trust direct protocol probes over generic script wrappers when behavior diverges.

## Privy Docs and Workflow Defaults

- Privy plan/spec source: `spec/privy-template-expansion-01/README.md`.
- Detailed operator docs: `docs/privy-feature-pack.md`.
- Fast install baseline for Privy projects:
  1. `saiso add privy_client_base`
  2. `saiso add privy_wallet_lifecycle`
  3. `saiso add privy_balance_and_history`
  4. `saiso add privy_transfer`
- Chain-specific signing:
  - EVM: `saiso add privy_signing_evm`
  - SVM: `saiso add privy_signing_svm`
- Required env vars for Privy features:
  - `PRIVY_APP_ID`
  - `PRIVY_APP_SECRET`
