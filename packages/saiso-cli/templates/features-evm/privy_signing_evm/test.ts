import { afterEach, describe, it, expect, mock } from 'bun:test';
import { privySigningEvmAction } from './action';

const originalFetch = globalThis.fetch;

describe('privy_signing_evm evm adapter', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('submits an EVM signing RPC request to Privy', async () => {
    const fetchMock = mock(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ signature: '0xsigned' }),
    })) as any;
    globalThis.fetch = fetchMock;
    const runtime = {
      getSetting: mock((key: string) => {
        if (key === 'PRIVY_APP_ID') return 'app';
        if (key === 'PRIVY_APP_SECRET') return 'secret';
        if (key === 'PRIVY_BASE_URL') return 'https://privy.example/v1';
        return undefined;
      }),
    } as any;

    const result = await privySigningEvmAction.handler(
      runtime,
      { content: { walletId: 'wallet_123', message: 'hello' } } as any,
      {} as any,
      {} as any,
      undefined as any
    );

    expect(result.success).toBe(true);
    expect(result.chainFamily).toBe('evm');
    expect(result.data.method).toBe('personal_sign');
    expect(String(fetchMock.mock.calls[0][0])).toContain('/wallets/wallet_123/rpc');
  });

  it('returns a normalized error when Privy credentials are missing', async () => {
    const result = await privySigningEvmAction.handler(
      { getSetting: mock(() => undefined) } as any,
      { content: { walletId: 'wallet_123', message: 'hello' } } as any,
      {} as any,
      {} as any,
      undefined as any
    );

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('privy_signing_evm_failed');
    expect(result.error.message).toContain('PRIVY_APP_ID');
  });
});
