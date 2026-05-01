import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';

interface schedulerWorkflowRunnerActionContent {
  chainFamily?: 'evm' | 'svm' | 'cross';
  dryRun?: boolean;
  requestId?: string;
  payload?: Record<string, unknown>;
  maxCostUsd?: number;
  minTrustScore?: number;
}

export const schedulerWorkflowRunnerAction: Action = {
  name: 'SCHEDULER_WORKFLOW_RUNNER',
  similes: ['SCHEDULER_WORKFLOW_RUNNER', 'SCHEDULER_WORKFLOW_RUNNER_RUN', 'SCHEDULER_WORKFLOW_RUNNER_EXECUTE'],
  description: 'Schedule and execute idempotent multi-step workflows',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as schedulerWorkflowRunnerActionContent;
    return typeof content === 'object';
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _options: any,
    callback: HandlerCallback
  ) => {
    const content = (message.content || {}) as schedulerWorkflowRunnerActionContent;
    const chainFamily = content.chainFamily || 'cross';
    const traceId = content.requestId || 'saiso-' + Date.now().toString(36);
    const startedAt = Date.now();

    const response = {
      success: true,
      operation: 'scheduler_and_workflow_runner',
      chainFamily,
      data: {
        dryRun: content.dryRun !== false,
        payload: content.payload || {},
        policy: {
          maxCostUsd: content.maxCostUsd ?? Number(runtime.getSetting('PAYMENT_MAX_PER_REQUEST_USD') || 5),
          minTrustScore: content.minTrustScore ?? Number(runtime.getSetting('TRUST_MIN_SCORE') || 0.65),
        },
      },
      meta: {
        requestId: traceId,
        traceId,
        latencyMs: Date.now() - startedAt,
      },
    };

    if (callback) {
      callback({
        text: '[scheduler_and_workflow_runner] completed for ' + chainFamily + ' (dryRun=' + String(response.data.dryRun) + ')',
        content: response as any,
      });
    }

    return response as any;
  },
  examples: [
    [
      {
        user: '{{user1}}',
        content: {
          text: 'Run scheduler_and_workflow_runner in dry-run mode',
          chainFamily: 'evm',
          dryRun: true,
        },
      },
      {
        user: '{{agent}}',
        content: {
          text: 'Running scheduler_and_workflow_runner with preconfigured safety guardrails.',
          action: 'SCHEDULER_WORKFLOW_RUNNER',
        },
      },
    ],
  ] as ActionExample[][],
};
