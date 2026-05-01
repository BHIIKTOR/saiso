# Oracle and Market Data Layer

## What It Adds

1. Normalize prices and liquidity feeds with freshness checks
2. Normalized response envelope for SAISO workflow parity.
3. Dry-run friendly scaffold for iterative hardening.

## Usage

1. Install with saiso add oracle_and_market_data_layer.
2. Invoke action ORACLE_AND_MARKET_DATA_LAYER with chainFamily, payload, and optional policy overrides.
3. Extend handler internals with protocol-specific clients and execution paths.

## Output Contract

1. success
2. operation
3. chainFamily
4. data
5. meta
