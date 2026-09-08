import { describe, it, expect, mock } from 'bun:test';
import { schedulerWorkflowRunnerAction } from './action';

describe('scheduler_and_workflow_runner action scaffold', () => {
  it('returns normalized workflow envelope', async () => {
    const runtime = {
      getSetting: mock((_key: string) => undefined),
    } as any;

    const message = {
      content: {
        chainFamily: 'evm',
        dryRun: true,
        payload: { foo: 'bar' },
      },
    } as any;

    const result = await schedulerWorkflowRunnerAction.handler(runtime, message, {} as any, {} as any, undefined as any);
    expect(result.success).toBe(true);
    expect(result.operation).toBe('scheduler_and_workflow_runner');
    expect(result.chainFamily).toBe('evm');
    expect(result.meta.requestId).toBeDefined();
  });
});

describe('scheduler_and_workflow_runner regression checks', () => {

  it('returns a plan with default schedule and never completes steps', async () => {
    const result = await schedulerWorkflowRunnerAction.handler({ getSetting: () => undefined } as any, { content: { workflow: { id: 'test', steps: [{ action: 'NON_EXISTENT_ACTION' }] } } } as any, undefined, {});
    expect(result.success).toBe(true);
    expect(result.data.schedule).toEqual({ intervalMs: 60000, maxRuns: 1 });
    expect(result.data.workflow.status).toBe('planned');
    expect(result.data.workflow.steps[0].status).toBe('planned');
  });

  it('rejects execution and invalid schedules', async () => {
    for (const content of [
      { dryRun: false, workflow: { steps: [{ action: 'NON_EXISTENT_ACTION' }] } },
      { schedule: { intervalMs: 0 } }, { schedule: { intervalMs: -1 } },
      { schedule: { maxRuns: 0 } }, { schedule: { maxRuns: 1.5 } },
      { schedule: { maxRuns: Infinity } },
    ]) {
      const result = await schedulerWorkflowRunnerAction.handler({ getSetting: () => undefined } as any, { content } as any, undefined, {});
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('workflow_plan_rejected');
      expect(result.data.workflow.status).not.toBe('completed');
    }
    const invalid = await schedulerWorkflowRunnerAction.handler({ getSetting: () => 'invalid' } as any, { content: {} } as any, undefined, {});
    expect(invalid.success).toBe(false);
  });
});
