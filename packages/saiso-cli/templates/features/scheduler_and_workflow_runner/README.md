# Scheduler and Workflow Planner

The `SCHEDULER_AND_WORKFLOW_RUNNER` action name is retained for compatibility. It plans workflows and validates schedule values; it does not execute actions, create checkpoints, or schedule background work.

## Inputs

- `dryRun`: omit or set to `true`. `false` is rejected.
- `schedule.intervalMs`: positive safe integer; defaults to `SCHEDULER_INTERVAL_MS`, or 60000 when unset/blank.
- `schedule.maxRuns`: positive safe integer; defaults to `SCHEDULER_MAX_RUNS`, or 1 when unset/blank.
- `workflow.id`: optional identifier.
- `workflow.steps`: array of `{ name, action }` descriptions.

## Output

A valid plan returns `success: true`, `data.schedule`, and `data.workflow`. Steps have status `planned`; workflow status is `planned` or `empty`. No action availability or execution success is implied.

An execution request or invalid schedule returns `success: false`, `error.code: workflow_plan_rejected`, and `data.violations`. Nothing is executed.

## Migration

Consumers that previously interpreted `completed` as evidence of execution must use this result only as a plan. Actual execution and checkpoint recovery are outside this feature's current scope.
