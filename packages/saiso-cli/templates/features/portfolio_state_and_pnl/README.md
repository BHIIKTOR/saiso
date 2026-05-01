# Portfolio State and PnL

## What It Adds

1. Persist balances, allocation drift, and PnL snapshots
2. Normalized response envelope for SAISO workflow parity.
3. Dry-run friendly scaffold for iterative hardening.

## Usage

1. Install with saiso add portfolio_state_and_pnl.
2. Invoke action PORTFOLIO_STATE_AND_PNL with chainFamily, payload, and optional policy overrides.
3. Extend handler internals with protocol-specific clients and execution paths.

## Output Contract

1. success
2. operation
3. chainFamily
4. data
5. meta
