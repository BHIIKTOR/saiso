import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';
import { createPrivyClient } from '../privy_client_base/client';

interface PrivyAccountsContent {
  chainFamily?: 'evm' | 'svm';
  operation?: 'create' | 'get' | 'list' | 'update' | 'balance';
  accountId?: string;
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

export const privyAccountsAction: Action = {
  name: 'PRIVY_ACCOUNTS',
  similes: ['PRIVY_ACCOUNTS', 'PRIVY_ACCOUNT_CREATE', 'PRIVY_ACCOUNT_GET', 'PRIVY_ACCOUNT_BALANCE'],
  description: 'Create and manage accounts plus account balance retrieval',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as PrivyAccountsContent;
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
    const content = (message.content || {}) as PrivyAccountsContent;
    const startedAt = Date.now();
    const chainFamily = content.chainFamily || 'evm';
    const requestId = content.requestId || 'saiso-privy-accounts-' + startedAt.toString(36);
    const idempotencyKey = content.idempotencyKey || 'idem-accounts-' + startedAt.toString(36);
    const expiresAt = content.expiresAt || new Date(startedAt + Number(readSetting(runtime, 'PRIVY_REQUEST_EXPIRY_MS', '120000'))).toISOString();
    const operation = content.operation || (content.accountId ? 'get' : 'create');

    try {
      const client = createClient(runtime);
      let path = '/accounts';
      let method: 'GET' | 'POST' | 'PATCH' = 'POST';
      let body: unknown = {
        chain_type: chainFamily === 'svm' ? 'solana' : 'ethereum',
        network: content.network,
        ...content.payload,
      };

      if (operation === 'get') {
        if (!content.accountId) throw new Error('accountId is required for get');
        path = `/accounts/${encodeURIComponent(content.accountId)}`;
        method = 'GET';
        body = undefined;
      } else if (operation === 'list') {
        path = '/accounts';
        method = 'GET';
        body = undefined;
      } else if (operation === 'update') {
        if (!content.accountId) throw new Error('accountId is required for update');
        path = `/accounts/${encodeURIComponent(content.accountId)}`;
        method = 'PATCH';
      } else if (operation === 'balance') {
        if (!content.accountId) throw new Error('accountId is required for balance');
        path = `/accounts/${encodeURIComponent(content.accountId)}/balance`;
        method = 'GET';
        body = undefined;
      }

      const result = await client.request(path, { method, body, idempotencyKey, expiresAt });
      const response = {
        success: true,
        operation: 'privy_accounts',
        chainFamily,
        requestId,
        data: { operation, accountId: content.accountId, network: content.network, result },
        meta: { idempotencyKey, expiresAt, latencyMs: Date.now() - startedAt },
      };
      if (callback) callback({ text: '[privy_accounts] Privy account operation completed', content: response as any });
      return response as any;
    } catch (error) {
      const response = {
        success: false,
        operation: 'privy_accounts',
        chainFamily,
        requestId,
        error: { code: 'privy_accounts_failed', message: error instanceof Error ? error.message : String(error) },
        meta: { idempotencyKey, expiresAt, latencyMs: Date.now() - startedAt },
      };
      if (callback) callback({ text: '[privy_accounts] Privy account operation failed', content: response as any });
      return response as any;
    }
  },
  examples: [] as ActionExample[][],
};