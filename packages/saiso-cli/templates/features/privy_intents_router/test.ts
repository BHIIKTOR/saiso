import { afterEach, describe, it, expect, spyOn } from 'bun:test';
import { privyIntentsRouterAction } from './action';

const originalFetch = globalThis.fetch;
const settings: Record<string, string> = {
  PRIVY_APP_ID: 'app', PRIVY_APP_SECRET: 'secret',
  PRIVY_BASE_URL: 'https://privy.example/v1',
  PRIVY_RETRY_BASE_DELAY_MS: '0',
};
function invoke(content: Record<string, unknown>, config = settings) {
  return privyIntentsRouterAction.handler({ getSetting: (key: string) => config[key] } as any, { content } as any, undefined, {});
}

describe('privy_intents_router HTTP contract', () => {
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('transfer: sends the documented method, path, and body', async () => {
    const transport = spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ id: 'result_1' }));
    const result = await invoke({"operation":"transfer","walletId":"wallet_1","payload":{"source":{"asset":"usdc","amount":"10.0","chain":"tempo"},"destination":{"address":"0xrecipient"}}});
    expect(result.success).toBe(true);
    expect(result.data.result.id).toBe('result_1');
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, options] = transport.mock.calls[0];
    expect(url).toBe('https://privy.example/v1/intents/wallets/wallet_1/transfer');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(String(options?.body))).toEqual({"source":{"asset":"usdc","amount":"10.0","chain":"tempo"},"destination":{"address":"0xrecipient"}});
    const headers = new Headers(options?.headers);
    expect(headers.get('privy-app-id')).toBe('app');
    expect(headers.get('authorization')).toBe('Basic YXBwOnNlY3JldA==');

  });

  it('rpc: sends the documented method, path, and body', async () => {
    const transport = spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ id: 'result_1' }));
    const result = await invoke({"operation":"rpc","walletId":"wallet_1","rpcRequest":{"method":"eth_sendTransaction","caip2":"eip155:8453","params":{"transaction":{"to":"0xrecipient","value":"0x1"}}}});
    expect(result.success).toBe(true);
    expect(result.data.result.id).toBe('result_1');
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, options] = transport.mock.calls[0];
    expect(url).toBe('https://privy.example/v1/intents/wallets/wallet_1/rpc');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(String(options?.body))).toEqual({"method":"eth_sendTransaction","caip2":"eip155:8453","params":{"transaction":{"to":"0xrecipient","value":"0x1"}}});
    const headers = new Headers(options?.headers);
    expect(headers.get('privy-app-id')).toBe('app');
    expect(headers.get('authorization')).toBe('Basic YXBwOnNlY3JldA==');

  });

  it('get: sends the documented method, path, and body', async () => {
    const transport = spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ id: 'result_1' }));
    const result = await invoke({"operation":"get","intentId":"intent_1"});
    expect(result.success).toBe(true);
    expect(result.data.result.id).toBe('result_1');
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, options] = transport.mock.calls[0];
    expect(url).toBe('https://privy.example/v1/intents/intent_1');
    expect(options?.method).toBe('GET');
    expect(options?.body).toBeUndefined();
    const headers = new Headers(options?.headers);
    expect(headers.get('privy-app-id')).toBe('app');
    expect(headers.get('authorization')).toBe('Basic YXBwOnNlY3JldA==');

  });

  it('list: sends the documented method, path, and body', async () => {
    const transport = spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ id: 'result_1' }));
    const result = await invoke({"operation":"list"});
    expect(result.success).toBe(true);
    expect(result.data.result.id).toBe('result_1');
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, options] = transport.mock.calls[0];
    expect(url).toBe('https://privy.example/v1/intents');
    expect(options?.method).toBe('GET');
    expect(options?.body).toBeUndefined();
    const headers = new Headers(options?.headers);
    expect(headers.get('privy-app-id')).toBe('app');
    expect(headers.get('authorization')).toBe('Basic YXBwOnNlY3JldA==');

  });

  it('update-policy: sends the documented method, path, and body', async () => {
    const transport = spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ id: 'result_1' }));
    const result = await invoke({"operation":"update-policy","policyId":"policy_1","payload":{"name":"Updated"}});
    expect(result.success).toBe(true);
    expect(result.data.result.id).toBe('result_1');
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, options] = transport.mock.calls[0];
    expect(url).toBe('https://privy.example/v1/intents/policies/policy_1');
    expect(options?.method).toBe('PATCH');
    expect(JSON.parse(String(options?.body))).toEqual({"name":"Updated"});
    const headers = new Headers(options?.headers);
    expect(headers.get('privy-app-id')).toBe('app');
    expect(headers.get('authorization')).toBe('Basic YXBwOnNlY3JldA==');

  });

  it('update-key-quorum: sends the documented method, path, and body', async () => {
    const transport = spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ id: 'result_1' }));
    const result = await invoke({"operation":"update-key-quorum","keyQuorumId":"quorum_1","payload":{"authorization_threshold":2}});
    expect(result.success).toBe(true);
    expect(result.data.result.id).toBe('result_1');
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, options] = transport.mock.calls[0];
    expect(url).toBe('https://privy.example/v1/intents/key_quorums/quorum_1');
    expect(options?.method).toBe('PATCH');
    expect(JSON.parse(String(options?.body))).toEqual({"authorization_threshold":2});
    const headers = new Headers(options?.headers);
    expect(headers.get('privy-app-id')).toBe('app');
    expect(headers.get('authorization')).toBe('Basic YXBwOnNlY3JldA==');

  });

  it('preserves the response envelope and caller request controls', async () => {
    spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ id: 'result_1' }));
    const expiresAt = new Date(Date.now() + 60000).toISOString();
    for (const chainFamily of ['evm', 'svm']) {
      const result = await invoke({ ...{"operation":"transfer","walletId":"wallet_1","payload":{"source":{"asset":"usdc","amount":"10.0","chain":"tempo"},"destination":{"address":"0xrecipient"}}}, chainFamily, requestId: 'request_1', idempotencyKey: 'stable-key', expiresAt });
      expect(result.success).toBe(true);
      expect(result.operation).toBe('privy_intents_router');
      expect(result.chainFamily).toBe(chainFamily);
      expect(result.requestId).toBe('request_1');
      expect(result.meta.idempotencyKey).toBe('stable-key');
      expect(result.meta.expiresAt).toBe(expiresAt);
    }
  });

  it('rejects invalid operations and missing identifiers without an HTTP request', async () => {
    const transport = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({}));
    for (const content of [{"operation":"unknown"},{"operation":"transfer"},{"operation":"transfer","walletId":"wallet_1","to":"0xrecipient","amount":"1"},{"operation":"update-policy","intentId":"intent_1"},{"operation":"update-key-quorum","intentId":"intent_1"}]) {
      const result = await invoke(content);
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('privy_intents_router_failed');
    }
    expect(transport).not.toHaveBeenCalled();
  });

  it('reports missing credentials and provider rejection without claiming success', async () => {
    const content = {"operation":"transfer","walletId":"wallet_1","payload":{"source":{"asset":"usdc","amount":"10.0","chain":"tempo"},"destination":{"address":"0xrecipient"}}};
    expect((await invoke(content, {})).success).toBe(false);
    const transport = spyOn(globalThis, 'fetch').mockResolvedValue(new Response('rejected', { status: 400 }));
    const result = await invoke(content);
    expect(result.success).toBe(false);
    expect(result.error.message).toContain('HTTP 400');
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
