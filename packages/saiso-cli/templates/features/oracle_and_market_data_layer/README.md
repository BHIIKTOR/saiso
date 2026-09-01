# Oracle and Market Data Layer

## What It Adds

1. Normalize price and liquidity feeds with freshness checks.
2. Flag stale feeds against a configurable staleness threshold.
3. Return per-feed age and staleness with a normalized SAISO envelope.

## Inputs

- `feeds`: array of `{ symbol, price, timestamp, source }` entries
- `maxStalenessMs`: override the configured `ORACLE_MAX_STALENESS_MS` threshold

## Usage

1. Install with `saiso add oracle_and_market_data_layer`.
2. Invoke action `ORACLE_AND_MARKET_DATA_LAYER` with price feeds.
3. The action returns normalized feeds; it does not fetch live market data.

## Output Contract

1. success
2. operation
3. chainFamily
4. data.feeds
5. data.staleCount
6. data.maxStalenessMs
7. meta