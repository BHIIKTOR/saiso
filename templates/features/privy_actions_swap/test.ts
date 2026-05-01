import { describe, it, expect, mock } from 'bun:test';
import { privyActionsSwapAction } from './action';

describe('privy_actions_swap action scaffold', () => {
  it('returns standardized Privy response envelope', async () => {
    const runtime = {
      getSetting: mock((_key: string) => undefined),
    } as any;

    const result = await privyActionsSwapAction.handler(
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
    expect(result.operation).toBe('privy_actions_swap');
    expect(result.chainFamily).toBe('svm');
    expect(result.requestId).toBeDefined();
    expect(result.meta.idempotencyKey).toBeDefined();
    expect(result.meta.expiresAt).toBeDefined();
  });
});
