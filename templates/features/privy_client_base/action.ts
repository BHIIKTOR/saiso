import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';

interface PrivyClientBaseActionContent {
  chainFamily?: 'evm' | 'svm';
  payload?: Record<string, unknown>;
  requestId?: string;
  idempotencyKey?: string;
  expiresAt?: string;
}

export const privyClientBaseAction: Action = {
  name: 'PRIVY_CLIENT_BASE',
  similes: ['PRIVY_CLIENT_BASE', 'PRIVY_BASE_CLIENT', 'PRIVY_FOUNDATION'],
  description: 'Provide shared Privy client/auth/retry/idempotency foundation for wallet features',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as PrivyClientBaseActionContent;
    return typeof content === 'object' && content !== null;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: any,
    callback?: HandlerCallback
  ) => {
    const content = (message.content || {}) as PrivyClientBaseActionContent;
    const startedAt = Date.now();
    const requestId = content.requestId || 'saiso-privy-base-' + startedAt.toString(36);
    const idempotencyKey = content.idempotencyKey || 'idem-base-' + startedAt.toString(36);
    const expiresAt = content.expiresAt || new Date(startedAt + Number(runtime.getSetting('PRIVY_REQUEST_EXPIRY_MS') || 120000)).toISOString();
    const appId = runtime.getSetting('PRIVY_APP_ID');
    const appSecret = runtime.getSetting('PRIVY_APP_SECRET');

    const response = {
      success: Boolean(appId && appSecret),
      operation: 'privy_client_base',
      chainFamily: content.chainFamily || 'evm',
      requestId,
      data: {
        configured: Boolean(appId && appSecret),
        baseUrl: String(runtime.getSetting('PRIVY_BASE_URL') || 'https://api.privy.io/v1'),
        timeoutMs: Number(runtime.getSetting('PRIVY_REQUEST_TIMEOUT_MS') || 30000),
        retryMaxAttempts: Number(runtime.getSetting('PRIVY_RETRY_MAX_ATTEMPTS') || 3),
        retryBaseDelayMs: Number(runtime.getSetting('PRIVY_RETRY_BASE_DELAY_MS') || 200),
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
        text: '[privy_client_base] ready',
        content: response as any,
      });
    }

    return response as any;
  },
  examples: [] as ActionExample[][],
};
