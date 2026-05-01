import { afterEach, describe, it, expect, mock } from 'bun:test';
import { quoteAndSwapAction } from './action';

const originalFetch = globalThis.fetch;

describe('quote_and_swap svm adapter', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fetches a Jupiter quote without building a swap transaction', async () => {
    const fetchMock = mock(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ inAmount: '1000', outAmount: '990' }),
    })) as any;
    globalThis.fetch = fetchMock;

    const runtime = {
      getSetting: mock((key: string) => key === 'JUPITER_QUOTE_API_BASE' ? 'https://jupiter.example/v6' : undefined),
    } as any;

    const result = await quoteAndSwapAction.handler(
      runtime,
      { content: { inputMint: 'So11111111111111111111111111111111111111112', outputMint: 'USDC111111111111111111111111111111111111111', amount: '1000' } } as any,
      {} as any,
      {} as any,
      undefined as any
    );

    expect(result.success).toBe(true);
    expect(result.chainFamily).toBe('svm');
    expect(result.data.adapter).toBe('svm');
    expect(result.data.executable).toBe(false);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/quote?');
  });

  it('returns a normalized failure when Jupiter rejects', async () => {
    globalThis.fetch = mock(async () => ({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: 'bad mint' }),
    })) as any;
    const runtime = { getSetting: mock(() => undefined) } as any;

    const result = await quoteAndSwapAction.handler(
      runtime,
      { content: { inputMint: 'So11111111111111111111111111111111111111112', outputMint: 'bad', amount: '1000' } } as any,
      {} as any,
      {} as any,
      undefined as any
    );

    expect(result.success).toBe(false);
    expect(result.operation).toBe('quote_and_swap');
    expect(result.error.code).toBe('quote_failed');
  });
});
