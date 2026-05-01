import { Action, IAgentRuntime, Memory, State, HandlerCallback } from '@elizaos/core';

interface TxLifecycleManagerContent {
  txHash?: string;
  hash?: string;
  requiredConfirmations?: number;
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

function requireTxHash(content: TxLifecycleManagerContent): string {
  const txHash = content.txHash || content.hash;
  if (typeof txHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    throw new Error('txHash must be a 32-byte EVM transaction hash');
  }
  return txHash;
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

export const txLifecycleManagerAction: Action = {
  name: 'TX_LIFECYCLE_MANAGER',
  similes: ['TX_LIFECYCLE_MANAGER', 'TX_STATUS', 'TX_FINALITY', 'TX_RECEIPT'],
  description: 'Track EVM transaction pending, mined, failed, confirmed, and finality states',
  validate: async (_runtime: IAgentRuntime, message: Memory) => {
    const content = (message.content || {}) as TxLifecycleManagerContent;
    return Boolean(content.txHash || content.hash);
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
    const requestId = content.requestId || 'saiso-evm-tx-' + startedAt.toString(36);

    try {
      const rpcUrl = readSetting(runtime, 'RPC_URL');
      if (!rpcUrl) {
        throw new Error('RPC_URL is required');
      }
      const txHash = requireTxHash(content);
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
      const stateName = !transaction && !receipt
        ? 'unknown'
        : !receipt
          ? 'pending'
          : failed
            ? 'failed'
            : confirmations >= requiredConfirmations
              ? 'finalized'
              : 'confirmed';

      const response = {
        success: true,
        operation: 'tx_lifecycle_manager',
        chainFamily: 'evm',
        data: {
          adapter: 'evm',
          txHash,
          state: stateName,
          latestBlock,
          minedBlock: receiptBlock,
          confirmations,
          requiredConfirmations,
          transaction,
          receipt,
        },
        meta: {
          requestId,
          latencyMs: Date.now() - startedAt,
        },
      };

      if (callback) {
        callback({ text: '[tx_lifecycle_manager] EVM transaction state resolved', content: response as any });
      }
      return response as any;
    } catch (error) {
      const response = {
        success: false,
        operation: 'tx_lifecycle_manager',
        chainFamily: 'evm',
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
        callback({ text: '[tx_lifecycle_manager] EVM transaction lookup failed', content: response as any });
      }
      return response as any;
    }
  },
  examples: [],
};
