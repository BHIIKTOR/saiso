# Observability and Incident Hooks

## What It Adds

1. Emit structured metrics, traces, and incident signals
2. Normalized response envelope for SAISO workflow parity.
3. Dry-run friendly scaffold for iterative hardening.

## Usage

1. Install with saiso add observability_and_incident_hooks.
2. Invoke action OBSERVABILITY_AND_INCIDENT_HOOKS with chainFamily, payload, and optional policy overrides.
3. Extend handler internals with protocol-specific clients and execution paths.

## Output Contract

1. success
2. operation
3. chainFamily
4. data
5. meta
