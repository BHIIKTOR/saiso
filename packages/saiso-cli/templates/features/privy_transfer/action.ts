import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';
import { createPrivyClient } from '../privy_client_base/client';

interface PrivyTransferContent {
  chainFamily?: 'evm' | 'svm';
  walletId?: string;
  network?: string;
  to?: string;
  asset?: string;
  amount?: string;
  tokenAddress?: string;
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

export const privyTransferAction: Action = {
  name: 'PRIVY_TRANSFER',
  similes: ['PRIVY_TRANSFER', 'PRIVY_SEND', 'PRIVY_WALLET_TRANSFER'],
  description: 'Submit Privy wallet transfers through an auditable action envelope',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as PrivyTransferContent;
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
    const content = (message.content || {}) as PrivyTransferContent;
    const startedAt = Date.now();
    const chainFamily = content.chainFamily || 'evm';
    const requestId = content.requestId || 'saiso-privy-transfer-' + startedAt.toString(36);
    const idempotencyKey = content.idempotencyKey || 'idem-transfer-' + startedAt.toString(36);
    const expiresAt = content.expiresAt || new Date(startedAt + Number(readSetting(runtime, 'PRIVY_REQUEST_EXPIRY_MS', '120000'))).toISOString();

    try {
      const walletId = content.walletId || readSetting(runtime, 'PRIVY_DEFAULT_WALLET_ID');
      if (!walletId) throw new Error('walletId or PRIVY_DEFAULT_WALLET_ID is required');
      const body = {
        chain_type: chainFamily === 'svm' ? 'solana' : 'ethereum',
        network: content.network,
        to: content.to,
        amount: content.amount,
        asset: content.asset,
        token_address: content.tokenAddress,
        ...content.payload,
      };
      if (!body.to || !body.amount) {
        throw new Error('to and amount are required');
      }
      const result = await createClient(runtime).request(`/wallets/${encodeURIComponent(walletId)}/transfers`, {
        method: 'POST',
        body,
        idempotencyKey,
        expiresAt,
      });
      const response = {
        success: true,
        operation: 'privy_transfer',
        chainFamily,
        requestId,
        data: { walletId, network: content.network, result },
        meta: { idempotencyKey, expiresAt, latencyMs: Date.now() - startedAt },
      };
      if (callback) callback({ text: '[privy_transfer] Privy transfer submitted', content: response as any });
      return response as any;
    } catch (error) {
      const response = {
        success: false,
        operation: 'privy_transfer',
        chainFamily,
        requestId,
        error: { code: 'privy_transfer_failed', message: error instanceof Error ? error.message : String(error) },
        meta: { idempotencyKey, expiresAt, latencyMs: Date.now() - startedAt },
      };
      if (callback) callback({ text: '[privy_transfer] Privy transfer failed', content: response as any });
      return response as any;
    }
  },
  examples: [] as ActionExample[][],
};
