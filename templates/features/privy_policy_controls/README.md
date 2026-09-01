# Privy Policy Controls

## What It Adds

1. Manage policies, rules, condition sets, and key quorums.
2. Chain-agnostic action envelope for evm and svm.
3. Idempotency and request-expiry metadata for mutating workflows.

## Endpoint Surface

1. policies/*
2. policies/rules/*
3. condition-sets/*
4. key-quorums/*

## Usage

1. Install with `saiso add privy_policy_controls`.
2. Invoke action `PRIVY_POLICY_CONTROLS` with an operation (`create-policy`, `list-policies`, `create-rule`, `create-condition-set`, or `create-key-quorum`) and policy context.
3. Requires `PRIVY_APP_ID` and `PRIVY_APP_SECRET`.

## Output Contract

1. success
2. operation
3. chainFamily
4. requestId
5. data
6. meta.idempotencyKey
7. meta.expiresAt