# Transaction Lifecycle Manager (EVM Adapter)

This adapter overrides the generic tx_lifecycle_manager implementation for EVM projects.

1. Keeps action signature parity.
2. Injects EVM-specific execution metadata.
3. Provides a dedicated extension point for chain-specific behavior.
