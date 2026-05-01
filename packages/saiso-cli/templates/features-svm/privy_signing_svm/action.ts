import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';
import { createPrivyClient } from '../../features/privy_client_base/client';

interface PrivySigningSvmContent {
  walletId?: string;
  method?: 'signMessage' | 'signTransaction';
  message?: string;
  transaction?: string | Record<string, unknown>;
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
  if (!appId || !appSecret) throw new Error('PRIVY_APP_ID and PRIVY_APP_SECRET are required');
  return createPrivyClient({
    appId,
    appSecret,
    baseUrl: readSetting(runtime, 'PRIVY_BASE_URL', 'https://api.privy.io/v1').replace(/\/$/, ''),
    timeoutMs: Number(readSetting(runtime, 'PRIVY_REQUEST_TIMEOUT_MS', '30000')),
    retryMaxAttempts: Number(readSetting(runtime, 'PRIVY_RETRY_MAX_ATTEMPTS', '3')),
    retryBaseDelayMs: Number(readSetting(runtime, 'PRIVY_RETRY_BASE_DELAY_MS', '200')),
  });
}

export const privySigningSvmAction: Action = {
  name: 'PRIVY_SIGNING_SVM',
  similes: ['PRIVY_SIGNING_SVM', 'PRIVY_SVM_SIGN', 'PRIVY_SOLANA_SIGN'],
  description: 'Sign SVM messages and transactions with Privy wallets',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as PrivySigningSvmContent;
    return typeof content === 'object' && content !== null;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: any,
    callback?: HandlerCallback
  ) => {
    const content = (message.content || {}) as PrivySigningSvmContent;
    const startedAt = Date.now();
    const requestId = content.requestId || 'saiso-privy-svm-sign-' + startedAt.toString(36);
    const idempotencyKey = content.idempotencyKey || 'idem-svm-sign-' + startedAt.toString(36);
    const expiresAt = content.expiresAt || new Date(startedAt + Number(readSetting(runtime, 'PRIVY_REQUEST_EXPIRY_MS', '120000'))).toISOString();

    try {
      const walletId = content.walletId || readSetting(runtime, 'PRIVY_DEFAULT_WALLET_ID');
      if (!walletId) throw new Error('walletId or PRIVY_DEFAULT_WALLET_ID is required');
      const method = content.method || (content.transaction ? 'signTransaction' : 'signMessage');
      const params = method === 'signTransaction'
        ? [content.transaction ?? content.payload?.transaction]
        : [content.message ?? content.payload?.message];
      if (params[0] === undefined) throw new Error('message, transaction, or payload is required');
      const result = await createClient(runtime).request(`/wallets/${encodeURIComponent(walletId)}/rpc`, {
        method: 'POST',
        body: { method, params },
        idempotencyKey,
        expiresAt,
      });
      const response = {
        success: true,
        operation: 'privy_signing_svm',
        chainFamily: 'svm',
        requestId,
        data: { adapter: 'svm', walletId, method, result },
        meta: { idempotencyKey, expiresAt, latencyMs: Date.now() - startedAt },
      };
      if (callback) callback({ text: '[privy_signing_svm] Privy SVM signature completed', content: response });
      return response;
    } catch (error) {
      const response = {
        success: false,
        operation: 'privy_signing_svm',
        chainFamily: 'svm',
        requestId,
        error: { code: 'privy_signing_svm_failed', message: error instanceof Error ? error.message : String(error) },
        meta: { idempotencyKey, expiresAt, latencyMs: Date.now() - startedAt },
      };
      if (callback) callback({ text: '[privy_signing_svm] Privy SVM signature failed', content: response });
      return response;
    }
  },
  examples: [] as ActionExample[][],
};
