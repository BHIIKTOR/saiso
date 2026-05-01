import { describe, it, expect, mock } from 'bun:test';
import { privyPolicyControlsAction } from './action';

describe('privy_policy_controls action scaffold', () => {
  it('returns standardized Privy response envelope', async () => {
    const runtime = {
      getSetting: mock((_key: string) => undefined),
    } as any;

    const result = await privyPolicyControlsAction.handler(
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
    expect(result.operation).toBe('privy_policy_controls');
    expect(result.chainFamily).toBe('svm');
    expect(result.requestId).toBeDefined();
    expect(result.meta.idempotencyKey).toBeDefined();
    expect(result.meta.expiresAt).toBeDefined();
  });
});
