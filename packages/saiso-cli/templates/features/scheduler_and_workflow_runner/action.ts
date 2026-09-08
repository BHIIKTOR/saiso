import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';

interface SchedulerWorkflowRunnerContent {
  chainFamily?: 'evm' | 'svm' | 'cross';
  dryRun?: boolean;
  requestId?: string;
  schedule?: {
    intervalMs?: number;
    maxRuns?: number;
  };
  workflow?: {
    id?: string;
    steps?: Array<{
      name?: string;
      action?: string;
    }>;
  };
  payload?: Record<string, unknown>;
}

function readNumber(runtime: IAgentRuntime, key: string, fallback: number): number {
  const value = runtime.getSetting(key);
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
    return fallback;
  }
  return typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN;
}

function planWorkflow(workflow: { id?: string; steps?: Array<{ name?: string; action?: string }> }) {
  const steps = (workflow.steps || []).map((step, index) => ({
    step: index + 1,
    name: step.name || `step-${index + 1}`,
    action: step.action || 'noop',
    status: 'planned' as const,
  }));
  return {
    workflowId: workflow.id || 'workflow-default',
    stepCount: steps.length,
    steps,
    status: steps.length > 0 ? 'planned' : 'empty',
  };
}

export const schedulerWorkflowRunnerAction: Action = {
  name: 'SCHEDULER_AND_WORKFLOW_RUNNER',
  similes: ['SCHEDULER_AND_WORKFLOW_RUNNER', 'SCHEDULER', 'WORKFLOW_RUNNER', 'CRON_RUNNER'],
  description: 'Plan multi-step workflows and validate schedules without executing actions',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as SchedulerWorkflowRunnerContent;
    return typeof content === 'object' && content !== null;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: any,
    callback?: HandlerCallback
  ) => {
    const content = (message.content || {}) as SchedulerWorkflowRunnerContent;
    const chainFamily = content.chainFamily || 'cross';
    const requestId = content.requestId || 'saiso-scheduler-' + Date.now().toString(36);
    const startedAt = Date.now();
    const intervalMs = content.schedule?.intervalMs ?? readNumber(runtime, 'SCHEDULER_INTERVAL_MS', 60000);
    const maxRuns = content.schedule?.maxRuns ?? readNumber(runtime, 'SCHEDULER_MAX_RUNS', 1);
    const workflow = content.workflow || content.payload?.workflow || {};
    const result = planWorkflow(workflow);
    const violations: string[] = [];
    if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0) {
      violations.push('intervalMs must be a positive safe integer');
    }
    if (!Number.isSafeInteger(maxRuns) || maxRuns <= 0) {
      violations.push('maxRuns must be a positive safe integer');
    }
    if (content.dryRun === false) {
      violations.push('Workflow execution is not supported; use dryRun: true to request a plan');
    }

    const response = {
      success: violations.length === 0,
      ...(violations.length > 0 ? { error: { code: 'workflow_plan_rejected', message: violations.join('; ') } } : {}),
      operation: 'scheduler_and_workflow_runner',
      chainFamily,
      data: {
        dryRun: true,
        violations,
        schedule: { intervalMs, maxRuns },
        workflow: result,
        payload: content.payload || {},
      },
      meta: {
        requestId,
        traceId: requestId,
        latencyMs: Date.now() - startedAt,
      },
    };

    if (callback) {
      callback({
        text: violations.length > 0
          ? `[scheduler_and_workflow_runner] rejected: ${violations.join('; ')}`
          : `[scheduler_and_workflow_runner] workflow '${result.workflowId}' ${result.status} (${result.stepCount} steps)`,
        content: response as any,
      });
    }

    return response as any;
  },
  examples: [] as ActionExample[][],
};
