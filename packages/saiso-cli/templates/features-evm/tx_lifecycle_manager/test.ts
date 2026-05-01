import { afterEach, describe, it, expect, mock } from 'bun:test';
import { txLifecycleManagerAction } from './action';

const originalFetch = globalThis.fetch;
const txHash = '0x' + '1'.repeat(64);

function installEvmRpcMock() {
  globalThis.fetch = mock(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const result = body.method === 'eth_getTransactionByHash'
      ? { hash: txHash, blockNumber: '0xa' }
      : body.method === 'eth_getTransactionReceipt'
        ? { transactionHash: txHash, status: '0x1', blockNumber: '0xa' }
        : '0x14';
    return { ok: true, status: 200, text: async () => JSON.stringify({ jsonrpc: '2.0', id: body.id, result }) };
  }) as any;
}

describe('tx_lifecycle_manager evm adapter', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('classifies a finalized EVM transaction', async () => {
    installEvmRpcMock();
    const runtime = {
      getSetting: mock((key: string) => key === 'RPC_URL' ? 'https://rpc.example' : undefined),
    } as any;

    const result = await txLifecycleManagerAction.handler(
      runtime,
      { content: { txHash, requiredConfirmations: 2 } } as any,
      {} as any,
      {} as any,
      undefined as any
    );

    expect(result.success).toBe(true);
    expect(result.chainFamily).toBe('evm');
    expect(result.data.state).toBe('finalized');
    expect(result.data.confirmations).toBe(11);
  });

  it('classifies failed EVM receipts', async () => {
    globalThis.fetch = mock(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      const result = body.method === 'eth_getTransactionByHash'
        ? { hash: txHash, blockNumber: '0xa' }
        : body.method === 'eth_getTransactionReceipt'
          ? { transactionHash: txHash, status: '0x0', blockNumber: '0xa' }
          : '0x14';
      return { ok: true, status: 200, text: async () => JSON.stringify({ jsonrpc: '2.0', id: body.id, result }) };
    }) as any;
    const runtime = { getSetting: mock((key: string) => key === 'RPC_URL' ? 'https://rpc.example' : undefined) } as any;

    const result = await txLifecycleManagerAction.handler(
      runtime,
      { content: { txHash } } as any,
      {} as any,
      {} as any,
      undefined as any
    );

    expect(result.success).toBe(true);
    expect(result.data.state).toBe('failed');
  });
});
