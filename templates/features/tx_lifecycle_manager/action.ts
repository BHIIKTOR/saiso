import { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionExample } from '@elizaos/core';

interface TxLifecycleManagerContent {
  chainFamily?: 'evm' | 'svm';
  txHash?: string;
  hash?: string;
  signature?: string;
  requiredConfirmations?: number;
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

function hexToNumber(value?: string | null): number | undefined {
  if (!value) return undefined;
  return Number.parseInt(value, 16);
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

async function inspectEvm(runtime: IAgentRuntime, content: TxLifecycleManagerContent) {
  const rpcUrl = readSetting(runtime, 'RPC_URL');
  if (!rpcUrl) throw new Error('RPC_URL is required');
  const txHash = content.txHash || content.hash;
  if (typeof txHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    throw new Error('txHash must be a 32-byte EVM transaction hash');
  }

  const requiredConfirmations = content.requiredConfirmations
    ?? Number(readSetting(runtime, 'TX_FINALITY_CONFIRMATIONS', '12'));
  const [transaction, receipt, latestBlockHex] = await Promise.all([
    rpc<Record<string, unknown> | null>(rpcUrl, 'eth_getTransactionByHash', [txHash]),
    rpc<Record<string, unknown> | null>(rpcUrl, 'eth_getTransactionReceipt', [txHash]),
    rpc<string>(rpcUrl, 'eth_blockNumber', []),
  ]);
  const latestBlock = hexToNumber(latestBlockHex) ?? 0;
  const receiptBlock = hexToNumber(receipt?.blockNumber as string | undefined);
  const confirmations = receiptBlock === undefined ? 0 : Math.max(0, latestBlock - receiptBlock + 1);
  const failed = receipt?.status === '0x0';
  const state = !transaction && !receipt
    ? 'unknown'
    : !receipt
      ? 'pending'
      : failed
        ? 'failed'
        : confirmations >= requiredConfirmations
          ? 'finalized'
          : 'confirmed';

  return {
    adapter: 'evm',
    txHash,
    state,
    latestBlock,
    minedBlock: receiptBlock,
    confirmations,
    requiredConfirmations,
    transaction,
    receipt,
  };
}

async function inspectSvm(runtime: IAgentRuntime, content: TxLifecycleManagerContent) {
  const rpcUrl = readSetting(runtime, 'RPC_URL');
  if (!rpcUrl) throw new Error('RPC_URL is required');
  const signature = content.signature || content.txHash;
  if (typeof signature !== 'string' || signature.trim().length < 32) {
    throw new Error('signature is required');
  }

  const statusResult = await rpc<{ value: Array<Record<string, unknown> | null> }>(
    rpcUrl,
    'getSignatureStatuses',
    [[signature.trim()], { searchTransactionHistory: true }]
  );
  const status = statusResult.value?.[0] || null;
  const err = status?.err;
  const confirmationStatus = status?.confirmationStatus as string | undefined;
  const state = !status
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
        signature.trim(),
        { commitment: content.commitment || 'confirmed', maxSupportedTransactionVersion: 0 },
      ]).catch(() => null)
    : null;

  return {
    adapter: 'svm',
    signature: signature.trim(),
    state,
    slot: status?.slot,
    confirmations: status?.confirmations,
    confirmationStatus,
    err,
    status,
    transaction,
  };
}

export const txLifecycleManagerAction: Action = {
  name: 'TX_LIFECYCLE_MANAGER',
  similes: ['TX_LIFECYCLE_MANAGER', 'TX_STATUS', 'TX_FINALITY', 'SIGNATURE_STATUS'],
  description: 'Track, classify, and manage transaction lifecycle states for EVM and SVM',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as TxLifecycleManagerContent;
    return Boolean(content.txHash || content.hash || content.signature);
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
    const requestId = content.requestId || 'saiso-tx-' + startedAt.toString(36);
    const chainFamily = content.chainFamily || (content.signature ? 'svm' : 'evm');

    try {
      const data = chainFamily === 'svm'
        ? await inspectSvm(runtime, content)
        : await inspectEvm(runtime, content);
      const response = {
        success: true,
        operation: 'tx_lifecycle_manager',
        chainFamily,
        data,
        meta: {
          requestId,
          latencyMs: Date.now() - startedAt,
        },
      };
      if (callback) {
        callback({ text: '[tx_lifecycle_manager] transaction state resolved', content: response });
      }
      return response;
    } catch (error) {
      const response = {
        success: false,
        operation: 'tx_lifecycle_manager',
        chainFamily,
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
        callback({ text: '[tx_lifecycle_manager] transaction lookup failed', content: response });
      }
      return response;
    }
  },
  examples: [] as ActionExample[][],
};
