import { afterEach, describe, it, expect, mock } from 'bun:test';
import { privyTransferAction } from './action';

const originalFetch = globalThis.fetch;

describe('privy_transfer action', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('submits a transfer request to Privy', async () => {
    const fetchMock = mock(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 'transfer_123', status: 'submitted' }),
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

    const result = await privyTransferAction.handler(
      runtime,
      { content: { walletId: 'wallet_123', to: '0xabc', amount: '0.01', asset: 'ETH' } } as any,
      {} as any,
      {} as any,
      undefined as any
    );

    expect(result.success).toBe(true);
    expect(result.operation).toBe('privy_transfer');
    expect(result.data.result.status).toBe('submitted');
    expect(String(fetchMock.mock.calls[0][0])).toContain('/wallets/wallet_123/transfers');
  });

  it('returns a normalized error when Privy credentials are missing', async () => {
    const result = await privyTransferAction.handler(
      { getSetting: mock(() => undefined) } as any,
      { content: { walletId: 'wallet_123', to: '0xabc', amount: '0.01' } } as any,
      {} as any,
      {} as any,
      undefined as any
    );

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('privy_transfer_failed');
    expect(result.error.message).toContain('PRIVY_APP_ID');
  });
});
