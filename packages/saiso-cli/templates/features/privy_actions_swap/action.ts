import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';
import { randomUUID } from 'node:crypto';
import { createPrivyClient } from '../privy_client_base/client';

interface PrivyActionsSwapContent {
  chainFamily?: 'evm' | 'svm';
  operation?: 'quote' | 'execute' | 'status';
  walletId?: string;
  actionId?: string;
  fromToken?: string;
  toToken?: string;
  amount?: string;
  network?: string;
  payload?: Record<string, unknown>;
  requestId?: string;
  idempotencyKey?: string;
  expiresAt?: string;
  authorizationSignature?: string;
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

export const privyActionsSwapAction: Action = {
  name: 'PRIVY_ACTIONS_SWAP',
  similes: ['PRIVY_ACTIONS_SWAP', 'PRIVY_SWAP', 'PRIVY_SWAP_QUOTE', 'PRIVY_SWAP_EXECUTE'],
  description: 'Quote token swaps, execute, and poll action status',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as PrivyActionsSwapContent;
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
    const content = (message.content || {}) as PrivyActionsSwapContent;
    const startedAt = Date.now();
    const chainFamily = content.chainFamily || 'evm';
    const requestId = content.requestId || 'saiso-privy-swap-' + startedAt.toString(36);
    const idempotencyKey = content.idempotencyKey || randomUUID();
    let expiresAt = content.expiresAt;
    const operation = content.operation || (content.actionId ? 'status' : 'quote');

    try {
      expiresAt ??= new Date(startedAt + Number(readSetting(runtime, 'PRIVY_REQUEST_EXPIRY_MS', '120000'))).toISOString();
      const client = createClient(runtime);
      if (!['quote', 'execute', 'status'].includes(operation)) throw new Error('Unsupported swap operation');
      if (!content.walletId) throw new Error('walletId is required for swap operations');
      let path = `/wallets/${encodeURIComponent(content.walletId)}/swap/quote`;
      let method: 'GET' | 'POST' = 'POST';
      let body: unknown = {
        source: { caip2: content.network, asset_address: content.fromToken },
        destination: { asset_address: content.toToken },
        base_amount: content.amount,
        amount_type: 'exact_input',
        ...content.payload,
      };

      if (operation === 'execute') {
        if (!content.walletId) throw new Error('walletId is required for execute');
        path = `/wallets/${encodeURIComponent(content.walletId)}/swap`;
        method = 'POST';
      } else if (operation === 'status') {
        if (!content.actionId) throw new Error('actionId is required for status');
        path = `/wallets/${encodeURIComponent(content.walletId)}/actions/${encodeURIComponent(content.actionId)}`;
        method = 'GET';
        body = undefined;
      }

      const headers = content.authorizationSignature ? { 'privy-authorization-signature': content.authorizationSignature } : undefined;
      const result = await client.request(path, { method, body, idempotencyKey, expiresAt, headers });
      const response = {
        success: true,
        operation: 'privy_actions_swap',
        chainFamily,
        requestId,
        data: { operation, walletId: content.walletId, actionId: content.actionId, network: content.network, result },
        meta: { idempotencyKey, expiresAt, latencyMs: Date.now() - startedAt },
      };
      if (callback) callback({ text: '[privy_actions_swap] Privy swap operation completed', content: response as any });
      return response as any;
    } catch (error) {
      const response = {
        success: false,
        operation: 'privy_actions_swap',
        chainFamily,
        requestId,
        error: { code: 'privy_actions_swap_failed', message: error instanceof Error ? error.message : String(error) },
        meta: { idempotencyKey, expiresAt, latencyMs: Date.now() - startedAt },
      };
      if (callback) callback({ text: '[privy_actions_swap] Privy swap operation failed', content: response as any });
      return response as any;
    }
  },
  examples: [] as ActionExample[][],
};
