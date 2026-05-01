# Quote and Swap (SVM Adapter)

This adapter overrides the generic quote_and_swap implementation for SVM projects.

1. Keeps action signature parity.
2. Injects SVM-specific execution metadata.
3. Provides a dedicated extension point for chain-specific behavior.
