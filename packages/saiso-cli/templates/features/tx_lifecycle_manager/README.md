# Transaction Lifecycle Manager

## What It Adds

1. Track pending, replacement, finality, and failure lifecycle states
2. Normalized response envelope for SAISO workflow parity.
3. Dry-run friendly scaffold for iterative hardening.

## Usage

1. Install with saiso add tx_lifecycle_manager.
2. Invoke action TX_LIFECYCLE_MANAGER with chainFamily, payload, and optional policy overrides.
3. Extend handler internals with protocol-specific clients and execution paths.

## Output Contract

1. success
2. operation
3. chainFamily
4. data
5. meta
