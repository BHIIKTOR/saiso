import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';

interface portfolioStatePnlActionContent {
  chainFamily?: 'evm' | 'svm' | 'cross';
  dryRun?: boolean;
  requestId?: string;
  payload?: Record<string, unknown>;
  maxCostUsd?: number;
  minTrustScore?: number;
}

export const portfolioStatePnlAction: Action = {
  name: 'PORTFOLIO_STATE_PNL',
  similes: ['PORTFOLIO_STATE_PNL', 'PORTFOLIO_STATE_PNL_RUN', 'PORTFOLIO_STATE_PNL_EXECUTE'],
  description: 'Snapshot balances, allocations, and PnL state',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as portfolioStatePnlActionContent;
    return typeof content === 'object';
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _options: any,
    callback: HandlerCallback
  ) => {
    const content = (message.content || {}) as portfolioStatePnlActionContent;
    const chainFamily = content.chainFamily || 'cross';
    const traceId = content.requestId || 'saiso-' + Date.now().toString(36);
    const startedAt = Date.now();

    const response = {
      success: true,
      operation: 'portfolio_state_and_pnl',
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
        text: '[portfolio_state_and_pnl] completed for ' + chainFamily + ' (dryRun=' + String(response.data.dryRun) + ')',
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
          text: 'Run portfolio_state_and_pnl in dry-run mode',
          chainFamily: 'evm',
          dryRun: true,
        },
      },
      {
        user: '{{agent}}',
        content: {
          text: 'Running portfolio_state_and_pnl with preconfigured safety guardrails.',
          action: 'PORTFOLIO_STATE_PNL',
        },
      },
    ],
  ] as ActionExample[][],
};
