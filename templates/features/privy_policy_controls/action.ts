import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';
import { createPrivyClient } from '../privy_client_base/client';

interface PrivyPolicyControlsContent {
  chainFamily?: 'evm' | 'svm';
  operation?: 'create-policy' | 'list-policies' | 'create-rule' | 'create-condition-set' | 'create-key-quorum';
  policyId?: string;
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

export const privyPolicyControlsAction: Action = {
  name: 'PRIVY_POLICY_CONTROLS',
  similes: ['PRIVY_POLICY_CONTROLS', 'PRIVY_POLICY', 'PRIVY_RULES', 'PRIVY_KEY_QUORUM'],
  description: 'Manage policies, rules, condition sets, and key quorums',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as PrivyPolicyControlsContent;
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
    const content = (message.content || {}) as PrivyPolicyControlsContent;
    const startedAt = Date.now();
    const chainFamily = content.chainFamily || 'evm';
    const requestId = content.requestId || 'saiso-privy-policy-' + startedAt.toString(36);
    const idempotencyKey = content.idempotencyKey || 'idem-policy-' + startedAt.toString(36);
    const expiresAt = content.expiresAt || new Date(startedAt + Number(readSetting(runtime, 'PRIVY_REQUEST_EXPIRY_MS', '120000'))).toISOString();
    const operation = content.operation || 'create-policy';

    try {
      const client = createClient(runtime);
      let path = '/policies';
      let method: 'GET' | 'POST' = 'POST';
      let body: unknown = { ...content.payload };

      if (operation === 'list-policies') {
        path = '/policies';
        method = 'GET';
        body = undefined;
      } else if (operation === 'create-rule') {
        if (!content.policyId) throw new Error('policyId is required for create-rule');
        path = `/policies/${encodeURIComponent(content.policyId)}/rules`;
        method = 'POST';
      } else if (operation === 'create-condition-set') {
        path = '/condition-sets';
        method = 'POST';
      } else if (operation === 'create-key-quorum') {
        path = '/key-quorums';
        method = 'POST';
      }

      const result = await client.request(path, { method, body, idempotencyKey, expiresAt });
      const response = {
        success: true,
        operation: 'privy_policy_controls',
        chainFamily,
        requestId,
        data: { operation, policyId: content.policyId, result },
        meta: { idempotencyKey, expiresAt, latencyMs: Date.now() - startedAt },
      };
      if (callback) callback({ text: '[privy_policy_controls] Privy policy operation completed', content: response as any });
      return response as any;
    } catch (error) {
      const response = {
        success: false,
        operation: 'privy_policy_controls',
        chainFamily,
        requestId,
        error: { code: 'privy_policy_controls_failed', message: error instanceof Error ? error.message : String(error) },
        meta: { idempotencyKey, expiresAt, latencyMs: Date.now() - startedAt },
      };
      if (callback) callback({ text: '[privy_policy_controls] Privy policy operation failed', content: response as any });
      return response as any;
    }
  },
  examples: [] as ActionExample[][],
};