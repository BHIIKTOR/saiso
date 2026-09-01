# Portfolio State and PnL

## What It Adds

1. Compute position values, PnL (USD and percent), and total portfolio value.
2. Measure allocation drift against target weights.
3. Return a full portfolio snapshot with a normalized SAISO envelope.

## Inputs

- `balances`: array of `{ token, amount, priceUsd, costBasisUsd }` positions
- `targets`: map of `token -> targetWeightPercent`

## Usage

1. Install with `saiso add portfolio_state_and_pnl`.
2. Invoke action `PORTFOLIO_STATE_AND_PNL` with balances and optional target allocations.
3. The action returns computed state; it does not persist or fetch balances.

## Output Contract

1. success
2. operation
3. chainFamily
4. data.portfolio (positions, totalValueUsd, totalPnlUsd, allocations)
5. data.allocationDrift
6. meta