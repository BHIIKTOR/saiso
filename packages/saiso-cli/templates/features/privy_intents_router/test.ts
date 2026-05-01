import { describe, it, expect, mock } from 'bun:test';
import { privyIntentsRouterAction } from './action';

describe('privy_intents_router action scaffold', () => {
  it('returns standardized Privy response envelope', async () => {
    const runtime = {
      getSetting: mock((_key: string) => undefined),
    } as any;

    const result = await privyIntentsRouterAction.handler(
      runtime,
      {
        content: {
          chainFamily: 'svm',
          walletId: 'wallet_abc',
          network: 'solana:mainnet',
          payload: { ok: true },
        },
      } as any,
      {} as any,
      {} as any,
      undefined as any
    );

    expect(result.success).toBe(true);
    expect(result.operation).toBe('privy_intents_router');
    expect(result.chainFamily).toBe('svm');
    expect(result.requestId).toBeDefined();
    expect(result.meta.idempotencyKey).toBeDefined();
    expect(result.meta.expiresAt).toBeDefined();
  });
});
