# Allowance and Permission Manager

## What It Adds

1. Evaluate token approval and permission requests against safety guardrails.
2. Enforce a maximum allowance in USD, a token allowlist, and a spender blocklist.
3. Return a deterministic approved/blocked decision with a normalized SAISO envelope.

## Inputs

- `operation`: `check` (default), `grant`, `revoke`, or `list`
- `token`: token identifier to approve
- `spender`: spender address to authorize
- `amount`: allowance amount in USD
- `maxAllowanceUsd`: override the configured `ALLOWANCE_MAX_USD` cap
- `allowedTokens` / `blockedSpenders`: inline allow/block lists (merged with env config)

## Usage

1. Install with `saiso add allowance_and_permission_manager`.
2. Invoke action `ALLOWANCE_AND_PERMISSION_MANAGER` with chainFamily, token/spender context, and optional policy overrides.
3. The action returns a decision; it does not submit on-chain approvals.

## Output Contract

1. success
2. operation
3. chainFamily
4. data.operation
5. data.decision
6. data.policy
7. meta