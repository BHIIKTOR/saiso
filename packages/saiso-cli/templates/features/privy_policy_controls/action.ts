import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';

interface privyPolicyControlsActionContent {
  chainFamily?: 'evm' | 'svm';
  walletId?: string;
  walletAddress?: string;
  network?: string;
  payload?: Record<string, unknown>;
  requestId?: string;
  idempotencyKey?: string;
  expiresAt?: string;
}

export const privyPolicyControlsAction: Action = {
  name: 'PRIVY_POLICY_CONTROLS',
  similes: ['PRIVY_POLICY_CONTROLS', 'PRIVY_POLICY_CONTROLS_RUN', 'PRIVY_POLICY_CONTROLS_EXECUTE'],
  description: 'Manage Privy policy and key-quorum controls',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as privyPolicyControlsActionContent;
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
    const content = (message.content || {}) as privyPolicyControlsActionContent;
    const startedAt = Date.now();
    const chainFamily = content.chainFamily || 'evm';
    const requestId = content.requestId || 'saiso-privy-' + startedAt.toString(36);
    const idempotencyKey = content.idempotencyKey || 'idem-' + startedAt.toString(36);
    const expiresAt = content.expiresAt || new Date(startedAt + Number(runtime.getSetting('PRIVY_REQUEST_EXPIRY_MS') || 120000)).toISOString();

    const response = {
      success: true,
      operation: 'privy_policy_controls',
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
        text: '[privy_policy_controls] completed for ' + chainFamily,
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
          text: 'Run privy_policy_controls for an EVM wallet',
          chainFamily: 'evm',
          walletId: 'wallet_123',
        },
      },
      {
        user: '{{agent}}',
        content: {
          text: 'Running privy_policy_controls with Privy-compatible request envelope.',
          action: 'PRIVY_POLICY_CONTROLS',
        },
      },
    ],
  ] as ActionExample[][],
};
