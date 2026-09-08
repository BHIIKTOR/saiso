import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';
import { randomUUID } from 'node:crypto';
import { createPrivyClient } from '../../features/privy_client_base/client';

interface PrivyAdvancedExecutionEvmContent {
  operation?: 'auth-signature' | 'user-operation' | 'send-call';
  walletId?: string;
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

export const privyAdvancedExecutionEvmAction: Action = {
  name: 'PRIVY_ADVANCED_EXECUTION_EVM',
  similes: ['PRIVY_ADVANCED_EXECUTION_EVM', 'PRIVY_7702', 'PRIVY_USER_OPERATION', 'PRIVY_SEND_CALL'],
  description: 'Run advanced EVM Privy execution methods (7702 auth, user operations, send-calls)',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as PrivyAdvancedExecutionEvmContent;
    return typeof content === 'object' && content !== null;
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: any,
    callback?: HandlerCallback
  ) => {
    const content = (message.content || {}) as PrivyAdvancedExecutionEvmContent;
    const startedAt = Date.now();
    const requestId = content.requestId || 'saiso-privy-evm-' + startedAt.toString(36);
    const idempotencyKey = content.idempotencyKey || randomUUID();
    let expiresAt = content.expiresAt;
    const operation = content.operation || 'auth-signature';

    try {
      expiresAt ??= new Date(startedAt + Number(readSetting(runtime, 'PRIVY_REQUEST_EXPIRY_MS', '120000'))).toISOString();
      const client = createClient(runtime);
      if (!['auth-signature', 'user-operation', 'send-call'].includes(operation)) throw new Error('Unsupported advanced EVM operation');
      if (!content.walletId) throw new Error('walletId is required for advanced EVM operations');
      if (!content.payload?.params) throw new Error('payload.params is required in Privy RPC format');
      const rpcMethod = operation === 'auth-signature' ? 'eth_sign7702Authorization'
        : operation === 'user-operation' ? 'eth_signUserOperation' : 'wallet_sendCalls';
      const path = `/wallets/${encodeURIComponent(content.walletId)}/rpc`;
      const body = { ...(operation === 'send-call' ? { caip2: content.network } : {}), ...content.payload, method: rpcMethod };
      const headers = content.authorizationSignature ? { 'privy-authorization-signature': content.authorizationSignature } : undefined;
      const result = await client.request(path, { method: 'POST', body, idempotencyKey, expiresAt, headers });
      const response = {
        success: true,
        operation: 'privy_advanced_execution_evm',
        chainFamily: 'evm',
        requestId,
        data: { operation, walletId: content.walletId, network: content.network, result },
        meta: { idempotencyKey, expiresAt, latencyMs: Date.now() - startedAt },
      };
      if (callback) callback({ text: '[privy_advanced_execution_evm] EVM advanced execution completed', content: response as any });
      return response as any;
    } catch (error) {
      const response = {
        success: false,
        operation: 'privy_advanced_execution_evm',
        chainFamily: 'evm',
        requestId,
        error: { code: 'privy_advanced_execution_evm_failed', message: error instanceof Error ? error.message : String(error) },
        meta: { idempotencyKey, expiresAt, latencyMs: Date.now() - startedAt },
      };
      if (callback) callback({ text: '[privy_advanced_execution_evm] EVM advanced execution failed', content: response as any });
      return response as any;
    }
  },
  examples: [] as ActionExample[][],
};
