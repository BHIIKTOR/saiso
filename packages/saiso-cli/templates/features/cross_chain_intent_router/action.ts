import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';

interface crossChainIntentRouterActionContent {
  chainFamily?: 'evm' | 'svm' | 'cross';
  dryRun?: boolean;
  requestId?: string;
  payload?: Record<string, unknown>;
  maxCostUsd?: number;
  minTrustScore?: number;
}

export const crossChainIntentRouterAction: Action = {
  name: 'CROSS_CHAIN_INTENT_ROUTER',
  similes: ['CROSS_CHAIN_INTENT_ROUTER', 'CROSS_CHAIN_INTENT_ROUTER_RUN', 'CROSS_CHAIN_INTENT_ROUTER_EXECUTE'],
  description: 'Route intent-driven workflows across chains',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as crossChainIntentRouterActionContent;
    return typeof content === 'object';
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _options: any,
    callback: HandlerCallback
  ) => {
    const content = (message.content || {}) as crossChainIntentRouterActionContent;
    const chainFamily = content.chainFamily || 'cross';
    const traceId = content.requestId || 'saiso-' + Date.now().toString(36);
    const startedAt = Date.now();

    const response = {
      success: true,
      operation: 'cross_chain_intent_router',
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
        text: '[cross_chain_intent_router] completed for ' + chainFamily + ' (dryRun=' + String(response.data.dryRun) + ')',
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
          text: 'Run cross_chain_intent_router in dry-run mode',
          chainFamily: 'evm',
          dryRun: true,
        },
      },
      {
        user: '{{agent}}',
        content: {
          text: 'Running cross_chain_intent_router with preconfigured safety guardrails.',
          action: 'CROSS_CHAIN_INTENT_ROUTER',
        },
      },
    ],
  ] as ActionExample[][],
};
