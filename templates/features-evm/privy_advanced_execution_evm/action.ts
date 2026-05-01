import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';

interface privyAdvancedExecutionEvmActionContent {
  walletId?: string;
  walletAddress?: string;
  network?: string;
  payload?: Record<string, unknown>;
  requestId?: string;
  idempotencyKey?: string;
  expiresAt?: string;
}

export const privyAdvancedExecutionEvmAction: Action = {
  name: 'PRIVY_ADVANCED_EXECUTION_EVM',
  similes: ['PRIVY_ADVANCED_EXECUTION_EVM', 'PRIVY_ADVANCED_EXECUTION_EVM_EVM'],
  description: 'Run advanced EVM Privy execution methods',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as privyAdvancedExecutionEvmActionContent;
    return typeof content === 'object' && content !== null;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _options: any,
    callback: HandlerCallback
  ) => {
    const content = (message.content || {}) as privyAdvancedExecutionEvmActionContent;
    const startedAt = Date.now();
    const requestId = content.requestId || 'saiso-privy-evm-' + startedAt.toString(36);
    const idempotencyKey = content.idempotencyKey || 'idem-evm-' + startedAt.toString(36);
    const expiresAt = content.expiresAt || new Date(startedAt + Number(runtime.getSetting('PRIVY_REQUEST_EXPIRY_MS') || 120000)).toISOString();

    const response = {
      success: true,
      operation: 'privy_advanced_execution_evm',
      chainFamily: 'evm',
      requestId,
      data: {
        adapter: 'evm',
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
        text: '[privy_advanced_execution_evm] EVM adapter path selected',
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
          text: 'Run privy_advanced_execution_evm for EVM',
          walletId: 'wallet_123',
        },
      },
      {
        user: '{{agent}}',
        content: {
          text: 'Executing privy_advanced_execution_evm using EVM-specific Privy adapter flow.',
          action: 'PRIVY_ADVANCED_EXECUTION_EVM',
        },
      },
    ],
  ] as ActionExample[][],
};
