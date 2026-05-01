import { afterEach, describe, expect, it } from 'bun:test';
import { paidFetch } from '../src/payments/http-client.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('paidFetch', () => {
  it('retries 402 responses with MPP credential', async () => {
    let callCount = 0;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      callCount += 1;
      if (callCount === 1) {
        return new Response(JSON.stringify({ request: { amount: '0.1', network: 'eip155:11155111', payTo: 'mpp.vendor' } }), {
          status: 402,
          headers: { 'content-type': 'application/json' },
        });
      }

      const header = new Headers(init?.headers).get('Payment');
      expect(header).toContain('signed-mpp-token');
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    const response = await paidFetch('https://example.test/paid', {}, {
      payment: { enabled: true, preferredProtocol: 'mpp' },
      createMppCredential: async () => ({ protocol: 'mpp', payload: { token: 'signed-mpp-token' } }),
    });

    expect(callCount).toBe(2);
    expect(response.status).toBe(200);
  });

  it('retries x402 challenges with X-PAYMENT header', async () => {
    let callCount = 0;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      callCount += 1;
      if (callCount === 1) {
        return new Response(JSON.stringify({ x402Version: '2', accepts: [{ amount: '0.01', payTo: 'merchant' }] }), {
          status: 402,
          headers: { 'content-type': 'application/json' },
        });
      }

      const header = new Headers(init?.headers).get('X-PAYMENT');
      expect(header).toContain('signed-x402');
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    const response = await paidFetch('https://example.test/paid', {}, {
      payment: { enabled: true, preferredProtocol: 'x402' },
      createX402Credential: async () => ({ protocol: 'x402', payload: { token: 'signed-x402' } }),
    });

    expect(callCount).toBe(2);
    expect(response.status).toBe(200);
  });

  it('auto mode retries x402 challenges with x402 credentials even when MPP credentials are configured', async () => {
    let callCount = 0;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      callCount += 1;
      if (callCount === 1) {
        return new Response(JSON.stringify({ x402Version: '2', accepts: [{ amount: '0.01', payTo: 'merchant' }] }), {
          status: 402,
          headers: { 'content-type': 'application/json' },
        });
      }

      expect(new Headers(init?.headers).get('X-PAYMENT')).toContain('signed-x402');
      expect(new Headers(init?.headers).get('Payment')).toBeNull();
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    const response = await paidFetch('https://example.test/paid', {}, {
      payment: { enabled: true, preferredProtocol: 'auto' },
      createMppCredential: async () => ({ protocol: 'mpp', payload: { token: 'wrong-protocol' } }),
      createX402Credential: async () => ({ protocol: 'x402', payload: { token: 'signed-x402' } }),
    });

    expect(callCount).toBe(2);
    expect(response.status).toBe(200);
  });

  it('auto mode retries MPP challenges with Payment header', async () => {
    let callCount = 0;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      callCount += 1;
      if (callCount === 1) {
        return new Response(JSON.stringify({ request: { amount: '0.1', payTo: 'mpp.vendor' } }), {
          status: 402,
          headers: { 'content-type': 'application/json' },
        });
      }

      expect(new Headers(init?.headers).get('Payment')).toContain('signed-mpp-token');
      expect(new Headers(init?.headers).get('X-PAYMENT')).toBeNull();
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    const response = await paidFetch('https://example.test/mpp', {}, {
      payment: { enabled: true, preferredProtocol: 'auto' },
      createMppCredential: async () => ({ protocol: 'mpp', payload: { token: 'signed-mpp-token' } }),
      createX402Credential: async () => ({ protocol: 'x402', payload: { token: 'wrong-protocol' } }),
    });

    expect(callCount).toBe(2);
    expect(response.status).toBe(200);
  });

  it('does not retry x402 when challenge body is malformed', async () => {
    let callCount = 0;
    globalThis.fetch = (async () => {
      callCount += 1;
      return new Response('not-json', {
        status: 402,
        headers: { 'content-type': 'text/plain' },
      });
    }) as typeof fetch;

    const response = await paidFetch('https://example.test/paid', {}, {
      payment: { enabled: true, preferredProtocol: 'x402' },
      createX402Credential: async () => ({ protocol: 'x402', payload: { token: 'signed-x402' } }),
    });

    expect(callCount).toBe(1);
    expect(response.status).toBe(402);
  });

  it('returns original x402 402 when credential callback is not provided', async () => {
    let callCount = 0;
    globalThis.fetch = (async () => {
      callCount += 1;
      return new Response(JSON.stringify({ x402Version: '2', accepts: [{ amount: '0.01', payTo: 'merchant' }] }), {
        status: 402,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const response = await paidFetch('https://example.test/paid', {}, {
      payment: { enabled: true, preferredProtocol: 'x402' },
    });

    expect(callCount).toBe(1);
    expect(response.status).toBe(402);
  });

  it('returns original mpp 402 when credential callback is not provided', async () => {
    let callCount = 0;
    globalThis.fetch = (async () => {
      callCount += 1;
      return new Response(JSON.stringify({ request: { amount: '0.1', payTo: 'mpp.vendor' } }), {
        status: 402,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const response = await paidFetch('https://example.test/mpp', {}, {
      payment: { enabled: true, preferredProtocol: 'mpp' },
    });

    expect(callCount).toBe(1);
    expect(response.status).toBe(402);
  });
});
