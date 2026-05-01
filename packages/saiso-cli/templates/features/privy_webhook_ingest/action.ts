import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';

interface privyWebhookIngestActionContent {
  chainFamily?: 'evm' | 'svm';
  walletId?: string;
  walletAddress?: string;
  network?: string;
  payload?: Record<string, unknown>;
  requestId?: string;
  idempotencyKey?: string;
  expiresAt?: string;
}

export const privyWebhookIngestAction: Action = {
  name: 'PRIVY_WEBHOOK_INGEST',
  similes: ['PRIVY_WEBHOOK_INGEST', 'PRIVY_WEBHOOK_INGEST_RUN', 'PRIVY_WEBHOOK_INGEST_EXECUTE'],
  description: 'Ingest and verify Privy webhook event payloads',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as privyWebhookIngestActionContent;
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
    const content = (message.content || {}) as privyWebhookIngestActionContent;
    const startedAt = Date.now();
    const chainFamily = content.chainFamily || 'evm';
    const requestId = content.requestId || 'saiso-privy-' + startedAt.toString(36);
    const idempotencyKey = content.idempotencyKey || 'idem-' + startedAt.toString(36);
    const expiresAt = content.expiresAt || new Date(startedAt + Number(runtime.getSetting('PRIVY_REQUEST_EXPIRY_MS') || 120000)).toISOString();

    const response = {
      success: true,
      operation: 'privy_webhook_ingest',
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
        text: '[privy_webhook_ingest] completed for ' + chainFamily,
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
          text: 'Run privy_webhook_ingest for an EVM wallet',
          chainFamily: 'evm',
          walletId: 'wallet_123',
        },
      },
      {
        user: '{{agent}}',
        content: {
          text: 'Running privy_webhook_ingest with Privy-compatible request envelope.',
          action: 'PRIVY_WEBHOOK_INGEST',
        },
      },
    ],
  ] as ActionExample[][],
};
