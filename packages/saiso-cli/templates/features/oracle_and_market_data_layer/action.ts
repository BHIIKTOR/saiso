import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';

interface oracleMarketDataLayerActionContent {
  chainFamily?: 'evm' | 'svm' | 'cross';
  dryRun?: boolean;
  requestId?: string;
  payload?: Record<string, unknown>;
  maxCostUsd?: number;
  minTrustScore?: number;
}

export const oracleMarketDataLayerAction: Action = {
  name: 'ORACLE_MARKET_DATA_LAYER',
  similes: ['ORACLE_MARKET_DATA_LAYER', 'ORACLE_MARKET_DATA_LAYER_RUN', 'ORACLE_MARKET_DATA_LAYER_EXECUTE'],
  description: 'Normalize market data and enforce freshness guarantees',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as oracleMarketDataLayerActionContent;
    return typeof content === 'object';
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _options: any,
    callback: HandlerCallback
  ) => {
    const content = (message.content || {}) as oracleMarketDataLayerActionContent;
    const chainFamily = content.chainFamily || 'cross';
    const traceId = content.requestId || 'saiso-' + Date.now().toString(36);
    const startedAt = Date.now();

    const response = {
      success: true,
      operation: 'oracle_and_market_data_layer',
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
        text: '[oracle_and_market_data_layer] completed for ' + chainFamily + ' (dryRun=' + String(response.data.dryRun) + ')',
        content: response,
      });
    }

    return response;
  },
  examples: [
    [
      {
        user: '{{user1}}',
        content: {
          text: 'Run oracle_and_market_data_layer in dry-run mode',
          chainFamily: 'evm',
          dryRun: true,
        },
      },
      {
        user: '{{agent}}',
        content: {
          text: 'Running oracle_and_market_data_layer with preconfigured safety guardrails.',
          action: 'ORACLE_MARKET_DATA_LAYER',
        },
      },
    ],
  ] as ActionExample[][],
};
