# Scheduler and Workflow Runner

## What It Adds

1. Run interval and checkpointed multi-step workflows
2. Normalized response envelope for SAISO workflow parity.
3. Dry-run friendly scaffold for iterative hardening.

## Usage

1. Install with saiso add scheduler_and_workflow_runner.
2. Invoke action SCHEDULER_AND_WORKFLOW_RUNNER with chainFamily, payload, and optional policy overrides.
3. Extend handler internals with protocol-specific clients and execution paths.

## Output Contract

1. success
2. operation
3. chainFamily
4. data
5. meta
