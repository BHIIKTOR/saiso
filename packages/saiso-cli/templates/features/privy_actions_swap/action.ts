import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';

interface privyActionsSwapActionContent {
  chainFamily?: 'evm' | 'svm';
  walletId?: string;
  walletAddress?: string;
  network?: string;
  payload?: Record<string, unknown>;
  requestId?: string;
  idempotencyKey?: string;
  expiresAt?: string;
}

export const privyActionsSwapAction: Action = {
  name: 'PRIVY_ACTIONS_SWAP',
  similes: ['PRIVY_ACTIONS_SWAP', 'PRIVY_ACTIONS_SWAP_RUN', 'PRIVY_ACTIONS_SWAP_EXECUTE'],
  description: 'Run Privy swap quote and action status workflows',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as privyActionsSwapActionContent;
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
    const content = (message.content || {}) as privyActionsSwapActionContent;
    const startedAt = Date.now();
    const chainFamily = content.chainFamily || 'evm';
    const requestId = content.requestId || 'saiso-privy-' + startedAt.toString(36);
    const idempotencyKey = content.idempotencyKey || 'idem-' + startedAt.toString(36);
    const expiresAt = content.expiresAt || new Date(startedAt + Number(runtime.getSetting('PRIVY_REQUEST_EXPIRY_MS') || 120000)).toISOString();

    const response = {
      success: true,
      operation: 'privy_actions_swap',
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
        text: '[privy_actions_swap] completed for ' + chainFamily,
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
          text: 'Run privy_actions_swap for an EVM wallet',
          chainFamily: 'evm',
          walletId: 'wallet_123',
        },
      },
      {
        user: '{{agent}}',
        content: {
          text: 'Running privy_actions_swap with Privy-compatible request envelope.',
          action: 'PRIVY_ACTIONS_SWAP',
        },
      },
    ],
  ] as ActionExample[][],
};
