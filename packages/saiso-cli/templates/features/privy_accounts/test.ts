import { afterEach, describe, it, expect, spyOn } from 'bun:test';
import { privyAccountsAction } from './action';

const originalFetch = globalThis.fetch;
const settings: Record<string, string> = {
  PRIVY_APP_ID: 'app', PRIVY_APP_SECRET: 'secret',
  PRIVY_BASE_URL: 'https://privy.example/v1',
  PRIVY_RETRY_BASE_DELAY_MS: '0',
};
function invoke(content: Record<string, unknown>, config = settings) {
  return privyAccountsAction.handler({ getSetting: (key: string) => config[key] } as any, { content } as any, undefined, {});
}

describe('privy_accounts HTTP contract', () => {
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('create: sends the documented method, path, and body', async () => {
    const transport = spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ id: 'result_1' }));
    const result = await invoke({"operation":"create","payload":{"display_name":"Review","wallet_ids":["wallet_1"]}});
    expect(result.success).toBe(true);
    expect(result.data.result.id).toBe('result_1');
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, options] = transport.mock.calls[0];
    expect(url).toBe('https://privy.example/v1/accounts');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(String(options?.body))).toEqual({"display_name":"Review","wallet_ids":["wallet_1"]});
    const headers = new Headers(options?.headers);
    expect(headers.get('privy-app-id')).toBe('app');
    expect(headers.get('authorization')).toBe('Basic YXBwOnNlY3JldA==');

  });

  it('get: sends the documented method, path, and body', async () => {
    const transport = spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ id: 'result_1' }));
    const result = await invoke({"operation":"get","accountId":"account_1"});
    expect(result.success).toBe(true);
    expect(result.data.result.id).toBe('result_1');
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, options] = transport.mock.calls[0];
    expect(url).toBe('https://privy.example/v1/accounts/account_1');
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
    expect(url).toBe('https://privy.example/v1/accounts');
    expect(options?.method).toBe('GET');
    expect(options?.body).toBeUndefined();
    const headers = new Headers(options?.headers);
    expect(headers.get('privy-app-id')).toBe('app');
    expect(headers.get('authorization')).toBe('Basic YXBwOnNlY3JldA==');

  });

  it('update: sends the documented method, path, and body', async () => {
    const transport = spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ id: 'result_1' }));
    const result = await invoke({"operation":"update","accountId":"account_1","payload":{"display_name":"Updated"}});
    expect(result.success).toBe(true);
    expect(result.data.result.id).toBe('result_1');
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, options] = transport.mock.calls[0];
    expect(url).toBe('https://privy.example/v1/accounts/account_1');
    expect(options?.method).toBe('PATCH');
    expect(JSON.parse(String(options?.body))).toEqual({"display_name":"Updated"});
    const headers = new Headers(options?.headers);
    expect(headers.get('privy-app-id')).toBe('app');
    expect(headers.get('authorization')).toBe('Basic YXBwOnNlY3JldA==');

  });

  it('balance: sends the documented method, path, and body', async () => {
    const transport = spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ id: 'result_1' }));
    const result = await invoke({"operation":"balance","accountId":"account_1"});
    expect(result.success).toBe(true);
    expect(result.data.result.id).toBe('result_1');
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, options] = transport.mock.calls[0];
    expect(url).toBe('https://privy.example/v1/accounts/account_1/balance');
    expect(options?.method).toBe('GET');
    expect(options?.body).toBeUndefined();
    const headers = new Headers(options?.headers);
    expect(headers.get('privy-app-id')).toBe('app');
    expect(headers.get('authorization')).toBe('Basic YXBwOnNlY3JldA==');

  });

  it('preserves the response envelope and caller request controls', async () => {
    spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ id: 'result_1' }));
    const expiresAt = new Date(Date.now() + 60000).toISOString();
    for (const chainFamily of ['evm', 'svm']) {
      const result = await invoke({ ...{"operation":"create","payload":{"display_name":"Review","wallet_ids":["wallet_1"]}}, chainFamily, requestId: 'request_1', idempotencyKey: 'stable-key', expiresAt });
      expect(result.success).toBe(true);
      expect(result.operation).toBe('privy_accounts');
      expect(result.chainFamily).toBe(chainFamily);
      expect(result.requestId).toBe('request_1');
      expect(result.meta.idempotencyKey).toBe('stable-key');
      expect(result.meta.expiresAt).toBe(expiresAt);
    }
  });

  it('rejects invalid operations and missing identifiers without an HTTP request', async () => {
    const transport = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({}));
    for (const content of [{"operation":"unknown"},{"operation":"create"},{"operation":"create","payload":{"wallet_ids":[],"wallets_configuration":[]}},{"operation":"get"}]) {
      const result = await invoke(content);
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('privy_accounts_failed');
    }
    expect(transport).not.toHaveBeenCalled();
  });

  it('reports missing credentials and provider rejection without claiming success', async () => {
    const content = {"operation":"create","payload":{"display_name":"Review","wallet_ids":["wallet_1"]}};
    expect((await invoke(content, {})).success).toBe(false);
    const transport = spyOn(globalThis, 'fetch').mockResolvedValue(new Response('rejected', { status: 400 }));
    const result = await invoke(content);
    expect(result.success).toBe(false);
    expect(result.error.message).toContain('HTTP 400');
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
