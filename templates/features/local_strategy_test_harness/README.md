# Local Strategy Test Harness

## What It Adds

1. Run deterministic buy/sell strategy scenarios for local validation.
2. Simulate a starting balance, apply trade steps, and report PnL.
3. Return a full trade ledger with a normalized SAISO envelope.

## Inputs

- `strategy`: strategy name (defaults to `STRATEGY_NAME` env or `default`)
- `scenario.name`: scenario label
- `scenario.steps`: array of `{ action: 'buy'|'sell'|'hold', price, amount }` steps

## Usage

1. Install with `saiso add local_strategy_test_harness`.
2. Invoke action `LOCAL_STRATEGY_TEST_HARNESS` with a scenario and optional strategy name.
3. The action returns simulated results; it does not place real trades.

## Output Contract

1. success
2. operation
3. chainFamily
4. data.scenario
5. data.result (initialBalance, finalBalance, pnl, tradeCount, trades)
6. meta