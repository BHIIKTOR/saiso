import { describe, it, expect, mock } from 'bun:test';
import { privyClientBaseAction } from './action';
import { createPrivyAuthHeader } from './auth';
import { retryWithBackoff } from './retry';

describe('privy_client_base scaffold', () => {
  it('returns base client envelope with idempotency metadata', async () => {
    const runtime = {
      getSetting: mock((key: string) => {
        if (key === 'PRIVY_BASE_URL') return 'https://api.privy.io/v1';
        if (key === 'PRIVY_APP_ID') return 'app';
        if (key === 'PRIVY_APP_SECRET') return 'secret';
        return undefined;
      }),
    } as any;

    const result = await privyClientBaseAction.handler(
      runtime,
      { content: { chainFamily: 'evm' } } as any,
      {} as any,
      {} as any,
      undefined as any
    );

    expect(result.success).toBe(true);
    expect(result.operation).toBe('privy_client_base');
    expect(result.meta.idempotencyKey).toBeDefined();
    expect(result.meta.expiresAt).toBeDefined();
  });

  it('builds a basic auth header', () => {
    const auth = createPrivyAuthHeader('app', 'secret');
    expect(auth.startsWith('Basic ')).toBe(true);
  });

  it('retries and succeeds on second attempt', async () => {
    let attempts = 0;
    const result = await retryWithBackoff(async () => {
      attempts += 1;
      if (attempts < 2) {
        throw new Error('transient');
      }
      return 'ok';
    }, { maxAttempts: 2, baseDelayMs: 1 });

    expect(result).toBe('ok');
    expect(attempts).toBe(2);
  });
});
