# Cross-Chain Intent Router

## What It Adds

1. Plan and execute intent paths across multiple chains
2. Normalized response envelope for SAISO workflow parity.
3. Dry-run friendly scaffold for iterative hardening.

## Usage

1. Install with saiso add cross_chain_intent_router.
2. Invoke action CROSS_CHAIN_INTENT_ROUTER with chainFamily, payload, and optional policy overrides.
3. Extend handler internals with protocol-specific clients and execution paths.

## Output Contract

1. success
2. operation
3. chainFamily
4. data
5. meta
