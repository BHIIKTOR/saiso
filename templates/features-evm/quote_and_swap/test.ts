import { afterEach, describe, it, expect, mock } from 'bun:test';
import { quoteAndSwapAction } from './action';

const originalFetch = globalThis.fetch;

describe('quote_and_swap evm adapter', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fetches a 0x price quote without broadcasting', async () => {
    const fetchMock = mock(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ price: '1000', buyAmount: '1000000' }),
    })) as any;
    globalThis.fetch = fetchMock;

    const runtime = {
      getSetting: mock((key: string) => {
        if (key === 'CHAIN_ID') return '1';
        if (key === 'ZEROX_SWAP_API_BASE') return 'https://zero.example/swap/v1';
        return undefined;
      }),
    } as any;

    const result = await quoteAndSwapAction.handler(
      runtime,
      { content: { sellToken: 'ETH', buyToken: 'USDC', sellAmount: '1000000000000000000' } } as any,
      {} as any,
      {} as any,
      undefined as any
    );

    expect(result.success).toBe(true);
    expect(result.chainFamily).toBe('evm');
    expect(result.data.adapter).toBe('evm');
    expect(result.data.executable).toBe(false);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/price?');
  });

  it('fails fast for hosted 0x when ZEROX_API_KEY is missing', async () => {
    const fetchMock = mock(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({}),
    })) as any;
    globalThis.fetch = fetchMock;
    const runtime = { getSetting: mock(() => undefined) } as any;

    const result = await quoteAndSwapAction.handler(
      runtime,
      { content: { sellToken: 'ETH', buyToken: 'USDC', sellAmount: '1' } } as any,
      {} as any,
      {} as any,
      undefined as any
    );

    expect(result.success).toBe(false);
    expect(result.error.code).toBe('quote_provider_auth_required');
    expect(result.meta.provider).toBe('0x');
    expect(result.meta.requiredEnv).toEqual(['ZEROX_API_KEY']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the 0x API key for hosted 0x requests', async () => {
    const fetchMock = mock(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ price: '1000' }),
    })) as any;
    globalThis.fetch = fetchMock;
    const runtime = {
      getSetting: mock((key: string) => key === 'ZEROX_API_KEY' ? 'zero-key' : undefined),
    } as any;

    const result = await quoteAndSwapAction.handler(
      runtime,
      { content: { sellToken: 'ETH', buyToken: 'USDC', sellAmount: '1' } } as any,
      {} as any,
      {} as any,
      undefined as any
    );

    expect(result.success).toBe(true);
    expect(fetchMock.mock.calls[0][1].headers['0x-api-key']).toBe('zero-key');
  });

  it('allows custom quote providers without ZEROX_API_KEY', async () => {
    const fetchMock = mock(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ price: '1000' }),
    })) as any;
    globalThis.fetch = fetchMock;
    const runtime = { getSetting: mock(() => undefined) } as any;

    const result = await quoteAndSwapAction.handler(
      runtime,
      { content: { quoteProvider: 'custom', quoteUrl: 'https://quotes.example/swap', sellToken: 'ETH', buyToken: 'USDC', sellAmount: '1' } } as any,
      {} as any,
      {} as any,
      undefined as any
    );

    expect(result.success).toBe(true);
    expect(result.data.provider).toBe('custom');
    expect(String(fetchMock.mock.calls[0][0])).toContain('https://quotes.example/swap/price?');
  });

  it('returns a normalized failure when the 0x provider rejects', async () => {
    globalThis.fetch = mock(async () => ({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ reason: 'bad pair' }),
    })) as any;
    const runtime = {
      getSetting: mock((key: string) => key === 'ZEROX_API_KEY' ? 'zero-key' : undefined),
    } as any;

    const result = await quoteAndSwapAction.handler(
      runtime,
      { content: { sellToken: 'ETH', buyToken: 'USDC', sellAmount: '1' } } as any,
      {} as any,
      {} as any,
      undefined as any
    );

    expect(result.success).toBe(false);
    expect(result.operation).toBe('quote_and_swap');
    expect(result.error.code).toBe('quote_failed');
  });
});
