# Local Strategy Test Harness (EVM Adapter)

This adapter overrides the generic local_strategy_test_harness implementation for EVM projects.

1. Keeps action signature parity.
2. Injects EVM-specific execution metadata.
3. Provides a dedicated extension point for chain-specific behavior.
