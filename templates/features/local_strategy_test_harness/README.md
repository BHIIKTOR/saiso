# Local Strategy Test Harness

## What It Adds

1. Run deterministic strategy scenarios for local validation
2. Normalized response envelope for SAISO workflow parity.
3. Dry-run friendly scaffold for iterative hardening.

## Usage

1. Install with saiso add local_strategy_test_harness.
2. Invoke action LOCAL_STRATEGY_TEST_HARNESS with chainFamily, payload, and optional policy overrides.
3. Extend handler internals with protocol-specific clients and execution paths.

## Output Contract

1. success
2. operation
3. chainFamily
4. data
5. meta
