import { afterEach, describe, it, expect, mock, spyOn } from 'bun:test';
import { privyClientBaseAction } from './action';
import { createPrivyAuthHeader } from './auth';
import { retryWithBackoff } from './retry';
import { createPrivyClient } from './client';

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

const originalFetch = globalThis.fetch;
describe('Privy transport safety', () => {
  afterEach(() => { globalThis.fetch = originalFetch; });
  const client = () => createPrivyClient({ appId: 'app', appSecret: 'secret', baseUrl: 'https://privy.example/v1', retryMaxAttempts: 2, retryBaseDelayMs: 0 });

  it('sends documented authentication, idempotency, and expiry headers', async () => {
    const transport = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ id: 'created' }));
    const expiresAt = new Date(Date.now() + 60000).toISOString();
    await client().request('/accounts', { method: 'POST', body: { wallet_ids: ['wallet_1'] }, idempotencyKey: 'stable-key', expiresAt, headers: { 'privy-authorization-signature': 'fixture-signature' } });
    const headers = new Headers(transport.mock.calls[0][1]?.headers);
    expect(headers.get('privy-app-id')).toBe('app');
    expect(headers.get('privy-idempotency-key')).toBe('stable-key');
    expect(headers.get('privy-request-expiry')).toBe(String(Date.parse(expiresAt)));
    expect(headers.get('privy-authorization-signature')).toBe('fixture-signature');
    expect(headers.has('x-idempotency-key')).toBe(false);
    expect(headers.has('x-request-expiry')).toBe(false);
  });

  it('retries transient GET failures but not permanent errors', async () => {
    const transport = spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(Response.json({ id: 'account_1' }));
    expect(await client().request('/accounts/account_1')).toEqual({ id: 'account_1' });
    expect(transport).toHaveBeenCalledTimes(2);
    transport.mockClear();
    transport.mockResolvedValue(new Response('unauthorized', { status: 401 }));
    await expect(client().request('/accounts/account_1')).rejects.toThrow('HTTP 401');
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('never retries a write after a transient failure or lost response', async () => {
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE'] as const) {
      const transport = spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('connection lost'));
      await expect(client().request('/resource', { method, body: {}, idempotencyKey: 'stable-key' })).rejects.toThrow('connection lost');
      expect(transport).toHaveBeenCalledTimes(1);
      globalThis.fetch = originalFetch;
    }
    const transport = spyOn(globalThis, 'fetch').mockResolvedValue(new Response('unavailable', { status: 503 }));
    await expect(client().request('/accounts', { method: 'POST' })).rejects.toThrow('HTTP 503');
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('rejects expired requests and invalid transport configuration before fetching', async () => {
    const transport = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({}));
    for (const expiresAt of ['invalid', '2000-01-01T00:00:00.000Z']) {
      await expect(client().request('/accounts', { expiresAt })).rejects.toThrow();
    }
    for (const options of [{ timeoutMs: NaN }, { timeoutMs: 0 }, { retryMaxAttempts: 0 }, { retryMaxAttempts: 1.5 }, { retryBaseDelayMs: -1 }]) {
      expect(() => createPrivyClient({ appId: 'app', appSecret: 'secret', ...options })).toThrow('Invalid Privy timeout or retry configuration');
    }
    expect(transport).not.toHaveBeenCalled();
  });

  it('reports invalid JSON without retrying or leaking credentials', async () => {
    const transport = spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{', { status: 200 }));
    await expect(client().request('/accounts')).rejects.toThrow('Privy returned invalid JSON');
    expect(transport).toHaveBeenCalledTimes(1);
    transport.mockResolvedValue(new Response('private upstream body', { status: 403 }));
    try {
      await client().request('/accounts', { headers: { 'privy-authorization-signature': 'sensitive-signature' } });
      throw new Error('Expected HTTP error');
    } catch (error) {
      expect(error).toHaveProperty('statusCode', 403);
      const serialized = JSON.stringify(error);
      expect(serialized).not.toContain('sensitive-signature');
      expect(serialized).not.toContain('YXBwOnNlY3JldA==');
      expect(serialized).not.toContain('private upstream body');
    }
  });
});
