import { describe, it, expect, mock } from 'bun:test';
import { privyWebhookIngestAction } from './action';

describe('privy_webhook_ingest action scaffold', () => {
  it('returns standardized Privy response envelope', async () => {
    const runtime = {
      getSetting: mock((_key: string) => undefined),
    } as any;

    const result = await privyWebhookIngestAction.handler(
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
    expect(result.operation).toBe('privy_webhook_ingest');
    expect(result.chainFamily).toBe('svm');
    expect(result.requestId).toBeDefined();
    expect(result.meta.idempotencyKey).toBeDefined();
    expect(result.meta.expiresAt).toBeDefined();
  });
});
