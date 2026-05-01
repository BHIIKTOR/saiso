import { Action, IAgentRuntime, Memory, State, HandlerCallback } from '@elizaos/core';

interface TxLifecycleManagerContent {
  signature?: string;
  txHash?: string;
  commitment?: 'processed' | 'confirmed' | 'finalized';
  requestId?: string;
}

interface JsonRpcResponse<T> {
  result?: T;
  error?: { code: number; message: string };
}

function readSetting(runtime: IAgentRuntime, key: string, fallback = ''): string {
  const value = runtime.getSetting(key);
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function requireSignature(content: TxLifecycleManagerContent): string {
  const signature = content.signature || content.txHash;
  if (typeof signature !== 'string' || signature.trim().length < 32) {
    throw new Error('signature is required');
  }
  return signature.trim();
}

async function rpc<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
  });
  const body = await response.text();
  const parsed = body ? JSON.parse(body) as JsonRpcResponse<T> : {};
  if (!response.ok || parsed.error) {
    throw new Error(parsed.error?.message || `RPC ${method} failed with HTTP ${response.status}`);
  }
  return parsed.result as T;
}

export const txLifecycleManagerAction: Action = {
  name: 'TX_LIFECYCLE_MANAGER',
  similes: ['TX_LIFECYCLE_MANAGER', 'SVM_TX_STATUS', 'SIGNATURE_STATUS'],
  description: 'Track SVM signature pending, failed, confirmed, and finalized states',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as TxLifecycleManagerContent;
    return Boolean(content.signature || content.txHash);
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: any,
    callback?: HandlerCallback
  ) => {
    const content = (message.content || {}) as TxLifecycleManagerContent;
    const startedAt = Date.now();
    const requestId = content.requestId || 'saiso-svm-tx-' + startedAt.toString(36);

    try {
      const rpcUrl = readSetting(runtime, 'RPC_URL');
      if (!rpcUrl) {
        throw new Error('RPC_URL is required');
      }
      const signature = requireSignature(content);
      const commitment = content.commitment || 'confirmed';
      const statusResult = await rpc<{ value: Array<Record<string, unknown> | null> }>(
        rpcUrl,
        'getSignatureStatuses',
        [[signature], { searchTransactionHistory: true }]
      );
      const status = statusResult.value?.[0] || null;
      const err = status?.err;
      const confirmationStatus = status?.confirmationStatus as string | undefined;
      const stateName = !status
        ? 'pending'
        : err
          ? 'failed'
          : confirmationStatus === 'finalized'
            ? 'finalized'
            : confirmationStatus === 'confirmed'
              ? 'confirmed'
              : 'processed';

      const transaction = status
        ? await rpc<Record<string, unknown> | null>(rpcUrl, 'getTransaction', [
            signature,
            { commitment, maxSupportedTransactionVersion: 0 },
          ]).catch(() => null)
        : null;

      const response = {
        success: true,
        operation: 'tx_lifecycle_manager',
        chainFamily: 'svm',
        data: {
          adapter: 'svm',
          signature,
          state: stateName,
          slot: status?.slot,
          confirmations: status?.confirmations,
          confirmationStatus,
          err,
          status,
          transaction,
        },
        meta: {
          requestId,
          latencyMs: Date.now() - startedAt,
        },
      };

      if (callback) {
        callback({ text: '[tx_lifecycle_manager] SVM transaction state resolved', content: response });
      }
      return response;
    } catch (error) {
      const response = {
        success: false,
        operation: 'tx_lifecycle_manager',
        chainFamily: 'svm',
        error: {
          code: 'tx_lifecycle_failed',
          message: error instanceof Error ? error.message : String(error),
        },
        meta: {
          requestId,
          latencyMs: Date.now() - startedAt,
        },
      };
      if (callback) {
        callback({ text: '[tx_lifecycle_manager] SVM transaction lookup failed', content: response });
      }
      return response;
    }
  },
  examples: [],
};
