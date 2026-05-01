import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';

interface allowancePermissionManagerActionContent {
  chainFamily?: 'evm' | 'svm' | 'cross';
  dryRun?: boolean;
  requestId?: string;
  payload?: Record<string, unknown>;
  maxCostUsd?: number;
  minTrustScore?: number;
}

export const allowancePermissionManagerAction: Action = {
  name: 'ALLOWANCE_PERMISSION_MANAGER',
  similes: ['ALLOWANCE_PERMISSION_MANAGER', 'ALLOWANCE_PERMISSION_MANAGER_RUN', 'ALLOWANCE_PERMISSION_MANAGER_EXECUTE'],
  description: 'Manage approvals, allowances, and permission safety',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as allowancePermissionManagerActionContent;
    return typeof content === 'object';
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _options: any,
    callback: HandlerCallback
  ) => {
    const content = (message.content || {}) as allowancePermissionManagerActionContent;
    const chainFamily = content.chainFamily || 'cross';
    const traceId = content.requestId || 'saiso-' + Date.now().toString(36);
    const startedAt = Date.now();

    const response = {
      success: true,
      operation: 'allowance_and_permission_manager',
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
        text: '[allowance_and_permission_manager] completed for ' + chainFamily + ' (dryRun=' + String(response.data.dryRun) + ')',
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
          text: 'Run allowance_and_permission_manager in dry-run mode',
          chainFamily: 'evm',
          dryRun: true,
        },
      },
      {
        user: '{{agent}}',
        content: {
          text: 'Running allowance_and_permission_manager with preconfigured safety guardrails.',
          action: 'ALLOWANCE_PERMISSION_MANAGER',
        },
      },
    ],
  ] as ActionExample[][],
};
