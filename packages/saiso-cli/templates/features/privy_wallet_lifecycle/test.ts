import { afterEach, describe, it, expect, mock } from 'bun:test';
import { privyWalletLifecycleAction } from './action';

const originalFetch = globalThis.fetch;

function runtime() {
  return {
    getSetting: mock((key: string) => {
      if (key === 'PRIVY_APP_ID') return 'app';
      if (key === 'PRIVY_APP_SECRET') return 'secret';
      if (key === 'PRIVY_BASE_URL') return 'https://privy.example/v1';
      return undefined;
    }),
  } as any;
}

describe('privy_wallet_lifecycle action', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('creates a Privy wallet through the configured API', async () => {
    globalThis.fetch = mock(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 'wallet_123' }),
    })) as any;

    const result = await privyWalletLifecycleAction.handler(
      runtime(),
      { content: { chainFamily: 'evm', operation: 'create_wallet' } } as any,
      {} as any,
      {} as any,
      undefined as any
    );

    expect(result.success).toBe(true);
    expect(result.operation).toBe('privy_wallet_lifecycle');
    expect(result.data.result.id).toBe('wallet_123');
  });

  it('returns a normalized error when Privy credentials are missing', async () => {
    const result = await privyWalletLifecycleAction.handler(
      { getSetting: mock(() => undefined) } as any,
      { content: { operation: 'create_wallet' } } as any,
      {} as any,
      {} as any,
      undefined as any
    );

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('privy_wallet_lifecycle_failed');
    expect(result.error.message).toContain('PRIVY_APP_ID');
  });
});
