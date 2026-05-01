import { Action, IAgentRuntime, Memory, State, HandlerCallback } from '@elizaos/core';

interface localStrategyTestHarnessActionContent {
  dryRun?: boolean;
  payload?: Record<string, unknown>;
}

export const localStrategyTestHarnessAction: Action = {
  name: 'LOCAL_STRATEGY_TEST_HARNESS',
  similes: ['LOCAL_STRATEGY_TEST_HARNESS', 'LOCAL_STRATEGY_TEST_HARNESS_ADAPTER_SVM'],
  description: 'Run deterministic local strategy scenarios (SVM-specific adapter)',
  validate: async () => true,
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _options: any,
    callback: HandlerCallback
  ) => {
    const content = (message.content || {}) as localStrategyTestHarnessActionContent;

    const response = {
      success: true,
      operation: 'local_strategy_test_harness',
      chainFamily: 'svm',
      data: {
        adapter: 'svm',
        dryRun: content.dryRun !== false,
        payload: content.payload || {},
        chainId: Number(runtime.getSetting('CHAIN_ID') || 0),
        rpcUrl: String(runtime.getSetting('RPC_URL') || ''),
      },
      meta: {
        requestId: 'saiso-svm-' + Date.now().toString(36),
      },
    };

    if (callback) {
      callback({
        text: '[local_strategy_test_harness] SVM adapter path selected',
        content: response as any,
      });
    }

    return response as any;
  },
  examples: [],
};
