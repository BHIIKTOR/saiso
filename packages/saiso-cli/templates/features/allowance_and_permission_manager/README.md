# Allowance and Permission Manager

## What It Adds

1. Manage token approvals and permissions with safety guardrails
2. Normalized response envelope for SAISO workflow parity.
3. Dry-run friendly scaffold for iterative hardening.

## Usage

1. Install with saiso add allowance_and_permission_manager.
2. Invoke action ALLOWANCE_AND_PERMISSION_MANAGER with chainFamily, payload, and optional policy overrides.
3. Extend handler internals with protocol-specific clients and execution paths.

## Output Contract

1. success
2. operation
3. chainFamily
4. data
5. meta
