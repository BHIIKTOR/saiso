# Preflight Risk Checks

## What It Adds

1. Run simulation and policy checks before execution
2. Normalized response envelope for SAISO workflow parity.
3. Dry-run friendly scaffold for iterative hardening.

## Usage

1. Install with saiso add preflight_risk_checks.
2. Invoke action PREFLIGHT_RISK_CHECKS with chainFamily, payload, and optional policy overrides.
3. Extend handler internals with protocol-specific clients and execution paths.

## Output Contract

1. success
2. operation
3. chainFamily
4. data
5. meta
