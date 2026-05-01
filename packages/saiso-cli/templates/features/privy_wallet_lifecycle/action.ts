import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';
import { createPrivyClient } from '../privy_client_base/client';

interface PrivyWalletLifecycleContent {
  chainFamily?: 'evm' | 'svm';
  operation?: 'create_wallet' | 'get_wallet' | 'update_wallet' | 'delete_wallet';
  walletId?: string;
  walletAddress?: string;
  network?: string;
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

export const privyWalletLifecycleAction: Action = {
  name: 'PRIVY_WALLET_LIFECYCLE',
  similes: ['PRIVY_WALLET_LIFECYCLE', 'PRIVY_CREATE_WALLET', 'PRIVY_GET_WALLET', 'PRIVY_UPDATE_WALLET'],
  description: 'Create, query, update, and delete Privy wallets',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as PrivyWalletLifecycleContent;
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
    const content = (message.content || {}) as PrivyWalletLifecycleContent;
    const startedAt = Date.now();
    const chainFamily = content.chainFamily || 'evm';
    const requestId = content.requestId || 'saiso-privy-wallet-' + startedAt.toString(36);
    const idempotencyKey = content.idempotencyKey || 'idem-wallet-' + startedAt.toString(36);
    const expiresAt = content.expiresAt || new Date(startedAt + Number(readSetting(runtime, 'PRIVY_REQUEST_EXPIRY_MS', '120000'))).toISOString();
    const operation = content.operation || (content.walletId ? 'get_wallet' : 'create_wallet');

    try {
      const walletId = content.walletId || readSetting(runtime, 'PRIVY_DEFAULT_WALLET_ID');
      let path = '/wallets';
      let method = 'POST';
      let body: unknown = {
        chain_type: chainFamily === 'svm' ? 'solana' : 'ethereum',
        network: content.network,
        ...content.payload,
      };

      if (operation === 'get_wallet') {
        if (!walletId) throw new Error('walletId or PRIVY_DEFAULT_WALLET_ID is required');
        path = `/wallets/${encodeURIComponent(walletId)}`;
        method = 'GET';
        body = undefined;
      } else if (operation === 'update_wallet') {
        if (!walletId) throw new Error('walletId or PRIVY_DEFAULT_WALLET_ID is required');
        path = `/wallets/${encodeURIComponent(walletId)}`;
        method = 'PATCH';
      } else if (operation === 'delete_wallet') {
        if (!walletId) throw new Error('walletId or PRIVY_DEFAULT_WALLET_ID is required');
        path = `/wallets/${encodeURIComponent(walletId)}`;
        method = 'DELETE';
        body = undefined;
      }

      const result = await createClient(runtime).request(path, { method: method as any, body, idempotencyKey, expiresAt });
      const response = {
        success: true,
        operation: 'privy_wallet_lifecycle',
        chainFamily,
        requestId,
        data: { operation, walletId, walletAddress: content.walletAddress, network: content.network, result },
        meta: { idempotencyKey, expiresAt, latencyMs: Date.now() - startedAt },
      };
      if (callback) callback({ text: '[privy_wallet_lifecycle] Privy wallet operation completed', content: response });
      return response;
    } catch (error) {
      const response = {
        success: false,
        operation: 'privy_wallet_lifecycle',
        chainFamily,
        requestId,
        error: { code: 'privy_wallet_lifecycle_failed', message: error instanceof Error ? error.message : String(error) },
        meta: { idempotencyKey, expiresAt, latencyMs: Date.now() - startedAt },
      };
      if (callback) callback({ text: '[privy_wallet_lifecycle] Privy wallet operation failed', content: response });
      return response;
    }
  },
  examples: [] as ActionExample[][],
};
