import { afterEach, describe, it, expect, mock } from 'bun:test';
import { txLifecycleManagerAction } from './action';

const originalFetch = globalThis.fetch;
const signature = '5'.repeat(88);

function installSvmRpcMock() {
  globalThis.fetch = mock(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const result = body.method === 'getSignatureStatuses'
      ? { value: [{ slot: 10, confirmations: null, confirmationStatus: 'finalized', err: null }] }
      : { slot: 10, transaction: { signatures: [signature] } };
    return { ok: true, status: 200, text: async () => JSON.stringify({ jsonrpc: '2.0', id: body.id, result }) };
  }) as any;
}

describe('tx_lifecycle_manager svm adapter', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('classifies a finalized SVM signature', async () => {
    installSvmRpcMock();
    const runtime = {
      getSetting: mock((key: string) => key === 'RPC_URL' ? 'https://solana-rpc.example' : undefined),
    } as any;

    const result = await txLifecycleManagerAction.handler(
      runtime,
      { content: { signature } } as any,
      {} as any,
      {} as any,
      undefined as any
    );

    expect(result.success).toBe(true);
    expect(result.chainFamily).toBe('svm');
    expect(result.data.state).toBe('finalized');
    expect(result.data.signature).toBe(signature);
  });

  it('classifies failed SVM signatures', async () => {
    globalThis.fetch = mock(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      const result = { value: [{ slot: 10, confirmations: 1, confirmationStatus: 'confirmed', err: { InstructionError: [0, 'Custom'] } }] };
      return { ok: true, status: 200, text: async () => JSON.stringify({ jsonrpc: '2.0', id: body.id, result }) };
    }) as any;
    const runtime = { getSetting: mock((key: string) => key === 'RPC_URL' ? 'https://solana-rpc.example' : undefined) } as any;

    const result = await txLifecycleManagerAction.handler(
      runtime,
      { content: { signature } } as any,
      {} as any,
      {} as any,
      undefined as any
    );

    expect(result.success).toBe(true);
    expect(result.data.state).toBe('failed');
  });
});
