import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';
import { createPrivyClient } from '../privy_client_base/client';

interface PrivyIntentsRouterContent {
  chainFamily?: 'evm' | 'svm';
  operation?: 'transfer' | 'rpc' | 'get' | 'list' | 'update-policy' | 'update-key-quorum';
  intentId?: string;
  walletId?: string;
  network?: string;
  to?: string;
  amount?: string;
  rpcRequest?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  requestId?: string;
  idempotencyKey?: string;
  expiresAt?: string;
}

function readSetting(runtime: IAgentRuntime, key: string, fallback = ''): string {
  const value = runtime.getSetting(key);
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function createClient(runtime: IAgentRuntime) {
  const appId = readSetting(runtime, 'PRIVY_APP_ID');
  const appSecret = readSetting(runtime, 'PRIVY_APP_SECRET');
  if (!appId || !appSecret) {
    throw new Error('PRIVY_APP_ID and PRIVY_APP_SECRET are required');
  }
  return createPrivyClient({
    appId,
    appSecret,
    baseUrl: readSetting(runtime, 'PRIVY_BASE_URL', 'https://api.privy.io/v1').replace(/\/$/, ''),
    timeoutMs: Number(readSetting(runtime, 'PRIVY_REQUEST_TIMEOUT_MS', '30000')),
    retryMaxAttempts: Number(readSetting(runtime, 'PRIVY_RETRY_MAX_ATTEMPTS', '3')),
    retryBaseDelayMs: Number(readSetting(runtime, 'PRIVY_RETRY_BASE_DELAY_MS', '200')),
  });
}

export const privyIntentsRouterAction: Action = {
  name: 'PRIVY_INTENTS_ROUTER',
  similes: ['PRIVY_INTENTS_ROUTER', 'PRIVY_INTENT', 'PRIVY_INTENT_TRANSFER', 'PRIVY_INTENT_RPC'],
  description: 'Create and route transfer or RPC intents with status polling',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as PrivyIntentsRouterContent;
    return typeof content === 'object' && content !== null
      && (content.chainFamily === undefined || content.chainFamily === 'evm' || content.chainFamily === 'svm');
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: any,
    callback?: HandlerCallback
  ) => {
    const content = (message.content || {}) as PrivyIntentsRouterContent;
    const startedAt = Date.now();
    const chainFamily = content.chainFamily || 'evm';
    const requestId = content.requestId || 'saiso-privy-intent-' + startedAt.toString(36);
    const idempotencyKey = content.idempotencyKey || 'idem-intent-' + startedAt.toString(36);
    const expiresAt = content.expiresAt || new Date(startedAt + Number(readSetting(runtime, 'PRIVY_REQUEST_EXPIRY_MS', '120000'))).toISOString();
    const operation = content.operation || (content.intentId ? 'get' : 'transfer');

    try {
      const client = createClient(runtime);
      let path = '/intents/transfer';
      let method: 'GET' | 'POST' | 'PATCH' = 'POST';
      let body: unknown = {
        chain_type: chainFamily === 'svm' ? 'solana' : 'ethereum',
        network: content.network,
        wallet_id: content.walletId,
        to: content.to,
        amount: content.amount,
        ...(content.payload as Record<string, unknown> | undefined),
      };

      if (operation === 'rpc') {
        path = '/intents/rpc';
        method = 'POST';
        body = {
          chain_type: chainFamily === 'svm' ? 'solana' : 'ethereum',
          network: content.network,
          wallet_id: content.walletId,
          rpc_request: content.rpcRequest,
          ...(content.payload as Record<string, unknown> | undefined),
        };
      } else if (operation === 'get') {
        if (!content.intentId) throw new Error('intentId is required for get');
        path = `/intents/${encodeURIComponent(content.intentId)}`;
        method = 'GET';
        body = undefined;
      } else if (operation === 'list') {
        path = '/intents';
        method = 'GET';
        body = undefined;
      } else if (operation === 'update-policy') {
        if (!content.intentId) throw new Error('intentId is required for update-policy');
        path = `/intents/${encodeURIComponent(content.intentId)}/policy`;
        method = 'PATCH';
      } else if (operation === 'update-key-quorum') {
        if (!content.intentId) throw new Error('intentId is required for update-key-quorum');
        path = `/intents/${encodeURIComponent(content.intentId)}/key-quorum`;
        method = 'PATCH';
      }

      const result = await client.request(path, { method, body, idempotencyKey, expiresAt });
      const response = {
        success: true,
        operation: 'privy_intents_router',
        chainFamily,
        requestId,
        data: { operation, intentId: content.intentId, walletId: content.walletId, network: content.network, result },
        meta: { idempotencyKey, expiresAt, latencyMs: Date.now() - startedAt },
      };
      if (callback) callback({ text: '[privy_intents_router] Privy intent operation completed', content: response as any });
      return response as any;
    } catch (error) {
      const response = {
        success: false,
        operation: 'privy_intents_router',
        chainFamily,
        requestId,
        error: { code: 'privy_intents_router_failed', message: error instanceof Error ? error.message : String(error) },
        meta: { idempotencyKey, expiresAt, latencyMs: Date.now() - startedAt },
      };
      if (callback) callback({ text: '[privy_intents_router] Privy intent operation failed', content: response as any });
      return response as any;
    }
  },
  examples: [] as ActionExample[][],
};