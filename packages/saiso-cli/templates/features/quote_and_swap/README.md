# Quote and Swap

## What It Adds

1. Provide quote to execute swap flow with policy-aware defaults
2. Normalized response envelope for SAISO workflow parity.
3. Dry-run friendly scaffold for iterative hardening.

## Usage

1. Install with saiso add quote_and_swap.
2. Invoke action QUOTE_AND_SWAP with chainFamily, payload, and optional policy overrides.
3. Extend handler internals with protocol-specific clients and execution paths.

## Output Contract

1. success
2. operation
3. chainFamily
4. data
5. meta
