# Scheduler and Workflow Runner

## What It Adds

1. Execute checkpointed multi-step workflows and report step status.
2. Validate schedule configuration (interval and max runs).
3. Return a workflow run summary with a normalized SAISO envelope.

## Inputs

- `schedule.intervalMs`: interval between runs (defaults to `SCHEDULER_INTERVAL_MS`)
- `schedule.maxRuns`: maximum runs (defaults to `SCHEDULER_MAX_RUNS`)
- `workflow.id`: workflow identifier
- `workflow.steps`: array of `{ name, action }` steps

## Usage

1. Install with `saiso add scheduler_and_workflow_runner`.
2. Invoke action `SCHEDULER_AND_WORKFLOW_RUNNER` with a workflow and optional schedule.
3. The action returns the run summary; it does not schedule background execution.

## Output Contract

1. success
2. operation
3. chainFamily
4. data.schedule
5. data.workflow (workflowId, stepCount, steps, status)
6. meta