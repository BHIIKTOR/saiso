# Quote and Swap (EVM Adapter)

This adapter overrides the generic quote_and_swap implementation for EVM projects.

1. Keeps action signature parity.
2. Injects EVM-specific execution metadata.
3. Provides a dedicated extension point for chain-specific behavior.
