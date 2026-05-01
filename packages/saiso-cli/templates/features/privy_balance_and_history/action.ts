import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';
import { createPrivyClient } from '../privy_client_base/client';

interface PrivyBalanceAndHistoryContent {
  chainFamily?: 'evm' | 'svm';
  operation?: 'balances' | 'history' | 'transactions';
  walletId?: string;
  network?: string;
  asset?: string;
  limit?: number;
  cursor?: string;
  payload?: Record<string, unknown>;
  requestId?: string;
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

export const privyBalanceAndHistoryAction: Action = {
  name: 'PRIVY_BALANCE_AND_HISTORY',
  similes: ['PRIVY_BALANCE_AND_HISTORY', 'PRIVY_BALANCES', 'PRIVY_HISTORY', 'PRIVY_TRANSACTIONS'],
  description: 'Retrieve Privy wallet balances and transaction history',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as PrivyBalanceAndHistoryContent;
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
    const content = (message.content || {}) as PrivyBalanceAndHistoryContent;
    const startedAt = Date.now();
    const chainFamily = content.chainFamily || 'evm';
    const requestId = content.requestId || 'saiso-privy-balance-' + startedAt.toString(36);
    const operation = content.operation || 'balances';

    try {
      const walletId = content.walletId || readSetting(runtime, 'PRIVY_DEFAULT_WALLET_ID');
      if (!walletId) throw new Error('walletId or PRIVY_DEFAULT_WALLET_ID is required');
      const query = new URLSearchParams();
      if (content.network) query.set('network', content.network);
      if (content.asset) query.set('asset', content.asset);
      if (content.limit) query.set('limit', String(content.limit));
      if (content.cursor) query.set('cursor', content.cursor);
      const suffix = query.toString() ? `?${query.toString()}` : '';
      const path = operation === 'balances'
        ? `/wallets/${encodeURIComponent(walletId)}/balances${suffix}`
        : `/wallets/${encodeURIComponent(walletId)}/transactions${suffix}`;
      const result = await createClient(runtime).request(path);
      const response = {
        success: true,
        operation: 'privy_balance_and_history',
        chainFamily,
        requestId,
        data: { operation, walletId, network: content.network, result },
        meta: { latencyMs: Date.now() - startedAt },
      };
      if (callback) callback({ text: '[privy_balance_and_history] Privy wallet data retrieved', content: response as any });
      return response as any;
    } catch (error) {
      const response = {
        success: false,
        operation: 'privy_balance_and_history',
        chainFamily,
        requestId,
        error: { code: 'privy_balance_history_failed', message: error instanceof Error ? error.message : String(error) },
        meta: { latencyMs: Date.now() - startedAt },
      };
      if (callback) callback({ text: '[privy_balance_and_history] Privy wallet data retrieval failed', content: response as any });
      return response as any;
    }
  },
  examples: [] as ActionExample[][],
};
