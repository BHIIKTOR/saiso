import { afterEach, describe, it, expect, spyOn } from 'bun:test';
import { privyActionsSwapAction } from './action';

const originalFetch = globalThis.fetch;
const settings: Record<string, string> = {
  PRIVY_APP_ID: 'app', PRIVY_APP_SECRET: 'secret',
  PRIVY_BASE_URL: 'https://privy.example/v1',
  PRIVY_RETRY_BASE_DELAY_MS: '0',
};
function invoke(content: Record<string, unknown>, config = settings) {
  return privyActionsSwapAction.handler({ getSetting: (key: string) => config[key] } as any, { content } as any, undefined, {});
}

describe('privy_actions_swap HTTP contract', () => {
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('quote: sends the documented method, path, and body', async () => {
    const transport = spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ id: 'result_1' }));
    const result = await invoke({"operation":"quote","walletId":"wallet_1","network":"eip155:8453","fromToken":"native","toToken":"0xtoken","amount":"1000"});
    expect(result.success).toBe(true);
    expect(result.data.result.id).toBe('result_1');
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, options] = transport.mock.calls[0];
    expect(url).toBe('https://privy.example/v1/wallets/wallet_1/swap/quote');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(String(options?.body))).toEqual({"source":{"caip2":"eip155:8453","asset_address":"native"},"destination":{"asset_address":"0xtoken"},"base_amount":"1000","amount_type":"exact_input"});
    const headers = new Headers(options?.headers);
    expect(headers.get('privy-app-id')).toBe('app');
    expect(headers.get('authorization')).toBe('Basic YXBwOnNlY3JldA==');

  });

  it('execute: sends the documented method, path, and body', async () => {
    const transport = spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ id: 'result_1' }));
    const result = await invoke({"operation":"execute","walletId":"wallet_1","authorizationSignature":"fixture-auth-signature","payload":{"source":{"caip2":"solana:mainnet","asset_address":"native"},"destination":{"asset_address":"token"},"base_amount":"1000","amount_type":"exact_input"}});
    expect(result.success).toBe(true);
    expect(result.data.result.id).toBe('result_1');
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, options] = transport.mock.calls[0];
    expect(url).toBe('https://privy.example/v1/wallets/wallet_1/swap');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(String(options?.body))).toEqual({"source":{"caip2":"solana:mainnet","asset_address":"native"},"destination":{"asset_address":"token"},"base_amount":"1000","amount_type":"exact_input"});
    const headers = new Headers(options?.headers);
    expect(headers.get('privy-app-id')).toBe('app');
    expect(headers.get('authorization')).toBe('Basic YXBwOnNlY3JldA==');
    expect(headers.get('privy-authorization-signature')).toBe('fixture-auth-signature');
  });

  it('status: sends the documented method, path, and body', async () => {
    const transport = spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ id: 'result_1' }));
    const result = await invoke({"operation":"status","walletId":"wallet_1","actionId":"action_1"});
    expect(result.success).toBe(true);
    expect(result.data.result.id).toBe('result_1');
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, options] = transport.mock.calls[0];
    expect(url).toBe('https://privy.example/v1/wallets/wallet_1/actions/action_1');
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
      const result = await invoke({ ...{"operation":"quote","walletId":"wallet_1","network":"eip155:8453","fromToken":"native","toToken":"0xtoken","amount":"1000"}, chainFamily, requestId: 'request_1', idempotencyKey: 'stable-key', expiresAt });
      expect(result.success).toBe(true);
      expect(result.operation).toBe('privy_actions_swap');
      expect(result.chainFamily).toBe(chainFamily);
      expect(result.requestId).toBe('request_1');
      expect(result.meta.idempotencyKey).toBe('stable-key');
      expect(result.meta.expiresAt).toBe(expiresAt);
    }
  });

  it('rejects invalid operations and missing identifiers without an HTTP request', async () => {
    const transport = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({}));
    for (const content of [{"operation":"unknown","walletId":"wallet_1"},{"operation":"quote"},{"operation":"status","walletId":"wallet_1"}]) {
      const result = await invoke(content);
      expect(result.success).toBe(false);
      expect(result.error.code).toBe('privy_actions_swap_failed');
    }
    expect(transport).not.toHaveBeenCalled();
  });

  it('reports missing credentials and provider rejection without claiming success', async () => {
    const content = {"operation":"quote","walletId":"wallet_1","network":"eip155:8453","fromToken":"native","toToken":"0xtoken","amount":"1000"};
    expect((await invoke(content, {})).success).toBe(false);
    const transport = spyOn(globalThis, 'fetch').mockResolvedValue(new Response('rejected', { status: 400 }));
    const result = await invoke(content);
    expect(result.success).toBe(false);
    expect(result.error.message).toContain('HTTP 400');
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
