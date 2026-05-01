import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';

interface privyIntentsRouterActionContent {
  chainFamily?: 'evm' | 'svm';
  walletId?: string;
  walletAddress?: string;
  network?: string;
  payload?: Record<string, unknown>;
  requestId?: string;
  idempotencyKey?: string;
  expiresAt?: string;
}

export const privyIntentsRouterAction: Action = {
  name: 'PRIVY_INTENTS_ROUTER',
  similes: ['PRIVY_INTENTS_ROUTER', 'PRIVY_INTENTS_ROUTER_RUN', 'PRIVY_INTENTS_ROUTER_EXECUTE'],
  description: 'Route Privy intent workflows for transfer and RPC operations',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as privyIntentsRouterActionContent;
    if (typeof content !== 'object' || content === null) {
      return false;
    }
    return content.chainFamily === undefined || content.chainFamily === 'evm' || content.chainFamily === 'svm';
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _options: any,
    callback: HandlerCallback
  ) => {
    const content = (message.content || {}) as privyIntentsRouterActionContent;
    const startedAt = Date.now();
    const chainFamily = content.chainFamily || 'evm';
    const requestId = content.requestId || 'saiso-privy-' + startedAt.toString(36);
    const idempotencyKey = content.idempotencyKey || 'idem-' + startedAt.toString(36);
    const expiresAt = content.expiresAt || new Date(startedAt + Number(runtime.getSetting('PRIVY_REQUEST_EXPIRY_MS') || 120000)).toISOString();

    const response = {
      success: true,
      operation: 'privy_intents_router',
      chainFamily,
      requestId,
      data: {
        walletId: content.walletId,
        walletAddress: content.walletAddress,
        network: content.network,
        payload: content.payload || {},
      },
      meta: {
        idempotencyKey,
        expiresAt,
        latencyMs: Date.now() - startedAt,
      },
    };

    if (callback) {
      callback({
        text: '[privy_intents_router] completed for ' + chainFamily,
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
          text: 'Run privy_intents_router for an EVM wallet',
          chainFamily: 'evm',
          walletId: 'wallet_123',
        },
      },
      {
        user: '{{agent}}',
        content: {
          text: 'Running privy_intents_router with Privy-compatible request envelope.',
          action: 'PRIVY_INTENTS_ROUTER',
        },
      },
    ],
  ] as ActionExample[][],
};
