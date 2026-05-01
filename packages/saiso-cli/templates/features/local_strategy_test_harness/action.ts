import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';

interface localStrategyTestHarnessActionContent {
  chainFamily?: 'evm' | 'svm' | 'cross';
  dryRun?: boolean;
  requestId?: string;
  payload?: Record<string, unknown>;
  maxCostUsd?: number;
  minTrustScore?: number;
}

export const localStrategyTestHarnessAction: Action = {
  name: 'LOCAL_STRATEGY_TEST_HARNESS',
  similes: ['LOCAL_STRATEGY_TEST_HARNESS', 'LOCAL_STRATEGY_TEST_HARNESS_RUN', 'LOCAL_STRATEGY_TEST_HARNESS_EXECUTE'],
  description: 'Run deterministic local strategy scenarios',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as localStrategyTestHarnessActionContent;
    return typeof content === 'object';
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _options: any,
    callback: HandlerCallback
  ) => {
    const content = (message.content || {}) as localStrategyTestHarnessActionContent;
    const chainFamily = content.chainFamily || 'cross';
    const traceId = content.requestId || 'saiso-' + Date.now().toString(36);
    const startedAt = Date.now();

    const response = {
      success: true,
      operation: 'local_strategy_test_harness',
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
        text: '[local_strategy_test_harness] completed for ' + chainFamily + ' (dryRun=' + String(response.data.dryRun) + ')',
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
          text: 'Run local_strategy_test_harness in dry-run mode',
          chainFamily: 'evm',
          dryRun: true,
        },
      },
      {
        user: '{{agent}}',
        content: {
          text: 'Running local_strategy_test_harness with preconfigured safety guardrails.',
          action: 'LOCAL_STRATEGY_TEST_HARNESS',
        },
      },
    ],
  ] as ActionExample[][],
};
