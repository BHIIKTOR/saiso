import { afterEach, describe, it, expect, mock } from 'bun:test';
import { privyBalanceAndHistoryAction } from './action';

const originalFetch = globalThis.fetch;

describe('privy_balance_and_history action', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('retrieves balances for a Privy wallet', async () => {
    const fetchMock = mock(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ balances: [{ asset: 'ETH', amount: '1' }] }),
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

    const result = await privyBalanceAndHistoryAction.handler(
      runtime,
      { content: { walletId: 'wallet_123', operation: 'balances' } } as any,
      {} as any,
      {} as any,
      undefined as any
    );

    expect(result.success).toBe(true);
    expect(result.operation).toBe('privy_balance_and_history');
    expect(result.data.result.balances[0].asset).toBe('ETH');
    expect(String(fetchMock.mock.calls[0][0])).toContain('/wallets/wallet_123/balances');
  });

  it('returns a normalized error when Privy credentials are missing', async () => {
    const result = await privyBalanceAndHistoryAction.handler(
      { getSetting: mock(() => undefined) } as any,
      { content: { walletId: 'wallet_123' } } as any,
      {} as any,
      {} as any,
      undefined as any
    );

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('privy_balance_history_failed');
    expect(result.error.message).toContain('PRIVY_APP_ID');
  });
});
